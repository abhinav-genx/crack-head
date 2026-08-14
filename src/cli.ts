#!/usr/bin/env node
import { Command } from "commander";
import { PROVIDERS } from "./constants.js";
import {
  initConfig,
  removeApiKey,
  setApiKey,
  setModel,
  setProvider,
} from "./utils/config-store.js";
import {
  installGlobalErrorHandlers,
  logError,
  runAction,
} from "./utils/errors.js";
import {
  loadConversation,
  saveConversation,
} from "./utils/conversation-store.js";

const program = new Command();

installGlobalErrorHandlers();

try {
  initConfig();
} catch (err) {
  logError("config", err);
  process.exit(1);
}

const VALID_PROVIDERS = Object.values(PROVIDERS);

/** Exit with a helpful error when the slug isn't one of the supported providers. */
const assertValidProvider = (provider: string): void => {
  if (!VALID_PROVIDERS.includes(provider as PROVIDERS)) {
    console.error(
      `Unknown provider "${provider}". Valid providers: ${VALID_PROVIDERS.join(", ")}`,
    );
    process.exit(1);
  }
};

/**
 * Resolve the --use-tools value into raw XML.
 * "-" reads stdin, "@path" reads a file, anything else is treated as literal XML.
 * File/stdin input sidesteps shell mangling of <, >, ! and CDATA in complex XML.
 */
const resolveToolsInput = async (value: string): Promise<string> => {
  if (value === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }
  if (value.startsWith("@")) {
    const { readFile } = await import("node:fs/promises");
    return readFile(value.slice(1), "utf8");
  }
  return value;
};

program
  .name("crack-head")
  .description("AI Coding Agent with cracked head")
  .option("-D, --direct <prompt>", "one-shot answer, no TUI")
  .option(
    "-i, --id <id>",
    "persist this conversation under <id>; reuse it as context if it already exists",
  )
  .option(
    "-t, --use-tools <xml>",
    "execute <TOOL> blocks directly and print the output, bypassing the model. Pass raw XML, @file to read a file, or - to read stdin",
  )
  .version("1.0.0")
  .action(async (opts) => {
    try {
      if (opts.useTools) {
        const { executeTools } = await import("./tools/index.js");
        const { extractXmlContent } = await import("./utils/xml-utils.js");
        const raw = await resolveToolsInput(opts.useTools);
        // Accept either the bare <TOOL> blocks or a full <TOOLS_TO_USE> wrapper.
        const toolsXml = extractXmlContent("TOOLS_TO_USE", raw) ?? raw;
        const output = await executeTools(toolsXml);
        console.log(
          output.trim().length > 0 ? output : "[SYSTEM] : no tools executed",
        );
        return;
      }
      if (opts.direct || opts.ask) {
        const { Agent } = await import("./agent/parent.js");
        const agentX = new Agent();

        agentX.on("parent", (msg: string) => console.log(`[PARENT] : ${msg}`));
        agentX.on("swarm", (msg: string) => console.log(`[SWARM] : ${msg}`));
        agentX.on("system", (msg: string) => console.log(`[SYSTEM] : ${msg}`));
        agentX.on("error", (err: unknown) => {
          logError("agent", err);
          process.exitCode = 1;
        });

        if (opts.id) {
          const prior = loadConversation(opts.id);
          if (prior.length > 0) {
            agentX.seedConversation(prior);
            console.log(
              `[SYSTEM] : resuming conversation "${opts.id}" (${prior.length} prior messages)`,
            );
          }
        }

        agentX.pushCommand(opts.direct);
        await agentX.loop();

        if (opts.id) {
          saveConversation(opts.id, agentX.conversations);
          console.log(`[SYSTEM] : saved conversation "${opts.id}"`);
        }
      } else {
        const { startTui } = await import("./tui/App.js");
        startTui();
      }
    } catch (err) {
      logError(undefined, err);
      process.exit(1);
    }
  });

program
  .command("set-provider <provider> <apiKey>")
  .description(
    "set the active provider and store its API key (replaces any existing key)",
  )
  .action(
    runAction((provider: string, apiKey: string) => {
      assertValidProvider(provider);
      setApiKey(provider, apiKey);
      setProvider(provider);
      console.log(`Provider set to ${provider}.`);
    }),
  );

program
  .command("remove-provider <provider>")
  .description("delete a provider's stored API key")
  .action(
    runAction((provider: string) => {
      assertValidProvider(provider);
      removeApiKey(provider);
      console.log(`Removed API key for ${provider}.`);
    }),
  );

program
  .command("set-model <model>")
  .description("set the active model")
  .action(
    runAction((model: string) => {
      setModel(model);
      console.log(`Model set to ${model}.`);
    }),
  );

program.addHelpText(
  "after",
  `
Examples:
  $ crack-head set-provider open-ai sk-...     set provider + store its API key
  $ crack-head set-model gpt-4o                set the active model
  $ crack-head remove-provider open-ai         delete a provider's stored API key
  $ crack-head --direct "explain this repo"    one-shot answer without the TUI
  $ crack-head -D "add tests" --id my-task      persist/resume a conversation by id
  $ crack-head --use-tools @tools.xml           run tool XML from a file, no model
  $ crack-head --use-tools - < tools.xml        run tool XML from stdin, no model

Providers:
  ${VALID_PROVIDERS.join(", ")}`,
);

program.parse();

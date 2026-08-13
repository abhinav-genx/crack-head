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

program
  .name("crack-head")
  .description("AI Coding Agent with cracked head")
  .option("-D, --direct <prompt>", "one-shot answer, no TUI")
  .version("1.0.0")
  .action(async (opts) => {
    try {
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

        agentX.pushCommand(opts.direct);
        await agentX.loop();
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

Providers:
  ${VALID_PROVIDERS.join(", ")}`,
);

program.parse();

import {
  parsePatchFilesXml,
  patch_files_tool_description,
  patchFilesTool,
} from "./patch-files.js";
import {
  parseReadFilesXml,
  read_files_tool_description,
  readFilesTool,
} from "./read-files.js";
import {
  parseUseShellXml,
  run_command_tool_description,
  useShellTool,
} from "./use-shell.js";
import {
  parseBackgroundShellXml,
  background_shell_tool_description,
  backgroundShellTool,
} from "./background-shell.js";
import {
  parseSearchCodeXml,
  search_code_tool_description,
  searchCodeTool,
} from "./search-code.js";
import {
  parseListFilesXml,
  list_files_tool_description,
  listFilesTool,
} from "./list-files.js";
import {
  parseFinishXml,
  finish_tool_description,
  finishTool,
} from "./finish.js";
import {
  extractAllXmlContent,
  extractXmlText,
} from "../utils/xml-utils.js";

export { getFinishMessage } from "./finish.js";

export const available_tools = [
  {
    name: "read-files",
    description: read_files_tool_description,
  },
  {
    name: "patch-files",
    description: patch_files_tool_description,
  },
  {
    name: "use-shell",
    description: run_command_tool_description,
  },
  {
    name: "background-shell",
    description: background_shell_tool_description,
  },
  {
    name: "search-code",
    description: search_code_tool_description,
  },
  {
    name: "list-files",
    description: list_files_tool_description,
  },
  {
    name: "finish",
    description: finish_tool_description,
  },
];

export const formatAvailableToolsXml = (): string =>
  available_tools
    .map(
      (t) => `<TOOL>
<NAME>${t.name}</NAME>
<DESCRIPTION>
${t.description}
</DESCRIPTION>
</TOOL>`,
    )
    .join("\n\n");

const wrapOutput = (toolName: string, output: string): string => `<TOOL_OUTPUT>
<TOOL_NAME>${toolName}</TOOL_NAME>
<OUTPUT><![CDATA[
${output}
]]></OUTPUT>
</TOOL_OUTPUT>`;

/**
 * Execute tools described in the <TOOLS_TO_USE> XML block.
 * Input: the inner XML (one or more <TOOL> blocks).
 * Output: an XML string of <TOOL_OUTPUT> blocks — "" if nothing was executed.
 * Errors are captured per-tool and returned as output so the model can self-correct.
 */
export const executeTools = async (toolsXml: string): Promise<string> => {
  const toolBlocks = extractAllXmlContent("TOOL", toolsXml);
  const outputs: string[] = [];

  // Content present but no parseable <TOOL> blocks → malformed XML
  // (e.g. missing closing </TOOL>). Report back so the model retries.
  if (toolBlocks.length === 0 && toolsXml.trim().length > 0) {
    return wrapOutput(
      "parser",
      `ERROR: could not parse any <TOOL> block from <TOOLS_TO_USE>. ` +
        `Make sure every <TOOL> block is complete and has a closing </TOOL> tag, ` +
        `and follows the documented XML schema exactly. Re-emit the full tool call.`,
    );
  }

  for (const block of toolBlocks) {
    const name = extractXmlText("NAME", block);
    try {
      if (name === "read-files") {
        const configs = parseReadFilesXml(block);
        if (configs.length === 0)
          throw new Error("no <FILE> blocks found — check the tool schema.");
        outputs.push(wrapOutput(name, await readFilesTool(configs)));
      } else if (name === "patch-files") {
        const patches = parsePatchFilesXml(block);
        if (patches.length === 0)
          throw new Error("no <FILE> blocks found — check the tool schema.");
        const results = await patchFilesTool(patches);
        const text = results
          .map(
            (r) => `${r.file_name}: ${r.ok ? "OK" : "ERROR"} — ${r.message}`,
          )
          .join("\n");
        outputs.push(wrapOutput(name, text));
      } else if (name === "use-shell") {
        const cfg = parseUseShellXml(block);
        if (!cfg.command)
          throw new Error("no <COMMAND> found — check the tool schema.");
        outputs.push(wrapOutput(name, await useShellTool(cfg)));
      } else if (name === "background-shell") {
        const cfg = parseBackgroundShellXml(block);
        outputs.push(wrapOutput(name, await backgroundShellTool(cfg)));
      } else if (name === "search-code") {
        const cfg = parseSearchCodeXml(block);
        if (!cfg.pattern)
          throw new Error("no <PATTERN> found — check the tool schema.");
        outputs.push(wrapOutput(name, await searchCodeTool(cfg)));
      } else if (name === "list-files") {
        const cfg = parseListFilesXml(block);
        outputs.push(wrapOutput(name, await listFilesTool(cfg)));
      } else if (name === "finish") {
        outputs.push(wrapOutput(name, finishTool(parseFinishXml(block))));
      } else {
        outputs.push(
          wrapOutput(
            name ?? "unknown",
            `ERROR: unknown tool "${name}". Available tools: ${available_tools
              .map((t) => t.name)
              .join(", ")}. Stick to the documented XML schema.`,
          ),
        );
      }
    } catch (err) {
      outputs.push(
        wrapOutput(
          name ?? "unknown",
          `ERROR: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  return outputs.join("\n\n");
};

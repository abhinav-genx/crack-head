import {
  extractAllXmlContent,
  extractXmlText,
} from "../utils/xml-utils.js";

type FinishConfig = {
  message: string;
};

/** Parse the inner XML of a finish <TOOL> block into a config. */
export const parseFinishXml = (toolXml: string): FinishConfig => ({
  message: extractXmlText("MESSAGE", toolXml) ?? "",
});

export const finish_tool_description = `Signal that the user's task is FULLY complete and has been verified. Calling this ENDS the run.
- Only call finish AFTER you have verified the result (e.g. the build/tests pass, or the file exists).
- Put a concise summary of what you did and how you verified it in <MESSAGE>.
- Do NOT call finish while work remains, and do NOT keep calling other tools once the task is done — call finish instead.

Example input:
<TOOL>
<NAME>finish</NAME>
<MESSAGE><![CDATA[Fixed the off-by-one in multiply() in sandbox/math.ts and ran \`pnpm run dev\` — all 4 assertions pass.]]></MESSAGE>
</TOOL>`;

export const finishTool = (cfg: FinishConfig): string =>
  cfg.message.trim().length > 0 ? cfg.message : "Task complete.";

/**
 * If a <TOOLS_TO_USE> block contains a finish tool, return its message
 * (possibly ""); otherwise null. Used by the agent loop to end the run.
 */
export const getFinishMessage = (toolsXml: string): string | null => {
  for (const block of extractAllXmlContent("TOOL", toolsXml)) {
    if (extractXmlText("NAME", block) === "finish") {
      return extractXmlText("MESSAGE", block) ?? "";
    }
  }
  return null;
};

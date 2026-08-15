import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  extractAllXmlContent,
  extractXmlText,
} from "../utils/xml-utils.js";

export type PatchOp = {
  old_str: string; // exact text to find (must be unique in file). "" = create/overwrite whole file
  new_str: string; // replacement text. "" = delete old_str
};

export type Patch = {
  file_name: string;
  patches: PatchOp[];
};

/** Parse the inner XML of a patch-files <TOOL> block into patches. */
export const parsePatchFilesXml = (toolXml: string): Patch[] =>
  extractAllXmlContent("FILE", toolXml).map((fileXml) => {
    const ops: PatchOp[] = extractAllXmlContent("PATCH", fileXml).map(
      (patchXml) => ({
        old_str: extractXmlText("OLD_STR", patchXml) ?? "",
        new_str: extractXmlText("NEW_STR", patchXml) ?? "",
      }),
    );
    return {
      file_name: extractXmlText("FILE_NAME", fileXml) ?? "",
      patches: ops,
    };
  });

export const patch_files_tool_description = `Edit files using search/replace blocks.
For each <PATCH>, <OLD_STR> is replaced with <NEW_STR>.
Rules:
- OLD_STR must match the file content EXACTLY (including whitespace and indentation).
- OLD_STR must appear EXACTLY ONCE in the file. If it appears multiple times, include more surrounding lines to make it unique.
- ALWAYS wrap OLD_STR and NEW_STR content in <![CDATA[ ... ]]> so whitespace, newlines, quotes and code survive exactly.
- To delete text, set NEW_STR to an empty CDATA: <![CDATA[]]>.
- To insert text, set OLD_STR to an existing adjacent line(s) and include it in NEW_STR along with the new text.
- If OLD_STR is empty the file is created or OVERWRITTEN with NEW_STR (idempotent — re-running the same create does not duplicate content). Parent folders are created automatically.
- NEVER include line-number prefixes (like "12→") from read output in OLD_STR — they are not part of the file.

Example input (edit two files: fix a bug, delete a log line, create a new file):
<TOOL>
<NAME>patch-files</NAME>
<FILE>
<FILE_NAME>src/math.ts</FILE_NAME>
<PATCH>
<OLD_STR><![CDATA[export const add = (a: number, b: number) => {
  return a - b;
};]]></OLD_STR>
<NEW_STR><![CDATA[export const add = (a: number, b: number) => {
  return a + b;
};]]></NEW_STR>
</PATCH>
<PATCH>
<OLD_STR><![CDATA[  console.log("debug: adding");
]]></OLD_STR>
<NEW_STR><![CDATA[]]></NEW_STR>
</PATCH>
</FILE>
<FILE>
<FILE_NAME>src/math.test.ts</FILE_NAME>
<PATCH>
<OLD_STR><![CDATA[]]></OLD_STR>
<NEW_STR><![CDATA[import { add } from "./math.js";

test("adds", () => {
  expect(add(1, 2)).toBe(3);
});
]]></NEW_STR>
</PATCH>
</FILE>
</TOOL>

Example output:
src/math.ts: OK — updated — 2 patch(es) applied
src/math.test.ts: OK — created — 1 patch(es) applied`;

type PatchResult = {
  file_name: string;
  ok: boolean;
  message: string;
};

const applyOp = (content: string, op: PatchOp): string => {
  // Empty old_str -> (over)write the whole file with new_str (idempotent create).
  if (op.old_str === "") {
    return op.new_str;
  }

  const first = content.indexOf(op.old_str);
  if (first === -1) {
    // Give the model actionable feedback for self-correction
    const preview = op.old_str.slice(0, 80).replace(/\n/g, "\\n");
    throw new Error(
      `old_str not found: "${preview}...". It must match the file exactly — re-read the file and check whitespace/indentation.`,
    );
  }

  const second = content.indexOf(op.old_str, first + op.old_str.length);
  if (second !== -1) {
    throw new Error(
      `old_str appears more than once — include more surrounding lines to make it unique.`,
    );
  }

  return (
    content.slice(0, first) +
    op.new_str +
    content.slice(first + op.old_str.length)
  );
};

export const patchFilesTool = async (patches: Patch[]): Promise<PatchResult[]> => {
  const results: PatchResult[] = [];

  for (const patch of patches) {
    try {
      let content = "";
      let isNewFile = false;
      try {
        content = await readFile(patch.file_name, "utf8");
      } catch {
        isNewFile = true; // file doesn't exist → treat as empty (create)
      }

      let applied = 0;
      for (const op of patch.patches) {
        content = applyOp(content, op); // ops apply sequentially, in order
        applied++;
      }

      await mkdir(dirname(patch.file_name), { recursive: true });
      await writeFile(patch.file_name, content, "utf8");
      results.push({
        file_name: patch.file_name,
        ok: true,
        message: `${isNewFile ? "created" : "updated"} — ${applied} patch(es) applied`,
      });
    } catch (err) {
      results.push({
        file_name: patch.file_name,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
};

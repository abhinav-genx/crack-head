import { readFile } from "node:fs/promises";
import {
  extractAllXmlContent,
  extractXmlText,
} from "../utils/xml-utils.js";

type ReadFileType = {
  file_name: string;
  start_line: number; // 1-based, inclusive
  end_line: number; // inclusive; -1 = read to end of file
};

/** Parse the inner XML of a read-files <TOOL> block into configs. */
export const parseReadFilesXml = (toolXml: string): ReadFileType[] =>
  extractAllXmlContent("FILE", toolXml).map((fileXml) => ({
    file_name: extractXmlText("FILE_NAME", fileXml) ?? "",
    start_line: Number(extractXmlText("START_LINE", fileXml) ?? "1"),
    end_line: Number(extractXmlText("END_LINE", fileXml) ?? "-1"),
  }));

export const read_files_tool_description = `Read one or more files, returning line-numbered content.
- start_line is 1-based and inclusive; end_line is inclusive; use end_line: -1 to read to the end.
- Output lines are prefixed "N→". This prefix is NOT part of the file — never include it in old_str when patching.
- Large output is truncated; request a narrower line range if you see [TRUNCATED].
- Prefer reading large meaningful ranges over many small reads. Batch multiple files into ONE call.

Example input (read two files: one fully, one partially):
<TOOL>
<NAME>read-files</NAME>
<FILE>
<FILE_NAME>src/math.ts</FILE_NAME>
<START_LINE>1</START_LINE>
<END_LINE>-1</END_LINE>
</FILE>
<FILE>
<FILE_NAME>src/cli.ts</FILE_NAME>
<START_LINE>10</START_LINE>
<END_LINE>12</END_LINE>
</FILE>
</TOOL>

Example output:
=== src/math.ts  ===
1→export const add = (a: number, b: number) => {
2→  return a + b;
3→};

=== src/cli.ts  ===
10→program
11→  .name("crack-head")
12→  .option("-D, --direct <prompt>", "one-shot answer, no TUI")

Example output when a file is missing:
=== src/missing.ts (ERROR) ===
Could not read "src/missing.ts": ENOENT: no such file or directory. Check the path — it may not exist.`;

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

type ReadResult = {
  file_name: string;
  ok: boolean;
  content: string; // numbered content, or error message
};

const readOne = async (cfg: ReadFileType): Promise<ReadResult> => {
  try {
    const raw = await readFile(cfg.file_name, "utf8");
    const lines = raw.split("\n");

    const start = Math.max(1, cfg.start_line);
    const end =
      cfg.end_line === -1 ? lines.length : Math.min(cfg.end_line, lines.length);

    if (start > lines.length) {
      return {
        file_name: cfg.file_name,
        ok: false,
        content: `start_line ${cfg.start_line} is past end of file (${lines.length} lines). Retry with a valid range.`,
      };
    }

    let slice = lines.slice(start - 1, end);
    let truncated = false;

    if (slice.length > MAX_LINES) {
      slice = slice.slice(0, MAX_LINES);
      truncated = true;
    }

    const numbered = slice
      .map((line, i) => {
        const text =
          line.length > MAX_LINE_LENGTH
            ? line.slice(0, MAX_LINE_LENGTH) + " [LINE TRUNCATED]"
            : line;
        return `${start + i}→${text}`;
      })
      .join("\n");

    return {
      file_name: cfg.file_name,
      ok: true,
      content:
        numbered +
        (truncated
          ? `\n[TRUNCATED: showed ${MAX_LINES} of ${end - start + 1} requested lines. File has ${lines.length} lines total. Request a narrower range.]`
          : ""),
    };
  } catch (err) {
    return {
      file_name: cfg.file_name,
      ok: false,
      content: `Could not read "${cfg.file_name}": ${
        err instanceof Error ? err.message : String(err)
      }. Check the path — it may not exist.`,
    };
  }
};

export const readFilesTool = async (configs: ReadFileType[]): Promise<string> => {
  const results = await Promise.all(configs.map(readOne));

  // Format as one string for the tool-result message
  return results
    .map((r) => `=== ${r.file_name} ${r.ok ? "" : "(ERROR)"} ===\n${r.content}`)
    .join("\n\n");
};

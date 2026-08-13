import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { extractXmlText } from "../utils/xml-utils.js";
import { globToRegExp, walk } from "../utils/fs-search.js";

type SearchConfig = {
  pattern: string;
  path: string;
  include?: string; // glob on file name, e.g. *.ts
  max_results: number;
  ignore_case: boolean;
};

/** Parse the inner XML of a search-code <TOOL> block into a config. */
export const parseSearchCodeXml = (toolXml: string): SearchConfig => {
  const include = extractXmlText("INCLUDE", toolXml);
  const max = extractXmlText("MAX_RESULTS", toolXml);
  const ic = extractXmlText("IGNORE_CASE", toolXml);
  return {
    pattern: extractXmlText("PATTERN", toolXml) ?? "",
    path: extractXmlText("PATH", toolXml) ?? ".",
    ...(include ? { include } : {}),
    max_results: max ? Number(max) : 100,
    ignore_case: ic ? /^(true|1|yes)$/i.test(ic.trim()) : false,
  };
};

export const search_code_tool_description = `Search file contents with a regular expression (like ripgrep). Returns matching lines as "relative/path:line: text".
- PATTERN is a JavaScript regular expression (required). Wrap it in CDATA so metacharacters survive.
- PATH is the directory to search under (default "."). INCLUDE is an optional glob on the file name (e.g. *.ts or *.{ts,tsx}).
- Set IGNORE_CASE to true for case-insensitive search. Results are capped by MAX_RESULTS (default 100).
- node_modules, .git and build folders are skipped automatically. Prefer this over grep via use-shell — output is structured and cross-platform.

Example input (find every exported const under src):
<TOOL>
<NAME>search-code</NAME>
<PATTERN><![CDATA[export const \\w+]]></PATTERN>
<PATH>src</PATH>
<INCLUDE>*.ts</INCLUDE>
</TOOL>

Example output:
3 match(es) for /export const \\w+/ in 2 file(s):
src/tools/index.ts:21: export const available_tools = [
src/tools/index.ts:36: export const formatAvailableToolsXml = (): string =>
src/utils/xml-utils.ts:1: export function extractXmlContent(tag: string, input: string): string | null {

Example output (no matches — broaden the pattern or change PATH, don't just retry):
No matches for /frobnicate/ in "src". Searched 12 file(s). Try a broader pattern or different path.`;

// File types that are never worth grepping.
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".pdf",
  ".zip", ".gz", ".tar", ".tgz", ".exe", ".dll", ".so", ".dylib",
  ".bin", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".mov",
  ".mkv", ".mp3", ".wav", ".flac", ".class", ".o", ".a", ".node",
]);

const MAX_FILE_BYTES = 1_000_000;
const HARD_CAP = 200;
const MAX_LINE_LENGTH = 300;

export const searchCodeTool = async (cfg: SearchConfig): Promise<string> => {
  if (!cfg.pattern) return `ERROR: no <PATTERN> found — check the tool schema.`;

  let re: RegExp;
  try {
    re = new RegExp(cfg.pattern, cfg.ignore_case ? "i" : "");
  } catch (err) {
    return `ERROR: invalid regex "${cfg.pattern}": ${
      err instanceof Error ? err.message : String(err)
    }. Fix the pattern and retry.`;
  }

  const includeRe = cfg.include ? globToRegExp(cfg.include) : null;
  const cap = Math.min(cfg.max_results || 100, HARD_CAP);
  const matches: string[] = [];
  let filesSearched = 0;
  let truncated = false;

  for await (const entry of walk(cfg.path)) {
    if (entry.isDir) continue;
    const base = basename(entry.relPath);
    if (includeRe && !includeRe.test(base)) continue;

    const dot = base.lastIndexOf(".");
    const ext = dot >= 0 ? base.slice(dot).toLowerCase() : "";
    if (BINARY_EXT.has(ext)) continue;

    try {
      const st = await stat(entry.absPath);
      if (st.size > MAX_FILE_BYTES) continue;
    } catch {
      continue;
    }

    let content: string;
    try {
      content = await readFile(entry.absPath, "utf8");
    } catch {
      continue;
    }
    if (content.includes("\u0000")) continue; // looks binary

    filesSearched++;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!re.test(line)) continue;
      const text =
        line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + " …" : line;
      matches.push(`${entry.relPath}:${i + 1}: ${text}`);
      if (matches.length >= cap) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  if (matches.length === 0) {
    return `No matches for /${cfg.pattern}/ in "${cfg.path}"${
      cfg.include ? ` (include ${cfg.include})` : ""
    }. Searched ${filesSearched} file(s). Try a broader pattern or different path.`;
  }

  return (
    `${matches.length} match(es) for /${cfg.pattern}/ in ${filesSearched} file(s):\n` +
    matches.join("\n") +
    (truncated
      ? `\n[TRUNCATED at ${cap} matches — narrow with INCLUDE or a more specific PATTERN.]`
      : "")
  );
};

import { extractXmlText } from "../utils/xml-utils.js";
import { globToRegExp, walk } from "../utils/fs-search.js";

type ListConfig = {
  path: string;
  pattern?: string; // glob on relative path
  depth: number; // -1 = unlimited
};

/** Parse the inner XML of a list-files <TOOL> block into a config. */
export const parseListFilesXml = (toolXml: string): ListConfig => {
  const pattern = extractXmlText("PATTERN", toolXml);
  const depthRaw = extractXmlText("DEPTH", toolXml);
  const hasDepth = depthRaw != null && depthRaw.trim().length > 0;
  return {
    path: extractXmlText("PATH", toolXml) ?? ".",
    ...(pattern ? { pattern } : {}),
    // A glob implies "search everywhere" unless the caller pins a depth.
    depth: hasDepth ? Number(depthRaw) : pattern ? -1 : 2,
  };
};

export const list_files_tool_description = `List files and directories under a path, optionally filtered by a glob. Use it to discover project structure or find files by name.
- PATH is the directory to list (default "."). Directories are marked with a trailing "/".
- PATTERN is an optional glob matched against the relative path: * matches within one path segment, ** matches across segments, {a,b} is alternation (e.g. **/*.{ts,tsx}). When PATTERN is set, only matching files are returned.
- DEPTH limits recursion (default 2; use -1 for unlimited). When a PATTERN is given, DEPTH defaults to unlimited.
- node_modules, .git and build folders are skipped automatically.

Example input (find every TypeScript file in the repo):
<TOOL>
<NAME>list-files</NAME>
<PATTERN>**/*.ts</PATTERN>
</TOOL>

Example output:
4 entries under "." matching **/*.ts:
src/cli.ts
src/tools/index.ts
src/tools/read-files.ts
src/utils/xml-utils.ts

Example input (see the top two levels of a folder):
<TOOL>
<NAME>list-files</NAME>
<PATH>src</PATH>
<DEPTH>2</DEPTH>
</TOOL>

Example output:
src/agent/
src/agent/parent.ts
src/cli.ts
src/tools/
src/tools/index.ts`;

const HARD_CAP = 500;

export const listFilesTool = async (cfg: ListConfig): Promise<string> => {
  const patternRe = cfg.pattern ? globToRegExp(cfg.pattern) : null;
  const maxDepth = cfg.depth < 0 ? Infinity : cfg.depth;
  const entries: string[] = [];
  let truncated = false;

  for await (const e of walk(cfg.path, { maxDepth })) {
    if (patternRe) {
      if (e.isDir || !patternRe.test(e.relPath)) continue;
      entries.push(e.relPath);
    } else {
      entries.push(e.isDir ? `${e.relPath}/` : e.relPath);
    }
    if (entries.length >= HARD_CAP) {
      truncated = true;
      break;
    }
  }

  if (entries.length === 0) {
    return `No entries under "${cfg.path}"${
      cfg.pattern ? ` matching ${cfg.pattern}` : ""
    }. Check the path or pattern.`;
  }

  return (
    `${entries.length} entr${entries.length === 1 ? "y" : "ies"} under "${cfg.path}"${
      cfg.pattern ? ` matching ${cfg.pattern}` : ""
    }:\n` +
    entries.join("\n") +
    (truncated
      ? `\n[TRUNCATED at ${HARD_CAP} entries — narrow with a PATTERN or smaller DEPTH.]`
      : "")
  );
};

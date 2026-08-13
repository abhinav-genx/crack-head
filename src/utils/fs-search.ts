import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

// Directories that are never useful to search or list.
const DEFAULT_IGNORES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "out",
  ".cache",
  ".turbo",
]);

/** Escape a string so it is treated literally inside a RegExp. */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Convert a shell-style glob to an anchored RegExp.
 * Supports: `*` (within one path segment), `**` (across segments),
 * `?` (single char), and `{a,b,c}` alternation. Paths use "/" separators.
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (glob[i] === "/") i += 1; // let "**/" also match zero directories
        continue;
      }
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end !== -1) {
        const inner = glob
          .slice(i + 1, end)
          .split(",")
          .map(escapeRe)
          .join("|");
        re += `(${inner})`;
        i = end + 1;
        continue;
      }
    }
    re += escapeRe(c);
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

export type WalkEntry = {
  absPath: string;
  relPath: string; // relative to root, "/"-separated
  isDir: boolean;
};

/**
 * Recursively yield entries under `root` in a stable, tree-like order,
 * skipping DEFAULT_IGNORES. `maxDepth` counts direct children as depth 1.
 */
export async function* walk(
  root: string,
  opts: { maxDepth?: number } = {},
): AsyncGenerator<WalkEntry> {
  const maxDepth = opts.maxDepth ?? Infinity;

  async function* recurse(dir: string, depth: number): AsyncGenerator<WalkEntry> {
    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable / missing directory → yield nothing
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name));
    for (const d of dirents) {
      if (DEFAULT_IGNORES.has(d.name)) continue;
      const absPath = join(dir, d.name);
      const relPath = relative(root, absPath) || d.name;
      const isDir = d.isDirectory();
      yield { absPath, relPath, isDir };
      if (isDir && depth < maxDepth) {
        yield* recurse(absPath, depth + 1);
      }
    }
  }

  yield* recurse(root, 1);
}

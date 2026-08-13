import { exec } from "node:child_process";
import { extractXmlText } from "../utils/xml-utils.js";

type RunCommandType = {
  command: string;
  cwd?: string; // working directory, defaults to process.cwd()
  timeout_ms?: number; // defaults to 30s, max 5min
};

/** Parse the inner XML of a use-shell <TOOL> block into a config. */
export const parseUseShellXml = (toolXml: string): RunCommandType => {
  const timeout = extractXmlText("TIMEOUT_MS", toolXml);
  const cwd = extractXmlText("CWD", toolXml);
  return {
    command: extractXmlText("COMMAND", toolXml) ?? "",
    ...(cwd ? { cwd } : {}),
    ...(timeout ? { timeout_ms: Number(timeout) } : {}),
  };
};

export const run_command_tool_description = `Execute a shell command and return stdout, stderr, and exit code.
- Runs in bash: pipes, &&, globs, and redirection all work.
- Non-zero exit codes are returned, not thrown — check exit_code to know if the command failed.
- Default timeout 30s (set timeout_ms up to 300000 for long builds/tests).
- Use this ONLY for one-shot commands that exit on their own. For long-lived processes (dev servers, watch mode) use the background-shell tool — here they would just time out.
- Output is truncated if very large; pipe through grep/head/tail to narrow it.
- All the shell commands passed here will be run in sequential order, only after first one finishes

Example input (run tests with a longer timeout):
<TOOL>
<NAME>use-shell</NAME>
<COMMAND><![CDATA[pnpm test]]></COMMAND>
<TIMEOUT_MS>120000</TIMEOUT_MS>
</TOOL>

Example output (success):
exit_code: 0
--- stdout ---
✓ src/math.test.ts (3 tests) 12ms
Test Files  1 passed (1)

Example output (failure — read stderr and fix the code, don't just retry):
exit_code: 1
--- stderr ---
src/math.ts(2,10): error TS2322: Type 'string' is not assignable to type 'number'.

Example output (timeout):
exit_code: TIMEOUT
[Command timed out after 30000ms. If this is a long build/test, retry with a higher timeout_ms. If it's a server/watch process, use the background-shell tool instead — it never exits.]

Example input (narrow noisy output):
<TOOL>
<NAME>use-shell</NAME>
<COMMAND><![CDATA[pnpm build 2>&1 | grep -i error | head -20]]></COMMAND>
</TOOL>`;

const MAX_OUTPUT_CHARS = 30_000;
const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 300_000;

const truncate = (s: string, label: string): string => {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  const half = MAX_OUTPUT_CHARS / 2;
  return (
    s.slice(0, half) +
    `\n\n[${label} TRUNCATED: ${s.length} chars total — showing first and last ${half}. Pipe through grep/head/tail to narrow output.]\n\n` +
    s.slice(-half)
  );
};

export const useShellTool = async (cfg: RunCommandType): Promise<string> => {
  const timeout = Math.min(cfg.timeout_ms ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);

  return new Promise((resolve) => {
    exec(
      cfg.command,
      {
        cwd: cfg.cwd ?? process.cwd(),
        timeout,
        shell: "/bin/bash",
        maxBuffer: 10 * 1024 * 1024, // 10MB before Node kills it
        env: { ...process.env, NO_COLOR: "1", CI: "1" }, // no ANSI codes, no interactive prompts
      },
      (error, stdout, stderr) => {
        const exitCode = error?.code ?? 0;
        const timedOut = error?.killed && error?.signal === "SIGTERM";

        const parts = [
          `exit_code: ${timedOut ? "TIMEOUT" : exitCode}`,
          timedOut
            ? `[Command timed out after ${timeout}ms. If this is a long build/test, retry with a higher timeout_ms. If it's a server/watch process, use the background-shell tool instead — it never exits.]`
            : "",
          stdout ? `--- stdout ---\n${truncate(stdout, "stdout")}` : "",
          stderr ? `--- stderr ---\n${truncate(stderr, "stderr")}` : "",
          !stdout && !stderr ? "(no output)" : "",
        ];

        resolve(parts.filter(Boolean).join("\n"));
      },
    );
  });
};

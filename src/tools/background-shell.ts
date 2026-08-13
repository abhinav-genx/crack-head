import { spawn, type ChildProcess } from "node:child_process";
import { extractXmlText } from "../utils/xml-utils.js";

type BgAction = "start" | "logs" | "list" | "stop";

type BackgroundShellConfig = {
  action: BgAction;
  command?: string;
  cwd?: string; // working directory, defaults to process.cwd()
  process_id?: number; // target process for logs/stop
  settle_ms?: number; // how long to watch a freshly started process
};

type BgProcess = {
  id: number;
  command: string;
  cwd: string;
  child: ChildProcess;
  output: string; // rolling buffer of combined stdout+stderr
  status: "running" | "exited";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startedAt: number;
};

/** Parse the inner XML of a background-shell <TOOL> block into a config. */
export const parseBackgroundShellXml = (
  toolXml: string,
): BackgroundShellConfig => {
  const action = (extractXmlText("ACTION", toolXml) ?? "start")
    .trim()
    .toLowerCase() as BgAction;
  const command = extractXmlText("COMMAND", toolXml);
  const cwd = extractXmlText("CWD", toolXml);
  const idRaw = extractXmlText("PROCESS_ID", toolXml);
  const settleRaw = extractXmlText("SETTLE_MS", toolXml);
  return {
    action,
    ...(command ? { command } : {}),
    ...(cwd ? { cwd } : {}),
    ...(idRaw && idRaw.trim().length > 0 ? { process_id: Number(idRaw) } : {}),
    ...(settleRaw && settleRaw.trim().length > 0
      ? { settle_ms: Number(settleRaw) }
      : {}),
  };
};

export const background_shell_tool_description = `Start and manage long-lived background processes (dev servers, watchers, queues) that never exit on their own. Unlike use-shell, these are NOT killed by a timeout — they keep running so you can start a server, hit it, and read its logs. All background processes are killed automatically when the run ends.

Pick an <ACTION>:
- start: spawn <COMMAND> in the background. Returns a numbered PROCESS_ID plus whatever it printed in the first ~1.5s (so you can tell if it booted or crashed on startup). Optional <CWD> and <SETTLE_MS> (how long to watch startup, max 15000).
- logs: read everything a process has printed so far. Requires <PROCESS_ID>. Use this after 'start' to check a server is ready before you curl it.
- list: show every background process with its status (running / exited) and command.
- stop: terminate a process (SIGTERM, then SIGKILL). Requires <PROCESS_ID>. Kills the whole process tree.

Guidance:
- Use this ONLY for processes that don't exit by themselves. For one-shot builds/tests/greps use the use-shell tool.
- After start, if status is "exited" the command crashed immediately — read the output and fix it, don't just restart.
- If a process is running but not yet ready, call 'logs' again a moment later; don't assume it's broken.

Example input (start a dev server):
<TOOL>
<NAME>background-shell</NAME>
<ACTION>start</ACTION>
<COMMAND><![CDATA[npm run dev]]></COMMAND>
</TOOL>

Example output (started):
Started background process #1 — running (pid 40213, up 1s).
It keeps running in the background. Use action 'logs' with PROCESS_ID 1 to read new output, and 'stop' to terminate it.
--- output (first 1500ms) ---
VITE v5.4.0  ready in 320 ms
Local:   http://localhost:5173/

Example input (check its logs, then stop it):
<TOOL>
<NAME>background-shell</NAME>
<ACTION>logs</ACTION>
<PROCESS_ID>1</PROCESS_ID>
</TOOL>
<TOOL>
<NAME>background-shell</NAME>
<ACTION>stop</ACTION>
<PROCESS_ID>1</PROCESS_ID>
</TOOL>

Example output (start where the command crashed on boot):
Background process #2 exited during the first 1500ms — exited (code 1).
It did not stay up. Read the output below to see why (this usually means the command crashed on startup).
--- output (first 1500ms) ---
Error: Cannot find module 'express'`;

const MAX_OUTPUT_CHARS = 60_000;
const DEFAULT_SETTLE_MS = 1_500;
const MAX_SETTLE_MS = 15_000;
const STOP_GRACE_MS = 2_000;

let nextId = 1;
const processes = new Map<number, BgProcess>();

const appendOutput = (p: BgProcess, chunk: string): void => {
  p.output += chunk;
  if (p.output.length > MAX_OUTPUT_CHARS)
    p.output = p.output.slice(p.output.length - MAX_OUTPUT_CHARS);
};

const uptime = (p: BgProcess): string => {
  const secs = Math.floor((Date.now() - p.startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
};

const statusLine = (p: BgProcess): string =>
  p.status === "running"
    ? `running (pid ${p.child.pid}, up ${uptime(p)})`
    : `exited (code ${p.exitCode ?? "?"}${p.signal ? `, signal ${p.signal}` : ""})`;

// Read status through a call so TS doesn't wrongly narrow it across an await
// (the 'exit' handler can flip it to "exited" while we're waiting).
const hasExited = (p: BgProcess): boolean => p.status === "exited";

/** Detach a child stdio pipe from the event loop (they're sockets at runtime). */
const unrefStream = (s: unknown): void => {
  (s as { unref?: () => void } | null)?.unref?.();
};

/** Kill the process's whole group (it's a detached group leader) with a fallback. */
const killTree = (p: BgProcess, signal: NodeJS.Signals): void => {
  const pid = p.child.pid;
  if (pid == null) return;
  try {
    process.kill(-pid, signal); // negative pid → the whole process group
  } catch {
    try {
      p.child.kill(signal);
    } catch {
      // already gone
    }
  }
};

let cleanupRegistered = false;
/** Ensure background processes never outlive the CLI (no orphaned dev servers). */
const registerCleanup = (): void => {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const killAll = (): void => {
    for (const p of processes.values())
      if (p.status === "running") killTree(p, "SIGKILL");
  };
  process.on("exit", killAll);
  process.on("SIGINT", () => {
    killAll();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    killAll();
    process.exit(143);
  });
};

const startProcess = async (cfg: BackgroundShellConfig): Promise<string> => {
  const command = cfg.command;
  if (!command) throw new Error("action 'start' requires a <COMMAND>.");
  const cwd = cfg.cwd ?? process.cwd();

  const child = spawn(command, {
    cwd,
    shell: "/bin/bash",
    detached: true, // own process group so stop/cleanup can kill the whole tree
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });

  const id = nextId++;
  const proc: BgProcess = {
    id,
    command,
    cwd,
    child,
    output: "",
    status: "running",
    exitCode: null,
    signal: null,
    startedAt: Date.now(),
  };
  processes.set(id, proc);
  registerCleanup();

  child.stdout?.on("data", (d: Buffer) => appendOutput(proc, d.toString()));
  child.stderr?.on("data", (d: Buffer) => appendOutput(proc, d.toString()));
  child.on("exit", (code, signal) => {
    proc.status = "exited";
    proc.exitCode = code;
    proc.signal = signal;
  });
  child.on("error", (err) => {
    appendOutput(proc, `\n[spawn error] ${err.message}\n`);
    proc.status = "exited";
    if (proc.exitCode == null) proc.exitCode = -1;
  });

  // Don't let the child's pipes keep the CLI's event loop alive after the run.
  child.unref();
  unrefStream(child.stdout);
  unrefStream(child.stderr);

  const settle = Math.min(
    Math.max(cfg.settle_ms ?? DEFAULT_SETTLE_MS, 0),
    MAX_SETTLE_MS,
  );
  await new Promise((r) => setTimeout(r, settle));

  const header =
    proc.status === "running"
      ? `Started background process #${id} — ${statusLine(proc)}.\n` +
        `It keeps running in the background. Use action 'logs' with PROCESS_ID ${id} to read new output, and 'stop' to terminate it.`
      : `Background process #${id} exited during the first ${settle}ms — ${statusLine(proc)}.\n` +
        `It did not stay up. Read the output below to see why (this usually means the command crashed on startup).`;

  const body =
    proc.output.trim().length > 0
      ? `--- output (first ${settle}ms) ---\n${proc.output}`
      : "(no output yet)";

  return `${header}\n${body}`;
};

const requireProcess = (cfg: BackgroundShellConfig, action: string): BgProcess => {
  if (cfg.process_id == null)
    throw new Error(`action '${action}' requires a <PROCESS_ID>.`);
  const p = processes.get(cfg.process_id);
  if (!p)
    throw new Error(
      `no background process #${cfg.process_id}. Use action 'list' to see started processes.`,
    );
  return p;
};

const getLogs = (cfg: BackgroundShellConfig): string => {
  const p = requireProcess(cfg, "logs");
  const body = p.output.trim().length > 0 ? p.output : "(no output captured yet)";
  return `Background process #${p.id}: ${p.command}\nstatus: ${statusLine(p)}\n--- output ---\n${body}`;
};

const listProcesses = (): string => {
  if (processes.size === 0) return "No background processes have been started.";
  const lines = [...processes.values()].map(
    (p) => `#${p.id}  [${statusLine(p)}]  ${p.command}  (cwd: ${p.cwd})`,
  );
  return `${processes.size} background process(es):\n${lines.join("\n")}`;
};

const stopProcess = async (cfg: BackgroundShellConfig): Promise<string> => {
  const p = requireProcess(cfg, "stop");
  if (hasExited(p))
    return `Background process #${p.id} already exited — ${statusLine(p)}.`;

  killTree(p, "SIGTERM");
  await new Promise((r) => setTimeout(r, STOP_GRACE_MS));
  if (!hasExited(p)) killTree(p, "SIGKILL");

  return hasExited(p)
    ? `Stopped background process #${p.id} — ${statusLine(p)}.`
    : `Sent SIGKILL to background process #${p.id}; it should exit momentarily.`;
};

export const backgroundShellTool = async (
  cfg: BackgroundShellConfig,
): Promise<string> => {
  switch (cfg.action) {
    case "start":
      return startProcess(cfg);
    case "logs":
      return getLogs(cfg);
    case "list":
      return listProcesses();
    case "stop":
      return stopProcess(cfg);
    default:
      throw new Error(
        `unknown ACTION "${cfg.action}". Use one of: start, logs, list, stop.`,
      );
  }
};

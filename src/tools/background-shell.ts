import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractXmlText } from "../utils/xml-utils.js";

type BgAction = "start" | "logs" | "list" | "stop";

type BackgroundShellConfig = {
  action: BgAction;
  command?: string;
  cwd?: string; // working directory, defaults to process.cwd()
  process_id?: number; // target process for logs/stop
  settle_ms?: number; // how long to watch a freshly started process
};

// State is persisted on disk (metadata + a log file per process) so it survives
// across separate CLI invocations — crack-head --use-tools spawns a fresh,
// short-lived process per tool call, so any in-memory registry would be lost.
type Meta = {
  id: number;
  command: string;
  cwd: string;
  pid: number;
  startedAt: number;
  stopped?: boolean;
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

export const background_shell_tool_description = `Start and manage long-lived background processes (dev servers, watchers, queues) that never exit on their own. Unlike use-shell, these are NOT killed by a timeout — they keep running so you can start a server, hit it, and read its logs. Background processes PERSIST across tool calls; stop them explicitly with the 'stop' action when you are done.

Pick an <ACTION>:
- start: spawn <COMMAND> in the background. Returns a numbered PROCESS_ID plus whatever it printed in the first ~1.5s (so you can tell if it booted or crashed on startup). Optional <CWD> and <SETTLE_MS> (how long to watch startup, max 15000).
- logs: read everything a process has printed so far. Requires <PROCESS_ID>. Use this after 'start' to check a server is ready before you curl it.
- list: show every background process with its status (running / exited / stopped) and command.
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
Background process #2 exited during the first 1500ms — exited.
It did not stay up. Read the output below to see why (this usually means the command crashed on startup).
--- output (first 1500ms) ---
Error: Cannot find module 'express'`;

const MAX_OUTPUT_CHARS = 60_000;
const DEFAULT_SETTLE_MS = 1_500;
const MAX_SETTLE_MS = 15_000;
const STOP_GRACE_MS = 2_000;

// All state lives under ~/.crack-head/bg so it persists across CLI invocations.
const STATE_DIR = join(homedir(), ".crack-head", "bg");
const metaPath = (id: number): string => join(STATE_DIR, `${id}.json`);
const logPath = (id: number): string => join(STATE_DIR, `${id}.log`);
const counterPath = (): string => join(STATE_DIR, ".next");

const ensureStateDir = (): void => {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
};

/** Monotonic id from a counter file so ids are never reused across calls. */
const nextId = (): number => {
  ensureStateDir();
  let n = 1;
  try {
    n = Number(readFileSync(counterPath(), "utf8")) || 1;
  } catch {
    n = 1;
  }
  writeFileSync(counterPath(), String(n + 1), "utf8");
  return n;
};

const readMeta = (id: number): Meta | null => {
  try {
    return JSON.parse(readFileSync(metaPath(id), "utf8")) as Meta;
  } catch {
    return null;
  }
};

const writeMeta = (meta: Meta): void => {
  ensureStateDir();
  writeFileSync(metaPath(meta.id), JSON.stringify(meta), "utf8");
};

const listMetas = (): Meta[] => {
  ensureStateDir();
  const metas: Meta[] = [];
  for (const f of readdirSync(STATE_DIR)) {
    if (!f.endsWith(".json")) continue;
    const m = readMeta(Number(f.slice(0, -5)));
    if (m) metas.push(m);
  }
  return metas.sort((a, b) => a.id - b.id);
};

/** A pid is alive if signal 0 succeeds (or fails with EPERM, not ESRCH). */
const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

const uptime = (startedAt: number): string => {
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
};

const statusLine = (m: Meta): string => {
  if (m.stopped) return "stopped";
  return isAlive(m.pid)
    ? `running (pid ${m.pid}, up ${uptime(m.startedAt)})`
    : "exited";
};

const readLog = (id: number): string => {
  let out = "";
  try {
    out = readFileSync(logPath(id), "utf8");
  } catch {
    return "";
  }
  return out.length > MAX_OUTPUT_CHARS ? out.slice(-MAX_OUTPUT_CHARS) : out;
};

/** Kill the whole process group (the child is a detached group leader). */
const killTree = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
};

const startProcess = async (cfg: BackgroundShellConfig): Promise<string> => {
  const command = cfg.command;
  if (!command) throw new Error("action 'start' requires a <COMMAND>.");
  const cwd = cfg.cwd ?? process.cwd();

  ensureStateDir();
  const id = nextId();
  const out = openSync(logPath(id), "a"); // child writes stdout+stderr here

  const child = spawn(command, {
    cwd,
    shell: "/bin/bash",
    detached: true, // own process group; survives the CLI exiting
    stdio: ["ignore", out, out],
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });
  const pid = child.pid;
  child.unref();
  closeSync(out); // the child inherited its own copy of the fd

  if (pid == null) throw new Error(`failed to spawn: ${command}`);

  const meta: Meta = { id, command, cwd, pid, startedAt: Date.now() };
  writeMeta(meta);

  const settle = Math.min(
    Math.max(cfg.settle_ms ?? DEFAULT_SETTLE_MS, 0),
    MAX_SETTLE_MS,
  );
  await new Promise((r) => setTimeout(r, settle));

  const alive = isAlive(pid);
  const body = readLog(id).trim();
  const header = alive
    ? `Started background process #${id} — ${statusLine(meta)}.\n` +
      `It keeps running in the background. Use action 'logs' with PROCESS_ID ${id} to read new output, and 'stop' to terminate it.`
    : `Background process #${id} exited during the first ${settle}ms — exited.\n` +
      `It did not stay up. Read the output below to see why (this usually means the command crashed on startup).`;

  return `${header}\n${
    body.length > 0
      ? `--- output (first ${settle}ms) ---\n${body}`
      : "(no output yet)"
  }`;
};

const requireMeta = (cfg: BackgroundShellConfig, action: string): Meta => {
  if (cfg.process_id == null)
    throw new Error(`action '${action}' requires a <PROCESS_ID>.`);
  const m = readMeta(cfg.process_id);
  if (!m)
    throw new Error(
      `no background process #${cfg.process_id}. Use action 'list' to see started processes.`,
    );
  return m;
};

const getLogs = (cfg: BackgroundShellConfig): string => {
  const m = requireMeta(cfg, "logs");
  const body = readLog(m.id).trim();
  return `Background process #${m.id}: ${m.command}\nstatus: ${statusLine(
    m,
  )}\n--- output ---\n${body.length > 0 ? body : "(no output captured yet)"}`;
};

const listProcesses = (): string => {
  const metas = listMetas();
  if (metas.length === 0) return "No background processes have been started.";
  const lines = metas.map(
    (m) => `#${m.id}  [${statusLine(m)}]  ${m.command}  (cwd: ${m.cwd})`,
  );
  return `${metas.length} background process(es):\n${lines.join("\n")}`;
};

const stopProcess = async (cfg: BackgroundShellConfig): Promise<string> => {
  const m = requireMeta(cfg, "stop");
  if (m.stopped || !isAlive(m.pid)) {
    if (!m.stopped) writeMeta({ ...m, stopped: true });
    return `Background process #${m.id} already exited — ${statusLine(m)}.`;
  }

  killTree(m.pid, "SIGTERM");
  await new Promise((r) => setTimeout(r, STOP_GRACE_MS));
  if (isAlive(m.pid)) killTree(m.pid, "SIGKILL");

  writeMeta({ ...m, stopped: true });
  return isAlive(m.pid)
    ? `Sent SIGKILL to background process #${m.id}; it should exit momentarily.`
    : `Stopped background process #${m.id}.`;
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

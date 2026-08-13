import { useEffect, useMemo, useRef, useState } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { Agent } from "../agent/parent.js";
import { Banner } from "./Banner.js";

type Channel = "user" | "parent" | "swarm" | "system" | "error";
type LogLine = { id: number; channel: Channel; text: string };

// Muted / faded palette so nothing screams on a dark terminal.
const channelColor: Record<Channel, string> = {
  user: "#7fa87f", // faded green
  parent: "#6a9fb5", // muted blue
  swarm: "#9d84b7", // muted purple
  system: "#6c6c6c", // gray
  error: "#b56a6a", // muted red
};

// Source tag shown before each line so agent vs sub-agent output is obvious.
const channelLabel: Record<Channel, string> = {
  user: "[YOU]   ",
  parent: "[AGENT] ",
  swarm: "[SWARM] ",
  system: "[SYSTEM]",
  error: "[ERROR] ",
};

// Visual rows a string occupies once wrapped to `width`, honouring newlines.
// `prefix` is the width of any inline label drawn before the first line.
const wrapHeight = (text: string, prefix: number, width: number) =>
  text.split("\n").reduce((total, part, idx) => {
    const len = (idx === 0 ? prefix : 0) + part.length;
    return total + Math.max(1, Math.ceil(len / Math.max(1, width)));
  }, 0);

const App = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const agent = useMemo(() => new Agent(), []);
  const nextId = useRef(0);

  const [logs, setLogs] = useState<LogLine[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [queued, setQueued] = useState<string[]>([]);

  const log = (channel: Channel, text: string) =>
    setLogs((prev) => [...prev, { id: nextId.current++, channel, text }]);

  // Pipe every agent event into the log.
  useEffect(() => {
    const onParent = (m: string) => log("parent", m);
    const onSwarm = (m: string) => log("swarm", m);
    const onSystem = (m: string) => log("system", m);
    const onError = (e: unknown) =>
      log("error", e instanceof Error ? e.message : String(e));

    agent.on("parent", onParent);
    agent.on("swarm", onSwarm);
    agent.on("system", onSystem);
    agent.on("error", onError);
    return () => {
      agent.off("parent", onParent);
      agent.off("swarm", onSwarm);
      agent.off("system", onSystem);
      agent.off("error", onError);
    };
  }, [agent]);

  // Reflect live loop state + waiting list without touching the Agent internals.
  useEffect(() => {
    const t = setInterval(() => {
      setBusy(agent.loop_running);
      setCurrent(agent.current_task);
      setQueued([...agent.pending_commands]);
    }, 150);
    return () => clearInterval(t);
  }, [agent]);

  const runLoop = () => {
    if (agent.loop_running) return;
    agent.loop().catch((e) =>
      log("error", e instanceof Error ? e.message : String(e)),
    );
  };

  const submit = (value: string) => {
    const prompt = value.trim();
    if (!prompt) return;
    setInput("");
    log("user", prompt); // echo the user's prompt
    agent.pushCommand(prompt); // queues if busy, otherwise first in line
    runLoop(); // no-op while running; starts a fresh loop when idle
  };

  useInput((char, key) => {
    if (key.escape && agent.loop_running) {
      agent.stopLoop();
      log("system", "⛔ Cancelling the current task.");
    }
    if (key.ctrl && char === "c") exit();
  });

  const rows = stdout.rows ?? 24;
  const cols = Math.max(20, (stdout.columns ?? 80) - 2); // usable width inside paddingX
  const showTasks = busy || current !== "" || queued.length > 0;
  // Rows the task panel consumes once wrapped, so the log never pushes input off-screen.
  const taskRows = showTasks
    ? 2 +
      (current ? wrapHeight(current, 2, cols) : 0) +
      queued.reduce(
        (n, q, i) => n + wrapHeight(`   ${i + 1}. ${q}`, 0, cols),
        0,
      )
    : 0;
  const maxLogRows = Math.max(1, rows - 4 - taskRows);
  // Keep the most recent logs that fit, measuring wrapped height so long
  // messages appear in full instead of being cut off with an ellipsis.
  const visibleLogs: LogLine[] = [];
  let usedRows = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const line = logs[i];
    if (!line) continue;
    const needed = wrapHeight(line.text, 9, cols);
    if (visibleLogs.length > 0 && usedRows + needed > maxLogRows) break;
    visibleLogs.unshift(line);
    usedRows += needed;
  }

  return (
    <Box flexDirection="column" height={rows} width="100%">
      {/* TOP: banner while empty, then emit events filling from the top down */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {logs.length === 0 ? (
          <Box flexGrow={1} alignItems="center" justifyContent="center">
            <Banner />
          </Box>
        ) : (
          visibleLogs.map((line) => (
            <Text key={line.id} wrap="wrap">
              <Text color={channelColor[line.channel]} bold>
                {channelLabel[line.channel]}
              </Text>
              <Text color={channelColor[line.channel]}>
                {" "}
                {line.text}
              </Text>
            </Text>
          ))
        )}
      </Box>

      {/* Tasks: current + waiting list, just above the textarea */}
      {showTasks && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color="#4e4e4e">── tasks ──</Text>
          {current !== "" && (
            <Text color="#b5a56a" wrap="wrap">
              {busy ? <Spinner type="dots" /> : "•"} {current}
            </Text>
          )}
          {queued.map((q, i) => (
            <Text key={i} color="#5f5f5f" dimColor wrap="wrap">
              {`   ${i + 1}. ${q}`}
            </Text>
          ))}
        </Box>
      )}

      {/* BOTTOM: input, always pinned */}
      <Box
        borderStyle="round"
        borderColor={busy ? "#8a7f4e" : "#4e6a4e"}
        paddingX={1}
      >
        <Text color="#7fa87f">{"❯ "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          placeholder="Type a prompt and press Enter"
        />
        <Text color={input.trim() ? "#7fa87f" : "#3f3f3f"}>{"  ➤"}</Text>
      </Box>
    </Box>
  );
};

export const startTui = () => render(<App />);
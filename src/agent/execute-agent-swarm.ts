import { Agent, AGENT_TYPE } from "./parent.js";

export type SwarmEvent =
  | { type: "launch"; count: number }
  | { type: "agent-start"; index: number; task: string }
  | { type: "agent-message"; index: number; text: string }
  | { type: "agent-done"; index: number; elapsedMs: number }
  | { type: "done"; count: number; elapsedMs: number };

// Render a structured SwarmEvent as a human-readable line. Without this the
// events stringify to "[object Object]" when interpolated into a message.
export const formatSwarmEvent = (event: SwarmEvent): string => {
  switch (event.type) {
    case "launch":
      return `Launching ${event.count} sub-agent(s)`;
    case "agent-start":
      return `Agent ${event.index} started — task: ${event.task
        .replace(/\s+/g, " ")
        .trim()}`;
    case "agent-message":
      return `Agent ${event.index}: ${event.text}`;
    case "agent-done":
      return `Agent ${event.index} finished in ${event.elapsedMs}ms`;
    case "done":
      return `All ${event.count} sub-agents finished in ${event.elapsedMs}ms`;
    default:
      return "";
  }
};

// Spawns one sub-agent per task, runs them all concurrently, and resolves with
// each agent's collected output only once every agent's loop has finished.
// Progress is surfaced through the optional onEvent callback (no direct logging).
export const executeAgentSwarm = async (
  tasks: string[],
  onEvent?: (event: SwarmEvent) => void,
): Promise<string[]> => {
  const t0 = Date.now();
  onEvent?.({ type: "launch", count: tasks.length });

  const results = await Promise.all(
    tasks.map(async (task, i) => {
      const index = i + 1;
      onEvent?.({ type: "agent-start", index, task });

      const agent = new Agent(AGENT_TYPE.SUB_AGENT);
      const outputs: string[] = [];

      // Forward each sub-agent's live output so the caller can show what the
      // agent is doing, and keep a copy for the returned result.
      agent.on("swarm", (msg: string) => {
        outputs.push(msg);
        onEvent?.({ type: "agent-message", index, text: msg.replace(/^>\s*/, "") });
      });
      agent.on("error", (err: unknown) =>
        outputs.push(err instanceof Error ? err.message : String(err)),
      );

      const startedAt = Date.now();
      agent.pushCommand(task);
      await agent.loop();

      onEvent?.({
        type: "agent-done",
        index,
        elapsedMs: Date.now() - startedAt,
      });

      // Prefer the agent's finish message (its verified deliverable); fall back
      // to the streamed responses if it ended without calling finish.
      return agent.result.trim().length > 0
        ? agent.result
        : outputs.join("\n");
    }),
  );

  onEvent?.({ type: "done", count: tasks.length, elapsedMs: Date.now() - t0 });
  return results;
};

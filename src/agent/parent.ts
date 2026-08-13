import { EventEmitter } from "node:events";
import { chat } from "../providers/index.js";
import { getAgentSystemprompt, getAgentprompt } from "../prompts.js";
import {
  executeTools,
  formatAvailableToolsXml,
  getFinishMessage,
} from "../tools/index.js";
import { extractAllXmlContent, extractXmlContent } from "../utils/xml-utils.js";
import { executeAgentSwarm, formatSwarmEvent } from "./execute-agent-swarm.js";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export enum AGENT_TYPE {
  AGENT,
  SUB_AGENT,
}

export class Agent extends EventEmitter {
  name: string;
  pending_commands: string[];
  pending_tool_call: string[];
  conversations: Message[];
  provider: string;
  model: string;
  stop_loop_signal: boolean;
  loop_running: boolean;
  latest_tool_output: string;
  latest_summary: string;
  current_task: string;
  latest_sub_agents_response: string;
  result: string;
  type: AGENT_TYPE;

  constructor(type: AGENT_TYPE = AGENT_TYPE.AGENT) {
    super();
    this.name = "";
    this.pending_commands = [];
    this.pending_tool_call = [];
    this.conversations = [];
    this.conversations.push({
      role: "system",
      content: getAgentSystemprompt(formatAvailableToolsXml()),
    });
    this.provider = "open-router";
    this.model = "openai/gpt-4o-mini";
    this.stop_loop_signal = false;
    this.loop_running = false;
    this.latest_tool_output = "";
    this.latest_summary = "";
    this.current_task = "";
    this.latest_sub_agents_response = "";
    this.result = "";
    this.type = type;
  }

  stopLoop = () => {
    this.stop_loop_signal = true;
  };

  pushCommand = (command: string) => {
    if (!command || command.length == 0) return;
    this.pending_commands.push(command);
  };

  executeNextCommand = async () => {
    const nextCommand = this.pending_commands.shift();
    if (
      !nextCommand &&
      this.latest_tool_output.length === 0 &&
      this.latest_sub_agents_response.length === 0
    )
      return;

    if (nextCommand) this.current_task = nextCommand;

    const finalprompt = getAgentprompt(
      this.current_task,
      this.latest_tool_output,
      this.latest_summary,
      this.latest_sub_agents_response,
    );

    // After feeding the previous tools output, it's reset back to empty
    this.latest_tool_output = "";
    this.latest_sub_agents_response = "";

    this.conversations.push({
      role: "user",
      content: finalprompt as string,
    });

    const response = await chat(this.conversations);

    this.conversations.push({
      role: "assistant",
      content: response as string,
    });

    return response;
  };

  loop = async () => {
    if (this.loop_running) return;
    this.loop_running = true;

    try {
      while (
        this.pending_commands.length > 0 ||
        this.latest_tool_output.length > 0 ||
        this.latest_sub_agents_response.length > 0
      ) {
        if (this.stop_loop_signal) {
          this.stop_loop_signal = false;
          break;
        }

        const response = await this.executeNextCommand();

        const tools_to_use = extractXmlContent(
          "TOOLS_TO_USE",
          response as string,
        );
        const summary = extractXmlContent("SUMMARY", response as string);

        const chat_response = extractXmlContent("RESPONSE", response as string);

        if (chat_response && chat_response.trim().length > 0) {
          this.emit(
            `${this.type == AGENT_TYPE.AGENT ? "parent" : "swarm"}`,
            `> ${chat_response}`,
          );
        }

        const sub_agents_str = extractXmlContent(
          "CREATE_SUB_AGENTS",
          response as string,
        );

        const sub_agents = extractAllXmlContent(
          "AGENT",
          sub_agents_str as string,
        );

        this.latest_summary = summary as string;

        // Only dispatch a swarm when the model actually requested sub-agents;
        // otherwise latest_sub_agents_response must stay "" so the loop can end.
        if (sub_agents.length > 0) {
          this.emit("system", "Spawnning agents :");

          const sub_agents_response = await executeAgentSwarm(
            sub_agents,
            (event) => this.emit("system", `> ${formatSwarmEvent(event)}`),
          );
          this.latest_sub_agents_response = sub_agents_response
            .map(
              (r, i) =>
                `<AGENT_RESPONSE index="${i + 1}"><![CDATA[\n${r}\n]]></AGENT_RESPONSE>`,
            )
            .join("\n");
        }

        try {
          if (tools_to_use && tools_to_use.trim().length > 0) {
            const tools_output = await executeTools(tools_to_use);
            this.latest_tool_output = tools_output;

            const finish_message = getFinishMessage(tools_to_use);
            if (finish_message !== null) {
              this.result =
                finish_message.trim().length > 0
                  ? finish_message
                  : "Task complete.";
              this.emit(
                this.type == AGENT_TYPE.AGENT ? "parent" : "swarm",
                `> ${this.result}`,
              );
              this.latest_tool_output = "";
              this.current_task = "";
              this.latest_sub_agents_response = "";
              break;
            }
          }
        } catch (err) {
          this.latest_tool_output = `<TOOL_OUTPUT>
<TOOL_NAME>unknown</TOOL_NAME>
<OUTPUT><![CDATA[
ERROR: ${err instanceof Error ? err.message : String(err)}
]]></OUTPUT>
</TOOL_OUTPUT>`;
        }
      }
    } catch (err) {
      this.emit("error", err);
      this.loop_running = false;
    } finally {
      this.loop_running = false;
    }
    this.loop_running = false;
  };
}

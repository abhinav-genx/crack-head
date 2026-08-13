import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatFireworks(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.fireworks.ai/inference/v1",
    apiKey,
    messages,
    model,
    "Fireworks",
  );
}

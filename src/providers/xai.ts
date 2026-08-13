import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatXAI(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.x.ai/v1",
    apiKey,
    messages,
    model,
    "xAI",
  );
}

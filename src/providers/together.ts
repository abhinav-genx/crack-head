import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatTogether(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.together.xyz/v1",
    apiKey,
    messages,
    model,
    "Together",
  );
}

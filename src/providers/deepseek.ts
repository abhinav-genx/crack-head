import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatDeepSeek(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.deepseek.com/v1",
    apiKey,
    messages,
    model,
    "DeepSeek",
  );
}

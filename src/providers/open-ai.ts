import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatOpenAI(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.openai.com/v1",
    apiKey,
    messages,
    model,
    "OpenAI",
  );
}

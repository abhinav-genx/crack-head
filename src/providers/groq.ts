import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatGroq(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.groq.com/openai/v1",
    apiKey,
    messages,
    model,
    "Groq",
  );
}

import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatOpenRouter(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://openrouter.ai/api/v1",
    apiKey,
    messages,
    model,
    "OpenRouter",
  );
}

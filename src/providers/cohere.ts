import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

// Cohere exposes an OpenAI-compatible endpoint under /compatibility/v1.
export function chatCohere(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.cohere.ai/compatibility/v1",
    apiKey,
    messages,
    model,
    "Cohere",
  );
}

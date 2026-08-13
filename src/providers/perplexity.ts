import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

// Perplexity's base URL has no /v1 segment.
export function chatPerplexity(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.perplexity.ai",
    apiKey,
    messages,
    model,
    "Perplexity",
  );
}

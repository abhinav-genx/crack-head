import { chatOpenAICompatible, type Message } from "./openai-compatible.js";

export function chatMistral(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  return chatOpenAICompatible(
    "https://api.mistral.ai/v1",
    apiKey,
    messages,
    model,
    "Mistral",
  );
}

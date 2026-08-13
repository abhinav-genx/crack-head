import type { Message } from "./openai-compatible.js";

export async function chatAnthropic(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  // Anthropic keeps the system prompt out of the messages array.
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const conversation = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: conversation,
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const content = data.content?.[0]?.text;
  if (content == null) {
    throw new Error("Anthropic returned no message content");
  }
  return content;
}

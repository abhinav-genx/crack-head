import type { Message } from "./openai-compatible.js";

export async function chatGemini(
  messages: Message[],
  model: string,
  apiKey: string,
): Promise<string> {
  // Gemini takes the system prompt separately and uses "model" for assistant turns.
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(systemText
          ? { system_instruction: { parts: [{ text: systemText }] } }
          : {}),
        contents,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (content == null) {
    throw new Error("Gemini returned no message content");
  }
  return content;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

// Shared client for every OpenAI-compatible provider (Bearer auth + /chat/completions).
export async function chatOpenAICompatible(
  baseURL: string,
  apiKey: string,
  messages: Message[],
  model: string,
  providerName = "provider",
): Promise<string> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    throw new Error(`${providerName} error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices[0]?.message.content;
  if (content == null) {
    throw new Error(`${providerName} returned no message content`);
  }
  return content;
}

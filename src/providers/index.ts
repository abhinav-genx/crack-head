import { PROVIDERS } from "../constants.js";
import {
  getActivemodel,
  getActiveProvider,
  getApiKey,
} from "../utils/config.js";
import type { Message } from "./openai-compatible.js";
import { chatOpenRouter } from "./open-router.js";
import { chatOpenAI } from "./open-ai.js";
import { chatAnthropic } from "./anathropic.js";
import { chatGemini } from "./gemini.js";
import { chatXAI } from "./xai.js";
import { chatGroq } from "./groq.js";
import { chatMistral } from "./mistral.js";
import { chatDeepSeek } from "./deepseek.js";
import { chatTogether } from "./together.js";
import { chatFireworks } from "./fireworks.js";
import { chatPerplexity } from "./perplexity.js";
import { chatCohere } from "./cohere.js";

export const chat = async (chats: Message[]): Promise<string> => {
  const provider = getActiveProvider();
  const model = getActivemodel();
  const apiKey = getApiKey(provider);

  switch (provider) {
    case PROVIDERS.OPEN_ROUTER:
      return chatOpenRouter(chats, model, apiKey);
    case PROVIDERS.OPEN_AI:
      return chatOpenAI(chats, model, apiKey);
    case PROVIDERS.ANATHROPIC:
      return chatAnthropic(chats, model, apiKey);
    case PROVIDERS.GEMINI:
      return chatGemini(chats, model, apiKey);
    case PROVIDERS.XAI:
      return chatXAI(chats, model, apiKey);
    case PROVIDERS.GROQ:
      return chatGroq(chats, model, apiKey);
    case PROVIDERS.MISTRAL:
      return chatMistral(chats, model, apiKey);
    case PROVIDERS.DEEPSEEK:
      return chatDeepSeek(chats, model, apiKey);
    case PROVIDERS.TOGETHER:
      return chatTogether(chats, model, apiKey);
    case PROVIDERS.FIREWORKS:
      return chatFireworks(chats, model, apiKey);
    case PROVIDERS.PERPLEXITY:
      return chatPerplexity(chats, model, apiKey);
    case PROVIDERS.COHERE:
      return chatCohere(chats, model, apiKey);
    default:
      throw new Error(`Unsupported provider: ${String(provider)}`);
  }
};

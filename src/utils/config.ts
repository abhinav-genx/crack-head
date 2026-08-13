import { PROVIDERS } from "../constants.js";
import { readConfig } from "./config-store.js";

const ENV_KEYS: Record<PROVIDERS, string> = {
  [PROVIDERS.OPEN_ROUTER]: "OPENROUTER_API_KEY",
  [PROVIDERS.OPEN_AI]: "OPENAI_API_KEY",
  [PROVIDERS.ANATHROPIC]: "ANTHROPIC_API_KEY",
  [PROVIDERS.GEMINI]: "GEMINI_API_KEY",
  [PROVIDERS.XAI]: "XAI_API_KEY",
  [PROVIDERS.GROQ]: "GROQ_API_KEY",
  [PROVIDERS.MISTRAL]: "MISTRAL_API_KEY",
  [PROVIDERS.DEEPSEEK]: "DEEPSEEK_API_KEY",
  [PROVIDERS.TOGETHER]: "TOGETHER_API_KEY",
  [PROVIDERS.FIREWORKS]: "FIREWORKS_API_KEY",
  [PROVIDERS.PERPLEXITY]: "PERPLEXITY_API_KEY",
  [PROVIDERS.COHERE]: "COHERE_API_KEY",
};

export const getActiveProvider = (): PROVIDERS => {
  const saved = readConfig().provider;
  return saved as PROVIDERS;
};

export const getActivemodel = (): string => {
  return readConfig().model;
};

export const getApiKey = (provider: PROVIDERS): string => {
  // apiKeys is keyed by slug, and the provider value is exactly that slug.
  const key = readConfig().apiKeys[provider];
  if (key && key.length > 0) return key;
  throw new Error(
    `Missing API key: set ${ENV_KEYS[provider]} in the environment`,
  );
};

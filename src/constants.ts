// Each value is the provider's slug. That slug is what we save in the config file
// (config.provider) and use as the key inside config.apiKeys.
export enum PROVIDERS {
  OPEN_ROUTER = "open-router",
  ANATHROPIC = "anathropic",
  OPEN_AI = "open-ai",
  GEMINI = "gemini",
  XAI = "xai",
  GROQ = "groq",
  MISTRAL = "mistral",
  DEEPSEEK = "deepseek",
  TOGETHER = "together",
  FIREWORKS = "fireworks",
  PERPLEXITY = "perplexity",
  COHERE = "cohere",
}
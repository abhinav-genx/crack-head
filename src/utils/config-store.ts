import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Persisted, user-editable config for crack-head. Holds secrets, so it is written 0600. */
export interface CrackHeadConfig {
  provider: string;
  model: string;
  apiKeys: Record<string, string>;
}

export const DEFAULT_CONFIG: CrackHeadConfig = {
  provider: "open-router",
  model: "gpt-4o-mini",
  apiKeys: {},
};

const APP_DIR = "crack-head";
const CONFIG_FILE = "config.json";

/** Resolve the config path via the XDG spec, falling back to ~/.config/crack-head/config.json. */
export const getConfigPath = (): string => {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.length > 0
      ? process.env.XDG_CONFIG_HOME
      : join(homedir(), ".config");
  return join(base, APP_DIR, CONFIG_FILE);
};

/** Overwrite the entire config file, creating the dir + file if missing. Secrets → 0600 perms. */
export const writeConfig = (config: CrackHeadConfig): void => {
  const path = getConfigPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
};

/** Read + parse the config, auto-initializing it with defaults when the file doesn't exist. */
export const readConfig = (): CrackHeadConfig => {
  const path = getConfigPath();
  if (!existsSync(path)) writeConfig(DEFAULT_CONFIG);
  const raw = readFileSync(path, "utf8");
  let parsed: Partial<CrackHeadConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<CrackHeadConfig>;
  } catch (err) {
    throw new Error(
      `Invalid JSON in config file at ${path}: ${(err as Error).message}`,
    );
  }
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    apiKeys: { ...DEFAULT_CONFIG.apiKeys, ...parsed.apiKeys },
  };
};

/** Ensure the config file exists (writing defaults if not) and return the current config. */
export const initConfig = (): CrackHeadConfig => readConfig();

/** Store the API key for a provider (keyed by its slug) and return the updated config. */
export const setApiKey = (
  provider: string,
  apiKey: string,
): CrackHeadConfig => {
  const config = readConfig();
  const updated: CrackHeadConfig = {
    ...config,
    apiKeys: { ...config.apiKeys, [provider]: apiKey },
  };
  writeConfig(updated);
  return updated;
};

/** Set the active provider and return the updated config. */
export const setProvider = (provider: string): CrackHeadConfig => {
  const updated: CrackHeadConfig = { ...readConfig(), provider };
  writeConfig(updated);
  return updated;
};

/** Set the active model and return the updated config. */
export const setModel = (model: string): CrackHeadConfig => {
  const updated: CrackHeadConfig = { ...readConfig(), model };
  writeConfig(updated);
  return updated;
};

/** Remove a provider's stored API key and return the updated config. */
export const removeApiKey = (provider: string): CrackHeadConfig => {
  const config = readConfig();
  const { [provider]: _removed, ...apiKeys } = config.apiKeys;
  const updated: CrackHeadConfig = { ...config, apiKeys };
  writeConfig(updated);
  return updated;
};

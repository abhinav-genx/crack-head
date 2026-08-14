// open ~/.config/crack-head

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "../providers/openai-compatible.js";

const APP_DIR = "crack-head";
const CONVERSATIONS_DIR = "conversations";

/** Directory that holds saved conversation transcripts (next to config.json). */
export const getConversationsDir = (): string => {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.length > 0
      ? process.env.XDG_CONFIG_HOME
      : join(homedir(), ".config");
  return join(base, APP_DIR, CONVERSATIONS_DIR);
};

/**
 * Turn a user-supplied conversation id into a safe file name. Only letters,
 * numbers, "-" and "_" survive, so the id can never escape the conversations
 * directory (path-traversal guard).
 */
export const sanitizeConversationId = (id: string): string => {
  const cleaned = id.trim().replace(/[^A-Za-z0-9_-]/g, "-");
  if (cleaned.length === 0 || /^-+$/.test(cleaned)) {
    throw new Error(
      `Invalid conversation id "${id}". Use letters, numbers, "-" or "_".`,
    );
  }
  return cleaned;
};

/** Absolute path of the JSON file backing a conversation id. */
export const getConversationPath = (id: string): string =>
  join(getConversationsDir(), `${sanitizeConversationId(id)}.json`);

/**
 * Load a previously saved conversation. Returns [] when none exists yet.
 * System messages are dropped so the caller can pair the history with a fresh
 * system prompt (tools/instructions may have changed since the last run).
 */
export const loadConversation = (id: string): Message[] => {
  const path = getConversationPath(id);
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(
      `Corrupt conversation file at ${path}: ${(err as Error).message}`,
    );
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (m): m is Message =>
      !!m &&
      typeof (m as Message).content === "string" &&
      ((m as Message).role === "user" || (m as Message).role === "assistant"),
  );
};

/**
 * Persist a conversation for the given id, overwriting any previous file so the
 * newly appended user/assistant turns are included. System messages are
 * stripped; secrets never land here but the file is still written 0600.
 */
export const saveConversation = (id: string, messages: Message[]): void => {
  const path = getConversationPath(id);
  mkdirSync(getConversationsDir(), { recursive: true, mode: 0o700 });
  const turns = messages.filter((m) => m.role !== "system");
  writeFileSync(path, `${JSON.stringify(turns, null, 2)}\n`, { mode: 0o600 });
};

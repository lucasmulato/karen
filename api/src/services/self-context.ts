/**
 * Compact, cached self-context injected into every chat. The data is produced
 * by scripts/self-model.mjs — the model never supplies these facts itself.
 */
import { readFile } from "node:fs/promises";

const DATA = "/home/admin/karen/api/data";
const SELF = process.env.KAREN_SELF_JSON ?? `${DATA}/self-model.json`;
const INDEX = process.env.KAREN_NOTE_INDEX_JSON ?? `${DATA}/note-index.json`;
const CACHE_MS = 60_000;
const MAX_CHARS = 1_200;

let cache: { at: number; text: string } | null = null;

async function readPrompt(path: string): Promise<string> {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return String(data?.prompt ?? "").slice(0, 750);
  } catch {
    return "";
  }
}

export async function selfContext(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  const [selfPrompt, indexPrompt] = await Promise.all([
    readPrompt(SELF),
    readPrompt(INDEX),
  ]);
  const text = [selfPrompt, indexPrompt].filter(Boolean).join("\n").slice(0, MAX_CHARS);
  cache = { at: Date.now(), text };
  return text;
}

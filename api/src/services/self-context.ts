/**
 * Compact, cached self-context injected into every chat. The data is produced
 * by scripts/self-model.mjs, about-sync.mjs and eva-reflect.mjs — the model
 * never supplies these facts itself.
 */
import { readFile } from "node:fs/promises";

const DATA = "/home/admin/karen/api/data";
const SELF = process.env.KAREN_SELF_JSON ?? `${DATA}/self-model.json`;
const ABOUT = process.env.KAREN_ABOUT_JSON ?? `${DATA}/about-self.json`;
const REFLECTION = process.env.KAREN_REFLECTION_JSON ?? `${DATA}/eva-reflection.json`;
const INDEX = process.env.KAREN_NOTE_INDEX_JSON ?? `${DATA}/note-index.json`;
const CACHE_MS = 60_000;
const MAX_CHARS = 1_400;

let cache: { at: number; text: string } | null = null;

async function readPrompt(path: string, max: number): Promise<string> {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return String(data?.prompt ?? "").slice(0, max);
  } catch {
    return "";
  }
}

export async function selfContext(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  const parts = await Promise.all([
    readPrompt(SELF, 450),
    readPrompt(ABOUT, 300),
    readPrompt(REFLECTION, 320),
    readPrompt(INDEX, 350),
  ]);
  const text = parts.filter(Boolean).join("\n").slice(0, MAX_CHARS);
  cache = { at: Date.now(), text };
  return text;
}

/** Deterministic, cached context for the intimacy layer. No model calls. */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const VAULT = process.env.KAREN_VAULT_DIR ?? "/home/admin/models/karen-vault";
const CACHE_MS = 60_000;
let cache: { at: number; text: string } | null = null;

async function read(relative: string, max: number): Promise<string> {
  try {
    const text = await readFile(join(VAULT, relative), "utf8");
    return text.trim().slice(0, max);
  } catch {
    return "";
  }
}

async function recentFeedback(): Promise<string> {
  try {
    const files = (await readdir(join(VAULT, "feedback")))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
      .slice(-3);
    const parts = await Promise.all(files.map((name) => read(`feedback/${name}`, 400)));
    return parts.filter(Boolean).join("\n---\n");
  } catch {
    return "";
  }
}

export async function intimacyContext(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  const [user, rules, learning, feedback] = await Promise.all([
    read("USER.md", 900),
    read("RULES.md", 700),
    read("learning/INDEX.md", 500),
    recentFeedback(),
  ]);
  const parts = [
    user ? `PERFIL DO LUCAS (USER.md):\n${user}` : "",
    rules ? `REGRAS DE RELACIONAMENTO (RULES.md):\n${rules}` : "",
    learning ? `APRENDIZADO (learning/INDEX.md):\n${learning}` : "",
    feedback ? `FEEDBACK RECENTE:\n${feedback}` : "",
  ].filter(Boolean);
  const text = parts.join("\n").slice(0, 2600);
  cache = { at: Date.now(), text };
  return text;
}

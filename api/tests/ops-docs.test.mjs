import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function read(rel) {
  return readFile(join(ROOT, rel), "utf8");
}

test("AGENTS.md uses Portuguese and keeps the mission order", async () => {
  const text = await read("AGENTS.md");
  assert.match(text, /fale com Lucas em \*\*português\*\*/);
  assert.match(text, /First revenue within 30 days/);
  assert.match(text, /Fases 0 a 5/);
});

test("funding tracker lists verified sources without invented deadlines", async () => {
  const text = await read("docs/FUNDING-TRACKER.md");
  for (const name of ["Manifund", "Transformative AI Fund", "Alignment Project", "FAPESC"]) {
    assert.ok(text.includes(name), name);
  }
  assert.match(text, /Fechado/);
  assert.match(text, /2026-11-24/);
});

test("application skeleton has question, milestones and honest budget", async () => {
  const text = await read("docs/APPLICATION-SKELETON.md");
  assert.match(text, /Pergunta de pesquisa/);
  assert.match(text, /2027-03-31/);
  assert.match(text, /não medido/);
  assert.match(text, /a estimar com Lucas/);
});

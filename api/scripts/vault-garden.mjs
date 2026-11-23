#!/usr/bin/env node
/**
 * EVA vault maintenance — read-only suggestions, no automatic mutations.
 *
 * Finds orphan vault notes, suggests backlinks using the embeddings already
 * stored in Postgres, and drafts MEMORY.md lines from recent decisions that
 * are not in memory yet. Writes a reviewable JSON file; nothing is applied.
 *
 *   node scripts/vault-garden.mjs --dry-run   # print only
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { VaultFsService } from "../build/services/vaultfs.js";
import { pickSuggestions, memoryDraft } from "./lib/vault-garden.mjs";

const DATA = "/home/admin/karen/api/data";
const REPORT = resolve(process.env.KAREN_GARDEN_JSON ?? `${DATA}/vault-maintenance.json`);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");
const MAX_ORPHANS = 20;

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function writeAtomic(path, payload) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  let orphans;
  try {
    const res = await client.query(
      `SELECT id, name, type, embedding::text AS vector
         FROM nodes x
        WHERE x.source NOT LIKE 'kb:%'
          AND x.embedding IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM edges e WHERE e.source_id = x.id OR e.target_id = x.id
          )
        ORDER BY x.created_at DESC LIMIT $1`,
      [MAX_ORPHANS]
    );
    orphans = res.rows;
  } finally {
    await client.end();
  }

  const suggestions = [];
  for (const orphan of orphans) {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const res = await client.query(
        `SELECT id, name, 1 - (embedding <=> $1::vector) AS score
           FROM nodes
          WHERE id <> $2::uuid AND embedding IS NOT NULL AND source NOT LIKE 'kb:%'
          ORDER BY embedding <=> $1::vector LIMIT 6`,
        [orphan.vector, orphan.id]
      );
      suggestions.push({
        orphan: { id: orphan.id, name: orphan.name, type: orphan.type },
        candidates: pickSuggestions(res.rows),
      });
    } catch {
      // A single failed similarity query must not break the report.
      suggestions.push({
        orphan: { id: orphan.id, name: orphan.name, type: orphan.type },
        candidates: [],
      });
    } finally {
      await client.end();
    }
  }

  const vault = new VaultFsService();
  const [memory, decisions, previous] = await Promise.all([
    vault.memory().catch(() => ""),
    vault.decisions(8).catch(() => []),
    readJson(REPORT),
  ]);

  const report = {
    generated_at: new Date().toISOString(),
    orphans_total: orphans.length,
    with_candidates: suggestions.filter((s) => s.candidates.length > 0).length,
    suggestions,
    memory_draft: memoryDraft(memory, decisions),
    applied: false,
    previous_generated_at: previous?.generated_at ?? null,
  };

  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (DRY) {
    console.log(payload);
    return;
  }
  await writeAtomic(REPORT, payload);
  console.log(
    `[vault-garden] ${report.orphans_total} órfãs · ` +
      `${report.with_candidates} com sugestões · ` +
      `${report.memory_draft.length} linhas de MEMORY.md (rascunho) → ${REPORT}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

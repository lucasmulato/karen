#!/usr/bin/env node
/**
 * Applies the reversible knowledge-hygiene proposals (tags, maturity, archive
 * flag and duplicate markers) with explicit approval and one-command revert.
 * No node is deleted and no note file is moved: merge stays a proposal only.
 *
 *   node scripts/apply-proposals.mjs --dry-run
 *   node scripts/apply-proposals.mjs --approve
 *   node scripts/apply-proposals.mjs --revert
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const DATA = "/home/admin/karen/api/data";
const HYGIENE = resolve(`${DATA}/knowledge-hygiene.json`);
const AUDIT = resolve(`${DATA}/proposals-applied.json`);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const APPROVE = args.has("--approve");
const REVERT = args.has("--revert");

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
  try {
    if (REVERT) {
      const audit = await readJson(AUDIT);
      if (!audit?.nodes?.length) { console.log("Nada para reverter."); return; }
      let undone = 0;
      // Reverse order so the earliest snapshot wins when a node changed twice.
      for (const node of [...audit.nodes].reverse()) {
        try {
          await client.query("UPDATE nodes SET properties = $1::jsonb WHERE id = $2::uuid", [
            JSON.stringify(node.previous ?? {}),
            node.id,
          ]);
          undone++;
        } catch { /* node gone */ }
      }
      console.log(`[apply-proposals] revert: ${undone} nó(s) restaurado(s)`);
      return;
    }

    const report = await readJson(HYGIENE);
    if (!report) { console.log("Sem relatório de higiene."); return; }
    if (!APPROVE && !DRY) throw new Error("Use --approve para aplicar propostas.");

    const changes = [];
    for (const tag of report.proposals?.tags ?? []) {
      if (!tag?.id || !tag?.propose_tag) continue;
      const current = await client.query("SELECT properties FROM nodes WHERE id = $1::uuid", [tag.id]);
      if (!current.rows[0]) continue;
      const previous = current.rows[0].properties ?? {};
      if (previous.tags) continue;
      changes.push({
        id: tag.id,
        name: tag.name,
        field: "tags",
        applied: [tag.propose_tag],
        previous,
      });
      if (DRY) continue;
      await client.query(
        "UPDATE nodes SET properties = properties || $1::jsonb WHERE id = $2::uuid",
        [JSON.stringify({ tags: [tag.propose_tag] }), tag.id]
      );
    }
    for (const proposal of report.proposals?.maturity ?? []) {
      if (!proposal?.id) continue;
      const current = await client.query("SELECT properties FROM nodes WHERE id = $1::uuid", [proposal.id]);
      if (!current.rows[0]) continue;
      const previous = current.rows[0].properties ?? {};
      if (previous.maturity === proposal.propose) continue;
      changes.push({
        id: proposal.id,
        name: proposal.name,
        field: "maturity",
        applied: proposal.propose,
        previous,
      });
      if (DRY) continue;
      await client.query(
        "UPDATE nodes SET properties = properties || $1::jsonb WHERE id = $2::uuid",
        [JSON.stringify({ maturity: proposal.propose }), proposal.id]
      );
    }

    // Archive: flag the node in Postgres — never move the actual file.
    for (const proposal of report.proposals?.archive ?? []) {
      if (!proposal?.id) continue;
      const current = await client.query("SELECT properties FROM nodes WHERE id = $1::uuid", [proposal.id]);
      if (!current.rows[0]) continue;
      const previous = current.rows[0].properties ?? {};
      if (previous.archived) continue;
      changes.push({
        id: proposal.id,
        name: proposal.name,
        field: "archived",
        applied: true,
        previous,
      });
      if (DRY) continue;
      await client.query(
        "UPDATE nodes SET properties = properties || $1::jsonb WHERE id = $2::uuid",
        [JSON.stringify({ archived: true, archived_at: new Date().toISOString() }), proposal.id]
      );
    }

    // Duplicates: mark both sides for review — never delete or merge nodes.
    for (const pair of report.proposals?.duplicates ?? []) {
      for (const id of [pair?.a_id, pair?.b_id]) {
        if (!id) continue;
        const current = await client.query("SELECT properties FROM nodes WHERE id = $1::uuid", [id]);
        if (!current.rows[0]) continue;
        const previous = current.rows[0].properties ?? {};
        if (previous.duplicate_candidate) continue;
        changes.push({
          id,
          name: id === pair.a_id ? pair.a : pair.b,
          field: "duplicate_candidate",
          applied: true,
          previous,
        });
        if (DRY) continue;
        await client.query(
          "UPDATE nodes SET properties = properties || $1::jsonb WHERE id = $2::uuid",
          [JSON.stringify({ duplicate_candidate: true }), id]
        );
      }
    }

    const audit = {
      applied_at: new Date().toISOString(),
      source_report: report.generated_at,
      count: changes.length,
      nodes: changes,
      revert: "node scripts/apply-proposals.mjs --revert",
    };
    if (DRY) { console.log(JSON.stringify(audit, null, 2)); return; }
    await writeAtomic(AUDIT, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(`[apply-proposals] ${changes.length} propriedade(s) aplicada(s) → ${AUDIT}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

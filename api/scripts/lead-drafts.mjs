#!/usr/bin/env node
/**
 * Pre-drafts firstTouch/followUp for leads that still have none, using the
 * same deterministic templates as the chat tool. Never sends anything.
 *
 *   node scripts/lead-drafts.mjs --dry-run
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { draftFor } from "../build/templates/outreach.js";

const REPORT = resolve("/home/admin/karen/api/data/lead-drafts.json");
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");
const MAX = 50;
const COLUMNS = `id, title, neighborhood, city, category, rating, reviews_count, website, maps_url`;

async function main() {
  const ctx = {
    operatorName: process.env.OPERATOR_NAME?.trim() || "[Seu Nome]",
    exampleLink: process.env.KAREN_EXAMPLE_LINK?.trim() || "[LINK DO SEU CARDAPIFY DE EXEMPLO]",
  };
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const drafted = [];
  try {
    const res = await client.query(
      `SELECT ${COLUMNS} FROM leads
        WHERE suppressed = FALSE
          AND (draft->>'firstTouch' IS NULL OR draft->>'firstTouch' = '')
        ORDER BY created_at DESC LIMIT $1`,
      [MAX]
    );
    for (const row of res.rows) {
      const place = {
        title: row.title,
        neighborhood: row.neighborhood,
        city: row.city,
        category: row.category,
        rating: row.rating ? Number(row.rating) : null,
        reviewsCount: row.reviews_count ? Number(row.reviews_count) : null,
        website: row.website,
        mapsUrl: row.maps_url,
      };
      const draft = draftFor(place, ctx);
      drafted.push({ id: row.id, title: row.title, model: draft.model, firstTouch: draft.firstTouch });
      if (!DRY) {
        await client.query("UPDATE leads SET draft = $1::jsonb WHERE id = $2::uuid", [
          JSON.stringify(draft),
          row.id,
        ]);
      }
    }
  } finally {
    await client.end();
  }

  const report = {
    generated_at: new Date().toISOString(),
    count: drafted.length,
    drafts: drafted.map(({ id, title, model }) => ({ id, title, model })),
  };
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (DRY) { console.log(payload); return; }
  const tmp = `${REPORT}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, REPORT);
  console.log(`[lead-drafts] ${drafted.length} rascunho(s) gerado(s) — nenhum envio → ${REPORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

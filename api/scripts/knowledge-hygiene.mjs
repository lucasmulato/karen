#!/usr/bin/env node
/**
 * Read-only knowledge hygiene proposals: maturity, near-duplicates, archive
 * candidates, folder tags and a small external link check. Nothing is applied.
 *
 *   node scripts/knowledge-hygiene.mjs --dry-run
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const REPORT = resolve("/home/admin/karen/api/data/knowledge-hygiene.json");
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");

async function writeAtomic(path, payload) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const report = { generated_at: new Date().toISOString(), proposals: {}, broken_links: [], issues: [] };
  try {
    const maturity = await client.query(
      `SELECT n.id, n.name, COUNT(e.id)::int AS links
         FROM nodes n LEFT JOIN edges e ON e.source_id = n.id OR e.target_id = n.id
        WHERE n.source NOT LIKE 'kb:%'
          AND COALESCE(n.properties->>'maturity','seedling') = 'seedling'
          AND n.created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
        GROUP BY n.id, n.name HAVING COUNT(e.id) >= 3
        ORDER BY links DESC LIMIT 10`
    );
    report.proposals.maturity = maturity.rows.map((r) => ({
      id: r.id, name: r.name, links: r.links, propose: "budding",
    }));

    const duplicates = await client.query(
      `SELECT a.id AS a_id, a.name AS a_name, b.id AS b_id, b.name AS b_name,
              1 - (a.embedding <=> b.embedding) AS score
         FROM nodes a JOIN nodes b ON a.id < b.id
        WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
          AND a.source NOT LIKE 'kb:%' AND b.source NOT LIKE 'kb:%'
          AND a.embedding <=> b.embedding < 0.06
        ORDER BY score DESC LIMIT 10`
    );
    report.proposals.duplicates = duplicates.rows.map((r) => ({
      a_id: r.a_id, b_id: r.b_id, a: r.a_name, b: r.b_name,
      score: Number(r.score), propose: "review_merge",
    }));

    const archive = await client.query(
      `SELECT n.id, n.name, n.updated_at
         FROM nodes n
        WHERE n.source NOT LIKE 'kb:%' AND n.type = 'note'
          AND n.updated_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
          AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.source_id = n.id OR e.target_id = n.id)
        ORDER BY n.updated_at ASC LIMIT 10`
    );
    report.proposals.archive = archive.rows.map((r) => ({
      id: r.id, name: r.name, updated_at: r.updated_at, propose: "40 Archive",
    }));

    const tags = await client.query(
      `SELECT id, name, source FROM nodes
        WHERE source NOT LIKE 'kb:%' AND properties->'tags' IS NULL
        ORDER BY created_at DESC LIMIT 20`
    );
    report.proposals.tags = tags.rows.map((r) => {
      const folder = String(r.source ?? "").split("/").slice(-2, -1)[0] ?? "geral";
      return { id: r.id, name: r.name, propose_tag: folder };
    });

    const links = await client.query(
      `SELECT id, name, properties->>'url' AS url FROM nodes
        WHERE properties->>'url' LIKE 'http%' ORDER BY created_at DESC LIMIT 6`
    );
    for (const row of links.rows) {
      try {
        const res = await fetch(row.url, { method: "HEAD", signal: AbortSignal.timeout(4_000), redirect: "follow" });
        if (!res.ok && res.status !== 405) report.broken_links.push({ name: row.name, url: row.url, status: res.status });
      } catch {
        report.broken_links.push({ name: row.name, url: row.url, status: "unreachable" });
      }
    }
  } catch (err) {
    report.issues.push(String(err?.message ?? "falha").slice(0, 140));
  } finally {
    await client.end();
  }

  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (DRY) { console.log(payload); return; }
  await writeAtomic(REPORT, payload);
  const counts = Object.entries(report.proposals).map(([k, v]) => `${k}:${v.length}`).join(" ");
  console.log(`[knowledge-hygiene] ${counts} · links quebrados: ${report.broken_links.length} → ${REPORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

#!/usr/bin/env node
/**
 * Ingest local files or URLs into the SynapseVault knowledge graph.
 *
 * Usage:
 *   node scripts/ingest.mjs ./prompts/srEth.md ../README.md https://example.org/doc
 *
 * Environment: DATABASE_URL (required), plus the same CLOUDFLARE_* / EMBEDDING_*
 * variables as the API to also generate vector embeddings.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const CHUNK_SIZE = Number(process.env.INGEST_CHUNK_SIZE || 1400);

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunk(text) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > CHUNK_SIZE && current) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

function titleOf(text, fallback) {
  const first = text.split("\n")[0].replace(/^#+\s*/, "").trim();
  return first.length > 3 && first.length < 160 ? first : fallback;
}

async function readSource(source, index) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, {
      headers: { "User-Agent": "SynapseVault-ingest/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${source}`);
    return { text: htmlToText(await res.text()), source, index };
  }
  const path = resolve(source);
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return { text: readFileSync(path, "utf8"), source, index };
}

async function main() {
  const sources = process.argv.slice(2);
  if (sources.length === 0) {
    console.error("Usage: node scripts/ingest.mjs <file-or-url> [...]");
    process.exit(1);
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const embedEnabled = Boolean(accountId && token);
  const embeddingModel = process.env.EMBEDDING_MODEL || "@cf/baai/bge-m3";
  const embeddingBase =
    process.env.EMBEDDING_BASE_URL ||
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
  const embeddingDim = Number(process.env.EMBEDDING_DIM || 1024);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let inserted = 0;
  let skipped = 0;
  let embedded = 0;

  for (const [sourceIndex, source] of sources.entries()) {
    let material;
    try {
      material = await readSource(source, sourceIndex);
    } catch (err) {
      console.error(`SKIP ${source}: ${err.message}`);
      continue;
    }
    const chunks = chunk(material.text);
    console.log(`${source}: ${chunks.length} chunks`);

    for (const [chunkIndex, chunkText] of chunks.entries()) {
      const hash = createHash("sha256")
        .update(`${material.source}\n${chunkText}`)
        .digest("hex");
      const exists = await client.query(
        "SELECT 1 FROM nodes WHERE content_hash = $1 LIMIT 1",
        [hash]
      );
      if (exists.rowCount) {
        skipped++;
        continue;
      }

      let vector = null;
      if (embedEnabled) {
        try {
          const res = await fetch(`${embeddingBase}/embeddings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ model: embeddingModel, input: chunkText }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          vector = json.data[0].embedding;
          if (vector.length !== embeddingDim) {
            throw new Error(`dim ${vector.length} != ${embeddingDim}`);
          }
        } catch (err) {
          console.error(`  embedding failed for chunk ${chunkIndex}: ${err.message}`);
        }
      }

      const columns = [
        "type",
        "name",
        "description",
        "properties",
        "content_hash",
        "source",
      ];
      const values = [
        "note",
        titleOf(chunkText, `${material.source} #${chunkIndex + 1}`).slice(0, 300),
        chunkText,
        JSON.stringify({ chunk_index: chunkIndex, origin: material.source }),
        hash,
        material.source,
      ];
      if (vector) {
        columns.push("embedding", "embedding_model", "embedding_updated_at");
        values.push(
          `[${vector.join(",")}]`,
          embeddingModel,
          "CURRENT_TIMESTAMP"
        );
      }
      const placeholders = columns.map((col, i) =>
        col === "embedding"
          ? `$${i + 1}::vector`
          : col === "embedding_updated_at"
            ? "CURRENT_TIMESTAMP"
            : `$${i + 1}`
      );
      await client.query(
        `INSERT INTO nodes (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
        values
      );
      inserted++;
      if (vector) embedded++;
    }
  }

  await client.end();
  console.log(
    `Done: inserted=${inserted} skipped=${skipped} embedded=${embedded} embeddings=${embedEnabled}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

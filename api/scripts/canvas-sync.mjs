#!/usr/bin/env node
/**
 * Keeps the vault's Mapa.canvas in sync with the Postgres graph. The file is
 * a deterministic export (JSON Canvas 1.0); no note is edited.
 *
 *   node scripts/canvas-sync.mjs --dry-run
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { CanvasService } from "../build/services/canvas.js";
import { VaultService } from "../build/services/vault.js";

const TARGET = resolve("/home/admin/models/karen-vault/Mapa.canvas");
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  let canvas;
  try {
    canvas = await new CanvasService(client, new VaultService(client, null)).export();
  } finally {
    await client.end();
  }
  const payload = `${JSON.stringify(canvas, null, 2)}\n`;
  let previous = "";
  try { previous = await readFile(TARGET, "utf8"); } catch { /* first run */ }
  if (previous === payload) {
    console.log(`[canvas-sync] sem mudanças (${canvas.nodes.length} nós, ${canvas.edges.length} arestas)`);
    return;
  }
  if (DRY) {
    console.log(`[canvas-sync] seria escrito: ${canvas.nodes.length} nós, ${canvas.edges.length} arestas → ${TARGET}`);
    return;
  }
  const tmp = `${TARGET}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, TARGET);
  console.log(`[canvas-sync] ${canvas.nodes.length} nós, ${canvas.edges.length} arestas → ${TARGET}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

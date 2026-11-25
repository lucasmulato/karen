#!/usr/bin/env node
/**
 * Manual Climara OSM scan (Fase 5 gap filler).
 * Reads public data only; no DB writes, no messages, no timers, no auth bypass.
 *
 *   node scripts/climara-scan.mjs --dry-run
 *   node scripts/climara-scan.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { scoreLead } from "../build/services/lead-scoring.js";
import { renderLeadPreview } from "../build/services/lead-preview.js";
import { leadKey, shouldRefresh } from "../build/services/scan-policy.js";

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));
const CONFIG = join(ROOT, "config", "climara-pipeline.json");
const CACHE = process.env.KAREN_SCAN_CACHE ?? join(ROOT, "data", "climara-scan-cache.json");
const OUTPUT = process.env.KAREN_SCAN_OUTPUT ?? join(ROOT, "data", "climara-scan.json");
const PREVIEWS = process.env.KAREN_SCAN_PREVIEWS ??
  "/home/admin/models/karen-vault/drafts/previews";
const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const UA = "KAREN-SynapseVault/1.0 (local lead research)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function nominatim(params, pauseMs) {
  const url = new URL(NOMINATIM);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  await sleep(pauseMs);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const config = await readJson(CONFIG, null);
  if (!config?.city || !config?.niche) throw new Error("Config de pipeline inválida.");
  const pauseMs = Math.ceil(60_000 / Math.max(1, Number(config.rateLimitPerMinute) || 4));
  const nowMs = Date.now();
  const cache = await readJson(CACHE, { at: null, entries: [] });
  const force = FORCE || DRY;
  const useCache = !force && !shouldRefresh(cache.at, nowMs, Number(config.overpassCacheMinutes) || 10);
  const checkedAt = new Date().toISOString();

  let raw;
  if (useCache) {
    raw = cache.entries ?? [];
    console.log(`cache usado (${raw.length} entradas)`);
  } else {
    const geo = await nominatim({ format: "jsonv2", limit: 1, q: config.city }, pauseMs);
    if (!geo.length) throw new Error("Cidade não encontrada na base OSM.");
    const searches = [config.query ?? "loja", config.niche];
    const found = [];
    for (const q of [...new Set(searches)]) {
      try {
        const rows = await nominatim(
          { format: "jsonv2", addressdetails: 1, extratags: 1, limit: 25, q: `${q}, ${config.city}` },
          pauseMs
        );
        found.push(...rows);
      } catch (err) {
        console.warn(`busca '${q}' falhou: ${err.message}`);
      }
    }
    const seen = new Set();
    raw = found.filter((row) => {
      const key = leadKey({
        name: row.name ?? row.display_name?.split(",")[0] ?? "",
        phone: (row.extratags?.phone ?? row.extratags?.["contact:phone"] ?? ""),
      });
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const leads = raw
    .map((row) => {
      const extra = row.extratags ?? {};
      const address = row.address ?? {};
      const input = {
        title: row.name ?? row.display_name?.split(",")[0] ?? "",
        phone: extra.phone ?? extra["contact:phone"] ?? null,
        website: extra.website ?? extra["contact:website"] ?? null,
        category: row.type ?? row.class ?? null,
        rating: null,
        reviewsCount: null,
        address: [address.road, address.house_number].filter(Boolean).join(", ") || null,
        neighborhood: address.suburb ?? address.neighbourhood ?? null,
        city: config.city,
        mapsUrl: row.osm_id ? `https://www.openstreetmap.org/${row.osm_type ?? "node"}/${row.osm_id}` : null,
      };
      const scored = scoreLead(input);
      return {
        ...input,
        score: scored.score,
        bucket: scored.bucket,
        reasons: scored.reasons,
        source: "Nominatim/OpenStreetMap",
        checkedAt,
      };
    })
    .filter((lead) => lead.phone && lead.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  const top = leads.slice(0, 5);
  const previewPaths = top.map((lead) => {
    const slug = leadKey(lead).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48);
    return `${PREVIEWS}/${checkedAt.slice(0, 10)}/${slug}.html`;
  });

  const report = {
    generated_at: checkedAt,
    niche: config.niche,
    city: config.city,
    source: "Nominatim/OpenStreetMap (public data)",
    scanned: raw.length,
    qualified: leads.length,
    leads,
    previewPaths,
    note: "Nenhum contato foi enviado. Nenhum lead foi gravado no banco da Karen.",
  };

  if (DRY) {
    console.log(JSON.stringify({ ...report, leads: leads.slice(0, 3), previews: previewPaths.length }, null, 2));
    return;
  }

  await writeJson(OUTPUT, report);
  if (!useCache) await writeJson(CACHE, { at: checkedAt, entries: raw });
  await mkdir(`${PREVIEWS}/${checkedAt.slice(0, 10)}`, { recursive: true });
  for (let i = 0; i < top.length; i++) {
    await writeFile(previewPaths[i], renderLeadPreview(top[i]), "utf8");
  }
  console.log(`scan ok: ${raw.length} varridos, ${leads.length} qualificados, ${previewPaths.length} previews.`);
}

main().catch((err) => {
  console.error(`climara-scan falhou: ${err.message}`);
  process.exit(1);
});

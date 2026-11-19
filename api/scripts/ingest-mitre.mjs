#!/usr/bin/env node
/**
 * Converts MITRE ATT&CK / CAPEC STIX collections into KAREN knowledge nodes.
 * MITRE grants a royalty-free license provided the copyright notice is
 * reproduced — stored in every node's properties.
 */
import { createHash } from "node:crypto";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const NOTICE =
  "© 2026 The MITRE Corporation. This work is reproduced and distributed with the permission of The MITRE Corporation.";

const FILES = [
  { path: "enterprise-attack/enterprise-attack.json", label: "ATT&CK Enterprise", source: "mitre-attack" },
  { path: "pre-attack/pre-attack.json", label: "ATT&CK PRE-ATT&CK", source: "mitre-pre-attack" },
  { path: "mobile-attack/mobile-attack.json", label: "ATT&CK Mobile", source: "mitre-mobile-attack" },
  { path: "capec/2.1/stix-capec.json", label: "CAPEC", source: "mitre-capec" },
];

const hash = (text) => createHash("sha256").update(text).digest("hex");

async function fetchJson(path) {
  const url = `https://raw.githubusercontent.com/mitre/cti/master/${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "KAREN-KB-Ingest/1.0" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`raw ${res.status} ${path}`);
  return res.json();
}

function describe(obj, label, source) {
  if (!obj.name || !obj.description) return null;
  const ref = (obj.external_references ?? []).find((r) => r.external_id);
  const id = ref?.external_id ?? obj.id;
  const tactics = (obj.kill_chain_phases ?? []).map((p) => p.phase_name);
  const platforms = obj.x_mitre_platforms ?? [];
  const description = [
    `# ${label} — ${obj.name}`,
    "",
    `**ID:** ${id}`,
    tactics.length ? `**Táticas:** ${tactics.join(", ")}` : "",
    platforms.length ? `**Plataformas:** ${platforms.join(", ")}` : "",
    "",
    obj.description,
  ].filter((line) => line !== "").join("\n");
  return {
    id,
    name: `${label}: ${obj.name}`,
    description: description.slice(0, 10_000),
    properties: {
      kb: true,
      mitre_id: id,
      source_name: source,
      tactics,
      platforms,
      license: "MITRE royalty-free with copyright notice",
      attribution: NOTICE,
      url: ref?.url ?? `https://attack.mitre.org/`,
    },
  };
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  let inserted = 0;
  let skipped = 0;

  for (const file of FILES) {
    let json;
    try {
      console.log(`Baixando ${file.label}...`);
      json = await fetchJson(file.path);
    } catch (err) {
      console.error(`SKIP ${file.label}: ${err.message}`);
      continue;
    }
    const objects = json.objects ?? [];
    let count = 0;
    for (const obj of objects) {
      if (!["attack-pattern", "course-of-action"].includes(obj.type)) continue;
      if (obj.revoked || obj.x_mitre_deprecated) continue;
      const item = describe(obj, file.label, file.source);
      if (!item) continue;
      const contentHash = hash(`${item.name}\n${item.description}`);
      const exists = await client.query(
        "SELECT 1 FROM nodes WHERE content_hash = $1 LIMIT 1",
        [contentHash]
      );
      if (exists.rowCount) { skipped++; continue; }
      await client.query(
        `INSERT INTO nodes (type, name, description, properties, content_hash, source)
         VALUES ('note',$1,$2,$3,$4,$5)`,
        [
          item.name.slice(0, 500),
          item.description,
          JSON.stringify(item.properties),
          contentHash,
          `kb:mitre:${item.id}`,
        ]
      );
      inserted++;
      count++;
    }
    console.log(`${file.label}: ${count} nós`);
  }

  await client.end();
  console.log(`MITRE ingest: inserted=${inserted} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

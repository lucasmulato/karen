#!/usr/bin/env node
/**
 * Ingests free, openly licensed security knowledge into the SynapseVault graph.
 *
 * Only markdown files are downloaded (via raw.githubusercontent.com), so the
 * multi-GB asset folders of OWASP repos are never fetched. Existing chunks are
 * skipped by content_hash, making the script safely re-runnable.
 */
import { createHash } from "node:crypto";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const CHUNK_SIZE = Number(process.env.KB_CHUNK_SIZE || 1400);
const HEADERS = {
  "User-Agent": "KAREN-KB-Ingest/1.0",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

const SOURCES = [
  { repo: "OWASP/wstg", branch: "master", license: "CC-BY-SA-4.0", label: "OWASP WSTG", include: (p) => p.toLowerCase().endsWith(".md") && !/(^|\/)(readme|contributing|license|changelog)\.md$/i.test(p) },
  { repo: "OWASP/CheatSheetSeries", branch: "master", license: "CC-BY-SA-4.0", label: "OWASP Cheat Sheets", include: (p) => p.startsWith("cheatsheets/") && p.toLowerCase().endsWith(".md") },
  { repo: "OWASP/masvs", branch: "master", license: "CC-BY-SA-4.0", label: "OWASP MASVS", include: (p) => p.toLowerCase().endsWith(".md") && !/(^|\/)(readme|license)\.md$/i.test(p) },
  { repo: "OWASP/mastg", branch: "master", license: "CC-BY-SA-4.0", label: "OWASP MASTG", include: (p) => p.startsWith("Document/") && p.toLowerCase().endsWith(".md") && !/(^|\/)(readme|license)\.md$/i.test(p) },
  { repo: "swisskyrepo/PayloadsAllTheThings", branch: "master", license: "MIT", label: "PayloadsAllTheThings", include: (p) => p.toLowerCase().endsWith(".md") && !/(^|\/)(readme|license|contributing)\.md$/i.test(p) },
];

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function splitChunks(text, context) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let current = "";
  let section = "";
  const prefixFor = () => `# ${context}${section ? ` › ${section}` : ""}\n\n`;
  for (const paragraph of paragraphs) {
    const heading = paragraph.match(/^(#{1,6})\s+(.+)$/m);
    if (heading) section = heading[2].trim();
    const prefix = prefixFor();
    if (paragraph.length + prefix.length > CHUNK_SIZE) {
      if (current) { out.push(current); current = ""; }
      const max = CHUNK_SIZE - prefix.length;
      for (let i = 0; i < paragraph.length; i += max) {
        out.push(prefix + paragraph.slice(i, i + max));
      }
      continue;
    }
    if (current && (current + "\n\n" + paragraph).length > CHUNK_SIZE) {
      out.push(current);
      current = prefix + paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : prefix + paragraph;
    }
  }
  if (current) out.push(current);
  return out.filter((c) => c.length > 60);
}

async function markdownPaths(repo, branch) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    { headers: HEADERS, signal: AbortSignal.timeout(30000) }
  );
  if (!res.ok) throw new Error(`Tree API ${res.status} for ${repo}`);
  const tree = await res.json();
  return tree.tree
    .filter((x) => x.type === "blob" && x.path.toLowerCase().endsWith(".md"))
    .map((x) => x.path);
}

async function fetchRaw(repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    headers: { "User-Agent": HEADERS["User-Agent"] },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`raw ${res.status} ${path}`);
  return res.text();
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  let inserted = 0;
  let skipped = 0;
  let files = 0;
  const byRepo = {};

  for (const source of SOURCES) {
    let paths;
    try {
      paths = (await markdownPaths(source.repo, source.branch)).filter(source.include);
    } catch (err) {
      console.error(`SKIP source ${source.repo}: ${err.message}`);
      continue;
    }
    console.log(`${source.label}: ${paths.length} arquivos`);
    byRepo[source.repo] = { files: paths.length, chunks: 0 };

    for (const path of paths) {
      let text;
      try {
        text = await fetchRaw(source.repo, source.branch, path);
      } catch {
        skipped++;
        continue;
      }
      files++;
      const context = `${source.label} › ${path}`;
      for (const chunk of splitChunks(text, context)) {
        const contentHash = hash(chunk);
        const exists = await client.query(
          "SELECT 1 FROM nodes WHERE content_hash = $1 LIMIT 1",
          [contentHash]
        );
        if (exists.rowCount) {
          skipped++;
          continue;
        }
        await client.query(
          `INSERT INTO nodes (type, name, description, properties, content_hash, source)
           VALUES ('note',$1,$2,$3,$4,$5)`,
          [
            `${source.label}: ${path}`.slice(0, 500),
            chunk.slice(0, 10000),
            JSON.stringify({
              kb: true,
              repo: source.repo,
              path,
              license: source.license,
              attribution: `Source: ${source.label} (${source.repo}), ${source.license}`,
              url: `https://github.com/${source.repo}/blob/${source.branch}/${path}`,
            }),
            contentHash,
            `kb:${source.repo}:${path}`,
          ]
        );
        inserted++;
        byRepo[source.repo].chunks++;
      }
    }
  }

  await client.end();
  console.log(`KB ingest: files=${files} inserted=${inserted} skipped=${skipped}`);
  console.log(JSON.stringify(byRepo, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

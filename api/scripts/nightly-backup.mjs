#!/usr/bin/env node
/**
 * Nightly backup: PostgreSQL dump + private markdown vault archive.
 * Keeps 7 daily snapshots outside the repository. Read-only against services.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, unlink, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const run = promisify(execFile);
const BACKUP_DIR = resolve(process.env.KAREN_BACKUP_DIR || "/home/admin/backups/karen");
const VAULT_DIR = resolve(
  process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault"
);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const RETENTION_DAYS = 7;

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dbFile = join(BACKUP_DIR, `db-${stamp}.sql.gz`);
const vaultFile = join(BACKUP_DIR, `vault-${stamp}.tar.gz`);

async function main() {
  await mkdir(BACKUP_DIR, { recursive: true });

  await run("/bin/sh", [
    "-c",
    `pg_dump "${DATABASE_URL}" | gzip > "${dbFile}"`,
  ]);
  console.log(`DB dump: ${dbFile}`);

  await run("/bin/tar", [
    "-czf",
    vaultFile,
    "-C",
    VAULT_DIR,
    ".",
  ]);
  console.log(`Vault archive: ${vaultFile}`);

  const files = await readdir(BACKUP_DIR);
  const now = Date.now();
  for (const name of files) {
    if (!/^(db|vault)-.*\.(sql\.gz|tar\.gz)$/.test(name)) continue;
    const path = join(BACKUP_DIR, name);
    const info = await stat(path);
    if (now - info.mtimeMs > RETENTION_DAYS * 86_400_000) {
      await unlink(path);
      console.log(`Removed old backup: ${name}`);
    }
  }
  console.log("Backup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

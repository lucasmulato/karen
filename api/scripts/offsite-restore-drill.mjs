#!/usr/bin/env node
/**
 * Verifies the encrypted offsite snapshots by decrypting the newest pair into
 * a temp directory and checking gzip/tar integrity. Never touches production.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat, mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const run = promisify(execFile);
const OFFSITE = resolve(
  process.env.KAREN_OFFSITE_DIR || "/home/admin/backups/karen-offsite"
);
const REPORT = resolve(
  process.env.KAREN_OFFSITE_RESTORE_REPORT ||
    "/home/admin/karen/api/data/offsite-restore-drill.json"
);

async function newest(suffix) {
  const files = (await readdir(OFFSITE)).filter((f) => f.endsWith(suffix)).sort();
  if (!files.length) throw new Error(`missing *${suffix}`);
  return join(OFFSITE, files[files.length - 1]);
}

async function decrypt(src, dest) {
  await run("openssl", [
    "enc", "-d", "-aes-256-cbc", "-pbkdf2",
    "-in", src, "-out", dest,
    "-pass", "env:KAREN_BACKUP_PASSPHRASE",
  ]);
}

async function main() {
  if (!process.env.KAREN_BACKUP_PASSPHRASE) {
    throw new Error("KAREN_BACKUP_PASSPHRASE não configurado.");
  }
  const dbEnc = await newest("-db.sql.gz.enc");
  const vaultEnc = await newest("-vault.tar.gz.enc");
  const tmp = await mkdtemp(join(tmpdir(), "karen-offsite-drill-"));
  const checks = {};
  let ok = true;
  let error = null;

  try {
    const db = join(tmp, "db.sql.gz");
    const vault = join(tmp, "vault.tar.gz");
    await decrypt(dbEnc, db);
    await decrypt(vaultEnc, vault);

    const dbBytes = (await stat(db)).size;
    const vaultBytes = (await stat(vault)).size;
    await run("gzip", ["-t", db]);
    await run("tar", ["-tzf", vault]);

    checks.database = {
      source: dbEnc.split("/").pop(),
      bytes: dbBytes,
      passed: dbBytes > 0,
    };
    checks.vault = {
      source: vaultEnc.split("/").pop(),
      bytes: vaultBytes,
      passed: vaultBytes > 0,
    };
    ok = checks.database.passed && checks.vault.passed;
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  const report = {
    executed_at: new Date().toISOString(),
    passed: ok,
    error,
    checks,
  };
  await mkdir(resolve(REPORT, ".."), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(`Offsite restore drill: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

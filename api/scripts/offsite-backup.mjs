#!/usr/bin/env node
/**
 * Copies the newest local backups, encrypts them, and pushes them to a private
 * git remote. The passphrase is never stored in the repo — keep it in your
 * password manager, otherwise an offsite copy cannot be restored.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat, copyFile, unlink, mkdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const run = promisify(execFile);
const LOCAL = resolve(process.env.KAREN_BACKUP_DIR || "/home/admin/backups/karen");
const OFFSITE = resolve(process.env.KAREN_OFFSITE_DIR || "/home/admin/backups/karen-offsite");
const REPO = process.env.KAREN_OFFSITE_REPO || "git@github.com:lucasmulato/karen-backups.git";
const PASSPHRASE = process.env.KAREN_BACKUP_PASSPHRASE;
const KEEP = 7;

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function git(args, opts = {}) {
  const { stdout } = await run("git", args, { cwd: OFFSITE, ...opts });
  return stdout.trim();
}

async function newest(prefix, suffix) {
  const files = (await readdir(LOCAL)).filter((f) => f.startsWith(prefix) && f.endsWith(suffix)).sort();
  if (!files.length) throw new Error(`missing ${prefix}*${suffix}`);
  return join(LOCAL, files[files.length - 1]);
}

async function main() {
  if (!PASSPHRASE) throw new Error("KAREN_BACKUP_PASSPHRASE não configurado.");
  if (!(await exists(OFFSITE))) {
    await run("git", ["clone", REPO, OFFSITE]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  for (const [prefix, suffix, label] of [
    ["db-", ".sql.gz", "db"],
    ["vault-", ".tar.gz", "vault"],
  ]) {
    const src = await newest(prefix, suffix);
    const plain = join(OFFSITE, `${stamp}-${label}${suffix}`);
    const encrypted = `${plain}.enc`;
    await copyFile(src, plain);
    await run("openssl", [
      "enc", "-aes-256-cbc", "-pbkdf2", "-salt",
      "-in", plain, "-out", encrypted,
      "-pass", "env:KAREN_BACKUP_PASSPHRASE",
    ]);
    await unlink(plain);
    console.log(`Encrypted: ${label}`);
  }

  const entries = await readdir(OFFSITE);
  const files = entries.filter((f) => /^\d{4}-\d{2}-\d{2}-(db|vault)\..*\.enc$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP * 2))) {
    await unlink(join(OFFSITE, old));
  }

  await git(["add", "-A"]);
  const status = await git(["status", "--porcelain"]);
  if (status) {
    await git(["commit", "-m", `offsite backup ${stamp}`]);
    await git(["push", "origin", "HEAD"]);
    console.log("Offsite backup pushed.");
  } else {
    console.log("Offsite backup already up to date.");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

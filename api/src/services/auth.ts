/**
 * Self-hosted session authentication for KAREN.
 *
 * Passwords are scrypt-hashed outside the repo. Sessions are HMAC-signed,
 * HttpOnly cookies. Optional TOTP MFA and session revocation are supported.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type http from "node:http";

const USERS_FILE = resolve(
  process.env.KAREN_USERS_FILE || "/home/admin/models/karen-users.json"
);
const FAILURES_FILE = resolve(
  process.env.KAREN_AUTH_FAILURES || "/home/admin/karen/api/data/auth-failures.json"
);
import type { Brand, Role } from "./brands.js";

const SECRET = process.env.KAREN_SESSION_SECRET || "karen-dev-secret-change-me";
const COOKIE = "karen_session";
const MAX_AGE = 7 * 24 * 60 * 60;
const MFA_AGE = 5 * 60;

interface User {
  username: string;
  salt: string;
  hash: string;
  totpSecret?: string;
  sessionVersion?: number;
  role?: Role;
  brands?: Brand[];
}

const failures = new Map<string, { count: number; resetAt: number }>();

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function tokenFor(username: string, version = 0, purpose = "session"): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, v: version, p: purpose, exp: Date.now() + (purpose === "mfa" ? MFA_AGE : MAX_AGE) * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseToken(token: string | undefined, purpose = "session"): { username: string; version: number } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.u || !data.exp || Date.now() > data.exp || data.p !== purpose) return null;
    return { username: data.u, version: data.v ?? 0 };
  } catch {
    return null;
  }
}

function cookieValue(req: http.IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

function clientIp(req: http.IncomingMessage): string {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= 5;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < now) failures.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
  else entry.count++;
  void logFailure(ip);
}

async function logFailure(ip: string): Promise<void> {
  let list: { ip: string; at: string }[] = [];
  try { list = JSON.parse(await readFile(FAILURES_FILE, "utf8")); } catch { /* ignore */ }
  list.push({ ip, at: new Date().toISOString() });
  await mkdir(dirname(FAILURES_FILE), { recursive: true });
  await writeFile(FAILURES_FILE, JSON.stringify(list.slice(-100), null, 2), "utf8");
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}
function fromBase32(text: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const char of text.toUpperCase().replace(/=+$/, "")) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", fromBase32(secret)).update(buffer).digest();
  const offset = mac[mac.length - 1] & 15;
  const code = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (const delta of [-1, 0, 1]) {
    if (totp(secret, counter + delta) === code) return true;
  }
  return false;
}

async function readUsers(): Promise<User[]> {
  try { return JSON.parse(await readFile(USERS_FILE, "utf8")); } catch { return []; }
}
async function writeUsers(users: User[]): Promise<void> {
  await mkdir(dirname(USERS_FILE), { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  await chmod(USERS_FILE, 0o600);
}

export interface LoginResult {
  token?: string;
  mfaRequired?: boolean;
  pendingToken?: string;
}

export class AuthService {
  async ensureAdmin(password: string): Promise<void> {
    const users = await readUsers();
    if (users.some((u) => u.username === "karen")) return;
    const salt = randomBytes(16).toString("hex");
    users.push({
      username: "karen",
      salt,
      hash: hashPassword(password, salt),
      sessionVersion: 0,
      role: "owner",
      brands: ["karen", "climara"],
    });
    await writeUsers(users);
  }

  /**
   * Idempotent user provisioning for the multi-company setup. Deliberately
   * does NOT configure TOTP: the marketing user works without MFA.
   */
  async ensureUser(
    username: string,
    password: string,
    role: Role,
    brands: Brand[]
  ): Promise<{ created: boolean }> {
    const users = await readUsers();
    const existing = users.find((u) => u.username === username);
    if (existing) {
      let changed = false;
      if (existing.role !== role) { existing.role = role; changed = true; }
      if (JSON.stringify(existing.brands ?? []) !== JSON.stringify(brands)) {
        existing.brands = brands;
        changed = true;
      }
      if (changed) await writeUsers(users);
      return { created: false };
    }
    const salt = randomBytes(16).toString("hex");
    users.push({
      username,
      salt,
      hash: hashPassword(password, salt),
      sessionVersion: 0,
      role,
      brands,
    });
    await writeUsers(users);
    return { created: true };
  }

  async login(username: string, password: string, ip: string): Promise<LoginResult | null> {
    if (rateLimited(ip)) return null;
    const users = await readUsers();
    const user = users.find((u) => u.username === username);
    if (!user) { recordFailure(ip); return null; }
    const actual = Buffer.from(hashPassword(password, user.salt), "hex");
    const expected = Buffer.from(user.hash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      recordFailure(ip);
      return null;
    }
    failures.delete(ip);
    if (user.totpSecret) {
      return { mfaRequired: true, pendingToken: tokenFor(username, user.sessionVersion ?? 0, "mfa") };
    }
    return { token: tokenFor(username, user.sessionVersion ?? 0) };
  }

  async completeMfa(pendingToken: string, code: string): Promise<string | null> {
    const parsed = parseToken(pendingToken, "mfa");
    if (!parsed) return null;
    const users = await readUsers();
    const user = users.find((u) => u.username === parsed.username);
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, code)) return null;
    return tokenFor(user.username, user.sessionVersion ?? 0);
  }

  async session(
    req: http.IncomingMessage
  ): Promise<{ username: string; role: Role; brands: Brand[] } | null> {
    const parsed = parseToken(cookieValue(req, COOKIE));
    if (!parsed) return null;
    const users = await readUsers();
    const user = users.find((u) => u.username === parsed.username);
    if (!user || (user.sessionVersion ?? 0) !== parsed.version) return null;
    // Legacy users (no role field) are owners with access to every brand.
    const role: Role = user.role ?? "owner";
    const brands: Brand[] = (user.brands ?? ["karen", "climara"]).filter(
      (b): b is Brand => b === "karen" || b === "climara"
    );
    return { username: parsed.username, role, brands };
  }

  async setupMfa(username: string): Promise<{ secret: string; uri: string } | null> {
    const users = await readUsers();
    const user = users.find((u) => u.username === username);
    if (!user) return null;
    const secret = base32(randomBytes(20));
    user.totpSecret = secret;
    await writeUsers(users);
    const uri = `otpauth://totp/KAREN:${encodeURIComponent(username)}?secret=${secret}&issuer=KAREN&algorithm=SHA1&digits=6&period=30`;
    return { secret, uri };
  }

  async enableMfa(username: string, code: string): Promise<boolean> {
    const users = await readUsers();
    const user = users.find((u) => u.username === username);
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, code)) return false;
    await writeUsers(users);
    return true;
  }

  async revokeAll(username: string): Promise<void> {
    const users = await readUsers();
    const user = users.find((u) => u.username === username);
    if (!user) return;
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    await writeUsers(users);
  }

  cookie(token: string): string {
    return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
  }

  clearCookie(): string {
    return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }
}

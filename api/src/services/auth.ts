/**
 * Self-hosted session authentication for KAREN.
 *
 * Passwords are scrypt-hashed in a file outside the repo. Sessions are HMAC-
 * signed, HttpOnly cookies. No plaintext passwords, no external dependency.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type http from "node:http";

const USERS_FILE = resolve(
  process.env.KAREN_USERS_FILE || "/home/admin/models/karen-users.json"
);
const SECRET = process.env.KAREN_SESSION_SECRET || "karen-dev-secret-change-me";
const COOKIE = "karen_session";
const MAX_AGE = 7 * 24 * 60 * 60;

interface User {
  username: string;
  salt: string;
  hash: string;
}

const failures = new Map<string, { count: number; resetAt: number }>();

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function tokenFor(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + MAX_AGE * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseToken(token: string | undefined): User | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.u || !data.exp || Date.now() > data.exp) return null;
    return { username: data.u, salt: "", hash: "" };
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
}

export class AuthService {
  async ensureAdmin(password: string): Promise<void> {
    let users: User[] = [];
    try { users = JSON.parse(await readFile(USERS_FILE, "utf8")); } catch { /* first run */ }
    if (users.some((u) => u.username === "karen")) return;
    const salt = randomBytes(16).toString("hex");
    users.push({ username: "karen", salt, hash: hashPassword(password, salt) });
    await mkdir(dirname(USERS_FILE), { recursive: true });
    await writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    await chmod600(USERS_FILE);
  }

  async login(username: string, password: string, ip: string): Promise<string | null> {
    if (rateLimited(ip)) return null;
    let users: User[] = [];
    try { users = JSON.parse(await readFile(USERS_FILE, "utf8")); } catch { return null; }
    const user = users.find((u) => u.username === username);
    if (!user) { recordFailure(ip); return null; }
    const actual = Buffer.from(hashPassword(password, user.salt), "hex");
    const expected = Buffer.from(user.hash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      recordFailure(ip);
      return null;
    }
    failures.delete(ip);
    return tokenFor(username);
  }

  session(req: http.IncomingMessage): User | null {
    return parseToken(cookieValue(req, COOKIE));
  }

  cookie(token: string): string {
    return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
  }

  clearCookie(): string {
    return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }
}

async function chmod600(path: string): Promise<void> {
  const { chmod } = await import("node:fs/promises");
  await chmod(path, 0o600);
}

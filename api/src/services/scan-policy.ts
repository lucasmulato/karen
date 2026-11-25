/** Pure policy helpers for the manual Climara OSM scan. No network, no writes. */

export interface ScanEntry {
  name: string;
  phone?: string | null;
  website?: string | null;
}

/** Stable dedupe key from public business facts only. */
export function leadKey(entry: ScanEntry): string {
  const name = String(entry.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const phone = String(entry.phone ?? "").replace(/\D/g, "");
  return phone ? `${name}|${phone}` : name;
}

/** True when the cached payload is older than the configured TTL. */
export function shouldRefresh(
  cachedAt: string | null | undefined,
  now: number,
  ttlMinutes: number,
  force = false
): boolean {
  if (force || !cachedAt) return true;
  const parsed = Date.parse(cachedAt);
  if (Number.isNaN(parsed)) return true;
  return now - parsed >= Math.max(1, ttlMinutes) * 60_000;
}

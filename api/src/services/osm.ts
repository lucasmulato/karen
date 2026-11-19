/**
 * Free lead source: OpenStreetMap via Nominatim (geocoding) + Overpass (query).
 *
 * No API key, no paid events, no Google. Covers public business data such as
 * name, phone, website, address and category. Data completeness varies by
 * region — where OSM is sparse, switch LEAD_PROVIDER=apify if you later have
 * a paid token.
 */
import type { LeadQuery, ScrapeResult, ScrapedPlace } from "./apify.js";

export interface OsmConfig {
  overpassUrl: string;
  radiusMeters: number;
  websiteFilter: "allPlaces" | "placesWithWebsite" | "placesWithoutWebsite";
  maxPlaces: number;
}

const USER_AGENT = "KAREN-SynapseVault/1.0 (local lead generation)";

export function osmConfigFromEnv(): OsmConfig {
  const radius = Number(process.env.OSM_RADIUS_M ?? 3000);
  const maxPlaces = Number(process.env.APIFY_MAX_PLACES ?? 50);
  const websiteFilter = (["allPlaces", "placesWithWebsite", "placesWithoutWebsite"] as const).includes(
    process.env.APIFY_WEBSITE_FILTER as any
  )
    ? (process.env.APIFY_WEBSITE_FILTER as OsmConfig["websiteFilter"])
    : "placesWithoutWebsite";
  return {
    overpassUrl: process.env.OSM_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
    radiusMeters: Number.isFinite(radius) ? Math.min(Math.max(radius, 200), 20000) : 3000,
    websiteFilter,
    maxPlaces: Number.isFinite(maxPlaces) ? Math.min(Math.trunc(maxPlaces), 200) : 50,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function amenityRegex(query: string): string | null {
  const q = query.toLowerCase();
  if (/restaur|pizza|burger|lanche|marmita|comida|food|steak/.test(q))
    return "restaurant|fast_food|cafe";
  if (/bar|pub|boteco|bebida/.test(q)) return "bar|pub";
  if (/caf|padaria|bakery|biscoit/.test(q)) return "cafe";
  if (/hotel|pousada|hostel/.test(q)) return "hotel|guest_house|hostel";
  if (/farmacia|pharmacy|drogaria/.test(q)) return "pharmacy";
  if (/academia|gym|fitness/.test(q)) return "gym";
  if (/supermercado|mercado|market/.test(q)) return "supermarket|greengrocer";
  return null;
}

export class OsmService {
  readonly name = "osm";
  constructor(private readonly config: OsmConfig) {}

  estimateCost(_maxPlaces: number): number {
    return 0;
  }

  private async geocode(location: string): Promise<{ lat: number; lon: number; label: string }> {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
    const rows: any[] = await res.json();
    if (!rows.length) throw new Error(`Localização não encontrada: ${location}`);
    return {
      lat: Number(rows[0].lat),
      lon: Number(rows[0].lon),
      label: String(rows[0].display_name ?? "").split(",")[0],
    };
  }

  private mapElement(el: any, cityFallback: string): ScrapedPlace | null {
    const t = el.tags ?? {};
    const title = String(t.name ?? t["name:pt"] ?? "").trim();
    if (!title) return null;
    const id = String(el.id);
    const type = el.type === "way" || el.type === "relation" ? el.type : "node";
    const website: string | null = t.website || t["contact:website"] || null;
    if (this.config.websiteFilter === "placesWithoutWebsite" && website) return null;
    if (this.config.websiteFilter === "placesWithWebsite" && !website) return null;
    const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    return {
      title,
      phone: t.phone || t["contact:phone"] || t["contact:mobile"] || null,
      address: street || t["addr:full"] || null,
      neighborhood: t["addr:suburb"] || t["addr:neighbourhood"] || null,
      city: t["addr:city"] || cityFallback || null,
      category: t.cuisine || t.amenity || t.shop || null,
      rating: null,
      reviewsCount: null,
      website,
      placeId: `osm:${type}/${id}`,
      mapsUrl: `https://www.openstreetmap.org/${type}/${id}`,
      scrapedAt: new Date().toISOString(),
      // coordinates kept out of the shared shape but available via mapsUrl
      ...({ lat, lon } as any),
    };
  }

  async findPlaces(query: LeadQuery): Promise<ScrapeResult> {
    if (!query.query?.trim() || !query.location?.trim()) {
      throw new Error("query and location are required");
    }
    const geo = await this.geocode(query.location);
    const max = Math.min(
      Math.max(Math.trunc(query.maxPlaces ?? this.config.maxPlaces), 1),
      this.config.maxPlaces
    );
    const amenity = amenityRegex(query.query);
    const selector = amenity
      ? `["amenity"~"${amenity}"]`
      : `["name"~"${escapeRegex(query.query)}",i]`;
    const q = `[out:json][timeout:60];(nwr${selector}(around:${this.config.radiusMeters},${geo.lat},${geo.lon}););out center tags;`;

    const res = await fetch(this.config.overpassUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Overpass error ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const elements: any[] = json.elements ?? [];

    const seen = new Set<string>();
    const places: ScrapedPlace[] = [];
    for (const el of elements) {
      const place = this.mapElement(el, geo.label);
      if (!place || seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      places.push(place);
      if (places.length >= max) break;
    }
    return {
      places,
      estimatedCostUsd: 0,
      datasetId: null,
      runId: `osm-${Date.now()}`,
    };
  }
}

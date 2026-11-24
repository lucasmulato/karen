/**
 * Lead orchestration: scrape -> draft -> persist with dedupe/suppression.
 * This is the single service used by both the REST endpoints and the agent's
 * find_leads tool, so chat and button always produce the same result.
 */
import type { Client } from "pg";
import type { LeadQuery, ScrapedPlace } from "./apify.js";
import type { LeadProvider } from "./providers.js";
import { draftFor, type DraftContext, type OutreachDraft } from "../templates/outreach.js";
import { isBrand, type Brand } from "./brands.js";

export interface LeadRow {
  id: string;
  brand: string;
  place_id: string;
  title: string;
  phone: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviews_count: number | null;
  website: string | null;
  maps_url: string | null;
  draft: OutreachDraft;
  suppressed: boolean;
  created_at: string;
}

export interface LeadRunResult {
  leads: LeadRow[];
  found: number;
  added: number;
  deduped: number;
  suppressed: number;
  estimatedCostUsd: number;
  datasetId: string | null;
  runId: string | null;
}

const COLUMNS = `id, brand, place_id, title, phone, address, neighborhood, city,
  category, rating, reviews_count, website, maps_url, draft, suppressed, created_at`;

function mapRow(row: any): LeadRow {
  return {
    id: row.id,
    brand: String(row.brand ?? "karen"),
    place_id: row.place_id,
    title: row.title,
    phone: row.phone,
    address: row.address,
    neighborhood: row.neighborhood,
    city: row.city,
    category: row.category,
    rating: row.rating,
    reviews_count: row.reviews_count,
    website: row.website,
    maps_url: row.maps_url,
    draft: typeof row.draft === "string" ? JSON.parse(row.draft) : row.draft,
    suppressed: Boolean(row.suppressed),
    created_at: row.created_at,
  };
}

export class LeadService {
  constructor(
    private readonly client: Client,
    private readonly provider: LeadProvider | null,
    private readonly ctx: DraftContext
  ) {}

  get configured(): boolean {
    return this.provider !== null;
  }

  get providerName(): string | null {
    return this.provider?.name ?? null;
  }

  estimate(maxPlaces: number): number {
    return this.provider?.estimateCost(maxPlaces) ?? 0;
  }

  async scrape(query: LeadQuery, brand: Brand = "karen"): Promise<LeadRunResult> {
    if (!this.provider) {
      throw new Error(
        "Leads are disabled: set LEAD_PROVIDER=osm (or apify with APIFY_TOKEN)."
      );
    }
    const result = await this.provider.findPlaces(query);
    const leads: LeadRow[] = [];
    let added = 0;
    let deduped = 0;
    let suppressed = 0;

    for (const place of result.places) {
      const existing = await this.client.query(
        `SELECT ${COLUMNS} FROM leads WHERE place_id = $1 LIMIT 1`,
        [place.placeId]
      );
      if (existing.rowCount) {
        const row = mapRow(existing.rows[0]);
        if (row.suppressed) suppressed++;
        else deduped++;
        leads.push(row);
        continue;
      }
      const draft = draftFor(place, this.ctx);
      const inserted = await this.client.query(
        `INSERT INTO leads
          (brand, place_id, title, phone, address, neighborhood, city, category,
           rating, reviews_count, website, maps_url, draft)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (place_id) DO NOTHING
         RETURNING ${COLUMNS}`,
        [
          isBrand(brand) ? brand : "karen",
          place.placeId,
          place.title,
          place.phone,
          place.address,
          place.neighborhood,
          place.city,
          place.category,
          place.rating,
          place.reviewsCount,
          place.website,
          place.mapsUrl,
          JSON.stringify(draft),
        ]
      );
      if (inserted.rowCount) {
        leads.push(mapRow(inserted.rows[0]));
        added++;
      }
    }

    return {
      leads,
      found: result.places.length,
      added,
      deduped,
      suppressed,
      estimatedCostUsd: result.estimatedCostUsd,
      datasetId: result.datasetId,
      runId: result.runId,
    };
  }

  async list(limit = 100, brands?: string[]): Promise<LeadRow[]> {
    const capped = Math.min(Math.trunc(limit) || 100, 500);
    const res = brands && brands.length
      ? await this.client.query(
          `SELECT ${COLUMNS} FROM leads WHERE brand = ANY($2::text[])
            ORDER BY created_at DESC LIMIT $1`,
          [capped, brands]
        )
      : await this.client.query(
          `SELECT ${COLUMNS} FROM leads ORDER BY created_at DESC LIMIT $1`,
          [capped]
        );
    return res.rows.map(mapRow);
  }

  async suppress(id: string): Promise<LeadRow | null> {
    const res = await this.client.query(
      `UPDATE leads SET suppressed = TRUE WHERE id = $1::uuid RETURNING ${COLUMNS}`,
      [id]
    );
    return res.rowCount ? mapRow(res.rows[0]) : null;
  }

  /** Manually verified phone number (OSM coverage is sparse in Brazil). */
  async setPhone(id: string, phone: string | null): Promise<LeadRow | null> {
    const clean = phone?.trim() || null;
    const res = await this.client.query(
      `UPDATE leads SET phone = $2 WHERE id = $1::uuid RETURNING ${COLUMNS}`,
      [id, clean]
    );
    return res.rowCount ? mapRow(res.rows[0]) : null;
  }
}

export type { ScrapedPlace };

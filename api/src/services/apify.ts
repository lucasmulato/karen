/**
 * Google Maps lead scraping through the Apify REST API.
 *
 * The token stays server-side. The actor is called in batch mode and the run
 * is polled until it finishes; only the normalized place fields we actually
 * use are returned to the UI/agent. All paid add-ons are explicitly disabled —
 * reviews, contact enrichment, social profiles and competitor analysis can
 * raise a run from cents to dollars.
 */

const ACTOR = "compass~crawler-google-places";
const API_BASE = "https://api.apify.com/v2";
const BASE_COST_PER_PLACE = 0.0015; // $1.50 / 1,000 scraped places

export interface ApifyConfig {
  token: string;
  maxPlaces: number;
  websiteFilter: "allPlaces" | "placesWithWebsite" | "placesWithoutWebsite";
  operatorName: string;
  exampleLink: string;
}

export function apifyConfigFromEnv(): ApifyConfig | null {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return null;
  const maxPlaces = Number(process.env.APIFY_MAX_PLACES ?? 50);
  return {
    token,
    maxPlaces: Number.isFinite(maxPlaces)
      ? Math.min(Math.max(Math.trunc(maxPlaces), 1), 200)
      : 50,
    websiteFilter: (["allPlaces", "placesWithWebsite", "placesWithoutWebsite"] as const).includes(
      process.env.APIFY_WEBSITE_FILTER as any
    )
      ? (process.env.APIFY_WEBSITE_FILTER as ApifyConfig["websiteFilter"])
      : "placesWithoutWebsite",
    operatorName: process.env.OPERATOR_NAME?.trim() || "[Seu Nome]",
    exampleLink:
      process.env.KAREN_EXAMPLE_LINK?.trim() || "[LINK DO SEU CARDAPIFY DE EXEMPLO]",
  };
}

export interface LeadQuery {
  query: string;
  location: string;
  maxPlaces?: number;
  zoom?: number;
  website?: ApifyConfig["websiteFilter"];
}

export interface ScrapedPlace {
  title: string;
  phone: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  placeId: string;
  mapsUrl: string | null;
  scrapedAt: string;
}

export interface ScrapeResult {
  places: ScrapedPlace[];
  estimatedCostUsd: number;
  datasetId: string | null;
  runId: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function estimateCost(maxPlaces: number): number {
  return Math.round(maxPlaces * BASE_COST_PER_PLACE * 1000) / 1000;
}

export class ApifyService {
  constructor(private readonly config: ApifyConfig) {}

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(this.config.token)}`;
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Apify API ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  private buildInput(q: LeadQuery): Record<string, unknown> {
    const max = Math.min(
      Math.max(Math.trunc(q.maxPlaces ?? this.config.maxPlaces), 1),
      this.config.maxPlaces
    );
    const input: Record<string, unknown> = {
      searchStringsArray: [q.query],
      locationQuery: q.location,
      maxCrawledPlacesPerSearch: max,
      language: "pt-BR",
      countryCode: "BR",
      searchMatching: "all",
      placeMinimumStars: "",
      website: q.website ?? this.config.websiteFilter,
      skipClosedPlaces: true,
      scrapePlaceDetailPage: false,
      scrapeTableReservationProvider: false,
      scrapeOrderOnline: false,
      includeWebResults: false,
      scrapeDirectories: false,
      maxQuestions: 0,
      scrapeContacts: false,
      scrapeSocialMediaProfiles: {
        facebooks: false,
        instagrams: false,
        youtubes: false,
        tiktoks: false,
        twitters: false,
      },
      maximumLeadsEnrichmentRecords: 0,
      leadsEnrichmentDepartments: [],
      verifyLeadsEnrichmentEmails: false,
      maxReviews: 0,
      maxImages: 0,
      scrapeImageAuthors: false,
      enableCompetitorAnalysis: false,
      maxCompetitorsToAnalyze: 0,
      allPlacesNoSearchAction: "",
    };
    if (Number.isFinite(q.zoom)) {
      input.zoom = Math.min(Math.max(Math.trunc(q.zoom!), 1), 21);
    }
    return input;
  }

  private normalize(item: any): ScrapedPlace | null {
    const placeId = String(item?.placeId ?? "").trim();
    const title = String(item?.title ?? "").trim();
    if (!placeId || !title) return null;
    if (item?.permanentlyClosed || item?.temporarilyClosed) return null;
    return {
      title,
      phone: item.phoneUnformatted || item.phone || null,
      address: item.address || null,
      neighborhood: item.neighborhood || null,
      city: item.city || null,
      category: item.categoryName || item.categories?.[0] || null,
      rating: typeof item.totalScore === "number" ? item.totalScore : null,
      reviewsCount:
        typeof item.reviewsCount === "number" ? item.reviewsCount : null,
      website: item.website || null,
      placeId,
      mapsUrl: item.url || null,
      scrapedAt: item.scrapedAt || new Date().toISOString(),
    };
  }

  async findPlaces(query: LeadQuery): Promise<ScrapeResult> {
    if (!query.query?.trim() || !query.location?.trim()) {
      throw new Error("query and location are required");
    }
    const input = this.buildInput(query);
    const run = await this.api<any>(`/acts/${ACTOR}/runs`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const runId: string = run.data?.id;
    if (!runId) throw new Error("Apify did not return a run id");

    const deadline = Date.now() + 6 * 60_000;
    let status = run.data?.status ?? "RUNNING";
    while (!["READY", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      if (Date.now() > deadline) throw new Error("Apify run timed out");
      await sleep(3000);
      const poll = await this.api<any>(`/actor-runs/${runId}`);
      status = poll.data?.status ?? status;
    }
    if (status !== "READY") {
      throw new Error(`Apify run ended with status ${status}`);
    }

    const datasetId: string | null =
      run.data?.defaultDatasetId ?? null;
    if (!datasetId) return { places: [], estimatedCostUsd: 0, datasetId, runId };

    const items = await this.api<any[]>(
      `/datasets/${datasetId}/items?format=json&clean=true`
    );
    const seen = new Set<string>();
    const places: ScrapedPlace[] = [];
    for (const item of items) {
      const place = this.normalize(item);
      if (!place || seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      places.push(place);
    }
    return {
      places,
      estimatedCostUsd: estimateCost(places.length),
      datasetId,
      runId,
    };
  }
}

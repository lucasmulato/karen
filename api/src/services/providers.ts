/**
 * Lead provider selection.
 *
 * Default is OSM/OpenStreetMap: free, no key, no per-result charge. Set
 * LEAD_PROVIDER=apify (with APIFY_TOKEN) to use the paid Google Maps scraper.
 */
import { ApifyService, apifyConfigFromEnv, type LeadQuery, type ScrapeResult } from "./apify.js";
import { OsmService, osmConfigFromEnv } from "./osm.js";

export interface LeadProvider {
  readonly name: string;
  findPlaces(query: LeadQuery): Promise<ScrapeResult>;
  estimateCost(maxPlaces: number): number;
}

export function leadProviderFromEnv(): LeadProvider | null {
  const kind = (process.env.LEAD_PROVIDER ?? "osm").toLowerCase();
  if (kind === "apify") {
    const config = apifyConfigFromEnv();
    return config ? new ApifyService(config) : null;
  }
  return new OsmService(osmConfigFromEnv());
}

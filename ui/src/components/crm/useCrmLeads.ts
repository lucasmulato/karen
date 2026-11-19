import { useEffect, useState } from 'react';
import {
  MOCK_LEADS, type CrmLead, type Stage, type Temperature,
} from './mockCrm';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const STAGE_POOL: Stage[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

interface RawLead {
  id: string;
  title: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  website: string | null;
  maps_url: string | null;
  rating: number | null;
  created_at: string;
  draft?: { model?: string; signal?: string; firstTouch?: string; followUp?: string };
}

function hashOf(value: string): number {
  return [...value].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function fromRaw(raw: RawLead): CrmLead {
  const hash = hashOf(raw.id);
  const rating = raw.rating ?? 0;
  const temperature: Temperature = rating >= 4.5 ? 'hot' : rating >= 3.8 ? 'warm' : 'cold';
  return {
    id: raw.id,
    name: raw.title,
    contact: null,
    phone: raw.phone,
    city: raw.city,
    category: raw.category,
    website: raw.website,
    mapsUrl: raw.maps_url,
    rating: raw.rating,
    value: 1000 + (hash % 20) * 500,
    stage: STAGE_POOL[hash % STAGE_POOL.length],
    owner: 'KAREN',
    temperature,
    lastActivity: raw.created_at ? new Date(raw.created_at).toLocaleDateString() : '—',
    source: 'live',
    draft: raw.draft,
  };
}

export function useCrmLeads() {
  const [leads, setLeads] = useState<CrmLead[]>(MOCK_LEADS);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/leads?limit=100`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { leads?: RawLead[] };
        const rows = data.leads ?? [];
        if (cancelled) return;
        if (rows.length) {
          setLeads(rows.map(fromRaw));
          setLive(true);
        }
      } catch {
        // Keep the mock dataset — the CRM is a read-only projection anyway.
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return { leads, live };
}

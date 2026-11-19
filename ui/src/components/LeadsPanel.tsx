import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Copy,
  Download,
  Loader2,
  MapPin,
  Phone,
  Search,
  Star,
  X,
} from 'lucide-react';

interface Draft {
  model: string;
  signal: string;
  firstTouch: string;
  followUp: string;
}

interface Lead {
  id: string;
  title: string;
  phone: string | null;
  neighborhood: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviews_count: number | null;
  website: string | null;
  maps_url: string | null;
  draft: Draft;
  suppressed: boolean;
  created_at: string;
}

interface RunResult {
  leads: Lead[];
  found: number;
  added: number;
  deduped: number;
  suppressed: number;
  estimatedCostUsd: number;
}

interface Status {
  configured: boolean;
  maxPlaces: number;
  websiteFilter: string;
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const DEFAULTS = {
  query: 'restaurante',
  location: 'Guarulhos, SP',
  maxPlaces: 20,
};

function copy(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

function toCsv(leads: Lead[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['nome', 'telefone', 'bairro', 'cidade', 'categoria', 'avaliacao', 'site', 'maps', 'modelo', 'sinal', 'firstTouch', 'followUp'].join(','),
    ...leads.map((l) =>
      [
        l.title,
        l.phone,
        l.neighborhood,
        l.city,
        l.category,
        l.rating,
        l.website,
        l.maps_url,
        l.draft.model,
        l.draft.signal,
        l.draft.firstTouch,
        l.draft.followUp,
      ].map(esc).join(',')
    ),
  ];
  return rows.join('\n');
}

const LeadsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState(DEFAULTS.query);
  const [location, setLocation] = useState(DEFAULTS.location);
  const [maxPlaces, setMaxPlaces] = useState(DEFAULTS.maxPlaces);
  const [zoom, setZoom] = useState('');
  const [website, setWebsite] = useState('placesWithoutWebsite');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/chat/status`)
      .then((r) => r.json())
      .then((s) =>
        setStatus({
          configured: s.leads?.configured === true,
          maxPlaces: s.leads?.maxPlaces ?? 50,
          websiteFilter: s.leads?.websiteFilter ?? 'placesWithoutWebsite',
        })
      )
      .catch(() => setStatus({ configured: false, maxPlaces: 50, websiteFilter: 'placesWithoutWebsite' }));
  }, []);

  useEffect(() => {
    setWebsite((prev) => status?.websiteFilter ?? prev);
  }, [status]);

  const refreshEstimate = useCallback(() => {
    fetch(`${API_BASE}/leads/estimate?maxPlaces=${maxPlaces}`)
      .then((r) => r.json())
      .then((j) => setEstimate(j.estimatedCostUsd ?? null))
      .catch(() => setEstimate(null));
  }, [maxPlaces]);

  useEffect(() => {
    refreshEstimate();
  }, [refreshEstimate]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !location.trim() || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        query: query.trim(),
        location: location.trim(),
        maxPlaces,
        website,
      };
      if (zoom.trim()) body.zoom = Number(zoom);
      const res = await fetch(`${API_BASE}/leads/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function doCopy(key: string, text: string) {
    copy(text);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1500);
  }

  async function suppress(id: string) {
    const res = await fetch(`${API_BASE}/leads/${id}/suppress`, { method: 'POST' });
    if (res.ok) {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              leads: prev.leads.map((l) =>
                l.id === id ? { ...l, suppressed: true } : l
              ),
            }
          : prev
      );
    }
  }

  function download() {
    if (!result?.leads.length) return;
    const blob = new Blob([toCsv(result.leads)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'karen-leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl bg-black/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-400">
            KAREN · Leads
          </h2>
          <p className="text-[11px] text-zinc-500">
            Google Maps → mensagens prontas para copiar (nada é enviado automaticamente)
          </p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-md" title="Fechar">
          <X size={16} className="text-zinc-400" />
        </button>
      </div>

      <form onSubmit={run} className="px-5 py-4 border-b border-zinc-800 flex flex-col gap-3 shrink-0">
        {status && !status.configured && (
          <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg p-2">
            leads desativado: configure <code className="text-amber-200">LEAD_PROVIDER=osm</code> no ambiente da API.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Busca
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="restaurante"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Localização
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Guarulhos, SP"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Máx. lugares
            <input
              type="number"
              min={1}
              max={200}
              value={maxPlaces}
              onChange={(e) => setMaxPlaces(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Zoom (opcional)
            <input
              type="number"
              min={1}
              max={21}
              value={zoom}
              onChange={(e) => setZoom(e.target.value)}
              placeholder="auto"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Website
            <select
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="placesWithoutWebsite">Sem site (ICP)</option>
              <option value="allPlaces">Todos</option>
              <option value="placesWithWebsite">Com site</option>
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-500">
            Custo estimado: <span className="text-zinc-300">US$ {estimate?.toFixed(3) ?? '—'}</span>
            {' '}(add-ons desligados)
          </span>
          <button
            type="submit"
            disabled={busy || !status?.configured || !query.trim() || !location.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {busy ? 'Buscando...' : 'Buscar leads'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mx-5 mt-3 text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-lg p-3 shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {!result && !error && (
          <p className="text-sm text-zinc-500">
            Escolha um termo e uma cidade. A KAREN busca no Google Maps, deduplica e
            devolve duas mensagens prontas por lead — sem enviar nada.
          </p>
        )}
        {result && (
          <>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 flex-wrap gap-2">
              <span>
                {result.found} encontrados · {result.added} novos · {result.deduped} já salvos
                {result.suppressed > 0 ? ` · ${result.suppressed} sem interesse` : ''}
                {' '}· US$ {result.estimatedCostUsd.toFixed(3)}
              </span>
              <button
                onClick={download}
                disabled={!result.leads.length}
                className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 hover:border-blue-500 disabled:opacity-40"
              >
                <Download size={13} /> Exportar CSV
              </button>
            </div>
            {result.leads.map((lead) => (
              <div
                key={lead.id}
                className={`rounded-xl border p-4 flex flex-col gap-3 ${
                  lead.suppressed
                    ? 'border-zinc-800 bg-zinc-950/60 opacity-50'
                    : 'border-zinc-800 bg-zinc-900/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm text-zinc-100">{lead.title}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-zinc-500">
                      {lead.phone && (
                        <span className="flex items-center gap-1"><Phone size={11} />{lead.phone}</span>
                      )}
                      {(lead.neighborhood || lead.city) && (
                        <span className="flex items-center gap-1"><MapPin size={11} />{[lead.neighborhood, lead.city].filter(Boolean).join(', ')}</span>
                      )}
                      {lead.rating !== null && (
                        <span className="flex items-center gap-1"><Star size={11} />{lead.rating}</span>
                      )}
                      {lead.category && <span>{lead.category}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => doCopy(`${lead.id}-first`, lead.draft.firstTouch)}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-zinc-700 hover:border-blue-500 hover:text-blue-400"
                      title="Copiar primeira mensagem (sem link)"
                    >
                      <Copy size={12} /> {copied === `${lead.id}-first` ? 'Copiado' : '1ª mensagem'}
                    </button>
                    <button
                      onClick={() => doCopy(`${lead.id}-follow`, lead.draft.followUp)}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-zinc-700 hover:border-blue-500 hover:text-blue-400"
                      title="Copiar follow-up (24-48h depois)"
                    >
                      <Copy size={12} /> {copied === `${lead.id}-follow` ? 'Copiado' : 'Follow-up'}
                    </button>
                    <button
                      onClick={() => suppress(lead.id)}
                      disabled={lead.suppressed}
                      className="p-1 text-zinc-600 hover:text-red-400 disabled:opacity-30"
                      title="Marcar como sem interesse"
                    >
                      <Ban size={13} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <pre className="whitespace-pre-wrap font-sans text-zinc-400 bg-black/50 rounded-lg p-2 border border-zinc-800">
{lead.draft.firstTouch}
                  </pre>
                  <pre className="whitespace-pre-wrap font-sans text-zinc-500 bg-black/50 rounded-lg p-2 border border-zinc-800">
{lead.draft.followUp}
                  </pre>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default LeadsPanel;

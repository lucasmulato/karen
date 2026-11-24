import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, ShieldAlert, X } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

type Brand = 'karen' | 'climara';
type Classification = 'client' | 'not_client' | 'unclear';
type Status = 'pending' | 'approved' | 'rejected' | 'sent';

interface Conversation {
  id: string;
  lead_id: string | null;
  brand: Brand;
  classification: Classification;
  score: number;
  reason: string;
  system_prompt: string;
  message: string;
  prompt_version: string;
  status: Status;
  approved_by: string | null;
  created_at: string;
}

interface Lead {
  id: string;
  brand: string;
  title: string;
  phone: string | null;
}

const LABEL: Record<Classification, string> = {
  client: 'CLIENTE',
  not_client: 'NÃO CLIENTE',
  unclear: 'INCERTO',
};

const BADGE: Record<Classification, string> = {
  client: 'border-emerald-700 text-emerald-400',
  not_client: 'border-red-800 text-red-400',
  unclear: 'border-amber-800 text-amber-400',
};

const STATUS_BADGE: Record<Status, string> = {
  pending: 'border-amber-700 text-amber-400',
  approved: 'border-emerald-700 text-emerald-400',
  rejected: 'border-zinc-700 text-zinc-500',
  sent: 'border-blue-700 text-blue-400',
};

const ConversationsPanel: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [items, setItems] = useState<Conversation[]>([]);
  const [leadId, setLeadId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<Conversation | null>(null);
  const [deduped, setDeduped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [brandRes, convRes, leadRes] = await Promise.all([
        fetch(`${API_BASE}/brands`),
        fetch(`${API_BASE}/conversations`),
        fetch(`${API_BASE}/leads`),
      ]);
      if (!brandRes.ok || !convRes.ok) throw new Error('Falha ao carregar conversas');
      const b = await brandRes.json();
      const c = await convRes.json();
      const l = leadRes.ok ? await leadRes.json() : { leads: [] };
      const allowed: Brand[] = b.brands ?? ['karen'];
      setBrands(allowed);
      setBrand((current) => current && allowed.includes(current) ? current : allowed[0] ?? null);
      setItems(c.items ?? []);
      setLeads(l.leads ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!brand || transcript.trim().length < 20) return;
    setBusy(true);
    setError('');
    setResult(null);
    setDeduped(false);
    try {
      const res = await fetch(`${API_BASE}/conversations/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          transcript,
          leadId: leadId || null,
          source: 'manual',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data.item);
      setDeduped(Boolean(data.deduped));
      setTranscript('');
      setLeadId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function decide(item: Conversation, decision: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/conversations/${item.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data.item);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
  }

  const visibleLeads = leads.filter((lead) => lead.brand === brand);
  const pending = items.filter((item) => item.status === 'pending' && item.classification === 'client');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-900 px-4 py-2">
        <span className="text-[11px] uppercase tracking-widest text-zinc-500">Marca</span>
        {brands.map((b) => (
          <button
            key={b}
            onClick={() => { setBrand(b); setResult(null); }}
            className={`rounded-full border px-2.5 py-1 text-[11px] capitalize ${
              brand === b
                ? 'border-emerald-500 text-emerald-300'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-200'
            }`}
          >
            {b}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-400">
          <ShieldAlert size={12} /> {pending.length} entrega(s) crítica(s)
        </span>
        <button onClick={load} className="text-zinc-500 hover:text-blue-400" title="Atualizar">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {error && (
          <p className="rounded border border-red-800/50 bg-red-950/30 p-2 text-xs text-red-300">{error}</p>
        )}
        <p className="text-[11px] text-amber-400/80">
          Cole a conversa com o possível cliente. Nem toda conversa é cliente: a classificação
          respeita recusa explícita. Nada é enviado automaticamente — a entrega exige sua aprovação.
        </p>

        <form onSubmit={analyze} className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-300"
          >
            <option value="">Vincular a lead (opcional)</option>
            {visibleLeads.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.title}</option>
            ))}
          </select>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder={'Cole aqui o transcript da conversa...\n\nCliente: oi, quanto custa?\nVocê: ...'}
            className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-200 focus:border-emerald-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || transcript.trim().length < 20 || !brand}
            className="w-full rounded bg-emerald-700 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {busy ? 'Analisando...' : 'Analisar e gerar prompts'}
          </button>
        </form>

        {deduped && (
          <p className="rounded border border-blue-800/50 bg-blue-950/30 p-2 text-[11px] text-blue-300">
            Transcript já processado — reaproveitando o resultado anterior.
          </p>
        )}

        {result && <ResultCard item={result} busy={busy} onDecide={decide} onCopy={copy} />}

        <div className="border-t border-zinc-900 pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-widest text-zinc-600">Histórico</p>
          {items.length === 0 && (
            <p className="text-xs text-zinc-600">Nenhuma conversa processada ainda.</p>
          )}
          {items.map((item) => (
            <div key={item.id} className="mb-1.5 rounded border border-zinc-800 bg-zinc-900/30">
              <button
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
              >
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${BADGE[item.classification]}`}>
                  {LABEL[item.classification]}
                </span>
                <span className="flex-1 truncate text-[11px] text-zinc-300">
                  {item.brand} · {new Date(item.created_at).toLocaleString('pt-BR')}
                </span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${STATUS_BADGE[item.status]}`}>
                  {item.status}
                </span>
              </button>
              {expanded === item.id && (
                <div className="space-y-2 border-t border-zinc-800 px-2.5 py-2">
                  <p className="text-[10px] text-zinc-500">
                    confiança {item.score} · {item.reason} · prompt {item.prompt_version}
                  </p>
                  <PromptBlock label="PROMPT DE SISTEMA" text={item.system_prompt} onCopy={copy} />
                  <PromptBlock label="MENSAGEM FINAL" text={item.message} onCopy={copy} />
                  {item.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => decide(item, 'approve')}
                        className="flex items-center gap-1 rounded border border-emerald-800 px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-40"
                      >
                        <Check size={11} /> Aprovar entrega
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => decide(item, 'reject')}
                        className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-500 hover:text-red-400 disabled:opacity-40"
                      >
                        <X size={11} /> Descartar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function PromptBlock({ label, text, onCopy }: { label: string; text: string; onCopy: (t: string) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</span>
        <button onClick={() => onCopy(text)} className="text-zinc-600 hover:text-blue-400" title="Copiar">
          <Copy size={11} />
        </button>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 text-[11px] text-zinc-300">
        {text}
      </pre>
    </div>
  );
}

function ResultCard({
  item,
  busy,
  onDecide,
  onCopy,
}: {
  item: Conversation;
  busy: boolean;
  onDecide: (item: Conversation, decision: 'approve' | 'reject') => void;
  onCopy: (t: string) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-800/60 bg-amber-950/10 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase ${BADGE[item.classification]}`}>
          {LABEL[item.classification]}
        </span>
        <span className="text-[11px] text-amber-300">Entrega crítica · aguardando decisão</span>
      </div>
      <p className="mb-3 text-[10px] text-zinc-500">
        confiança {item.score} · {item.reason} · prompt {item.prompt_version}
      </p>
      <div className="space-y-3">
        <PromptBlock label="Prompt de sistema" text={item.system_prompt} onCopy={onCopy} />
        <PromptBlock label="Mensagem final" text={item.message} onCopy={onCopy} />
      </div>
      {item.status === 'pending' ? (
        <div className="mt-3 flex gap-1.5">
          <button
            disabled={busy}
            onClick={() => onDecide(item, 'approve')}
            className="flex items-center gap-1 rounded bg-emerald-700 px-3 py-1.5 text-[11px] text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            <Check size={11} /> Aprovar entrega
          </button>
          <button
            disabled={busy}
            onClick={() => onDecide(item, 'reject')}
            className="flex items-center gap-1 rounded border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-400 hover:text-red-400 disabled:opacity-40"
          >
            <X size={11} /> Descartar
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-zinc-400">
          Decisão registrada: <span className="text-emerald-400">{item.status}</span>
          {item.approved_by ? ` por ${item.approved_by}` : ''}.
        </p>
      )}
    </div>
  );
}

export default ConversationsPanel;

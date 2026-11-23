import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Copy, ExternalLink, RefreshCw } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

type Status = 'ready' | 'copied' | 'sent' | 'dismissed';

interface Message {
  id: string;
  title: string;
  phone: string | null;
  wa_link: string;
  first_touch: string;
  follow_up: string;
  model: string;
  status: Status;
  created_at: string;
  updated_at: string | null;
}

interface Queue {
  items: Message[];
  counts: Record<Status, number>;
}

const BADGE: Record<Status, string> = {
  ready: 'text-emerald-400 border-emerald-800',
  copied: 'text-blue-400 border-blue-800',
  sent: 'text-zinc-400 border-zinc-700',
  dismissed: 'text-red-400 border-red-800',
};

const OutreachPanel: React.FC = () => {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/outreach/queue`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setQueue(await res.json());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(item: Message, status: Status) {
    setBusy(item.id);
    try {
      const res = await fetch(`${API_BASE}/outreach/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(null); }
  }

  async function copy(item: Message) {
    try { await navigator.clipboard.writeText(item.first_touch); } catch { /* clipboard blocked */ }
    await setStatus(item, 'copied');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-900 px-4 py-1.5">
        <span className="text-[11px] text-zinc-500">
          {queue ? `${queue.counts.ready} prontas · ${queue.counts.sent} enviadas manualmente` : 'Carregando...'}
        </span>
        <button onClick={load} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-blue-400" title="Atualizar">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {error && <p className="rounded border border-red-800/50 bg-red-950/30 p-2 text-xs text-red-300">{error}</p>}
        <p className="text-[11px] text-amber-400/80">
          KAREN apenas prepara o texto. Nenhum envio é automático — a decisão e o clique são seus.
        </p>
        {(queue?.items ?? []).map((item) => (
          <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <p className="flex-1 truncate text-xs text-zinc-200">{item.title}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase ${BADGE[item.status]}`}>{item.status}</span>
            </div>
            <p className="mb-2 text-[10px] text-zinc-600">
              modelo {item.model} · {item.phone ? 'telefone do lead' : 'sem telefone (abre seletor)'}
            </p>
            <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 text-[11px] text-zinc-300">
              {item.first_touch}
            </pre>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => copy(item)}
                disabled={busy === item.id}
                className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-blue-500 disabled:opacity-40"
              >
                <Copy size={11} /> Copiar
              </button>
              <a
                href={item.wa_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setStatus(item, 'copied')}
                className="flex items-center gap-1 rounded border border-emerald-800 px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-950/40"
              >
                <ExternalLink size={11} /> Abrir WhatsApp
              </a>
              {item.status !== 'sent' && (
                <button
                  onClick={() => setStatus(item, 'sent')}
                  disabled={busy === item.id}
                  className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-emerald-300 disabled:opacity-40"
                >
                  <Check size={11} /> Marcar enviado
                </button>
              )}
              {item.status !== 'dismissed' && (
                <button
                  onClick={() => setStatus(item, 'dismissed')}
                  disabled={busy === item.id}
                  className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-500 hover:text-red-400 disabled:opacity-40"
                >
                  <Ban size={11} /> Descartar
                </button>
              )}
            </div>
          </div>
        ))}
        {(queue?.items.length ?? 0) === 0 && (
          <p className="text-xs text-zinc-600">Nenhuma mensagem pronta ainda. Rode a busca de leads ou o job de rascunhos.</p>
        )}
      </div>
    </div>
  );
};

export default OutreachPanel;

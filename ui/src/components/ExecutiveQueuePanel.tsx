import React, { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, RefreshCw, SkipForward } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

type Decision = 'approve' | 'edit' | 'skip';

interface QueueItem {
  id: string;
  action: string;
  lead: string;
  source: string;
  draft: string;
  estimateSeconds: number;
  status: 'pending' | 'approved' | 'edited' | 'skipped';
  created_at: string;
}

interface Queue {
  items: QueueItem[];
  max: number;
  readingTimeSeconds: number;
}

const ExecutiveQueuePanel: React.FC = () => {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/executive-queue`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setQueue(await res.json());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(item: QueueItem, decision: Decision) {
    setBusy(item.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/executive-queue/${encodeURIComponent(item.id)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          editedDraft: decision === 'edit' ? draft : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEditing(null);
      setDraft('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const pending = (queue?.items ?? []).filter((item) => item.status === 'pending');
  const minutes = Math.ceil((queue?.readingTimeSeconds ?? 0) / 60);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-hud-line px-4 py-2">
        <span className="hud-label">Fila executiva · {pending.length}/{queue?.max ?? 7}</span>
        <span className="hud-mono text-[11px] text-hud-cyan">~{minutes} min</span>
        <button onClick={load} className="text-hud-muted hover:text-hud-cyan" title="Atualizar">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 hud-scroll">
        {error && (
          <p role="alert" className="rounded-lg border border-hud-danger/40 bg-hud-danger/10 p-2 text-xs text-hud-danger">{error}</p>
        )}
        <p className="text-[11px] text-hud-muted">
          Aprovar só registra a decisão e devolve o texto. Nenhum envio é feito pela Karen.
        </p>
        {queue?.items.length === 0 && (
          <p className="rounded-lg border border-hud-line bg-hud-panel p-4 text-xs text-hud-muted">
            Nenhum item na fila.
          </p>
        )}
        {queue?.items.map((item) => (
          <article key={item.id} className="hud-card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200">{item.action}</p>
                <p className="hud-mono text-[10px] text-hud-muted">
                  {item.lead} · {item.source} · {item.estimateSeconds}s
                </p>
              </div>
              <span className={`hud-badge ${item.status === 'pending' ? '' : 'text-hud-muted'}`}>{item.status}</span>
            </div>
            {editing === item.id ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                className="hud-input"
                aria-label="Editar rascunho"
              />
            ) : (
              <pre className="whitespace-pre-wrap rounded bg-hud-bg p-2 text-[11px] text-slate-300">{item.draft}</pre>
            )}
            {item.status === 'pending' && (
              <div className="flex flex-wrap gap-1.5">
                {editing === item.id ? (
                  <>
                    <button
                      onClick={() => decide(item, 'edit')}
                      disabled={busy === item.id}
                      className="hud-btn-primary"
                    >
                      <Check size={11} /> Salvar
                    </button>
                    <button onClick={() => { setEditing(null); setDraft(''); }} className="hud-btn">
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => decide(item, 'approve')}
                      disabled={busy === item.id}
                      className="hud-btn-primary"
                    >
                      <Check size={11} /> Aprovar
                    </button>
                    <button
                      onClick={() => { setEditing(item.id); setDraft(item.draft); }}
                      disabled={busy === item.id}
                      className="hud-btn"
                    >
                      <Pencil size={11} /> Editar
                    </button>
                    <button
                      onClick={() => decide(item, 'skip')}
                      disabled={busy === item.id}
                      className="hud-btn"
                    >
                      <SkipForward size={11} /> Pular
                    </button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};

export default ExecutiveQueuePanel;

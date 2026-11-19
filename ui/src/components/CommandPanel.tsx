import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, RefreshCw, XCircle } from 'lucide-react';

interface Definition {
  id: string;
  label: string;
  description: string;
  risk: 'read' | 'write';
  preview: string;
}

interface Run {
  id: string;
  command_id: string;
  risk: 'read' | 'write';
  decision: string;
  status: 'pending' | 'running' | 'ok' | 'error' | 'denied';
  source: string;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  duration_ms: number | null;
  approval_token: string | null;
  created_at: string;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-amber-400 border-amber-700/60',
  running: 'text-blue-400 border-blue-700/60',
  ok: 'text-emerald-400 border-emerald-700/60',
  error: 'text-red-400 border-red-700/60',
  denied: 'text-zinc-500 border-zinc-700',
};

const CommandPanel: React.FC = () => {
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [garden, setGarden] = useState<string | null>(null);
  const [gardenBusy, setGardenBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/commands`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDefinitions(data.definitions ?? []);
      setRuns(data.runs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function request(def: Definition) {
    if (busy) return;
    setBusy(def.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/commands/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: def.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.status === 'ok' || data.status === 'error') setExpanded(data.runId ?? null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function decide(run: Run, action: 'approve' | 'deny') {
    if (!run.approval_token) return;
    setBusy(run.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/commands/${run.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: run.approval_token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (action === 'approve' && (data.status === 'ok' || data.status === 'error')) {
        setExpanded(data.runId ?? run.id);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function gardenReport() {
    setGardenBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/garden/report`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGarden(data.report ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGardenBusy(false);
    }
  }

  const labelOf = (id: string) => definitions.find((d) => d.id === id)?.label ?? id;
  const pending = runs.filter((r) => r.status === 'pending');
  const read = definitions.filter((d) => d.risk === 'read');
  const write = definitions.filter((d) => d.risk === 'write');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-end border-b border-zinc-900 px-5 py-1.5">
        <button onClick={refresh} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-blue-400" title="Atualizar">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
        {error && (
          <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-lg p-2">
            {error}
          </div>
        )}

        {pending.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
              Aprovação pendente ({pending.length})
            </h3>
            {pending.map((run) => (
              <div key={run.id} className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-amber-200">{labelOf(run.command_id)}</span>
                  <span className="text-[10px] text-zinc-500">
                    solicitado por {run.source} · {new Date(run.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-300 bg-black/60 rounded-lg p-2 border border-zinc-800">
{definitions.find((d) => d.id === run.command_id)?.preview ?? run.command_id}
                </pre>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => decide(run, 'deny')}
                    disabled={busy === run.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-700 disabled:opacity-40"
                  >
                    <XCircle size={13} /> Negar
                  </button>
                  <button
                    onClick={() => decide(run, 'approve')}
                    disabled={busy === run.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
                  >
                    <Check size={13} /> Aprovar e executar
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Comandos rápidos</h3>
          <div className="grid grid-cols-2 gap-2">
            {[...read, ...write].map((def) => (
              <button
                key={def.id}
                onClick={() => request(def)}
                disabled={busy !== null}
                title={def.description}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                  def.risk === 'write'
                    ? 'border-zinc-800 hover:border-amber-600 bg-amber-950/10'
                    : 'border-zinc-800 hover:border-blue-600 bg-zinc-900/40'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs text-zinc-200">
                  <span className={`h-1.5 w-1.5 rounded-full ${def.risk === 'write' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {def.label}
                </span>
                <span className="text-[10px] text-zinc-500 truncate w-full">{def.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              Jardim de notas
            </h3>
            <button
              onClick={gardenReport}
              disabled={gardenBusy}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-zinc-700 hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40"
            >
              <RefreshCw size={12} className={gardenBusy ? 'animate-spin' : ''} />
              {gardenBusy ? 'Analisando...' : 'Gerar relatório'}
            </button>
          </div>
          {garden && (
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-300 bg-black/60 rounded-lg p-3 border border-zinc-800 max-h-72 overflow-auto">
{garden}
            </pre>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Histórico</h3>
          {runs.length === 0 && <p className="text-xs text-zinc-600">Nenhum comando executado ainda.</p>}
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40">
              <button
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="flex items-center gap-2 text-xs text-zinc-300">
                  <ChevronDown size={13} className={`transition-transform ${expanded === run.id ? 'rotate-180' : ''}`} />
                  {labelOf(run.command_id)}
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase ${STATUS_STYLE[run.status] ?? ''}`}>
                    {run.status}
                  </span>
                </span>
                <span className="text-[10px] text-zinc-600">
                  {run.exit_code !== null ? `exit ${run.exit_code} · ` : ''}
                  {run.duration_ms !== null ? `${(run.duration_ms / 1000).toFixed(1)}s · ` : ''}
                  {new Date(run.created_at).toLocaleString()}
                </span>
              </button>
              {expanded === run.id && (
                <div className="border-t border-zinc-800 px-3 py-2 flex flex-col gap-2">
                  {run.stdout && (
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-300 bg-black/60 rounded p-2 max-h-60 overflow-auto">
{run.stdout}
                    </pre>
                  )}
                  {run.stderr && (
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-red-300 bg-black/60 rounded p-2 max-h-40 overflow-auto">
{run.stderr}
                    </pre>
                  )}
                  {!run.stdout && !run.stderr && (
                    <p className="text-[11px] text-zinc-600">Sem saída registrada.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default CommandPanel;

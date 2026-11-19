import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

interface Board {
  mode: 'karen' | 'eva';
  context: string;
  reportDate: string | null;
  opportunities: { rank: number; title: string; score: number; needs: string[] }[];
  decisions: { path: string; text: string }[];
}

const EvaPanel: React.FC = () => {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/eva/board`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBoard(await res.json());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setMode(mode: 'karen' | 'eva') {
    try {
      const res = await fetch(`${API_BASE}/eva/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-end border-b border-zinc-900 px-4 py-1.5">
        <button onClick={load} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-blue-400" title="Atualizar">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {error && <p className="rounded-lg border border-red-800/50 bg-red-950/30 p-2 text-xs text-red-300">{error}</p>}
        {board ? (
          <>
            <section className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                <Sparkles size={12} /> Modo do assistente
              </p>
              <div className="flex overflow-hidden rounded-lg border border-zinc-700">
                <button
                  onClick={() => setMode('karen')}
                  className={`flex-1 px-3 py-2 text-xs ${board.mode === 'karen' ? 'bg-zinc-800 text-blue-300' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  KAREN · assistente
                </button>
                <button
                  onClick={() => setMode('eva')}
                  className={`flex-1 px-3 py-2 text-xs ${board.mode === 'eva' ? 'bg-zinc-800 text-emerald-300' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  EVA · co-sócia
                </button>
              </div>
              <p className="text-[11px] text-zinc-600">
                Contexto ativo: <span className="text-blue-400">{board.context}</span>
              </p>
            </section>

            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                Oportunidades {board.reportDate ? `· ${board.reportDate}` : ''}
              </p>
              {board.opportunities.map((o) => (
                <div key={o.rank} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                  <p className="text-xs text-zinc-200">{o.title}</p>
                  <p className="text-[11px] text-zinc-600">score {o.score} · {(o.needs ?? []).join(', ')}</p>
                </div>
              ))}
              {board.opportunities.length === 0 && <p className="text-xs text-zinc-600">Sem relatório ainda.</p>}
            </section>

            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Decisões registradas</p>
              {board.decisions.map((d) => (
                <details key={d.path} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                  <summary className="cursor-pointer text-xs text-zinc-300">{d.path.split('/').pop()}</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-zinc-500">{d.text}</pre>
                </details>
              ))}
              {board.decisions.length === 0 && (
                <p className="text-xs text-zinc-600">Nenhuma decisão registrada. No chat, peça à EVA para registrar uma.</p>
              )}
            </section>
          </>
        ) : (
          <p className="text-xs text-zinc-500">Carregando board...</p>
        )}
      </div>
    </div>
  );
};

export default EvaPanel;

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, X } from 'lucide-react';
import type { ActivityItem } from '../../lib/cooTelemetry';
import { MOCK_AUDIT, type AuditEvent, type AuditLevel } from './mockData';

interface Props {
  events: AuditEvent[];
  activity: ActivityItem[];
}

const LEVEL_STYLE: Record<AuditLevel, string> = {
  INFO: 'border-hud-cyan/40 text-hud-cyan bg-hud-cyan/5',
  POLICY_PASS: 'border-hud-emerald/40 text-hud-emerald bg-hud-emerald/5',
  PENDING_APPROVAL: 'border-hud-amber/40 text-hud-amber bg-hud-amber/5',
  EXECUTED: 'border-hud-emerald/50 text-hud-emerald bg-hud-emerald/10',
  BLOCKED: 'border-hud-crimson/50 text-hud-crimson bg-hud-crimson/10',
};

export default function AuditStream({ events, activity }: Props) {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const live: AuditEvent[] = activity.slice(0, 8).map((a, i) => ({
      id: `live-${i}`,
      time: a.at.length <= 12 ? a.at : new Date(a.at).toLocaleTimeString(),
      level: a.kind === 'alert' ? 'PENDING_APPROVAL' : a.kind === 'command' ? 'EXECUTED' : 'INFO',
      message: `${a.title} — ${a.detail}`,
      promptHash: 'sha256:live...telemetry',
      reasoning: ['Read from /api/dashboard/activity', 'No mutation performed'],
      txId: 'read-only',
    }));
    return [...events, ...live];
  }, [events, activity]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  return (
    <>
      <section className="hud-glass flex h-full min-h-[300px] flex-col rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-hud-cyan" />
            <h2 className="text-sm font-semibold text-slate-100">Live Execution &amp; Audit Stream</h2>
          </div>
          <span className="font-mono text-[10px] text-slate-500">{rows.length} events</span>
        </div>
        <div ref={listRef} className="hud-scroll flex-1 space-y-1.5 overflow-y-auto pr-1 font-mono text-[10.5px]">
          {(rows.length ? rows : MOCK_AUDIT).map((row) => (
            <button
              key={row.id}
              onClick={() => setSelected(row)}
              className="flex w-full items-start gap-2 rounded border border-transparent px-2 py-1.5 text-left transition-colors hover:border-slate-700 hover:bg-slate-950/60"
            >
              <span className="shrink-0 text-slate-600">{row.time}</span>
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] ${LEVEL_STYLE[row.level]}`}>
                [{row.level}]
              </span>
              <span className="min-w-0 text-slate-300">{row.message}</span>
            </button>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.aside
              className="hud-scroll h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-[#0b111d] p-5"
              initial={reduced ? { opacity: 0 } : { x: 400 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { x: 400 }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-mono text-sm font-semibold text-hud-cyan">Audit Detail</h3>
                <button onClick={() => setSelected(null)} className="rounded p-1 text-slate-400 hover:text-white" aria-label="Close detail">
                  <X size={18} />
                </button>
              </div>
              <div className={`mb-3 inline-block rounded border px-2 py-1 text-[10px] ${LEVEL_STYLE[selected.level]}`}>
                [{selected.level}] {selected.time}
              </div>
              <p className="mb-5 text-sm text-slate-200">{selected.message}</p>
              <div className="space-y-4 text-[11px]">
                <div>
                  <div className="mb-1 uppercase tracking-wider text-slate-500">prompt_hash</div>
                  <div className="rounded border border-slate-800 bg-slate-950/60 p-2 font-mono text-hud-cyan">{selected.promptHash}</div>
                </div>
                <div>
                  <div className="mb-1 uppercase tracking-wider text-slate-500">reasoning_trace</div>
                  <ol className="space-y-1 rounded border border-slate-800 bg-slate-950/60 p-2 font-mono text-slate-300">
                    {selected.reasoning.map((r, i) => <li key={i}>{i + 1}. {r}</li>)}
                  </ol>
                </div>
                <div>
                  <div className="mb-1 uppercase tracking-wider text-slate-500">database_transaction_id</div>
                  <div className="rounded border border-slate-800 bg-slate-950/60 p-2 font-mono text-hud-emerald">{selected.txId}</div>
                </div>
              </div>
              <p className="mt-6 text-[10px] text-slate-600">Read-only view · no secrets are stored in the audit stream.</p>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

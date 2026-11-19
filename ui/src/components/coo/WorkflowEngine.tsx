import { motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowRight, CircleDot } from 'lucide-react';
import { MOCK_LOOPS, WORKFLOW_STAGES } from './mockData';

export default function WorkflowEngine() {
  const reduced = useReducedMotion();
  const activeStage = Math.max(...MOCK_LOOPS.map((l) => l.stage));

  return (
    <section className="hud-glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-hud-cyan" />
          <h2 className="text-sm font-semibold text-slate-100">Active Operational Loops</h2>
        </div>
        <motion.span
          className="flex items-center gap-1.5 rounded-full border border-hud-emerald/40 bg-hud-emerald/10 px-2.5 py-1 text-[10px] font-semibold text-hud-emerald"
          animate={reduced ? undefined : { opacity: [1, 0.6, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <CircleDot size={11} /> {MOCK_LOOPS.length} live
        </motion.span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {WORKFLOW_STAGES.map((stage, i) => {
          const done = i < activeStage;
          const active = i === activeStage;
          return (
            <div key={stage} className="flex items-center gap-1.5">
              <motion.div
                animate={active && !reduced ? { scale: [1, 1.06, 1] } : undefined}
                transition={{ duration: 1.6, repeat: Infinity }}
                className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                  active
                    ? 'border-hud-cyan/60 bg-hud-cyan/10 text-hud-cyan shadow-[0_0_18px_rgba(0,240,255,0.18)]'
                    : done
                      ? 'border-hud-emerald/30 bg-hud-emerald/5 text-hud-emerald'
                      : 'border-slate-800 bg-slate-950/40 text-slate-500'
                }`}
              >
                {done ? '✓ ' : active ? '▸ ' : ''}{stage}
              </motion.div>
              {i < WORKFLOW_STAGES.length - 1 && (
                <ArrowRight size={11} className="text-slate-700" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {MOCK_LOOPS.map((loop) => (
          <div key={loop.id} className="flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <motion.span
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-hud-emerald"
              animate={reduced ? undefined : { opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.4 + loop.stage * 0.2, repeat: Infinity }}
            />
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-200">{loop.name}</div>
              <div className="truncate text-[10px] text-slate-500">{loop.detail}</div>
            </div>
            <span className="ml-auto shrink-0 font-mono text-[9px] text-hud-cyan/70">
              S{loop.stage + 1}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

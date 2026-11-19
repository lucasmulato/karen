import { motion, useReducedMotion } from 'framer-motion';
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts';
import { AlertTriangle, CheckCircle, Pencil, X } from 'lucide-react';
import type { ApprovalItem } from './mockData';

export type Decision = 'approve' | 'modify' | 'reject';

interface Props {
  item: ApprovalItem;
  onDecide: (id: string, decision: Decision) => void;
}

export default function ApprovalCard({ item, onDecide }: Props) {
  const reduced = useReducedMotion();
  const color = item.severity === 'high' ? '#ef4444' : '#f59e0b';

  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduced ? undefined : { y: -2 }}
      className="hud-glass rounded-xl p-4 transition-shadow hover:shadow-[0_0_28px_rgba(0,240,255,0.10)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle size={15} style={{ color }} />
            <h3 className="truncate text-sm font-semibold text-slate-100">{item.title}</h3>
            <span
              className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color, borderColor: `${color}55`, background: `${color}12` }}
            >
              {item.severity} risk
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{item.target}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded border border-slate-700 bg-slate-950/50 px-2 py-0.5 font-mono text-slate-300">
              {item.system}
            </span>
            <span className="rounded border border-slate-800 px-2 py-0.5 font-mono text-slate-500">
              {item.requestedBy}
            </span>
            <span className="font-mono text-slate-600">{item.createdAt}</span>
          </div>
        </div>
        <div className="relative h-[72px] w-[72px] shrink-0">
          <RadialBarChart
            width={72}
            height={72}
            cx={36}
            cy={36}
            innerRadius={25}
            outerRadius={34}
            startAngle={90}
            endAngle={-270}
            data={[{ value: item.risk, fill: color }]}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" background={{ fill: '#1e293b' }} cornerRadius={5} isAnimationActive={!reduced} />
          </RadialBarChart>
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-bold" style={{ color }}>
            {item.risk}%
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
          Proposed payload <span className="text-hud-cyan">/ JSON diff preview</span>
        </div>
        <pre className="hud-scroll max-h-32 overflow-auto rounded-lg border border-slate-800 bg-[#070b14] p-3 font-mono text-[10.5px] leading-relaxed text-hud-cyan/90">
          {item.diff}
        </pre>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => onDecide(item.id, 'approve')}
          className="flex items-center gap-1.5 rounded-md border border-hud-emerald/50 bg-hud-emerald/10 px-3 py-1.5 text-[11px] font-semibold text-hud-emerald transition-colors hover:bg-hud-emerald/20"
        >
          <CheckCircle size={13} /> Approve (Execute)
        </button>
        <button
          onClick={() => onDecide(item.id, 'modify')}
          className="flex items-center gap-1.5 rounded-md border border-hud-amber/50 bg-hud-amber/10 px-3 py-1.5 text-[11px] font-semibold text-hud-amber transition-colors hover:bg-hud-amber/20"
        >
          <Pencil size={13} /> Modify
        </button>
        <button
          onClick={() => onDecide(item.id, 'reject')}
          className="flex items-center gap-1.5 rounded-md border border-hud-crimson/50 bg-hud-crimson/10 px-3 py-1.5 text-[11px] font-semibold text-hud-crimson transition-colors hover:bg-hud-crimson/20"
        >
          <X size={13} /> Reject
        </button>
      </div>
    </motion.article>
  );
}

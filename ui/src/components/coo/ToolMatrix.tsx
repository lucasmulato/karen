import { motion, useReducedMotion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle, Lock, Shield, Unplug } from 'lucide-react';
import {
  MOCK_CALL_FREQUENCY, MOCK_DEFENSE, MOCK_TOOLS, type Rbac,
} from './mockData';

interface Props {
  totalRuns?: number;
  lastRunStatus?: string;
}

const RBAC_STYLE: Record<Rbac, string> = {
  READ_ONLY: 'border-hud-cyan/40 text-hud-cyan bg-hud-cyan/5',
  BOUNDED_WRITE: 'border-hud-emerald/40 text-hud-emerald bg-hud-emerald/5',
  APPROVAL_REQUIRED: 'border-hud-amber/40 text-hud-amber bg-hud-amber/5',
};

export default function ToolMatrix({ totalRuns = 0, lastRunStatus }: Props) {
  const reduced = useReducedMotion();

  return (
    <section className="space-y-3">
      <div className="hud-glass rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-hud-cyan" />
            <h2 className="text-sm font-semibold text-slate-100">Tool &amp; Permission Matrix</h2>
          </div>
          {totalRuns > 0 && (
            <span className="font-mono text-[10px] text-slate-500">
              {totalRuns} live runs · last <span className="text-hud-cyan">{lastRunStatus ?? '—'}</span>
            </span>
          )}
        </div>
        <div className="space-y-2">
          {MOCK_TOOLS.map((tool) => (
            <motion.div
              key={tool.id}
              initial={reduced ? false : { opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  tool.status === 'connected' ? 'bg-hud-emerald' : tool.status === 'degraded' ? 'bg-hud-amber' : 'bg-hud-crimson'
                }`} />
                <span className="text-[12px] font-medium text-slate-200">{tool.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-slate-600">{tool.callsToday} calls</span>
                <span className={`rounded border px-2 py-0.5 font-mono text-[9px] ${RBAC_STYLE[tool.rbac]}`}>
                  {tool.rbac}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="hud-glass rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield size={15} className="text-hud-emerald" />
          <h2 className="text-sm font-semibold text-slate-100">Security &amp; Prompt Injection Defenses</h2>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-hud-emerald/30 bg-hud-emerald/5 px-3 py-2">
          <motion.span
            animate={reduced ? undefined : { opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <CheckCircle size={14} className="text-hud-emerald" />
          </motion.span>
          <span className="text-[11px] font-medium text-hud-emerald">
            Sanitizer Active — {MOCK_DEFENSE.breaches} Injection Breaches Detected
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['Docs sanitized', MOCK_DEFENSE.documentsSanitized],
            ['Grammar blocks', MOCK_DEFENSE.grammarViolations],
            ['Schema compliance', `${MOCK_DEFENSE.compliance}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/40 py-2">
              <div className="font-mono text-base font-semibold text-hud-cyan">{value}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hud-glass rounded-xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <Unplug size={14} className="text-hud-cyan" />
          <h2 className="text-sm font-semibold text-slate-100">Daily Tool Call Frequency</h2>
        </div>
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MOCK_CALL_FREQUENCY} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                cursor={{ fill: 'rgba(0,240,255,0.06)' }}
              />
              <Bar dataKey="calls" fill="#00f0ff" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

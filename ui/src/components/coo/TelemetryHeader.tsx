import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import {
  AlertTriangle, CheckCircle, Cpu, Lock, Shield, Terminal, Zap,
} from 'lucide-react';
import type { HealthFull } from '../../lib/cooTelemetry';
import { MOCK_VRAM, TELEMETRY_MOCK } from './mockData';

interface Props {
  onOpenWorkspace: () => void;
  health: HealthFull | null;
  live: boolean;
  updatedAt: Date;
}

const sparkData = MOCK_VRAM.map((v, i) => ({ i, v }));

function Pill({ label, value, icon, tone }: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: 'cyan' | 'emerald' | 'amber';
}) {
  const toneClass = tone === 'emerald'
    ? 'text-hud-emerald border-hud-emerald/30'
    : tone === 'amber'
      ? 'text-hud-amber border-hud-amber/30'
      : 'text-hud-cyan border-hud-cyan/30';
  return (
    <div className={`flex items-center gap-2 rounded-md border bg-slate-950/40 px-2.5 py-1.5 ${toneClass}`}>
      {icon}
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-mono text-[11px] text-slate-200">{value}</span>
    </div>
  );
}

export default function TelemetryHeader({ onOpenWorkspace, health, live, updatedAt }: Props) {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(new Date());
  const [armed, setArmed] = useState(false);
  const [halted, setHalted] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const healthy = live && health?.api === 'ok' && health?.db === 'ok';
  const pulse = reduced ? {} : { opacity: [1, 0.35, 1], scale: [1, 1.15, 1] };

  const onHalt = () => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setHalted(true);
    window.setTimeout(() => setHalted(false), 3000);
  };

  return (
    <header className="hud-glass relative z-20 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
      <div className="flex min-w-[260px] items-center gap-3">
        <motion.span
          className="h-2.5 w-2.5 rounded-full bg-hud-emerald shadow-[0_0_14px_#10b981]"
          animate={pulse}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
        <div>
          <div className="font-mono text-sm font-semibold tracking-wide text-hud-cyan">
            KAREN COO <span className="text-slate-500">//</span> EXECUTIVE OPERATIONAL HUBSPOT
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400">
            <Shield size={11} className="text-hud-emerald" />
            STATE: {halted ? 'AUTONOMY HALTED (SIMULATED)' : 'BOUNDED RUNNING'}
            <span className={healthy ? 'text-hud-emerald' : 'text-hud-amber'}>
              · {live ? 'LIVE TELEMETRY' : 'MOCK / OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
        <Pill
          label="Model"
          value={`${TELEMETRY_MOCK.model} (${TELEMETRY_MOCK.runtime})`}
          icon={<Cpu size={12} />}
        />
        <div className="flex items-center gap-2 rounded-md border border-hud-cyan/30 bg-slate-950/40 px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">VRAM</span>
          <span className="font-mono text-[11px] text-slate-200">2.8 / 11.0 GB</span>
          <div className="h-7 w-24 opacity-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="vramFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="#00f0ff" strokeWidth={1.5} fill="url(#vramFill)" isAnimationActive={!reduced} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <Pill label="KV Context" value="8192 tok" />
        <Pill label="Gen Speed" value="34.2 t/s" icon={<Zap size={12} />} tone="cyan" />
        <Pill
          label="Policy Gateway"
          value="Active (100% GBNF)"
          icon={<CheckCircle size={12} />}
          tone="emerald"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right font-mono text-[11px] leading-tight text-slate-300">
          <div>UTC <span className="text-hud-cyan">{now.toISOString().slice(11, 19)}</span></div>
          <div className="text-[10px] text-slate-500">LOCAL {now.toLocaleTimeString()}</div>
          <div className="text-[9px] text-slate-600">sync {updatedAt.toLocaleTimeString()}</div>
        </div>
        <button
          onClick={onOpenWorkspace}
          className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-300 transition-colors hover:border-hud-cyan/50 hover:text-hud-cyan"
          title="Open the full KAREN workspace (notes, graph, chat, leads, commands)"
        >
          <Terminal size={13} className="mr-1 inline" />Workspace
        </button>
        <motion.button
          onClick={onHalt}
          whileHover={reduced ? undefined : { scale: 1.03 }}
          className={`rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            armed
              ? 'border-hud-crimson bg-hud-crimson/30 text-white'
              : 'border-hud-crimson/60 bg-hud-crimson/10 text-hud-crimson hover:bg-hud-crimson/20'
          }`}
        >
          <AlertTriangle size={13} className="mr-1 inline" />
          {halted ? 'Halted (sim)' : armed ? 'Confirm halt?' : 'Halt all autonomy'}
        </motion.button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-hud-cyan/30 to-transparent" />
      <span className="sr-only"><Lock size={1} /> Governance controls are simulated.</span>
    </header>
  );
}

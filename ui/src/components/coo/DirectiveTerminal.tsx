import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CornerDownLeft, Terminal, Zap } from 'lucide-react';

interface Props {
  onDirective: (text: string) => void;
}

const CHIPS = [
  'Generate Daily Ops Brief',
  'Pause Financial Actions',
  'Review Last 24h Errors',
  'Adjust Approval Threshold to $200',
];

export default function DirectiveTerminal({ onDirective }: Props) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState('');

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onDirective(trimmed);
    setValue('');
  };

  return (
    <section className="hud-glass rounded-xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Terminal size={15} className="text-hud-cyan" />
        <h2 className="text-sm font-semibold text-slate-100">Operational Directive Terminal</h2>
        <span className="ml-auto font-mono text-[9px] text-slate-600">simulated · no commands executed</span>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(value); }}
        className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#070b14] px-3 py-2 focus-within:border-hud-cyan/50"
      >
        <span className="font-mono text-hud-cyan">&gt;</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask KAREN COO for operational status, issue a directive, or adjust risk threshold..."
          className="w-full bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600"
          aria-label="Operational directive"
        />
        <motion.button
          type="submit"
          whileHover={reduced ? undefined : { scale: 1.04 }}
          className="flex shrink-0 items-center gap-1 rounded-md border border-hud-cyan/40 bg-hud-cyan/10 px-3 py-1.5 text-[11px] font-semibold text-hud-cyan hover:bg-hud-cyan/20"
        >
          Send <CornerDownLeft size={12} />
        </motion.button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => submit(chip)}
            className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[10px] text-slate-400 transition-colors hover:border-hud-amber/50 hover:text-hud-amber"
          >
            <Zap size={10} /> {chip}
          </button>
        ))}
      </div>
    </section>
  );
}

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { STAGES, type CrmLead, type Stage } from './mockCrm';

interface Props {
  leads: CrmLead[];
  onSelect: (lead: CrmLead) => void;
  onMove: (id: string, stage: Stage) => void;
}

const TEMP_COLOR = { hot: '#ef4444', warm: '#f59e0b', cold: '#38bdf8' };

export default function PipelineBoard({ leads, onSelect, onMove }: Props) {
  const reduced = useReducedMotion();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  return (
    <div className="hud-scroll flex gap-3 overflow-x-auto pb-2">
      {STAGES.map((stage) => {
        const cards = leads.filter((l) => l.stage === stage.id);
        const total = cards.reduce((sum, l) => sum + l.value, 0);
        return (
          <div
            key={stage.id}
            onDragOver={(e) => { e.preventDefault(); setOver(stage.id); }}
            onDragLeave={() => setOver((s) => (s === stage.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) onMove(dragId, stage.id);
              setDragId(null);
              setOver(null);
            }}
            className={`flex w-56 shrink-0 flex-col rounded-xl border p-2 transition-colors ${
              over === stage.id
                ? 'border-hud-cyan/60 bg-hud-cyan/5'
                : 'border-slate-800 bg-slate-950/40'
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: stage.tone, boxShadow: `0 0 10px ${stage.tone}` }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">{stage.label}</span>
              </div>
              <span className="rounded-full bg-slate-800 px-1.5 font-mono text-[10px] text-slate-400">{cards.length}</span>
            </div>
            <div className="mb-2 px-1 font-mono text-[10px] text-slate-600">R$ {total.toLocaleString('pt-BR')}</div>
            <div className="flex-1 space-y-2">
              {cards.map((lead) => (
                <motion.button
                  key={lead.id}
                  draggable
                  onDragStart={() => setDragId(lead.id)}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                  onClick={() => onSelect(lead)}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={reduced ? undefined : { y: -2 }}
                  className="block w-full cursor-grab rounded-lg border border-slate-800 bg-[#0d1422] p-2.5 text-left active:cursor-grabbing hover:border-hud-cyan/40"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="truncate text-[11px] font-semibold text-slate-100">{lead.name}</span>
                    <GripVertical size={12} className="shrink-0 text-slate-700" />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: TEMP_COLOR[lead.temperature] }} />
                    <span className="truncate text-[10px] capitalize text-slate-500">{lead.category ?? lead.source}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[10px]">
                    <span className="text-hud-cyan">R$ {lead.value.toLocaleString('pt-BR')}</span>
                    <span className="text-slate-600">{lead.lastActivity}</span>
                  </div>
                </motion.button>
              ))}
              {cards.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-800 py-6 text-center text-[10px] text-slate-700">drop here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Copy, ExternalLink, MapPin, Phone, X } from 'lucide-react';
import { STAGES, type CrmActivity, type CrmLead } from './mockCrm';

interface Props {
  lead: CrmLead | null;
  activities: CrmActivity[];
  onClose: () => void;
  onActivity: (activity: CrmActivity) => void;
}

function copy(text: string) {
  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(text);
}

export default function ContactDrawer({ lead, activities, onClose, onActivity }: Props) {
  const reduced = useReducedMotion();
  const mine = activities.filter((a) => a.leadId === lead?.id);
  const stage = STAGES.find((s) => s.id === lead?.stage);

  return (
    <AnimatePresence>
      {lead && (
        <motion.div
          className="fixed inset-0 z-[90] flex justify-end bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            className="hud-scroll h-full w-full max-w-lg overflow-y-auto border-l border-slate-700 bg-[#0b111d] p-5"
            initial={reduced ? { opacity: 0 } : { x: 480 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { x: 480 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-hud-cyan">Contact / Company</div>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">{lead.name}</h3>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded border px-2 py-0.5 font-mono text-[9px]" style={{ color: stage?.tone, borderColor: `${stage?.tone}66` }}>
                    {stage?.label}
                  </span>
                  <span className="font-mono text-[10px] text-hud-cyan">R$ {lead.value.toLocaleString('pt-BR')}</span>
                  <span className="font-mono text-[9px] text-slate-600">via {lead.source}</span>
                </div>
              </div>
              <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-white" aria-label="Close contact">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                ['Contact', lead.contact ?? '—'],
                ['Phone', lead.phone ?? '—'],
                ['City', lead.city ?? '—'],
                ['Category', lead.category ?? '—'],
                ['Rating', lead.rating ? `${lead.rating} ★` : '—'],
                ['Owner', lead.owner],
                ['Temperature', lead.temperature],
                ['Last activity', lead.lastActivity],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-slate-800 bg-slate-950/50 p-2">
                  <div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div>
                  <div className="mt-0.5 text-slate-200">{value}</div>
                </div>
              ))}
            </div>

            {(lead.phone || lead.website || lead.mapsUrl) && (
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                {lead.phone && <span className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-300"><Phone size={11} />{lead.phone}</span>}
                {lead.website && <a href={`https://${lead.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-hud-cyan"><ExternalLink size={11} />{lead.website}</a>}
                {lead.mapsUrl && <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-hud-cyan"><MapPin size={11} />Maps</a>}
              </div>
            )}

            <div className="mt-5">
              <h4 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hud-cyan">Outreach drafts · copy only, never auto-send</h4>
              {lead.draft ? (
                <div className="space-y-2">
                  {[
                    ['Signal', lead.draft.signal],
                    ['First touch', lead.draft.firstTouch],
                    ['Follow-up', lead.draft.followUp],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
                        <button onClick={() => copy(String(value))} className="flex items-center gap-1 text-[9px] text-hud-cyan hover:underline"><Copy size={10} /> Copy</button>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-300">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-600">No outreach draft available for this lead.</p>
              )}
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-mono text-[10px] uppercase tracking-widest text-hud-cyan">Activity</h4>
                <button
                  onClick={() => onActivity({ id: `a-${Date.now()}`, leadId: lead.id, time: new Date().toLocaleTimeString(), type: 'note', text: 'Manual note added from CRM' })}
                  className="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-300 hover:border-hud-cyan/50 hover:text-hud-cyan"
                >
                  + Add note
                </button>
              </div>
              <div className="space-y-1.5">
                {mine.length ? mine.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-[10px]">
                    <span className="font-mono text-slate-600">{a.time}</span>
                    <span className="rounded bg-slate-800 px-1 text-[8px] uppercase text-slate-400">{a.type}</span>
                    <span className="text-slate-300">{a.text}</span>
                  </div>
                )) : <p className="text-[10px] text-slate-600">No activity recorded yet.</p>}
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

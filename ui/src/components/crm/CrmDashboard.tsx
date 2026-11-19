import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Search, Users } from 'lucide-react';
import ContactDrawer from './ContactDrawer';
import PipelineBoard from './PipelineBoard';
import {
  MOCK_ACTIVITIES, MOCK_FORECAST, STAGES, type CrmActivity, type CrmLead, type Stage,
} from './mockCrm';
import { useCrmLeads } from './useCrmLeads';

function toCsv(leads: CrmLead[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    ['name', 'contact', 'phone', 'city', 'category', 'value', 'stage', 'owner', 'source'].join(','),
    ...leads.map((l) => [l.name, l.contact, l.phone, l.city, l.category, l.value, l.stage, l.owner, l.source].map(esc).join(',')),
  ].join('\n');
}

export default function CrmDashboard() {
  const reduced = useReducedMotion();
  const { leads: initialLeads, live } = useCrmLeads();
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>(MOCK_ACTIVITIES);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');

  // Keep the board in sync when live telemetry replaces the mock dataset.
  useEffect(() => {
    if (live) setLeads(initialLeads);
  }, [initialLeads, live]);

  const shown = useMemo(() => {
    return leads.filter((l) => {
      const q = search.trim().toLowerCase();
      const matches = !q || [l.name, l.contact, l.city, l.category].some((v) => String(v ?? '').toLowerCase().includes(q));
      return matches && (stageFilter === 'all' || l.stage === stageFilter);
    });
  }, [leads, search, stageFilter]);

  const pipelineValue = shown.filter((l) => l.stage !== 'won' && l.stage !== 'lost').reduce((s, l) => s + l.value, 0);
  const won = shown.filter((l) => l.stage === 'won').length;
  const lost = shown.filter((l) => l.stage === 'lost').length;
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;

  const move = (id: string, stage: Stage) => {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, stage } : l));
    setActivities((prev) => [
      ...prev,
      { id: `a-${Date.now()}`, leadId: id, time: new Date().toLocaleTimeString(), type: 'note', text: `Stage moved to ${stage}` },
    ]);
  };

  const addActivity = (a: CrmActivity) => setActivities((prev) => [...prev, a]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'karen-crm.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    ['Leads', String(shown.length), '#00f0ff'],
    ['Pipeline value', `R$ ${pipelineValue.toLocaleString('pt-BR')}`, '#10b981'],
    ['Win rate', `${winRate}%`, '#f59e0b'],
    ['Data', live ? 'LIVE /api/leads' : 'MOCK DATA', '#38bdf8'],
  ];

  return (
    <div className="space-y-4">
      <div className="hud-glass rounded-xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-hud-cyan" />
            <h2 className="text-sm font-semibold text-slate-100">CRM // PIPELINE COMMAND</h2>
            <span className={`rounded border px-2 py-0.5 font-mono text-[9px] ${live ? 'border-hud-emerald/40 text-hud-emerald' : 'border-slate-700 text-slate-500'}`}>
              {live ? 'LIVE' : 'MOCK'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1">
              <Search size={12} className="text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-36 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
                aria-label="Search leads"
              />
            </div>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as Stage | 'all')}
              className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-[11px] text-slate-300 outline-none"
              aria-label="Filter by stage"
            >
              <option value="all">All stages</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1 rounded-md border border-hud-cyan/40 bg-hud-cyan/10 px-2.5 py-1.5 text-[10px] font-semibold text-hud-cyan hover:bg-hud-cyan/20"
            >
              <Download size={12} /> CSV
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {kpis.map(([label, value, color]) => (
            <motion.div
              key={label}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
            >
              <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
              <div className="mt-0.5 font-mono text-sm font-semibold" style={{ color }}>{value}</div>
            </motion.div>
          ))}
        </div>
      </div>

      <section className="hud-glass rounded-xl p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Deal pipeline · drag cards between stages</h3>
        <PipelineBoard leads={shown} onSelect={setSelected} onMove={move} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="hud-glass rounded-xl p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Revenue forecast (k units)</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_FORECAST} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} />
                <Area type="monotone" dataKey="actual" stroke="#00f0ff" fill="url(#actualFill)" strokeWidth={2} isAnimationActive={!reduced} />
                <Area type="monotone" dataKey="target" stroke="#f59e0b" fill="transparent" strokeDasharray="4 4" strokeWidth={1.5} isAnimationActive={!reduced} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="hud-glass rounded-xl p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Activity timeline</h3>
          <div className="hud-scroll h-48 space-y-1.5 overflow-y-auto pr-1">
            {[...activities].reverse().map((a) => {
              const lead = leads.find((l) => l.id === a.leadId);
              return (
                <button
                  key={a.id}
                  onClick={() => lead && setSelected(lead)}
                  className="flex w-full items-start gap-2 rounded border border-transparent px-2 py-1.5 text-left text-[10px] hover:border-slate-700 hover:bg-slate-950/50"
                >
                  <span className="shrink-0 font-mono text-slate-600">{a.time}</span>
                  <span className="shrink-0 rounded bg-slate-800 px-1 text-[8px] uppercase text-slate-400">{a.type}</span>
                  <span className="min-w-0 text-slate-300">{a.text}</span>
                  {a.done && <span className="ml-auto text-hud-emerald">✓</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <ContactDrawer lead={selected} activities={activities} onClose={() => setSelected(null)} onActivity={addActivity} />
    </div>
  );
}

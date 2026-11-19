import React, { useCallback, useEffect, useState } from 'react';
import { Activity, GitCommit, Scale, ShieldAlert, Stethoscope } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

interface ActivityItem {
  kind: 'command' | 'decision' | 'alert' | 'audit';
  title: string;
  detail: string;
  at: string;
}

const ICONS = {
  command: GitCommit,
  decision: Scale,
  alert: ShieldAlert,
  audit: Stethoscope,
};

const ActivityFeed: React.FC = () => {
  const [items, setItems] = useState<ActivityItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/activity`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
        <Activity size={12} /> Atividade recente
      </p>
      {items.map((item, index) => {
        const Icon = ICONS[item.kind] ?? Activity;
        return (
          <div key={`${item.kind}-${index}`} className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <Icon size={12} className="mt-0.5 shrink-0 text-zinc-500" />
            <div className="min-w-0">
              <p className="truncate text-xs text-zinc-200">{item.title}</p>
              <p className="truncate text-[11px] text-zinc-600">{item.detail}</p>
            </div>
          </div>
        );
      })}
      {items.length === 0 && <p className="text-xs text-zinc-600">Sem atividade registrada.</p>}
    </section>
  );
};

export default ActivityFeed;

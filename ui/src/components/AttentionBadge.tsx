import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

interface Item {
  topic: string;
  label: string;
  detail: string;
}

interface Props {
  /** When supplied by the workspace shell, this component does not poll. */
  items?: Item[];
  /** Gentle attention pulse (respects prefers-reduced-motion). */
  pulse?: boolean;
}

const AttentionBadge: React.FC<Props> = ({ items: supplied, pulse = false }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const shown = supplied ?? items;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/attention`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (supplied) return;
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load, supplied]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${pulse ? 'hud-pulse' : ''} ${
          shown.length
            ? 'border-amber-700 bg-amber-950/40 text-amber-300'
            : 'border-zinc-700 text-zinc-500'
        }`}
        title="Itens que precisam de atenção"
        aria-live="polite"
      >
        <Bell size={12} />
        {shown.length ? `${shown.length} atenção` : 'tudo ok'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-2xl">
          <p className="mb-1 px-1 text-[10px] uppercase tracking-widest text-zinc-500">Precisa de atenção</p>
          {shown.length === 0 && <p className="px-1 py-2 text-xs text-zinc-500">Nada pendente.</p>}
          {shown.map((item) => (
            <div key={item.topic} className="border-b border-zinc-900 px-1 py-2 last:border-0">
              <p className="text-xs text-zinc-200">{item.label}</p>
              <p className="text-[11px] text-zinc-500">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttentionBadge;

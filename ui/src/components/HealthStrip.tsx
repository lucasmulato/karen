import React, { useCallback, useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

interface Health {
  api?: string;
  db?: string;
  llama?: string;
  cert?: { status: string; days?: number; expires?: string };
}

const dot = (status?: string) => {
  if (status === 'ok') return 'bg-emerald-400';
  if (status === 'error') return 'bg-red-400';
  return 'bg-zinc-500';
};

const HealthStrip: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health/full`);
      if (res.ok) setHealth(await res.json());
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const items = [
    { key: 'api', label: 'API', status: health?.api },
    { key: 'llama', label: 'KAREN', status: health?.llama },
    { key: 'db', label: 'DB', status: health?.db },
    {
      key: 'cert',
      label: health?.cert?.days !== undefined ? `TLS ${health.cert.days}d` : 'TLS',
      status: health?.cert?.status,
      title: health?.cert?.expires ? `Expira em ${health.cert.expires}` : undefined,
    },
  ];

  return (
    <div className="flex items-center gap-2" title="Status dos serviços (atualiza a cada 15s)">
      {items.map((item) => (
        <span
          key={item.key}
          title={item.title}
          className="flex items-center gap-1 rounded-full border border-zinc-800 bg-black/50 px-2 py-1 text-[9px] uppercase tracking-wider text-zinc-400"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dot(item.status)}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
};

export default HealthStrip;

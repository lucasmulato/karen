import { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export interface HealthFull {
  status?: string;
  api?: string;
  db?: string;
  llama?: string;
  cert?: { status: string; days?: number; expires?: string };
  [key: string]: unknown;
}

export interface AttentionItem {
  topic: string;
  label: string;
  detail: string;
}

export interface ActivityItem {
  kind: string;
  title: string;
  detail: string;
  at: string;
}

export interface CommandDef {
  id: string;
  label: string;
  risk?: string;
  [key: string]: unknown;
}

export interface CommandRun {
  command_id: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

export interface CooTelemetry {
  health: HealthFull | null;
  attention: { total: number; items: AttentionItem[] } | null;
  activity: ActivityItem[];
  commands: CommandDef[];
  runs: CommandRun[];
  live: boolean;
  updatedAt: Date;
}

const EMPTY: CooTelemetry = {
  health: null,
  attention: null,
  activity: [],
  commands: [],
  runs: [],
  live: false,
  updatedAt: new Date(),
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Read-only polling of the existing KAREN API. Never mutates anything;
 * failures simply keep the last known state and the UI falls back to mocks.
 */
export function useCooTelemetry(intervalMs = 15_000): CooTelemetry {
  const [state, setState] = useState<CooTelemetry>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [health, attention, activity, commands, runs] = await Promise.allSettled([
        getJson<HealthFull>('/health/full'),
        getJson<{ total: number; items: AttentionItem[] }>('/dashboard/attention'),
        getJson<ActivityItem[]>('/dashboard/activity'),
        getJson<{ definitions: CommandDef[] }>('/commands'),
        getJson<{ runs: CommandRun[] }>('/commands/runs?limit=12'),
      ]);
      if (cancelled) return;
      const value = (r: PromiseSettledResult<unknown>) =>
        r.status === 'fulfilled' ? r.value : null;
      setState({
        health: value(health) as HealthFull | null,
        attention: value(attention) as CooTelemetry['attention'],
        activity: (value(activity) as ActivityItem[] | null) ?? [],
        commands: ((value(commands) as { definitions?: CommandDef[] } | null)?.definitions) ?? [],
        runs: ((value(runs) as { runs?: CommandRun[] } | null)?.runs) ?? [],
        live: health.status === 'fulfilled',
        updatedAt: new Date(),
      });
    };
    void poll();
    const id = window.setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}

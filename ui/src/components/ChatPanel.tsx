import React, { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  diagnosis?: DiagnosisReport;
}

interface DiagnosisReport {
  generated_at: string;
  services: Record<string, string>;
  timers: string[];
  llama: {
    health: string;
    rss_mib: number | string;
    context: number | string;
    threads: number | string;
    bench: { label: string; at: string; prompt_tps: number; gen_tps: number; rss_mib: number } | string;
  };
  attention: unknown;
  triage: unknown;
  garden: unknown;
  security: unknown;
  backups: unknown;
  issues: string[];
}

interface ChatPanelProps {
  /** Called when the agent mutated the graph so the UI can refetch. */
  onGraphChanged?: () => void;
  /** Palette-driven command, e.g. { id: 1, text: '/diagnosis' }. */
  command?: { id: number; text: string } | null;
  /** Active persona: EVA = professional/prospecting, KAREN = personal/security. */
  mode?: 'karen' | 'eva';
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const KAREN_PROMPTS = [
  { label: 'Status', text: 'Como você está?' },
  { label: 'Jardim', text: 'Use garden_report e me diga quantas notas estão órfãs' },
  { label: 'Notas', text: 'Quantas notas há no vault?' },
  { label: 'Memória', text: 'O que você lembra sobre mim?' },
];

const EVA_PROMPTS = [
  { label: 'Brief', text: 'Me dê um briefing da situação' },
  { label: 'Decisões', text: 'O que preciso decidir?' },
  { label: 'Mensagens', text: 'Quantas mensagens prontas?' },
  { label: 'Leads', text: 'busca restaurantes sem site em Guarulhos, máximo 5 lugares' },
  { label: 'Prazos', text: 'Quais prazos vencem em breve?' },
];

const show = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? '—');

const DiagnosisCard: React.FC<{ report: DiagnosisReport; onNarrate: () => void; busy: boolean }> = ({
  report,
  onNarrate,
  busy,
}) => {
  const l = report.llama;
  const bench = typeof l.bench === 'string' ? l.bench : l.bench.label;
  const rows: [string, string][] = [
    ['Serviços', `API ${report.services.api ?? '—'} · modelo ${report.services.llama ?? '—'} · triagem ${report.services.eva_triage ?? '—'}`],
    ['Modelo', `${bench} · contexto ${show(l.context)} · threads ${show(l.threads)}`],
    ['Memória', `${show(l.rss_mib)} MiB RSS · health ${l.health}`],
    ['Fila', show(report.attention)],
    ['Triagem EVA', show(report.triage)],
    ['Jardim', show(report.garden)],
    ['Segurança', show(report.security)],
    ['Backups', show(report.backups)],
    ['Timers', report.timers.join(' · ') || '—'],
  ];
  return (
    <div className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-blue-300">Diagnóstico · KAREN</span>
        <span className="text-[10px] text-zinc-500">{report.generated_at}</span>
      </div>
      <dl className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[82px_1fr] gap-2">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="break-words text-zinc-200">{value}</dd>
          </div>
        ))}
      </dl>
      {report.issues.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-400">
          Fontes indisponíveis: {report.issues.join(', ')}
        </p>
      )}
      <button
        onClick={onNarrate}
        disabled={busy}
        className="mt-3 rounded-md border border-blue-700 px-2 py-1 text-[11px] text-blue-300 hover:bg-blue-950/40 disabled:opacity-40"
      >
        Narrar com EVA
      </button>
    </div>
  );
};

const ChatPanel: React.FC<ChatPanelProps> = ({ onGraphChanged, command, mode = 'karen' }) => {
  const quickPrompts = mode === 'eva' ? EVA_PROMPTS : KAREN_PROMPTS;
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/chat/status`)
      .then((res) => res.json())
      .then((s) => setConfigured(s.configured === true))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function narrate(report: DiagnosisReport) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Narre este diagnóstico em linguagem natural, em português, sem alterar nenhum número: ${JSON.stringify(report)}`,
        }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.reply ?? 'Não consegui narrar o diagnóstico.' },
      ]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Falha ao narrar o diagnóstico.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function submit(text: string) {
    if (!text || busy) return;
    setMessages((m) => [...m, { role: 'user', content: text }]);
    const trimmed = text.trim();
    if (/^\/diagnosis\b/i.test(trimmed)) {
      setBusy(true);
      try {
        const res = await fetch(`${API_BASE}/diagnosis`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const report = (await res.json()) as DiagnosisReport;
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: 'Diagnóstico determinístico:', diagnosis: report },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: 'Não consegui ler o diagnóstico. A API está ativa?' },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      if ((data.actions ?? []).length > 0) onGraphChanged?.();
    } catch {
      console.error('Chat failed:');
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            'A requisição falhou. Verifique se o modelo local e a API estão ativos.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (command?.text) void submit(command.text);
    // Only react to a new command id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.id]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void submit(text);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {configured === false && (
          <div className="text-xs text-zinc-400 bg-zinc-900/70 border border-zinc-800 rounded-lg p-3">
            Chat desativado. Verifique se o modelo local está rodando e se o
            ambiente da API tem <code className="text-zinc-200">LLM_API_KEY</code>.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'self-end bg-blue-600 text-white'
                : 'self-start bg-zinc-900 border border-zinc-800 text-zinc-200'
            }`}
          >
            {msg.diagnosis ? (
              <DiagnosisCard report={msg.diagnosis} onNarrate={() => void narrate(msg.diagnosis!)} busy={busy} />
            ) : (
              msg.content
            )}
          </div>
        ))}
        {busy && (
          <div className="self-start bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-500">
            Pensando...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-1">
        {quickPrompts.map((p) => (
          <button
            key={p.label}
            onClick={() => submit(p.text)}
            disabled={busy || configured !== true}
            title={p.text}
            className="shrink-0 rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-blue-500 hover:text-blue-400 disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => submit('/diagnosis')}
          disabled={busy}
          title="Relatório determinístico do estado da KAREN"
          className="shrink-0 rounded-full border border-blue-800 px-2.5 py-1 text-[11px] text-blue-300 hover:bg-blue-950/40 disabled:opacity-40"
        >
          /diagnosis
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pb-1">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-hud-muted">feedback</span>
        {(['util', 'aprofunde', 'aplique', 'arquive'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => submit(`registre feedback: ${kind}`)}
            disabled={busy || configured !== true}
            title={`Registrar feedback: ${kind}`}
            className="shrink-0 rounded-full border border-hud-line px-2.5 py-1 text-[11px] text-hud-muted transition-colors hover:border-hud-cyan hover:text-hud-cyan disabled:opacity-40"
          >
            {kind}
          </button>
        ))}
      </div>

      <form onSubmit={send} className="flex shrink-0 gap-2 px-4 py-3 border-t border-zinc-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            configured
              ? `Pergunte à ${mode === 'eva' ? 'EVA' : 'KAREN'}... (/diagnosis)`
              : 'Chat desativado'
          }
          disabled={configured !== true || busy}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={configured !== true || busy || !input.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          Enviar
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;

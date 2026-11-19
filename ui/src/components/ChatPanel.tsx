import React, { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  /** Called when the agent mutated the graph so the UI can refetch. */
  onGraphChanged?: () => void;
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const QUICK_PROMPTS = [
  { label: 'Status', text: 'Use service_status e me diga se os serviços estão ok' },
  { label: 'Jardim', text: 'Use garden_report e me diga quantas notas estão órfãs' },
  { label: 'Leads', text: 'busca restaurantes sem site em Guarulhos, máximo 5 lugares' },
  { label: 'Memória', text: 'O que você lembra sobre mim?' },
];

const ChatPanel: React.FC<ChatPanelProps> = ({ onGraphChanged }) => {
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

  async function submit(text: string) {
    if (!text || busy) return;
    setMessages((m) => [...m, { role: 'user', content: text }]);
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
    } catch (err) {
      console.error('Chat failed:', err);
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
            {msg.content}
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
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p.label}
            onClick={() => submit(p.text)}
            disabled={busy || configured !== true}
            title={p.text}
            className="shrink-0 rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] text-zinc-400 hover:border-blue-500 hover:text-blue-400 disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={send} className="flex shrink-0 gap-2 px-4 py-3 border-t border-zinc-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            configured ? 'Pergunte à KAREN...' : 'Chat desativado'
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

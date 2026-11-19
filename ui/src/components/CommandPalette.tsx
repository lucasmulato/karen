import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void | Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}

const CommandPalette: React.FC<Props> = ({ open, onClose, actions }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      `${a.label} ${a.hint ?? ''}`.toLowerCase().includes(q)
    );
  }, [query, actions]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  async function choose(action: PaletteAction) {
    onClose();
    await action.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); void choose(filtered[active]); }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-cyan-900/60 bg-[#070b12] shadow-[0_0_60px_rgba(34,211,238,.12)]"
      >
        <div className="flex items-center gap-3 border-b border-cyan-950 px-4 py-3">
          <Search size={16} className="text-cyan-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Digite um comando... (/ para focar)"
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-cyan-700">
            {filtered.length} ação(ões) disponível(is)
          </p>
          {filtered.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onMouseEnter={() => setActive(index)}
                onClick={() => void choose(action)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  index === active ? 'bg-cyan-950/50 text-cyan-200' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <Icon size={15} className="shrink-0 text-cyan-600" />
                <span className="min-w-0 flex-1 truncate text-xs">{action.label}</span>
                {action.hint && <span className="shrink-0 font-mono text-[10px] text-zinc-600">{action.hint}</span>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-zinc-600">Nenhum comando corresponde.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPalette;

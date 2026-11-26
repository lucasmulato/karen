import React from 'react';
import { ListChecks, MapPin, MessageSquare, Network, NotebookPen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TabKind } from '../store/workspaceStore';
import { useWorkspace } from './providers/workspaceContext';

const ITEMS: { kind: TabKind; label: string; icon: LucideIcon }[] = [
  { kind: 'hub', label: 'Hub', icon: NotebookPen },
  { kind: 'graph', label: 'Grafo', icon: Network },
  { kind: 'chat', label: 'Chat', icon: MessageSquare },
  { kind: 'queue', label: 'Fila', icon: ListChecks },
  { kind: 'leads', label: 'Leads', icon: MapPin },
];

const MobileNav: React.FC = () => {
  const { openTab, focusTab, state, attention } = useWorkspace();

  return (
    <nav
      aria-label="Navegação mobile"
      className="workspace-mobile-nav shrink-0 items-stretch justify-around border-t border-hud-border bg-hud-panel px-1 pb-[env(safe-area-inset-bottom)] pt-1"
    >
      {ITEMS.map((item) => {
        const open = state.openTabs.some((tab) => tab.kind === item.kind);
        const Icon = item.icon;
        return (
          <button
            key={item.kind}
            type="button"
            onClick={() => {
              const existing = state.openTabs.find((tab) => tab.kind === item.kind);
              if (existing) focusTab(existing.id);
              else openTab(item.kind);
            }}
            className={`relative flex min-w-14 flex-col items-center gap-0.5 rounded px-2 py-1 text-[9px] uppercase tracking-wider ${
              open ? 'text-hud-cyan' : 'text-hud-muted'
            }`}
          >
            <Icon size={17} />
            <span>{item.label}</span>
            {item.kind === 'queue' && attention.length > 0 && (
              <span className="absolute right-1 top-0 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-hud-warning px-0.5 font-mono text-[9px] font-bold text-hud-bg">
                {attention.length}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default MobileNav;

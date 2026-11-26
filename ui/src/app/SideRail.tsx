import React from 'react';
import {
  FileText,
  ListChecks,
  Map,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Network,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TabKind } from '../store/workspaceStore';
import { useWorkspace } from './providers/workspaceContext';

interface RailItem {
  kind: TabKind;
  label: string;
  icon: LucideIcon;
}

const GROUPS: { title: string; items: RailItem[] }[] = [
  {
    title: 'Navegação',
    items: [
      { kind: 'hub', label: 'Hub', icon: NotebookPen },
      { kind: 'graph', label: 'Grafo', icon: Network },
      { kind: 'chat', label: 'Chat', icon: MessageSquare },
      { kind: 'queue', label: 'Fila', icon: ListChecks },
    ],
  },
  {
    title: 'Ferramentas',
    items: [
      { kind: 'leads', label: 'Leads', icon: MapPin },
      { kind: 'conversations', label: 'Conversas', icon: MessagesSquare },
      { kind: 'outreach', label: 'Mensagens', icon: Send },
      { kind: 'commands', label: 'Comandos', icon: Terminal },
      { kind: 'eva', label: 'EVA', icon: Sparkles },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { kind: 'mapa', label: 'Mapa', icon: Map },
      { kind: 'canvas', label: 'Canvas', icon: FileText },
    ],
  },
];

const SideRail: React.FC = () => {
  const { state, openTab, focusTab, toggleRail, attention } = useWorkspace();

  return (
    <nav
      aria-label="Navegação do workspace"
      className={`hud-scroll flex shrink-0 flex-col overflow-y-auto border-r border-hud-border bg-hud-panel/70 p-2 transition-[width] duration-150 ${
        state.railCollapsed ? 'w-12' : 'w-16'
      }`}
    >
      <button
        type="button"
        onClick={toggleRail}
        title={state.railCollapsed ? 'Expandir trilha' : 'Recolher trilha'}
        aria-label={state.railCollapsed ? 'Expandir trilha' : 'Recolher trilha'}
        className="grid h-9 shrink-0 place-items-center rounded text-hud-muted transition-colors hover:bg-hud-raised hover:text-hud-cyan"
      >
        {state.railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      {GROUPS.map((group) => (
        <div key={group.title} className="mt-3">
          {!state.railCollapsed && <p className="hud-label mb-1 text-center text-[8px]">{group.title}</p>}
          <div className="flex flex-col gap-1">
            {group.items.map((item) => {
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
                  title={item.label}
                  aria-label={item.label}
                  className={`relative grid h-9 shrink-0 place-items-center rounded transition-colors ${
                    open
                      ? 'bg-hud-raised text-hud-cyan'
                      : 'text-hud-muted hover:bg-hud-raised hover:text-hud-cyan'
                  }`}
                >
                  <Icon size={18} />
                  {item.kind === 'queue' && attention.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-hud-warning px-0.5 font-mono text-[9px] font-bold text-hud-bg">
                      {attention.length}
                    </span>
                  )}
                  {!state.railCollapsed && (
                    <span className="sr-only">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
};

export default SideRail;

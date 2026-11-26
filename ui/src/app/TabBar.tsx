import React, { useEffect, useRef } from 'react';
import {
  FileText,
  ListChecks,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Network,
  NotebookPen,
  Pin,
  Search,
  Send,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TabKind } from '../store/workspaceStore';
import { useWorkspace } from './providers/workspaceContext';

const TAB_ICONS: Partial<Record<TabKind, LucideIcon>> = {
  hub: NotebookPen,
  note: FileText,
  graph: Network,
  mapa: Network,
  chat: MessageSquare,
  leads: MapPin,
  outreach: Send,
  conversations: MessagesSquare,
  commands: Terminal,
  queue: ListChecks,
  eva: Sparkles,
  canvas: FileText,
  search: Search,
};

const TabBar: React.FC = () => {
  const { state, focusTab, closeTab, moveTab, togglePin } = useWorkspace();
  const dragFrom = useRef<number | null>(null);
  const buttons = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!state.activeTabId) return;
    buttons.current[state.activeTabId]?.focus();
  }, [state.activeTabId]);

  return (
    <div
      role="tablist"
      aria-label="Abas do workspace"
      className="flex h-9 shrink-0 items-stretch gap-px overflow-x-auto border-b border-hud-border bg-hud-panel/60 px-1 hud-scroll"
    >
      {state.openTabs.map((tab, index) => {
        const active = tab.id === state.activeTabId;
        const Icon = TAB_ICONS[tab.kind] ?? FileText;
        return (
          <div
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            data-tab-id={tab.id}
            tabIndex={active ? 0 : -1}
            draggable
            onClick={() => focusTab(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) closeTab(tab.id);
            }}
            onDragStart={() => {
              dragFrom.current = index;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragFrom.current !== null) moveTab(dragFrom.current, index);
              dragFrom.current = null;
            }}
            onKeyDown={(event) => {
              if (!event.altKey) return;
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = index + (event.key === 'ArrowRight' ? 1 : -1);
              const target = state.openTabs[next];
              if (target) focusTab(target.id);
            }}
            ref={(element) => {
              buttons.current[tab.id] = element;
            }}
            className={`group flex min-w-[110px] max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-2 text-[11px] transition-colors ${
              active
                ? 'border-hud-cyan bg-hud-raised text-hud-text'
                : 'border-transparent text-hud-muted hover:text-hud-text'
            }`}
          >
            <Icon size={13} className={active ? 'text-hud-cyan' : ''} />
            <button
              type="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                focusTab(tab.id);
              }}
              className="min-w-0 flex-1 truncate text-left outline-none"
            >
              {tab.title}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                togglePin(tab.id);
              }}
              title={tab.pinned ? 'Desafixar aba' : 'Fixar aba'}
              aria-label={tab.pinned ? 'Desafixar aba' : 'Fixar aba'}
              className={`rounded p-0.5 transition-colors ${
                tab.pinned ? 'text-hud-cyan' : 'text-hud-muted opacity-0 group-hover:opacity-100 hover:text-hud-cyan'
              }`}
            >
              <Pin size={11} />
            </button>
            {!tab.pinned && (
              <button
                type="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                title="Fechar aba"
                aria-label={`Fechar aba ${tab.title}`}
                className="rounded p-0.5 text-hud-muted opacity-0 transition-colors hover:text-hud-danger group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TabBar;

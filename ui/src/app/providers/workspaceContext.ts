import { createContext, useContext } from 'react';
import type { Dispatch } from 'react';
import type { TabKind, WorkspaceAction, WorkspaceState } from '../../store/workspaceStore';

export const TAB_LABELS: Record<TabKind, string> = {
  hub: 'Hub',
  note: 'Nota',
  graph: 'Grafo',
  mapa: 'Mapa',
  projetos: 'Projetos',
  jardim: 'Jardim',
  chat: 'Chat',
  leads: 'Leads',
  outreach: 'Mensagens',
  conversations: 'Conversas',
  commands: 'Comandos',
  queue: 'Fila executiva',
  eva: 'EVA',
  canvas: 'Canvas',
  search: 'Busca',
};

export interface AttentionItem {
  topic: string;
  label: string;
  detail: string;
}

export type WorkspaceSelection =
  | { kind: 'note'; path: string }
  | { kind: 'node'; id: string; name?: string }
  | { kind: 'lead'; id: string; label?: string; detail?: string }
  | { kind: 'queue'; id: string; label?: string; detail?: string };

export interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
  openTab: (kind: TabKind, options?: { title?: string; payload?: string }) => string;
  focusTab: (id: string) => void;
  closeTab: (id: string) => void;
  moveTab: (from: number, to: number) => void;
  togglePin: (id: string) => void;
  toggleRail: () => void;
  toggleInspector: () => void;
  toggleStatusFooter: () => void;
  highContrast: boolean;
  toggleContrast: () => void;
  splitWith: (tabId?: string) => void;
  closeSplit: () => void;
  toggleSplitOrientation: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  mode: 'karen' | 'eva';
  toggleMode: () => Promise<void>;
  attention: AttentionItem[];
  selection: WorkspaceSelection | null;
  select: (selection: WorkspaceSelection | null) => void;
  openNote: (path: string) => void;
  chatCommand: { id: number; text: string } | null;
  runChatCommand: (text: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>');
  return context;
}

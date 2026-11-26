import { createContext, useContext } from 'react';
import type { Dispatch } from 'react';
import type { TabKind, WorkspaceAction, WorkspaceState } from '../../store/workspaceStore';

export const TAB_LABELS: Record<TabKind, string> = {
  hub: 'Hub',
  note: 'Nota',
  graph: 'Grafo',
  mapa: 'Mapa',
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
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>');
  return context;
}

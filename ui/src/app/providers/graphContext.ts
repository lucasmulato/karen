import { createContext, useContext } from 'react';

export type EdgeLabel = 'relates_to' | 'contains' | 'depends_on' | 'tagged_with';

export const EDGE_LABELS: EdgeLabel[] = [
  'relates_to',
  'contains',
  'depends_on',
  'tagged_with',
];

export interface GraphRow {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  properties?: Record<string, unknown>;
  created_at?: string;
}

export interface GraphPayload {
  nodes: GraphRow[];
  edges: { source_id: string; target_id: string; label: string }[];
}

export interface GraphContextValue {
  data: GraphPayload | null;
  loading: boolean;
  error: string | null;
  showNoteNodes: boolean;
  setShowNoteNodes: (value: boolean) => void;
  selectedNode: GraphRow | null;
  selectNode: (node: GraphRow | null) => void;
  connect: { source?: string; label?: EdgeLabel } | null;
  startConnect: () => void;
  chooseConnectLabel: (label: EdgeLabel) => void;
  cancelConnect: () => void;
  onGraphNodeClick: (node: GraphRow) => void;
  refresh: () => Promise<void>;
  savePosition: (id: string, x: number, y: number) => void;
  addNode: (input: { name: string; type: string; description?: string }) => Promise<void>;
  exportCanvas: () => Promise<void>;
  importCanvas: (file: File) => Promise<void>;
}

export const GraphContext = createContext<GraphContextValue | null>(null);

export function useGraph(): GraphContextValue {
  const context = useContext(GraphContext);
  if (!context) throw new Error('useGraph precisa estar dentro de <GraphProvider>');
  return context;
}

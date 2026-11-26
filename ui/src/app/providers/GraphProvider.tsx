import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { NodePosition } from '../../components/GraphView';
import { toast } from '../../toast';
import { useWorkspace } from './workspaceContext';
import { GraphContext } from './graphContext';
import type { EdgeLabel, GraphPayload, GraphRow } from './graphContext';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const GraphProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { state, dispatch } = useWorkspace();
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNoteNodes, setShowNoteNodes] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphRow | null>(null);
  const [connect, setConnect] = useState<{ source?: string; label?: EdgeLabel } | null>(null);

  const pendingPositions = useRef<Map<string, NodePosition>>(new Map());
  const saveTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const query = showNoteNodes ? '' : '?exclude_notes=true';
      const response = await fetch(`${API_BASE}/graph${query}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as GraphPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [showNoteNodes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectNode = useCallback(
    (node: GraphRow | null) => {
      setSelectedNode(node);
      if (node && !state.inspectorOpen) dispatch({ type: 'toggle-inspector' });
    },
    [state.inspectorOpen, dispatch]
  );

  const createEdge = useCallback(
    async (targetId: string) => {
      if (!connect?.source || !connect.label) return;
      try {
        const response = await fetch(`${API_BASE}/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_id: connect.source,
            target_id: targetId,
            label: connect.label,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await refresh();
      } catch (err) {
        toast(`Falha ao conectar: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setConnect(null);
      }
    },
    [connect, refresh]
  );

  const onGraphNodeClick = useCallback(
    (node: GraphRow) => {
      if (connect) {
        if (!connect.source) {
          setConnect({ ...connect, source: node.id });
        } else if (!connect.label) {
          // Wait for the label picker in the toolbar dialog.
        } else if (node.id !== connect.source) {
          void createEdge(node.id);
        }
        return;
      }
      selectNode(node);
    },
    [connect, createEdge, selectNode]
  );

  const flushPositions = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const batch = [...pendingPositions.current.entries()];
      pendingPositions.current.clear();
      for (const [id, pos] of batch) {
        try {
          const response = await fetch(`${API_BASE}/nodes/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ properties: { _x: pos.x, _y: pos.y } }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (err) {
          console.error('Failed to persist position:', err);
        }
      }
    }, 800);
  }, []);

  const savePosition = useCallback(
    (id: string, x: number, y: number) => {
      pendingPositions.current.set(id, { x, y });
      flushPositions();
    },
    [flushPositions]
  );

  const addNode = useCallback(
    async (input: { name: string; type: string; description?: string }) => {
      const response = await fetch(`${API_BASE}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await refresh();
    },
    [refresh]
  );

  const exportCanvas = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/graph/canvas`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'karen-graph.canvas';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(`Falha ao exportar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const importCanvas = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const response = await fetch(`${API_BASE}/graph/canvas/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        });
        const result = (await response.json()) as { imported?: number; edges?: number; error?: string };
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        await refresh();
        toast(`Canvas importado: ${result.imported} nós, ${result.edges} arestas.`);
      } catch (err) {
        toast(`Falha ao importar: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [refresh]
  );

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
    },
    []
  );

  const value = React.useMemo(
    () => ({
      data,
      loading,
      error,
      showNoteNodes,
      setShowNoteNodes,
      selectedNode,
      selectNode,
      connect,
      startConnect: () => setConnect((current) => (current ? null : {})),
      chooseConnectLabel: (label: EdgeLabel) =>
        setConnect((current) => (current?.source ? { ...current, label } : current)),
      cancelConnect: () => setConnect(null),
      onGraphNodeClick,
      refresh,
      savePosition,
      addNode,
      exportCanvas,
      importCanvas,
    }),
    [
      data,
      loading,
      error,
      showNoteNodes,
      selectedNode,
      selectNode,
      connect,
      onGraphNodeClick,
      refresh,
      savePosition,
      addNode,
      exportCanvas,
      importCanvas,
    ]
  );

  return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>;
};

export default GraphProvider;

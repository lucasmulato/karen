import React, { useMemo, useState } from 'react';
import { Download, Link2, Plus, RotateCcw, Search, Upload } from 'lucide-react';
import Dialog from '../../components/Dialog';
import GraphView from '../../components/GraphView';
import type { NodePosition } from '../../components/GraphView';
import { toast } from '../../toast';
import { useGraph } from '../providers/graphContext';
import { EDGE_LABELS } from '../providers/graphContext';
import type { EdgeLabel } from '../providers/graphContext';
import { useWorkspace } from '../providers/workspaceContext';
import { Skeleton } from '../ui/Skeleton';

const NODE_TYPES = [
  'idea', 'project', 'task', 'label', 'note', 'finding', 'technique',
  'cve', 'tool', 'writeup', 'target', 'fix',
];

const GraphTab: React.FC = () => {
  const graph = useGraph();
  const { setPaletteOpen } = useWorkspace();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState(NODE_TYPES[0]);
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);

  const initialPositions = useMemo(() => {
    const positions: Record<string, NodePosition> = {};
    for (const node of graph.data?.nodes ?? []) {
      const x = node.properties?._x;
      const y = node.properties?._y;
      if (typeof x === 'number' && typeof y === 'number') positions[node.id] = { x, y };
    }
    return positions;
  }, [graph.data]);

  const banner = !graph.connect
    ? ''
    : !graph.connect.source
      ? 'Conectar: clique no nó de origem'
      : !graph.connect.label
        ? 'Conectar: escolha o relacionamento'
        : 'Conectar: clique no nó de destino';

  async function submitNode(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await graph.addNode({
        name: newName.trim(),
        type: newType,
        description: newDesc.trim() || undefined,
      });
      setNewName('');
      setNewDesc('');
      setNewType(NODE_TYPES[0]);
      setShowAdd(false);
    } catch (err) {
      toast(`Falha ao adicionar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-hud-bg">
      <div className="hud-tabbar gap-2">
        <span className="hud-label">Grafo de conhecimento</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hud-btn"
            title="Buscar nó (Ctrl+K)"
          >
            <Search size={13} /> Buscar
          </button>
          <button
            type="button"
            onClick={() => graph.setShowNoteNodes(!graph.showNoteNodes)}
            className={`hud-btn ${graph.showNoteNodes ? 'border-hud-cyan text-hud-cyan' : ''}`}
            title="Mostrar ou ocultar notas do Obsidian no grafo"
          >
            Notas {graph.showNoteNodes ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={graph.startConnect}
            className={`hud-btn ${graph.connect ? 'border-hud-cyan text-hud-cyan' : ''}`}
            title="Conectar nós"
          >
            <Link2 size={13} /> Conectar
          </button>
          <button type="button" onClick={() => setShowAdd(true)} className="hud-btn" title="Adicionar nó">
            <Plus size={13} /> Novo
          </button>
          <button type="button" onClick={() => void graph.exportCanvas()} className="hud-btn" title="Exportar .canvas">
            <Download size={13} />
          </button>
          <label className="hud-btn cursor-pointer" title="Importar .canvas">
            <Upload size={13} />
            <input
              type="file"
              accept=".canvas,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void graph.importCanvas(file);
                event.target.value = '';
              }}
            />
          </label>
        </span>
      </div>

      {graph.connect && (
        <div className="flex items-center gap-2 border-b border-hud-border bg-hud-panel/70 px-3 py-1.5 text-[11px] text-hud-cyan">
          {banner}
          <button type="button" onClick={graph.cancelConnect} className="ml-auto hud-btn">
            <RotateCcw size={11} /> Cancelar
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {graph.loading && !graph.data ? (
          <div className="space-y-3 p-6" role="status" aria-label="Carregando grafo">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-72" />
            <div className="grid grid-cols-2 gap-3 pt-4">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
        ) : graph.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-hud-danger">Grafo indisponível</p>
            <p className="text-xs text-hud-muted">{graph.error}</p>
            <button type="button" onClick={() => void graph.refresh()} className="hud-btn">
              Tentar novamente
            </button>
          </div>
        ) : !graph.data || graph.data.nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-hud-text">Nenhum nó no grafo.</p>
            <button type="button" onClick={() => setShowAdd(true)} className="hud-btn-primary">
              Criar o primeiro nó
            </button>
          </div>
        ) : (
          <GraphView
            data={graph.data}
            initialPositions={initialPositions}
            onNodePosition={graph.savePosition}
            highlightId={graph.connect?.source ?? null}
            onNodeClick={graph.onGraphNodeClick}
          />
        )}
      </div>

      <Dialog open={showAdd} title="Adicionar nó" onClose={() => setShowAdd(false)}>
        <form onSubmit={submitNode} className="flex flex-col gap-3">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nome"
            className="hud-input"
            autoFocus
          />
          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value)}
            className="hud-input"
          >
            {NODE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <textarea
            value={newDesc}
            onChange={(event) => setNewDesc(event.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className="hud-input resize-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="hud-btn">Cancelar</button>
            <button type="submit" disabled={adding || !newName.trim()} className="hud-btn-primary disabled:opacity-50">
              {adding ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={graph.connect !== null} title="Conectar nós" onClose={graph.cancelConnect}>
        <p className="mb-3 text-xs text-hud-muted">{banner}</p>
        {!graph.connect?.label && graph.connect?.source && (
          <div className="grid grid-cols-2 gap-2">
            {EDGE_LABELS.map((label: EdgeLabel) => (
              <button
                key={label}
                type="button"
                onClick={() => graph.chooseConnectLabel(label)}
                className="hud-btn justify-center"
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {graph.connect?.source && graph.connect?.label && (
          <p className="text-xs text-hud-muted">Origem selecionada. Clique no nó de destino no grafo.</p>
        )}
      </Dialog>
    </div>
  );
};

export default GraphTab;

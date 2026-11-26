import React, { useRef } from 'react';
import { FileText, ListChecks, MapPin, Network, X } from 'lucide-react';
import { useGraph } from './providers/graphContext';
import { useWorkspace } from './providers/workspaceContext';

const Inspector: React.FC = () => {
  const { state, dispatch, toggleInspector, selection, openTab } = useWorkspace();
  const { selectedNode } = useGraph();
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  if (!state.inspectorOpen) return null;

  return (
    <aside
      aria-label="Inspector"
      className="workspace-inspector relative flex shrink-0 flex-col border-l border-hud-border bg-hud-panel/80"
      style={{ width: state.inspectorWidth }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar Inspector"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStart.current = { x: event.clientX, width: state.inspectorWidth };
        }}
        onPointerMove={(event) => {
          if (!dragStart.current || event.buttons === 0) return;
          dispatch({
            type: 'set-inspector-width',
            width: dragStart.current.width + (dragStart.current.x - event.clientX),
          });
        }}
        onPointerUp={(event) => {
          dragStart.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          dispatch({
            type: 'set-inspector-width',
            width: state.inspectorWidth + (event.key === 'ArrowLeft' ? 16 : -16),
          });
        }}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-hud-cyan/40 focus:bg-hud-cyan/40 focus:outline-none"
      />
      <div className="flex items-center justify-between border-b border-hud-border px-3 py-2">
        <span className="hud-label">Inspector</span>
        <button
          type="button"
          onClick={toggleInspector}
          title="Fechar Inspector"
          aria-label="Fechar Inspector"
          className="rounded p-1 text-hud-muted hover:text-hud-cyan"
        >
          <X size={14} />
        </button>
      </div>

      <div className="hud-scroll min-h-0 flex-1 overflow-auto p-3">
        {selectedNode ? (
          <div className="space-y-3">
            <div className="hud-card">
              <span className="hud-badge">{selectedNode.type}</span>
              <h2 className="mt-2 break-words text-base text-hud-text">{selectedNode.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-hud-muted">
                {selectedNode.description || 'Sem descrição.'}
              </p>
            </div>
            <dl className="space-y-2 text-[11px]">
              <div>
                <dt className="hud-label">ID</dt>
                <dd className="break-all font-mono text-hud-text">{selectedNode.id}</dd>
              </div>
              <div>
                <dt className="hud-label">Criado</dt>
                <dd className="text-hud-text">
                  {selectedNode.created_at
                    ? new Date(selectedNode.created_at).toLocaleDateString()
                    : '—'}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => openTab('graph')}
              className="hud-btn w-full justify-center"
            >
              <Network size={12} /> Focar no grafo
            </button>
          </div>
        ) : selection?.kind === 'note' ? (
          <div className="hud-card space-y-2">
            <FileText size={16} className="text-hud-cyan" />
            <p className="hud-label">Nota selecionada</p>
            <p className="break-all font-mono text-[11px] text-hud-text">{selection.path}</p>
            <button
              type="button"
              onClick={() => openTab('note', { payload: selection.path })}
              className="hud-btn w-full justify-center"
            >
              Abrir nota
            </button>
          </div>
        ) : selection?.kind === 'lead' ? (
          <div className="hud-card space-y-2">
            <MapPin size={16} className="text-hud-cyan" />
            <p className="hud-label">Lead selecionado</p>
            <p className="text-sm text-hud-text">{selection.label ?? selection.id}</p>
            {selection.detail && <p className="text-xs text-hud-muted">{selection.detail}</p>}
            <button
              type="button"
              onClick={() => openTab('leads')}
              className="hud-btn w-full justify-center"
            >
              Abrir Leads
            </button>
          </div>
        ) : selection?.kind === 'queue' ? (
          <div className="hud-card space-y-2">
            <ListChecks size={16} className="text-hud-warning" />
            <p className="hud-label">Item da fila</p>
            <p className="text-sm text-hud-text">{selection.label ?? selection.id}</p>
            {selection.detail && <p className="text-xs leading-relaxed text-hud-muted">{selection.detail}</p>}
            <button
              type="button"
              onClick={() => openTab('queue')}
              className="hud-btn w-full justify-center"
            >
              Abrir fila executiva
            </button>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-hud-muted">
            Selecione um nó, nota, lead ou item da fila para ver o contexto aqui.
          </p>
        )}
      </div>
    </aside>
  );
};

export default Inspector;

import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from './providers/workspaceContext';

const Inspector: React.FC = () => {
  const { state, dispatch, toggleInspector } = useWorkspace();
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  if (!state.inspectorOpen) return null;

  return (
    <aside
      aria-label="Inspector"
      className="relative flex shrink-0 flex-col border-l border-hud-border bg-hud-panel/80"
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
      <div className="flex flex-1 items-center justify-center p-4 text-center">
        <p className="text-xs leading-relaxed text-hud-muted">
          Selecione um nó, nota, lead ou item da fila para ver o contexto aqui.
        </p>
      </div>
    </aside>
  );
};

export default Inspector;

import React from 'react';
import { PanelBottom, PanelRight } from 'lucide-react';
import { useWorkspace } from './providers/workspaceContext';

const TopBar: React.FC = () => {
  const { state, toggleInspector, toggleStatusFooter } = useWorkspace();

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-hud-border bg-hud-panel px-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded bg-hud-cyan font-mono text-[11px] font-bold text-hud-bg">
          K
        </span>
        <h1 className="font-mono text-[11px] uppercase tracking-[0.18em] text-hud-text">
          KAREN <span className="text-hud-cyan">// workspace</span>
        </h1>
      </div>
      <span className="hud-label border-l border-hud-border pl-3">fundação v1</span>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={toggleInspector}
          aria-pressed={state.inspectorOpen}
          title="Alternar Inspector"
          className={`rounded p-1.5 transition-colors ${
            state.inspectorOpen
              ? 'bg-hud-raised text-hud-cyan'
              : 'text-hud-muted hover:text-hud-cyan'
          }`}
        >
          <PanelRight size={15} />
        </button>
        <button
          type="button"
          onClick={toggleStatusFooter}
          aria-pressed={state.statusFooterOpen}
          title="Alternar rodapé de contexto"
          className={`rounded p-1.5 transition-colors ${
            state.statusFooterOpen
              ? 'bg-hud-raised text-hud-cyan'
              : 'text-hud-muted hover:text-hud-cyan'
          }`}
        >
          <PanelBottom size={15} />
        </button>
        <a href={window.location.pathname} className="hud-btn ml-1" title="Voltar à interface clássica">
          Clássico
        </a>
      </div>
    </header>
  );
};

export default TopBar;

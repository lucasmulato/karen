import React from 'react';
import { Columns2, Contrast, PanelBottom, PanelRight, Rows2, Search } from 'lucide-react';
import AttentionBadge from '../components/AttentionBadge';
import HealthStrip from '../components/HealthStrip';
import { useWorkspace } from './providers/workspaceContext';

const TopBar: React.FC = () => {
  const {
    state,
    toggleInspector,
    toggleStatusFooter,
    highContrast,
    toggleContrast,
    toggleMode,
    mode,
    attention,
    setPaletteOpen,
    splitWith,
    closeSplit,
    toggleSplitOrientation,
  } = useWorkspace();
  const splitActive = state.split.secondaryTabId !== null;

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

      <button
        type="button"
        onClick={() => void toggleMode()}
        title="Alternar modo KAREN / EVA"
        className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
          mode === 'eva'
            ? 'border-hud-success text-hud-success'
            : 'border-hud-border text-hud-cyan'
        }`}
      >
        {mode}
      </button>

      <div className="hidden items-center gap-2 sm:flex">
        <HealthStrip />
        <AttentionBadge items={attention} pulse={attention.length > 0} />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          title="Buscar e executar (Ctrl+K ou /)"
          className="hud-btn"
        >
          <Search size={13} /> <span className="hidden md:inline">Buscar</span>
        </button>
        <button
          type="button"
          onClick={() => (splitActive ? closeSplit() : splitWith())}
          aria-pressed={splitActive}
          title={splitActive ? 'Fechar divisão' : 'Dividir aba atual'}
          className={`rounded p-1.5 transition-colors ${
            splitActive ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-hud-cyan'
          }`}
        >
          <Columns2 size={15} />
        </button>
        {splitActive && (
          <button
            type="button"
            onClick={toggleSplitOrientation}
            title="Alternar divisão horizontal / vertical"
            className="rounded p-1.5 text-hud-muted transition-colors hover:text-hud-cyan"
          >
            <Rows2 size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleContrast}
          aria-pressed={highContrast}
          title="Alternar alto contraste"
          className={`rounded p-1.5 transition-colors ${
            highContrast ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-hud-cyan'
          }`}
        >
          <Contrast size={15} />
        </button>
        <button
          type="button"
          onClick={toggleInspector}
          aria-pressed={state.inspectorOpen}
          title="Alternar Inspector"
          className={`rounded p-1.5 transition-colors ${
            state.inspectorOpen ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-hud-cyan'
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
            state.statusFooterOpen ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-hud-cyan'
          }`}
        >
          <PanelBottom size={15} />
        </button>
      </div>
    </header>
  );
};

export default TopBar;

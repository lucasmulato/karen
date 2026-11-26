import React from 'react';
import { NotebookPen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useWorkspace } from './providers/workspaceContext';

const SideRail: React.FC = () => {
  const { state, focusTab, toggleRail } = useWorkspace();
  const hubTab = state.openTabs.find((tab) => tab.kind === 'hub');

  return (
    <nav
      aria-label="Navegação do workspace"
      className={`flex shrink-0 flex-col border-r border-hud-border bg-hud-panel/70 p-2 transition-[width] duration-150 ${
        state.railCollapsed ? 'w-12' : 'w-16'
      }`}
    >
      <button
        type="button"
        onClick={toggleRail}
        title={state.railCollapsed ? 'Expandir trilha' : 'Recolher trilha'}
        aria-label={state.railCollapsed ? 'Expandir trilha' : 'Recolher trilha'}
        className="grid h-9 place-items-center rounded text-hud-muted transition-colors hover:bg-hud-raised hover:text-hud-cyan"
      >
        {state.railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="mt-3 flex flex-col gap-1">
        <button
          type="button"
          disabled={!hubTab}
          onClick={() => {
            if (hubTab) focusTab(hubTab.id);
          }}
          title="Focar aba Hub"
          aria-label="Focar aba Hub"
          className="grid h-9 place-items-center rounded text-hud-muted transition-colors hover:bg-hud-raised hover:text-hud-cyan disabled:opacity-30"
        >
          <NotebookPen size={18} />
        </button>
      </div>

      {!state.railCollapsed && (
        <span className="hud-label mt-2 text-center">Hub</span>
      )}
    </nav>
  );
};

export default SideRail;

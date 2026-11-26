import React from 'react';
import { useWorkspace } from './providers/workspaceContext';

const StatusFooter: React.FC = () => {
  const { state } = useWorkspace();
  if (!state.statusFooterOpen) return null;

  const active = state.openTabs.find((tab) => tab.id === state.activeTabId);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-hud-border bg-hud-panel px-3 font-mono text-[10px] uppercase tracking-wider text-hud-muted">
      <span>workspace v1</span>
      <span>{state.openTabs.length} abas</span>
      <span>ativa: {active?.title ?? 'nenhuma'}</span>
      <span className="ml-auto">
        {state.split.secondaryTabId
          ? `divisão: ${Math.round(state.split.ratio)}%`
          : 'painel único'}
      </span>
    </footer>
  );
};

export default StatusFooter;

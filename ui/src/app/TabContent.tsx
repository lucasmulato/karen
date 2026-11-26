import React from 'react';
import { FileQuestion, NotebookPen } from 'lucide-react';
import App from '../App';
import { useWorkspace } from './providers/workspaceContext';

/**
 * Fase 0: the single Hub tab hosts the unchanged legacy App, so no feature is
 * lost while the shell is being built. Fase 1 replaces it with the real tabs.
 */
const TabContent: React.FC = () => {
  const { state, openTab } = useWorkspace();
  const active = state.openTabs.find((tab) => tab.id === state.activeTabId);

  if (!active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <FileQuestion size={28} className="text-hud-muted" />
        <p className="text-sm text-hud-muted">Nenhuma aba aberta.</p>
        <button
          type="button"
          onClick={() => openTab('hub')}
          className="hud-btn-primary inline-flex items-center gap-1.5"
        >
          <NotebookPen size={13} /> Reabrir Hub
        </button>
      </div>
    );
  }

  if (active.kind === 'hub') {
    return (
      <div className="h-full w-full" role="tabpanel" aria-label={active.title}>
        <App embedded />
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 text-center"
      role="tabpanel"
      aria-label={active.title}
    >
      <FileQuestion size={28} className="text-hud-muted" />
      <p className="text-sm text-hud-text">Aba “{active.title}”</p>
      <p className="max-w-sm text-xs text-hud-muted">
        A migração desta superfície está prevista para as fases seguintes. Nada foi removido: a
        interface clássica continua disponível.
      </p>
      <button type="button" onClick={() => openTab('hub')} className="hud-btn">
        Voltar ao Hub
      </button>
    </div>
  );
};

export default TabContent;

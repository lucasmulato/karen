import React from 'react';

const NotesPanel = React.lazy(() => import('../../components/NotesPanel'));

const HubTab: React.FC = () => (
  <div className="flex h-full w-full flex-col bg-hud-bg">
    <div className="hud-tabbar">
      <span className="hud-label">Hub · second brain</span>
      <span className="hud-label ml-auto text-[9px]">vault local · markdown</span>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden">
      <React.Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-xs text-hud-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-hud-cyan" /> Carregando notas...
          </div>
        }
      >
        <NotesPanel />
      </React.Suspense>
    </div>
  </div>
);

export default HubTab;

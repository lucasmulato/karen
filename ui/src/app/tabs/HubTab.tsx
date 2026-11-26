import React from 'react';
import { useWorkspace } from '../providers/workspaceContext';
import { NOTES_TAB_TO_KIND } from './noteNavigation';
import { Skeleton } from '../ui/Skeleton';

const NotesPanel = React.lazy(() => import('../../components/NotesPanel'));

const HubTab: React.FC = () => {
  const { openNote, openTab } = useWorkspace();
  return (
    <div className="h-full w-full">
      <React.Suspense
        fallback={
          <div className="space-y-3 p-4" role="status" aria-label="Carregando notas">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        <NotesPanel
          initialTab="hub"
          hideTabs
          onOpenNote={openNote}
          onOpenTab={(tab) => openTab(NOTES_TAB_TO_KIND[tab])}
        />
      </React.Suspense>
    </div>
  );
};

export default HubTab;

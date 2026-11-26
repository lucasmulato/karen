import React from 'react';
import { useWorkspace } from '../providers/workspaceContext';
import { NOTES_TAB_TO_KIND } from './noteNavigation';
import { Skeleton } from '../ui/Skeleton';

const NotesPanel = React.lazy(() => import('../../components/NotesPanel'));

interface Props {
  path: string;
}

const NoteTab: React.FC<Props> = ({ path }) => {
  const { openNote, openTab } = useWorkspace();
  return (
    <div className="h-full w-full">
      <React.Suspense
        fallback={
          <div className="space-y-3 p-4" role="status" aria-label="Carregando nota">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        }
      >
        <NotesPanel
          initialTab="files"
          selectedPath={path}
          hideTabs
          onOpenNote={openNote}
          onOpenTab={(tab) => openTab(NOTES_TAB_TO_KIND[tab])}
        />
      </React.Suspense>
    </div>
  );
};

export default NoteTab;

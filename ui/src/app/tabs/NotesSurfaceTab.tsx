import React from 'react';
import type { NotesTab } from '../../components/NotesPanel';
import { useWorkspace } from '../providers/workspaceContext';
import { NOTES_TAB_TO_KIND } from './noteNavigation';
import { Skeleton } from '../ui/Skeleton';

const NotesPanel = React.lazy(() => import('../../components/NotesPanel'));

interface Props {
  surface: Exclude<NotesTab, 'hub' | 'files'>;
}

/** Mapa / Projetos / Jardim / Canvas as first-class workspace tabs. */
const NotesSurfaceTab: React.FC<Props> = ({ surface }) => {
  const { openNote, openTab } = useWorkspace();
  return (
    <div className="h-full w-full">
      <React.Suspense
        fallback={
          <div className="space-y-3 p-4" role="status" aria-label="Carregando">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        }
      >
        <NotesPanel
          initialTab={surface}
          hideTabs
          onOpenNote={openNote}
          onOpenTab={(tab) => openTab(NOTES_TAB_TO_KIND[tab])}
        />
      </React.Suspense>
    </div>
  );
};

export default NotesSurfaceTab;

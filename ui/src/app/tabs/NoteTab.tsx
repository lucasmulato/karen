import React from 'react';
import { useWorkspace } from '../providers/workspaceContext';
import { NOTES_TAB_TO_KIND } from './noteNavigation';

const NotesPanel = React.lazy(() => import('../../components/NotesPanel'));

interface Props {
  path: string;
}

const NoteTab: React.FC<Props> = ({ path }) => {
  const { openNote, openTab } = useWorkspace();
  return (
    <div className="h-full w-full">
      <React.Suspense fallback={<p className="p-4 text-xs text-hud-muted">Carregando nota...</p>}>
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

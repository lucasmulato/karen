import React from 'react';
import type { NotesTab } from '../../components/NotesPanel';
import { useWorkspace } from '../providers/workspaceContext';
import { NOTES_TAB_TO_KIND } from './noteNavigation';

const NotesPanel = React.lazy(() => import('../../components/NotesPanel'));

interface Props {
  surface: Exclude<NotesTab, 'hub' | 'files'>;
}

/** Mapa / Projetos / Jardim / Canvas as first-class workspace tabs. */
const NotesSurfaceTab: React.FC<Props> = ({ surface }) => {
  const { openNote, openTab } = useWorkspace();
  return (
    <div className="h-full w-full">
      <React.Suspense fallback={<p className="p-4 text-xs text-hud-muted">Carregando...</p>}>
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

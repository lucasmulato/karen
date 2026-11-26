import type { NotesTab } from '../../components/NotesPanel';
import type { TabKind } from '../../store/workspaceStore';

export const NOTES_TAB_TO_KIND: Record<NotesTab, TabKind> = {
  hub: 'hub',
  files: 'note',
  mapa: 'mapa',
  projetos: 'projetos',
  garden: 'jardim',
  canvas: 'canvas',
};

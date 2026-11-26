import React from 'react';
import { FileQuestion } from 'lucide-react';
import type { WorkspaceTab } from '../store/workspaceStore';
import ChatTab from './tabs/ChatTab';
import GraphTab from './tabs/GraphTab';
import HubTab from './tabs/HubTab';
import NoteTab from './tabs/NoteTab';
import SearchResultsTab from './tabs/SearchResultsTab';

const PendingTab: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
    <FileQuestion size={28} className="text-hud-muted" />
    <p className="text-sm text-hud-text">Aba “{tab.title}”</p>
    <p className="max-w-sm text-xs leading-relaxed text-hud-muted">
      A migração desta superfície está prevista para a Fase 2. Nada foi removido: a interface
      clássica continua disponível.
    </p>
    <a href={window.location.pathname} className="hud-btn">
      Abrir interface clássica
    </a>
  </div>
);

const TabView: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => {
  switch (tab.kind) {
    case 'hub':
      return <HubTab />;
    case 'graph':
      return <GraphTab />;
    case 'chat':
      return <ChatTab />;
    case 'note':
      return <NoteTab path={tab.payload ?? ''} />;
    case 'search':
      return <SearchResultsTab query={tab.payload ?? ''} />;
    default:
      return <PendingTab tab={tab} />;
  }
};

export default TabView;

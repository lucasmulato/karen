import React from 'react';
import { FileQuestion } from 'lucide-react';
import type { WorkspaceTab } from '../store/workspaceStore';
import CommandPanel from '../components/CommandPanel';
import ConversationsPanel from '../components/ConversationsPanel';
import EvaPanel from '../components/EvaPanel';
import ExecutiveQueuePanel from '../components/ExecutiveQueuePanel';
import type { QueueItem } from '../components/ExecutiveQueuePanel';
import LeadsPanel from '../components/LeadsPanel';
import type { Lead } from '../components/LeadsPanel';
import OutreachPanel from '../components/OutreachPanel';
import ToolTab from './ToolTab';
import ChatTab from './tabs/ChatTab';
import GraphTab from './tabs/GraphTab';
import HubTab from './tabs/HubTab';
import NoteTab from './tabs/NoteTab';
import NotesSurfaceTab from './tabs/NotesSurfaceTab';
import SearchResultsTab from './tabs/SearchResultsTab';
import { useWorkspace } from './providers/workspaceContext';

const FallbackTab: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
    <FileQuestion size={26} className="text-hud-muted" />
    <p className="text-sm text-hud-text">Aba “{tab.title}” sem conteúdo.</p>
    <a href={window.location.pathname} className="hud-btn">Abrir interface clássica</a>
  </div>
);

const TabView: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => {
  const { select } = useWorkspace();

  switch (tab.kind) {
    case 'hub':
      return <HubTab />;
    case 'note':
      return <NoteTab path={tab.payload ?? ''} />;
    case 'graph':
      return <GraphTab />;
    case 'mapa':
      return <NotesSurfaceTab surface="mapa" />;
    case 'projetos':
      return <NotesSurfaceTab surface="projetos" />;
    case 'jardim':
      return <NotesSurfaceTab surface="garden" />;
    case 'canvas':
      return <NotesSurfaceTab surface="canvas" />;
    case 'chat':
      return <ChatTab />;
    case 'search':
      return <SearchResultsTab query={tab.payload ?? ''} />;
    case 'leads':
      return (
        <ToolTab title="Leads" subtitle="OpenStreetMap · envio manual">
          <LeadsPanel
            onSelectLead={(lead: Lead) =>
              select({
                kind: 'lead',
                id: lead.id,
                label: lead.title,
                detail: [lead.category, lead.neighborhood, lead.city, lead.phone]
                  .filter(Boolean)
                  .join(' · '),
              })
            }
          />
        </ToolTab>
      );
    case 'outreach':
      return (
        <ToolTab title="Mensagens" subtitle="rascunhos prontos · envio manual">
          <OutreachPanel />
        </ToolTab>
      );
    case 'conversations':
      return (
        <ToolTab title="Conversas" subtitle="classificação · prompt · mensagem">
          <ConversationsPanel />
        </ToolTab>
      );
    case 'commands':
      return (
        <ToolTab title="Comandos" subtitle="leitura automática · mudanças exigem aprovação">
          <CommandPanel />
        </ToolTab>
      );
    case 'queue':
      return (
        <ToolTab title="Fila executiva" subtitle="até 7 decisões · nenhum envio automático">
          <ExecutiveQueuePanel
            onSelectItem={(item: QueueItem) =>
              select({
                kind: 'queue',
                id: item.id,
                label: item.action,
                detail: `${item.lead} · ${item.source} · ${item.status}`,
              })
            }
          />
        </ToolTab>
      );
    case 'eva':
      return (
        <ToolTab title="EVA" subtitle="co-sócia · decisões e oportunidades">
          <EvaPanel />
        </ToolTab>
      );
    default:
      return <FallbackTab tab={tab} />;
  }
};

export default TabView;

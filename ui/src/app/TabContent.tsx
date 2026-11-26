import React from 'react';
import { NotebookPen } from 'lucide-react';
import SplitPane from './SplitPane';
import TabView from './TabView';
import { useWorkspace } from './providers/workspaceContext';
import { EmptyState } from './ui/Skeleton';

const TabContent: React.FC = () => {
  const { state, openTab, dispatch } = useWorkspace();
  const active = state.openTabs.find((tab) => tab.id === state.activeTabId);

  if (!active) {
    return (
      <EmptyState
        icon={<NotebookPen size={28} />}
        title="Nenhuma aba aberta."
        hint="O workspace fecha tudo, mas o layout e as preferências ficam salvos."
        action={
          <button
            type="button"
            onClick={() => openTab('hub')}
            className="hud-btn-primary inline-flex items-center gap-1.5"
          >
            <NotebookPen size={13} /> Reabrir Hub
          </button>
        }
      />
    );
  }

  const secondary = state.openTabs.find(
    (tab) => tab.id === state.split.secondaryTabId && tab.id !== active.id
  );

  if (secondary) {
    return (
      <SplitPane
        first={
          <div id={`panel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`} className="h-full">
            <TabView tab={active} />
          </div>
        }
        second={
          <div id={`panel-${secondary.id}`} role="tabpanel" aria-labelledby={`tab-${secondary.id}`} className="h-full">
            <TabView tab={secondary} />
          </div>
        }
        orientation={state.split.orientation}
        ratio={state.split.ratio}
        onRatioChange={(ratio) => dispatch({ type: 'set-split-ratio', ratio })}
      />
    );
  }

  return (
    <div
      id={`panel-${active.id}`}
      role="tabpanel"
      aria-labelledby={`tab-${active.id}`}
      className="h-full w-full"
    >
      <TabView tab={active} />
    </div>
  );
};

export default TabContent;

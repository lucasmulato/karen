import React from 'react';
import { NotebookPen } from 'lucide-react';
import SplitPane from './SplitPane';
import TabView from './TabView';
import { useWorkspace } from './providers/workspaceContext';

const TabContent: React.FC = () => {
  const { state, openTab, dispatch } = useWorkspace();
  const active = state.openTabs.find((tab) => tab.id === state.activeTabId);

  if (!active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <NotebookPen size={28} className="text-hud-muted" />
        <p className="text-sm text-hud-muted">Nenhuma aba aberta.</p>
        <button
          type="button"
          onClick={() => openTab('hub')}
          className="hud-btn-primary inline-flex items-center gap-1.5"
        >
          <NotebookPen size={13} /> Reabrir Hub
        </button>
      </div>
    );
  }

  const secondary = state.openTabs.find(
    (tab) => tab.id === state.split.secondaryTabId && tab.id !== active.id
  );

  if (secondary) {
    return (
      <SplitPane
        first={<TabView tab={active} />}
        second={<TabView tab={secondary} />}
        orientation={state.split.orientation}
        ratio={state.split.ratio}
        onRatioChange={(ratio) => dispatch({ type: 'set-split-ratio', ratio })}
      />
    );
  }

  return (
    <div role="tabpanel" aria-label={active.title} className="h-full w-full">
      <TabView tab={active} />
    </div>
  );
};

export default TabContent;

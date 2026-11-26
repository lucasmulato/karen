import React, { useEffect, useRef } from 'react';
import CommandPaletteHost from './CommandPaletteHost';
import Inspector from './Inspector';
import SideRail from './SideRail';
import StatusFooter from './StatusFooter';
import TabBar from './TabBar';
import TabContent from './TabContent';
import TopBar from './TopBar';
import GraphProvider from './providers/GraphProvider';
import { useWorkspace } from './providers/workspaceContext';

const Shell: React.FC = () => {
  const { state, setPaletteOpen, focusTab, closeTab, openTab } = useWorkspace();
  const deepLinked = useRef(false);

  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const pane = new URLSearchParams(window.location.search).get('pane');
    if (pane === 'commands' || pane === 'conversations') openTab(pane);
  }, [openTab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      if (
        !typing &&
        (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))
      ) {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        return;
      }
      if (typing || !event.altKey) return;

      if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        const active = state.openTabs.find((tab) => tab.id === state.activeTabId);
        if (active && !active.pinned) closeTab(active.id);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        const tab = state.openTabs[Number(event.key) - 1];
        if (tab) focusTab(tab.id);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const index = state.openTabs.findIndex((tab) => tab.id === state.activeTabId);
        const next = state.openTabs[index + (event.key === 'ArrowRight' ? 1 : -1)];
        if (next) focusTab(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.openTabs, state.activeTabId, setPaletteOpen, focusTab, closeTab]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-hud-bg text-hud-text">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SideRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar />
          <main className="min-h-0 flex-1 overflow-hidden">
            <TabContent />
          </main>
          <StatusFooter />
        </div>
        <Inspector />
      </div>
      <CommandPaletteHost />
    </div>
  );
};

/** Workspace shell. The provider is mounted by main.tsx in preview mode. */
const AppShell: React.FC = () => (
  <GraphProvider>
    <Shell />
  </GraphProvider>
);

export default AppShell;

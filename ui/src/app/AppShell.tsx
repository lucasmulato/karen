import React from 'react';
import Inspector from './Inspector';
import SideRail from './SideRail';
import StatusFooter from './StatusFooter';
import TabBar from './TabBar';
import TabContent from './TabContent';
import TopBar from './TopBar';

/** Workspace shell. The provider is mounted by main.tsx in preview mode. */
const AppShell: React.FC = () => (
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
  </div>
);

export default AppShell;

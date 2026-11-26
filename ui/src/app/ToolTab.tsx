import React from 'react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Shared chrome for the migrated tool surfaces (no business logic here). */
const ToolTab: React.FC<Props> = ({ title, subtitle, children }) => (
  <div className="flex h-full w-full flex-col bg-hud-bg">
    <div className="hud-tabbar">
      <span className="hud-label">{title}</span>
      {subtitle && <span className="hud-label ml-auto text-[9px]">{subtitle}</span>}
    </div>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
  </div>
);

export default ToolTab;

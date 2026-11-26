import React from 'react';
import type { ReactNode } from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    aria-hidden="true"
    className={`block animate-pulse rounded bg-hud-raised ${className}`}
  />
);

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, hint, action }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
    {icon && <div className="text-hud-muted">{icon}</div>}
    <p className="text-sm text-hud-text">{title}</p>
    {hint && <p className="max-w-sm text-xs leading-relaxed text-hud-muted">{hint}</p>}
    {action}
  </div>
);

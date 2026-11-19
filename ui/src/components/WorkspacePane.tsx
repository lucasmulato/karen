import React from 'react';
import { X } from 'lucide-react';

interface WorkspacePaneProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

const WorkspacePane: React.FC<WorkspacePaneProps> = ({ title, subtitle, onClose, children }) => (
  <div className="flex h-full w-full flex-col bg-black">
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-blue-400">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-[12px] text-zinc-500">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
        title="Fechar painel"
      >
        <X size={16} />
      </button>
    </div>
    <div className="flex min-h-0 flex-1 flex-col">{children}</div>
  </div>
);

export default WorkspacePane;

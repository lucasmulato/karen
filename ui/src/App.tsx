import { useState } from 'react';
import { X } from 'lucide-react';
import CooDashboard from './components/coo/CooDashboard';
import KarenWorkspace from './components/karen/KarenWorkspace';

/**
 * The COO HUD is the primary landing surface. All pre-existing KAREN tools
 * (notes, graph, chat, leads, commands, EVA, palette) remain available in the
 * Workspace overlay, launched from the HUD header.
 */
export default function App() {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  return (
    <>
      <CooDashboard onOpenWorkspace={() => setWorkspaceOpen(true)} />
      {workspaceOpen && (
        <div className="fixed inset-0 z-[120] overflow-auto bg-[#080c14]">
          <button
            onClick={() => setWorkspaceOpen(false)}
            className="fixed right-4 top-4 z-[130] flex items-center gap-1 rounded-md border border-hud-cyan/40 bg-slate-900/90 px-3 py-2 text-[11px] font-semibold text-hud-cyan shadow-lg hover:bg-slate-800"
            aria-label="Close workspace and return to COO dashboard"
          >
            <X size={14} /> Close workspace
          </button>
          <KarenWorkspace />
        </div>
      )}
    </>
  );
}

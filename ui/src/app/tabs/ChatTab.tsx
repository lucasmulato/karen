import React from 'react';
import { Sparkles } from 'lucide-react';
import ChatPanel from '../../components/ChatPanel';
import { useGraph } from '../providers/graphContext';
import { useWorkspace } from '../providers/workspaceContext';

const ChatTab: React.FC = () => {
  const { mode, chatCommand } = useWorkspace();
  const { refresh } = useGraph();

  return (
    <div className="flex h-full w-full flex-col bg-hud-bg">
      <div className="hud-tabbar">
        <span className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-hud-cyan" />
          <span className="hud-label">{mode === 'eva' ? 'EVA · co-sócia' : 'KAREN · assistente'}</span>
        </span>
        <span className="hud-label text-[9px]">memória durável · gate humano</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatPanel onGraphChanged={() => void refresh()} command={chatCommand} mode={mode} />
      </div>
    </div>
  );
};

export default ChatTab;

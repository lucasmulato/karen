import React, { useEffect, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import MarkdownRead from '../../components/MarkdownRead';
import { toast } from '../../toast';
import { useWorkspace } from '../providers/workspaceContext';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

interface Props {
  path: string;
}

const NoteTab: React.FC<Props> = ({ path }) => {
  const { openNote } = useWorkspace();
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [readMode, setReadMode] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setDirty(false);
    setReadMode(true);
    void (async () => {
      try {
        const [contentResponse, filesResponse] = await Promise.all([
          fetch(`${API_BASE}/notes/content?path=${encodeURIComponent(path)}`),
          fetch(`${API_BASE}/notes`),
        ]);
        const contentData = (await contentResponse.json()) as { content?: string; error?: string };
        if (!contentResponse.ok) throw new Error(contentData.error || `HTTP ${contentResponse.status}`);
        const filesData = (await filesResponse.json()) as { files?: string[] };
        if (!active) return;
        setContent(contentData.content ?? '');
        setDraft(contentData.content ?? '');
        setFiles(filesData.files ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [path]);

  async function save() {
    try {
      const response = await fetch(`${API_BASE}/notes/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: draft }),
      });
      const data = (await response.json()) as { error?: string; bridge?: { synced?: boolean } };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setContent(draft);
      setDirty(false);
      toast(data.bridge?.synced ? 'Salvo e sincronizado com o grafo' : `Salvo: ${path}`);
    } catch (err) {
      toast(`Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-hud-bg">
      <div className="hud-tabbar gap-2">
        <FileText size={13} className="text-hud-cyan" />
        <span className="truncate font-mono text-[11px] text-hud-text">{path}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setReadMode((value) => !value)}
            className={`hud-btn ${readMode ? '' : 'border-hud-cyan text-hud-cyan'}`}
          >
            {readMode ? 'Editar' : 'Ler'}
          </button>
          {!readMode && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty}
              className="hud-btn-primary disabled:opacity-40"
            >
              <Save size={12} /> Salvar
            </button>
          )}
        </span>
      </div>
      <div className="hud-scroll min-h-0 flex-1 overflow-auto p-4">
        {loading ? (
          <p className="text-xs text-hud-muted">Carregando nota...</p>
        ) : error ? (
          <p className="text-sm text-hud-danger">{error}</p>
        ) : readMode ? (
          <div className="mx-auto max-w-3xl">
            <MarkdownRead content={content} files={files} onOpen={openNote} />
          </div>
        ) : (
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            className="h-full min-h-[60vh] w-full resize-none rounded border border-hud-border bg-hud-panel p-3 font-mono text-[12px] leading-relaxed text-hud-text outline-none focus:border-hud-cyan"
          />
        )}
      </div>
    </div>
  );
};

export default NoteTab;

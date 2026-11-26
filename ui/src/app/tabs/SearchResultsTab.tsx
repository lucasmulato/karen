import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Network, Search } from 'lucide-react';
import { useGraph } from '../providers/graphContext';
import { useWorkspace } from '../providers/workspaceContext';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

interface NodeResult {
  id: string;
  name: string;
  type: string;
  description?: string | null;
}

interface Props {
  query: string;
}

const SearchResultsTab: React.FC<Props> = ({ query }) => {
  const { openNote, openTab } = useWorkspace();
  const graph = useGraph();
  const [nodes, setNodes] = useState<NodeResult[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const [nodeResponse, filesResponse] = await Promise.all([
          fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&limit=30`),
          fetch(`${API_BASE}/notes`),
        ]);
        const nodeData = await nodeResponse.json();
        const filesData = await filesResponse.json();
        if (!active) return;
        setNodes(Array.isArray(nodeData) ? nodeData : []);
        setFiles(Array.isArray(filesData.files) ? filesData.files : []);
      } catch {
        if (active) {
          setNodes([]);
          setFiles([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [query]);

  const matchedFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return files.filter((file) => file.toLowerCase().includes(needle)).slice(0, 30);
  }, [files, query]);

  return (
    <div className="flex h-full w-full flex-col bg-hud-bg">
      <div className="hud-tabbar">
        <Search size={13} className="text-hud-cyan" />
        <span className="hud-label">Resultados para “{query}”</span>
      </div>
      <div className="hud-scroll min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {loading ? (
          <p className="text-xs text-hud-muted">Buscando...</p>
        ) : nodes.length === 0 && matchedFiles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-hud-text">Nada encontrado.</p>
            <p className="text-xs text-hud-muted">Tente outro termo ou abra a paleta com Ctrl+K.</p>
          </div>
        ) : (
          <>
            {matchedFiles.length > 0 && (
              <section>
                <h2 className="hud-label mb-2">Notas ({matchedFiles.length})</h2>
                <div className="space-y-1">
                  {matchedFiles.map((file) => (
                    <button
                      key={file}
                      type="button"
                      onClick={() => openNote(file)}
                      className="hud-card flex w-full items-center gap-2 text-left hover:border-hud-cyan"
                    >
                      <FileText size={13} className="shrink-0 text-hud-cyan" />
                      <span className="truncate font-mono text-[11px]">{file}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {nodes.length > 0 && (
              <section>
                <h2 className="hud-label mb-2">Nós do grafo ({nodes.length})</h2>
                <div className="space-y-1">
                  {nodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        graph.selectNode(node);
                        openTab('graph');
                        openNoteByName(node);
                      }}
                      className="hud-card flex w-full items-center gap-2 text-left hover:border-hud-cyan"
                    >
                      <Network size={13} className="shrink-0 text-hud-cyan" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-hud-text">{node.name}</span>
                        <span className="block truncate text-[10px] text-hud-muted">
                          [{node.type}] {node.description ?? ''}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );

  function openNoteByName(node: NodeResult) {
    const candidate = files.find((file) =>
      file.toLowerCase().includes(node.name.trim().toLowerCase())
    );
    if (candidate) openNote(candidate);
  }
};

export default SearchResultsTab;

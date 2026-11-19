import React, { useCallback, useEffect, useRef, useState } from 'react';
import GraphView, {
  type GraphNode,
  type NodePosition,
} from './components/GraphView';
import {
  Brain,
  CircleHelp,
  Download,
  Plus,
  Search,
  Upload,
  MessageSquare,
  Link2,
  MapPin,
  NotebookPen,
  Terminal,
  X,
} from 'lucide-react';
import ChatPanel from './components/ChatPanel';
import LeadsPanel from './components/LeadsPanel';
import CommandPanel from './components/CommandPanel';
import HealthStrip from './components/HealthStrip';
import WorkspacePane from './components/WorkspacePane';
import Dialog from './components/Dialog';
import GraphSearch from './components/GraphSearch';

const NotesPanel = React.lazy(() => import('./components/NotesPanel'));

interface NodeRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  properties?: Record<string, unknown>;
  created_at?: string;
}

interface GraphData {
  nodes: NodeRow[];
  edges: { source_id: string; target_id: string; label: string }[];
}

type EdgeLabel = 'relates_to' | 'contains' | 'depends_on' | 'tagged_with';

const EDGE_LABELS: EdgeLabel[] = [
  'relates_to',
  'contains',
  'depends_on',
  'tagged_with',
];

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const App: React.FC = () => {
  const [data, setData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeRow | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<
    'idea' | 'project' | 'task' | 'label' | 'note' | 'finding' | 'technique' |
    'cve' | 'tool' | 'writeup' | 'target' | 'fix'
  >('idea');
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);

  // Edge-creation ("connect") mode state machine:
  // null -> off | { source } -> source picked | { source, label } -> awaiting target
  const [connect, setConnect] = useState<
    { source?: string; label?: EdgeLabel } | null
  >(null);
  const [showChat, setShowChat] = useState(false);
  const [showLeads, setShowLeads] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [paneWidth, setPaneWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('karen-pane-width'));
    return Number.isFinite(saved) && saved >= 25 && saved <= 75 ? saved : 50;
  });
  const paneWidthRef = useRef(paneWidth);
  const mainRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);

  // Positions changed since last save (id -> x/y), flushed on a debounce.
  const pendingPositions = useRef<Map<string, NodePosition>>(new Map());
  const saveTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/graph`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      console.error('Failed to load graph:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === '/') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') {
        setShowHelp(false);
        setShowSearch(false);
        setShowAdd(false);
        setConnect(null);
        setShowChat(false);
        setShowLeads(false);
        setShowCommands(false);
        setShowNotes(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function exportCanvas() {
    try {
      const res = await fetch(`${API_BASE}/graph/canvas`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'karen-graph.canvas';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Canvas export failed:', err);
    }
  }

  async function importCanvas(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await fetch(`${API_BASE}/graph/canvas/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await refresh();
      window.alert(`Canvas importado: ${data.imported} nós, ${data.edges} arestas.`);
    } catch (err) {
      window.alert(`Falha ao importar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      e.target.value = '';
    }
  }

  function setWidth(pct: number) {
    const clamped = Math.min(75, Math.max(25, Math.round(pct)));
    paneWidthRef.current = clamped;
    setPaneWidth(clamped);
  }

  function onDividerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  function onDividerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    setWidth(((rect.right - e.clientX) / rect.width) * 100);
  }

  function onDividerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    localStorage.setItem('karen-pane-width', String(paneWidthRef.current));
  }

  function onDividerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = paneWidthRef.current + (e.key === 'ArrowLeft' ? 2 : -2);
    setWidth(next);
    localStorage.setItem('karen-pane-width', String(paneWidthRef.current));
  }

  function handleAddNode(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    fetch(`${API_BASE}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: newType,
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return refresh();
      })
      .then(() => {
        setNewName('');
        setNewDesc('');
        setNewType('idea');
        setShowAdd(false);
      })
      .catch((err) => console.error('Failed to add node:', err))
      .finally(() => setAdding(false));
  }

  async function createEdge(targetId: string) {
    if (!connect?.source || !connect.label) return;
    try {
      const res = await fetch(`${API_BASE}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: connect.source,
          target_id: targetId,
          label: connect.label,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      console.error('Failed to add edge:', err);
    } finally {
      setConnect(null);
    }
  }

  function handleNodeClick(node: GraphNode) {
    if (connect) {
      if (!connect.source) {
        setConnect({ ...connect, source: node.id });
      } else if (!connect.label) {
        // Label picker is shown in the banner; ignore extra clicks until
        // a label is chosen.
      } else if (node.id !== connect.source) {
        createEdge(node.id);
      }
      return;
    }

    // One focus area at a time: a node selection closes any open tool pane.
    setShowChat(false);
    setShowLeads(false);
    setShowCommands(false);
    setShowNotes(false);
    setSelectedNode({
      id: node.id,
      name: node.name,
      type: node.type,
      description: node.description ?? null,
      properties: node.properties,
    });
    setSidebarOpen(true);
  }

  function flushPositions() {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const batch = [...pendingPositions.current.entries()];
      pendingPositions.current.clear();
      for (const [id, pos] of batch) {
        try {
          const res = await fetch(`${API_BASE}/nodes/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              properties: { _x: pos.x, _y: pos.y },
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          console.error('Failed to persist position:', err);
        }
      }
    }, 800);
  }

  function handleNodePosition(id: string, x: number, y: number) {
    pendingPositions.current.set(id, { x, y });
    flushPositions();
  }

  // Saved layout positions live in node.properties (_x/_y).
  const initialPositions: Record<string, NodePosition> | undefined =
    data
      ? Object.fromEntries(
          data.nodes
            .filter(
              (n) =>
                Number.isFinite(n.properties?._x) &&
                Number.isFinite(n.properties?._y)
            )
            .map((n) => [
              n.id,
              { x: n.properties!._x as number, y: n.properties!._y as number },
            ])
        )
      : undefined;

  const connectBannerText = !connect
    ? ''
    : !connect.source
      ? 'Conectar: clique no nó de origem'
      : !connect.label
        ? 'Conectar: escolha o relacionamento'
        : 'Conectar: clique no nó de destino';

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Navigation Sidebar */}
      <nav className="w-16 border-r border-zinc-800 flex flex-col items-center py-6 gap-8 bg-black">
        <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
          <Brain size={24} className="text-white" />
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowSearch((v) => !v)}
            className={`p-2 transition-colors ${showSearch ? 'text-blue-400 bg-zinc-800 rounded-md' : 'text-zinc-500 hover:text-white'}`}
            title="Buscar nós"
          >
            <Search size={24} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="p-2 text-zinc-500 hover:text-white transition-colors"
            title="Adicionar nó"
          >
            <Plus size={24} />
          </button>
          <button
            onClick={() => setConnect(connect ? null : {})}
            className={`p-2 transition-colors ${
              connect ? 'text-blue-400 bg-zinc-800 rounded-md' : 'text-zinc-500 hover:text-white'
            }`}
            title="Conectar nós"
          >
            <Link2 size={24} />
          </button>
        </div>

        <div className="my-1 h-px w-8 bg-zinc-800" />

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              setShowChat((v) => !v);
              setShowLeads(false);
              setShowCommands(false);
              setShowNotes(false);
              setSidebarOpen(false);
            }}
            className={`p-2 transition-colors ${
              showChat ? 'text-blue-400 bg-zinc-800 rounded-md' : 'text-zinc-500 hover:text-white'
            }`}
            title="Conversar com a KAREN"
          >
            <MessageSquare size={24} />
          </button>
          <button
            onClick={() => {
              setShowLeads((v) => !v);
              setShowChat(false);
              setShowCommands(false);
              setShowNotes(false);
              setSidebarOpen(false);
            }}
            className={`p-2 transition-colors ${
              showLeads ? 'text-blue-400 bg-zinc-800 rounded-md' : 'text-zinc-500 hover:text-white'
            }`}
            title="KAREN · Buscar leads"
          >
            <MapPin size={24} />
          </button>
          <button
            onClick={() => {
              setShowCommands((v) => !v);
              setShowChat(false);
              setShowLeads(false);
              setShowNotes(false);
              setSidebarOpen(false);
            }}
            className={`p-2 transition-colors ${
              showCommands ? 'text-blue-400 bg-zinc-800 rounded-md' : 'text-zinc-500 hover:text-white'
            }`}
            title="KAREN · Comandos"
          >
            <Terminal size={24} />
          </button>
          <button
            onClick={() => {
              setShowNotes((v) => !v);
              setShowChat(false);
              setShowLeads(false);
              setShowCommands(false);
              setSidebarOpen(false);
            }}
            className={`p-2 transition-colors ${
              showNotes ? 'text-blue-400 bg-zinc-800 rounded-md' : 'text-zinc-500 hover:text-white'
            }`}
            title="KAREN · Notas"
          >
            <NotebookPen size={24} />
          </button>
        </div>
        <div className="mt-auto">
          <button
            onClick={() => setShowHelp((v) => !v)}
            className={`p-2 transition-colors ${showHelp ? 'text-blue-400 bg-zinc-800 rounded-md' : 'text-zinc-500 hover:text-white'}`}
            title="Ajuda"
          >
            <CircleHelp size={24} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main
        ref={mainRef}
        className="flex-1 flex min-w-0 h-full"
        style={{ '--chat-width': `${paneWidth}%` } as React.CSSProperties}
      >
        <div className="relative flex-1 min-w-0 h-full">
        <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center pointer-events-none z-10">
          <div className="pointer-events-auto flex items-center gap-3 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-800 shadow-xl">
            <h1 className="text-sm font-medium tracking-wider uppercase text-zinc-400">
              KAREN <span className="text-zinc-600 px-2">//</span>{' '}
              <span className="text-blue-400">Cyber &amp; Leads</span>
            </h1>
            <span className="hidden lg:block">
              <HealthStrip />
            </span>
            <button
              onClick={exportCanvas}
              className="text-zinc-500 hover:text-blue-400 transition-colors"
              title="Exportar grafo como .canvas (JSON Canvas)"
            >
              <Download size={15} />
            </button>
            <label
              className="text-zinc-500 hover:text-blue-400 transition-colors cursor-pointer"
              title="Importar arquivo .canvas"
            >
              <Upload size={15} />
              <input
                type="file"
                accept=".canvas,application/json"
                className="hidden"
                onChange={importCanvas}
              />
            </label>
          </div>

          {showSearch && (
            <GraphSearch
              onClose={() => setShowSearch(false)}
              onSelect={(row) =>
                handleNodeClick({
                  id: row.id,
                  name: row.name,
                  type: row.type,
                  description: row.description ?? null,
                  properties: {},
                })
              }
            />
          )}

          {showHelp && (
            <div className="pointer-events-auto absolute right-6 top-16 w-64 rounded-xl border border-zinc-800 bg-black/95 p-4 text-xs text-zinc-400 shadow-2xl">
              <p className="mb-2 font-semibold text-zinc-200">Atalhos</p>
              <ul className="space-y-1 text-[11px]">
                <li><kbd className="text-blue-400">/</kbd> — buscar nós</li>
                <li><kbd className="text-blue-400">Esc</kbd> — fechar diálogo ou painel</li>
                <li>Arraste a barra lateral para redimensionar o painel</li>
              </ul>
              <button
                onClick={() => setShowHelp(false)}
                className="mt-3 w-full rounded-lg border border-zinc-700 py-1.5 text-[11px] hover:border-blue-500"
              >
                Fechar
              </button>
            </div>
          )}
        </header>

        <Dialog open={showAdd} title="Adicionar nó" onClose={() => setShowAdd(false)}>
            <form onSubmit={handleAddNode} className="flex flex-col gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="idea">Ideia</option>
                <option value="project">Projeto</option>
                <option value="task">Tarefa</option>
                <option value="label">Rótulo</option>
                <option value="note">Nota</option>
                <option value="finding">Achado</option>
                <option value="technique">Técnica</option>
                <option value="cve">CVE</option>
                <option value="tool">Ferramenta</option>
                <option value="writeup">Writeup</option>
                <option value="target">Alvo</option>
                <option value="fix">Correção</option>
              </select>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Descrição (opcional)"
                rows={2}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adding || !newName.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Adicionando...' : 'Adicionar'}
                </button>
              </div>
            </form>
        </Dialog>

        <Dialog open={connect !== null} title="Conectar nós" onClose={() => setConnect(null)}>
            <p className="mb-3 text-xs text-zinc-400">{connectBannerText}</p>
            {!connect?.label && connect?.source && (
              <div className="grid grid-cols-2 gap-2">
                {EDGE_LABELS.map((label) => (
                  <button
                    key={label}
                    onClick={() => setConnect({ source: connect!.source, label })}
                    className="px-3 py-2 text-xs rounded-lg border border-zinc-700 hover:border-blue-500 hover:bg-zinc-900 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {connect?.source && connect?.label && (
              <p className="text-xs text-zinc-400">
                Origem selecionada. Agora clique no nó de destino no grafo.
              </p>
            )}
        </Dialog>

        <GraphView
          data={data}
          initialPositions={initialPositions}
          onNodePosition={handleNodePosition}
          highlightId={connect?.source ?? null}
          onNodeClick={handleNodeClick}
        />
        </div>

        {(showChat || showCommands || showNotes || showLeads) && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={paneWidth}
            aria-label="Redimensionar painel"
            tabIndex={0}
            title="Arraste para redimensionar · duplo clique restaura 50% · setas ajustam"
            className="hidden md:block w-1.5 shrink-0 cursor-col-resize bg-zinc-800 hover:bg-blue-600 focus:bg-blue-500 focus:outline-none transition-colors"
            onPointerDown={onDividerDown}
            onPointerMove={onDividerMove}
            onPointerUp={onDividerUp}
            onDoubleClick={() => {
              setWidth(50);
              localStorage.setItem('karen-pane-width', '50');
            }}
            onKeyDown={onDividerKeyDown}
          />
        )}

        {(showChat || showLeads || showCommands || showNotes) && (
          <aside className="w-full md:w-[var(--chat-width)] h-full shrink-0 border-l border-zinc-800 md:border-l-0 bg-black">
            {showChat && (
              <WorkspacePane
                title="KAREN"
                subtitle="Chat com o second brain"
                onClose={() => setShowChat(false)}
              >
                <ChatPanel onGraphChanged={refresh} />
              </WorkspacePane>
            )}

            {showLeads && (
              <WorkspacePane
                title="Leads"
                subtitle="OpenStreetMap · mensagens prontas para copiar"
                onClose={() => setShowLeads(false)}
              >
                <LeadsPanel />
              </WorkspacePane>
            )}

            {showCommands && (
              <WorkspacePane
                title="Comandos"
                subtitle="Leitura automática · mudanças exigem aprovação"
                onClose={() => setShowCommands(false)}
              >
                <CommandPanel />
              </WorkspacePane>
            )}

            {showNotes && (
              <WorkspacePane
                title="Notas"
                subtitle="Vault Markdown · jardim · canvas"
                onClose={() => setShowNotes(false)}
              >
                <React.Suspense
                  fallback={<div className="flex h-full items-center justify-center text-xs text-zinc-500">Carregando notas...</div>}
                >
                  <NotesPanel />
                </React.Suspense>
              </WorkspacePane>
            )}
          </aside>
        )}
      </main>

      {/* Detail Sidebar */}
      {isSidebarOpen && selectedNode && (
        <aside className="w-96 border-l border-zinc-800 bg-black/90 backdrop-blur-xl p-8 flex flex-col gap-6 animate-in slide-in-from-right duration-300">
          <div className="flex justify-between items-start">
            <div className="px-3 py-1 bg-zinc-800 rounded-full text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {selectedNode.type}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 hover:bg-zinc-800 rounded-md transition-colors"
            >
              <X size={20} className="text-zinc-500" />
            </button>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-2">{selectedNode.name}</h2>
            <p className="text-zinc-400 leading-relaxed text-sm">
              {selectedNode.description || 'Sem descrição.'}
            </p>
          </div>

          <div className="flex flex-col gap-4 mt-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              Propriedades
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                <div className="text-zinc-500 mb-1">ID</div>
                <div className="font-mono text-zinc-300 truncate">
                  {selectedNode.id}
                </div>
              </div>
              <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                <div className="text-zinc-500 mb-1">Criado</div>
                <div className="text-zinc-300">
                  {selectedNode.created_at
                    ? new Date(selectedNode.created_at).toLocaleDateString()
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-zinc-900">
            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]">
              Editar nó
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};

export default App;

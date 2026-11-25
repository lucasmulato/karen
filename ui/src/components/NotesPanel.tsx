import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import CanvasView from './CanvasView';
import MarkdownRead from './MarkdownRead';
import GraphView, { type GraphData } from './GraphView';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import { Briefcase, Eye, FileText, FolderOpen, Home, Leaf, Link2, Network, Pencil, Save, Share2 } from 'lucide-react';
import { toast } from '../toast';
import ActivityFeed from './ActivityFeed';

interface GardenNote {
  id: string;
  name: string;
  type: string;
  updated_at: string;
}
interface GardenData {
  total: number;
  seedling: number;
  budding: number;
  evergreen: number;
  stale: number;
  types: { type: string; count: number }[];
  orphans: GardenNote[];
  staleNotes: GardenNote[];
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
type Tab = 'hub' | 'files' | 'mapa' | 'projetos' | 'garden' | 'canvas';

interface NoteMeta {
  type: string;
  tags: string[];
  maturity: string;
  graphId: string;
}

interface NoteNode {
  path: string;
  name: string;
  type: string;
  context: string;
  status: string;
  deadline: string;
  tags: string[];
  maturity: string;
  graphId: string | null;
  links: string[];
  backlinks: string[];
}
interface NoteGraph {
  nodes: NoteNode[];
  edges: { source: string; target: string }[];
  stats: {
    total: number;
    linked: number;
    orphan: number;
    mostLinked: { path: string; name: string; count: number }[];
    types: { type: string; count: number }[];
    contexts: { context: string; count: number }[];
    tags: { tag: string; count: number }[];
  };
}

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'nota';
}

function parseMeta(content: string): NoteMeta {
  const lines = content.split('\n');
  const meta: NoteMeta = { type: 'note', tags: [], maturity: 'seedling', graphId: '' };
  if (lines[0]?.trim() !== '---') return meta;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break;
    const m = lines[i].match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'type') meta.type = value;
    if (key === 'maturity') meta.maturity = value;
    if (key === 'graph_id') meta.graphId = value;
    if (key === 'tags') {
      const inner = value.startsWith('[') ? value.slice(1, -1) : value;
      meta.tags = inner.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    }
  }
  return meta;
}

function withFrontmatter(content: string, meta: NoteMeta): string {
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const tags = meta.tags.filter(Boolean).map((t) => t.replace(/^#/, '')).join(', ');
  return [
    '---',
    `type: ${meta.type || 'note'}`,
    `tags: [${tags}]`,
    `maturity: ${meta.maturity || 'seedling'}`,
    ...(meta.graphId ? [`graph_id: ${meta.graphId}`] : []),
    '---',
    '',
    body.replace(/^\n+/, ''),
  ].join('\n');
}

const NOTE_TYPES = ['inbox', 'project', 'area', 'resource', 'archive', 'memory', 'note', 'finding', 'technique', 'cve', 'tool', 'writeup', 'target', 'fix'];

const NotesPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('hub');
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [garden, setGarden] = useState<GardenData | null>(null);
  const [maturity, setMaturity] = useState('all');
  const [canvas, setCanvas] = useState<any>(null);
  const [noteGraph, setNoteGraph] = useState<NoteGraph | null>(null);
  const [projects, setProjects] = useState<NoteNode[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [contextFilter, setContextFilter] = useState('');
  const [activeContext, setActiveContext] = useState('personal');
  const [readMode, setReadMode] = useState(false);
  const [backlinks, setBacklinks] = useState<NoteNode[]>([]);
  const [linkPicker, setLinkPicker] = useState<{ prefix: string; typing: boolean } | null>(null);
  const [meta, setMeta] = useState<NoteMeta>({ type: 'note', tags: [], maturity: 'seedling', graphId: '' });

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/notes`);
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    loadFiles();
    fetch(`${API_BASE}/notes/context`)
      .then((r) => r.json())
      .then((d) => setActiveContext(d.context ?? 'personal'))
      .catch(() => setActiveContext('personal'));
  }, [loadFiles]);

  const loadGraph = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (tagFilter) params.set('tag', tagFilter);
      if (contextFilter) params.set('context', contextFilter);
      const res = await fetch(`${API_BASE}/notes/graph?${params}`);
      setNoteGraph(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [typeFilter, tagFilter, contextFilter]);

  useEffect(() => {
    if (tab === 'hub' || tab === 'mapa') loadGraph();
    if (tab === 'projetos') {
      fetch(`${API_BASE}/notes/graph?type=project`)
        .then((r) => r.json())
        .then((d) => setProjects(d.nodes ?? []))
        .catch(() => setProjects([]));
    }
  }, [tab, loadGraph]);

  useEffect(() => {
    if (!selected) {
      setBacklinks([]);
      return;
    }
    fetch(`${API_BASE}/notes/backlinks?path=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => setBacklinks(d.backlinks ?? []))
      .catch(() => setBacklinks([]));
  }, [selected, dirty]);

  async function openFile(path: string) {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/notes/content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelected(path);
      setContent(data.content ?? '');
      setMeta(parseMeta(data.content ?? ''));
      setDirty(false);
      setTab('files');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function save(override?: string) {
    if (!selected || (!dirty && override === undefined)) return;
    const payload = override ?? content;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/notes/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected, content: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDirty(false);
      const synced = data.bridge?.synced;
      toast(synced ? `Salvo e sincronizado com o grafo` : `Salvo: ${selected}`);
      await loadFiles();
      if (tab === 'hub' || tab === 'mapa') loadGraph();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function syncGraph() {
    try {
      const res = await fetch(`${API_BASE}/notes/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast(`Grafo sincronizado: ${data.notes} notas, ${data.edges} arestas`);
      loadGraph();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function connectNote(node: NoteNode) {
    try {
      const res = await fetch(`${API_BASE}/notes/content?path=${encodeURIComponent(node.path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const next = withFrontmatter(data.content ?? '', {
        ...parseMeta(data.content ?? ''),
        graphId: crypto.randomUUID(),
      });
      const put = await fetch(`${API_BASE}/notes/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: node.path, content: next }),
      });
      if (!put.ok) throw new Error(`HTTP ${put.status}`);
      toast(`Conectada ao grafo: ${node.name}`);
      loadGraph();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveMeta() {
    if (!selected) return;
    const next = withFrontmatter(content, meta);
    setContent(next);
    setDirty(true);
    await save(next);
  }

  async function loadGarden() {
    try {
      const res = await fetch(`${API_BASE}/garden/data`);
      setGarden(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadCanvas() {
    try {
      const res = await fetch(`${API_BASE}/graph/canvas`);
      setCanvas(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function changeTab(next: Tab) {
    setTab(next);
    setError('');
    if (next === 'garden' && !garden) loadGarden();
    if (next === 'canvas' && !canvas) loadCanvas();
  }

  async function createFromNode(name: string) {
    const path = `30 Resources/${slug(name)}.md`;
    const stub = [
      `# ${name}`,
      '',
      '---',
      'maturity: seedling',
      'source: garden-report',
      '---',
      '',
      'Nota criada a partir de uma nota órfã do grafo.',
      '',
      '## Ideia',
      '',
      '(escreva aqui)',
      '',
      '## Links',
      '',
      '- (adicione links explícitos)',
    ].join('\n');
    try {
      const res = await fetch(`${API_BASE}/notes/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: stub }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      await loadFiles();
      await openFile(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function openFromNode(name: string) {
    const match = files.find((f) => f.toLowerCase().endsWith(`/${slug(name)}.md`));
    if (match) openFile(match);
    else createFromNode(name);
  }

  const visibleNotes = useMemo(() => {
    if (!garden) return [];
    if (maturity === 'all') return [...garden.orphans, ...garden.staleNotes];
    if (maturity === 'stale') return garden.staleNotes;
    return maturity === 'orphan' ? garden.orphans : [];
  }, [garden, maturity]);

  const noteMapData: GraphData | null = useMemo(() => {
    if (!noteGraph) return null;
    return {
      nodes: noteGraph.nodes.map((n) => ({
        id: n.path,
        name: n.name,
        type: n.type,
        description: `${n.backlinks.length} backlinks · ${n.links.length} links`,
      })),
      edges: noteGraph.edges.map((e) => ({
        source_id: e.source,
        target_id: e.target,
        label: 'wikilink',
      })),
    };
  }, [noteGraph]);

  const linkSuggestions = useMemo(() => {
    const prefix = slug(linkPicker?.prefix ?? '');
    const names = noteGraph?.nodes.map((n) => ({ name: n.name, path: n.path })) ??
      files.map((f) => ({ name: f.replace(/\.md$/i, ''), path: f }));
    const filtered = prefix
      ? names.filter((n) => slug(n.name).includes(prefix))
      : names;
    return filtered.slice(0, 8);
  }, [linkPicker, noteGraph, files]);

  function insertLink(name: string) {
    if (linkPicker?.typing) {
      const next = content.replace(/\[\[([^\]]*)$/, `[[${name}]]`);
      setContent(next);
    } else {
      setContent(`${content.trimEnd()}\n\n[[${name}]]`);
    }
    setDirty(true);
    setLinkPicker(null);
  }

  return (
    <div data-color-mode="dark" className="flex h-full w-full flex-col bg-hud-panel text-slate-200">
      <div className="flex shrink-0 items-center justify-between border-b border-hud-line px-4 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => changeTab('hub')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'hub' ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-slate-200'}`}
          >
            <Home size={14} /> Hub
          </button>
          <button
            onClick={() => changeTab('files')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'files' ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-slate-200'}`}
          >
            <FileText size={14} /> Arquivos
          </button>
          <button
            onClick={() => changeTab('mapa')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'mapa' ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-slate-200'}`}
          >
            <Share2 size={14} /> Mapa
          </button>
          <button
            onClick={() => changeTab('projetos')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'projetos' ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-slate-200'}`}
          >
            <Briefcase size={14} /> Projetos
          </button>
          <button
            onClick={() => changeTab('garden')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'garden' ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-slate-200'}`}
          >
            <Leaf size={14} /> Jardim
          </button>
          <button
            onClick={() => changeTab('canvas')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'canvas' ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:text-slate-200'}`}
          >
            <Network size={14} /> Canvas
          </button>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'files' && selected && (
            <div className="flex overflow-hidden rounded-lg border border-hud-line">
              <button
                onClick={() => setReadMode(false)}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] ${!readMode ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted'}`}
                title="Editar"
              >
                <Pencil size={11} /> Editar
              </button>
              <button
                onClick={() => setReadMode(true)}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] ${readMode ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted'}`}
                title="Ler"
              >
                <Eye size={11} /> Ler
              </button>
            </div>
          )}
          {tab === 'files' && selected?.startsWith('proposals/') && (
            <button
              onClick={async () => {
                const res = await fetch(`${API_BASE}/notes/content?path=${encodeURIComponent(selected)}`);
                const data = await res.json();
                const token = String(data.content ?? '').match(/^token:\s*([a-f0-9]+)/im)?.[1];
                if (token) {
                  await navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`);
                  toast('Link da proposta copiado');
                } else toast('Proposta sem token no frontmatter');
              }}
              className="flex items-center gap-1 rounded border border-hud-ok px-2.5 py-1 text-[12px] text-hud-ok hover:border-hud-ok"
              title="Copiar link público da proposta"
            >
              <Link2 size={12} /> Link público
            </button>
          )}
          {tab === 'files' && !readMode && (
            <button
              onClick={() => save()}
              disabled={!dirty || saving}
              className="flex items-center gap-1 rounded bg-hud-cyan px-2.5 py-1 text-[12px] text-white disabled:opacity-40"
            >
              <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-900/50 bg-red-950/30 px-4 py-2 text-[12px] text-hud-danger">
          {error}
        </div>
      )}

      {tab === 'hub' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {noteGraph ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Notas', noteGraph.stats.total, 'text-slate-200'],
                  ['Conectadas', noteGraph.stats.linked, 'text-hud-cyan'],
                  ['Órfãs', noteGraph.stats.orphan, 'text-amber-400'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="rounded-lg border border-hud-line bg-hud-raised p-3">
                    <div className={`text-xl font-semibold ${color}`}>{value}</div>
                    <div className="text-[11px] uppercase tracking-wider text-hud-muted">{label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-hud-muted">
                    Contexto ativo: <span className="text-hud-cyan">{activeContext}</span>
                  </p>
                  {(typeFilter || tagFilter || contextFilter) && (
                    <button
                      onClick={() => { setTypeFilter(''); setTagFilter(''); setContextFilter(''); }}
                      className="text-[11px] text-hud-muted hover:text-hud-cyan"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {noteGraph.stats.contexts?.map((c) => (
                    <button
                      key={c.context}
                      onClick={() => {
                        const next = c.context === contextFilter ? '' : c.context;
                        setContextFilter(next);
                        fetch(`${API_BASE}/notes/context`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ context: next || 'personal' }),
                        }).then(() => setActiveContext(next || 'personal')).catch(() => {});
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${contextFilter === c.context ? 'border-hud-cyan text-hud-cyan' : 'border-hud-line text-hud-muted hover:border-hud-cyan'}`}
                      title="Trocar contexto de trabalho da KAREN"
                    >
                      {c.context} <span className="text-hud-muted">{c.count}</span>
                    </button>
                  ))}
                </div>
                <p className="pt-1 text-[11px] font-bold uppercase tracking-widest text-hud-muted">Filtrar por tipo</p>
                <div className="flex flex-wrap gap-1.5">
                  {noteGraph.stats.types.map((t) => (
                    <button
                      key={t.type}
                      onClick={() => setTypeFilter((v) => (v === t.type ? '' : t.type))}
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${typeFilter === t.type ? 'border-hud-cyan text-hud-cyan' : 'border-hud-line text-hud-muted hover:border-hud-cyan'}`}
                    >
                      {t.type} <span className="text-hud-muted">{t.count}</span>
                    </button>
                  ))}
                </div>
                {noteGraph.stats.tags.length > 0 && (
                  <>
                    <p className="pt-1 text-[11px] font-bold uppercase tracking-widest text-hud-muted">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {noteGraph.stats.tags.map((t) => (
                        <button
                          key={t.tag}
                          onClick={() => setTagFilter((v) => (v === t.tag ? '' : t.tag))}
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${tagFilter === t.tag ? 'border-hud-ok text-hud-ok' : 'border-hud-line text-hud-muted hover:border-hud-cyan'}`}
                        >
                          #{t.tag} <span className="text-hud-muted">{t.count}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                 onClick={syncGraph}
                 className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-hud-cyan bg-blue-950/30 py-2 text-[12px] text-hud-cyan hover:border-hud-cyan"
               >
                 <Network size={13} /> Sincronizar notas com o grafo
               </button>

               {noteGraph.stats.mostLinked.some((n) => n.count > 0) && (
                <section className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-hud-muted">
                    <Link2 size={12} /> Mais conectadas
                  </p>
                  {noteGraph.stats.mostLinked.filter((n) => n.count > 0).map((n) => (
                    <button
                      key={n.path}
                      onClick={() => openFile(n.path)}
                      className="flex w-full items-center justify-between rounded-lg border border-hud-line bg-hud-raised px-3 py-2 text-left hover:border-hud-cyan"
                    >
                      <span className="truncate text-xs text-slate-200">{n.name}</span>
                      <span className="ml-2 shrink-0 text-[11px] text-hud-cyan">{n.count} links</span>
                    </button>
                  ))}
                </section>
              )}

              <section className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-hud-muted">Notas</p>
                {noteGraph.nodes.map((n) => (
                  <div
                    key={n.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => openFile(n.path)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openFile(n.path); }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-hud-line bg-hud-raised px-3 py-2 text-left hover:border-hud-cyan"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-slate-200">{n.name}</span>
                      <span className="block text-[11px] text-hud-muted">
                        {n.type} · {n.backlinks.length} backlinks · {n.links.length} links
                      </span>
                    </span>
                    {n.graphId ? (
                      <span className="shrink-0 rounded border border-hud-ok px-1.5 py-0.5 text-[10px] text-hud-ok" title="Sincronizada com o grafo">grafo</span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); connectNote(n); }}
                        className="shrink-0 rounded border border-hud-line px-1.5 py-0.5 text-[10px] text-hud-muted hover:border-hud-cyan hover:text-hud-cyan"
                        title="Gerar graph_id e conectar ao grafo"
                      >
                        Conectar
                      </button>
                    )}
                  </div>
                ))}
                {noteGraph.nodes.length === 0 && (
                  <p className="text-xs text-hud-muted">Nenhuma nota com esses filtros.</p>
                )}
              </section>
               <ActivityFeed />

            </>
          ) : (
            <p className="text-xs text-hud-muted">Carregando hub...</p>
          )}
        </div>
      )}

      {tab === 'files' && (
        <div className="flex min-h-0 flex-1">
          <aside className="w-52 shrink-0 overflow-y-auto border-r border-hud-line bg-hud-panel px-2 py-2">
            <p className="px-1 pb-2 text-[11px] uppercase tracking-widest text-hud-muted">Vault</p>
            {files.map((f) => (
              <button
                key={f}
                onClick={() => openFile(f)}
                className={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-[12px] ${selected === f ? 'bg-hud-raised text-hud-cyan' : 'text-hud-muted hover:bg-hud-raised'}`}
                title={f}
              >
                <FolderOpen size={11} className="shrink-0" />
                {f}
              </button>
            ))}
            {files.length === 0 && <p className="px-1 text-[12px] text-hud-muted">Nenhuma nota.</p>}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              {selected ? (
                readMode ? (
                  <MarkdownRead content={content} files={files} onOpen={openFile} />
                ) : (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex shrink-0 justify-end border-b border-hud-line px-2 py-1">
                      <button
                        onClick={() => setLinkPicker({ prefix: '', typing: false })}
                        className="flex items-center gap-1 rounded border border-hud-line px-2 py-0.5 text-[11px] text-hud-muted hover:border-hud-cyan hover:text-hud-cyan"
                        title="Inserir wikilink"
                      >
                        <Link2 size={11} /> Inserir [[link]]
                      </button>
                    </div>
                    <div className="min-h-0 flex-1">
                      <MDEditor
                        value={content}
                        onChange={(v) => {
                          const next = v ?? '';
                          setContent(next);
                          setDirty(true);
                          const match = next.match(/\[\[([^\]]*)$/);
                          if (match) setLinkPicker({ prefix: match[1], typing: true });
                          else setLinkPicker(null);
                        }}
                        height="100%"
                        visibleDragbar={false}
                        textareaProps={{ spellCheck: false }}
                      />
                    </div>
                    {linkPicker && (
                      <div className="shrink-0 border-t border-hud-line bg-hud-bg p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-hud-muted">Inserir link</p>
                          <button onClick={() => setLinkPicker(null)} className="text-[11px] text-hud-muted hover:text-white">cancelar</button>
                        </div>
                        <input
                          autoFocus
                          value={linkPicker.prefix}
                          onChange={(e) => setLinkPicker({ ...linkPicker, prefix: e.target.value })}
                          placeholder="nome da nota..."
                          className="mb-1 w-full rounded border border-hud-line bg-hud-raised px-2 py-1 text-xs text-slate-200"
                        />
                        <div className="max-h-28 overflow-y-auto">
                          {linkSuggestions.map((s) => (
                            <button
                              key={s.path}
                              onClick={() => insertLink(s.name)}
                              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[12px] text-slate-200 hover:bg-hud-raised"
                            >
                              <span className="truncate">{s.name}</span>
                              <span className="ml-2 shrink-0 text-[10px] text-hud-muted">{s.path.split('/')[0]}</span>
                            </button>
                          ))}
                          {linkSuggestions.length === 0 && (
                            <p className="px-2 py-1 text-[11px] text-hud-muted">Nenhuma nota encontrada.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-hud-muted">
                  <FileText size={28} />
                  <p className="text-xs">Selecione uma nota para editar</p>
                </div>
              )}
            </div>
            {selected && (
              <div className="shrink-0 border-t border-hud-line bg-hud-bg px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-hud-muted">
                    Propriedades
                  </p>
                  <button
                    onClick={saveMeta}
                    className="rounded border border-hud-line px-2 py-0.5 text-[11px] text-hud-muted hover:border-hud-cyan hover:text-hud-cyan"
                  >
                    Salvar propriedades
                  </button>
                </div>
                {meta.tags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {meta.tags.map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTagFilter(t); setTab('hub'); }}
                        className="rounded-full border border-hud-ok px-2 py-0.5 text-[10px] text-hud-ok hover:border-hud-ok"
                        title={`Filtrar Hub por #${t}`}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5 text-[10px] text-hud-muted">
                    Tipo
                    <select
                      value={meta.type}
                      onChange={(e) => setMeta({ ...meta, type: e.target.value })}
                      className="rounded border border-hud-line bg-hud-raised px-1.5 py-1 text-[11px] text-slate-200"
                    >
                      {NOTE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px] text-hud-muted">
                    Maturidade
                    <select
                      value={meta.maturity}
                      onChange={(e) => setMeta({ ...meta, maturity: e.target.value })}
                      className="rounded border border-hud-line bg-hud-raised px-1.5 py-1 text-[11px] text-slate-200"
                    >
                      <option value="seedling">seedling</option>
                      <option value="budding">budding</option>
                      <option value="evergreen">evergreen</option>
                    </select>
                  </label>
                  <label className="col-span-2 flex flex-col gap-0.5 text-[10px] text-hud-muted">
                    Tags (separadas por vírgula)
                    <input
                      value={meta.tags.join(', ')}
                      onChange={(e) => setMeta({ ...meta, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                      className="rounded border border-hud-line bg-hud-raised px-1.5 py-1 text-[11px] text-slate-200"
                    />
                  </label>
                  <label className="col-span-2 flex flex-col gap-0.5 text-[10px] text-hud-muted">
                    graph_id (UUID do nó no grafo — vazio = não sincronizar)
                    <input
                      value={meta.graphId}
                      onChange={(e) => setMeta({ ...meta, graphId: e.target.value.trim() })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="rounded border border-hud-line bg-hud-raised px-1.5 py-1 font-mono text-[11px] text-slate-200"
                    />
                  </label>
                </div>
              </div>
            )}
            {selected && (
              <div className="max-h-36 shrink-0 overflow-y-auto border-t border-hud-line bg-hud-bg px-3 py-2">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-hud-muted">
                  <Link2 size={12} /> Backlinks ({backlinks.length})
                </p>
                {backlinks.map((b) => (
                  <button
                    key={b.path}
                    onClick={() => openFile(b.path)}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[12px] text-slate-200 hover:bg-hud-raised"
                  >
                    <span className="truncate">{b.name}</span>
                    <span className="ml-2 shrink-0 text-[11px] text-hud-muted">{b.type}</span>
                  </button>
                ))}
                {backlinks.length === 0 && (
                  <p className="text-[11px] text-hud-muted">
                    Nenhuma nota aponta aqui. Use [[Nome da Nota]] em outra nota.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'mapa' && (
        <div className="min-h-0 flex-1">
          {noteMapData ? (
            <GraphView
              data={noteMapData}
              onNodeClick={(node) => openFile(node.id)}
            />
          ) : (
            <p className="p-4 text-xs text-hud-muted">Carregando mapa de notas...</p>
          )}
        </div>
      )}

      {tab === 'projetos' && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-hud-muted">
            Projetos · ordenados por prazo
          </p>
          {projects
            .slice()
            .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
            .map((p) => (
              <button
                key={p.path}
                onClick={() => openFile(p.path)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-hud-line bg-hud-raised px-3 py-2 text-left hover:border-hud-cyan"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-slate-200">{p.name}</span>
                  <span className="block text-[11px] text-hud-muted">
                    {p.context} · {p.status} · {p.deadline || 'sem prazo'}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-hud-muted">{p.maturity}</span>
              </button>
            ))}
          {projects.length === 0 && <p className="text-xs text-hud-muted">Nenhum projeto ainda.</p>}
        </div>
      )}

      {tab === 'garden' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {garden ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Total', garden.total, 'text-slate-200'],
                  ['Seedling', garden.seedling, 'text-lime-400'],
                  ['Budding', garden.budding, 'text-amber-400'],
                  ['Evergreen', garden.evergreen, 'text-hud-ok'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="rounded-lg border border-hud-line bg-hud-raised p-3">
                    <div className={`text-xl font-semibold ${color}`}>{value}</div>
                    <div className="text-[11px] uppercase tracking-wider text-hud-muted">{label}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                {[
                  ['all', 'Tudo'],
                  ['orphan', 'Órfãs'],
                  ['stale', 'Paradas'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMaturity(key)}
                    className={`rounded-full border px-3 py-1 text-[12px] ${maturity === key ? 'border-hud-ok text-hud-ok' : 'border-hud-line text-hud-muted hover:border-hud-cyan'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {visibleNotes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 rounded-lg border border-hud-line bg-hud-raised px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-slate-200">{n.name}</p>
                      <p className="text-[11px] text-hud-muted">[{n.type}]</p>
                    </div>
                    <button
                      onClick={() => openFromNode(n.name)}
                      className="shrink-0 rounded border border-hud-line px-2 py-1 text-[11px] text-hud-muted hover:border-hud-cyan hover:text-hud-cyan"
                    >
                      Abrir / criar
                    </button>
                  </div>
                ))}
                {visibleNotes.length === 0 && (
                  <p className="text-xs text-hud-muted">Nada nesta categoria 🎉</p>
                )}
              </div>
              <p className="text-[11px] text-hud-muted">
                Custo: US$ 0,00 · dados locais do grafo
              </p>
            </>
          ) : (
            <p className="text-xs text-hud-muted">Carregando jardim...</p>
          )}
        </div>
      )}

      {tab === 'canvas' && (
        <div className="min-h-0 flex-1 bg-hud-panel">
          {canvas ? (
            <CanvasView canvas={canvas} />
          ) : (
            <p className="p-4 text-xs text-hud-muted">Carregando canvas...</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotesPanel;

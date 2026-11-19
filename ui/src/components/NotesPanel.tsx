import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import CanvasView from './CanvasView';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import { FileText, FolderOpen, Leaf, Network, Save } from 'lucide-react';

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
type Tab = 'files' | 'garden' | 'canvas';

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'nota';
}

const NotesPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('files');
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [garden, setGarden] = useState<GardenData | null>(null);
  const [maturity, setMaturity] = useState('all');
  const [canvas, setCanvas] = useState<any>(null);

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
  }, [loadFiles]);

  async function openFile(path: string) {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/notes/content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelected(path);
      setContent(data.content ?? '');
      setDirty(false);
      setTab('files');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function save() {
    if (!selected || !dirty) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/notes/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDirty(false);
      setNotice(`Salvo: ${selected}`);
      window.setTimeout(() => setNotice(''), 2000);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
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

  return (
    <div data-color-mode="dark" className="flex h-full w-full flex-col bg-[#1e1e1e] text-zinc-200">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => changeTab('files')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'files' ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500 hover:text-zinc-200'}`}
          >
            <FileText size={14} /> Arquivos
          </button>
          <button
            onClick={() => changeTab('garden')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'garden' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'}`}
          >
            <Leaf size={14} /> Jardim
          </button>
          <button
            onClick={() => changeTab('canvas')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${tab === 'canvas' ? 'bg-zinc-800 text-purple-400' : 'text-zinc-500 hover:text-zinc-200'}`}
          >
            <Network size={14} /> Canvas
          </button>
        </div>
        <div className="flex items-center gap-2">
          {notice && <span className="text-[10px] text-emerald-400">{notice}</span>}
          {tab === 'files' && (
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
            >
              <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-900/50 bg-red-950/30 px-4 py-2 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {tab === 'files' && (
        <div className="flex min-h-0 flex-1">
          <aside className="w-52 shrink-0 overflow-y-auto border-r border-zinc-800 bg-[#181818] px-2 py-2">
            <p className="px-1 pb-2 text-[10px] uppercase tracking-widest text-zinc-600">Vault</p>
            {files.map((f) => (
              <button
                key={f}
                onClick={() => openFile(f)}
                className={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-[11px] ${selected === f ? 'bg-zinc-800 text-blue-300' : 'text-zinc-400 hover:bg-zinc-900'}`}
                title={f}
              >
                <FolderOpen size={11} className="shrink-0" />
                {f}
              </button>
            ))}
            {files.length === 0 && <p className="px-1 text-[11px] text-zinc-600">Nenhuma nota.</p>}
          </aside>
          <div className="min-w-0 flex-1 overflow-hidden">
            {selected ? (
              <MDEditor
                value={content}
                onChange={(v) => {
                  setContent(v ?? '');
                  setDirty(true);
                }}
                height="100%"
                visibleDragbar={false}
                textareaProps={{ spellCheck: false }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                <FileText size={28} />
                <p className="text-xs">Selecione uma nota para editar</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'garden' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {garden ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Total', garden.total, 'text-zinc-200'],
                  ['Seedling', garden.seedling, 'text-lime-400'],
                  ['Budding', garden.budding, 'text-amber-400'],
                  ['Evergreen', garden.evergreen, 'text-emerald-400'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className={`text-xl font-semibold ${color}`}>{value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
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
                    className={`rounded-full border px-3 py-1 text-[11px] ${maturity === key ? 'border-emerald-600 text-emerald-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {visibleNotes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-zinc-200">{n.name}</p>
                      <p className="text-[10px] text-zinc-600">[{n.type}]</p>
                    </div>
                    <button
                      onClick={() => openFromNode(n.name)}
                      className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:border-blue-500 hover:text-blue-400"
                    >
                      Abrir / criar
                    </button>
                  </div>
                ))}
                {visibleNotes.length === 0 && (
                  <p className="text-xs text-zinc-600">Nada nesta categoria 🎉</p>
                )}
              </div>
              <p className="text-[10px] text-zinc-600">
                Custo: US$ 0,00 · dados locais do grafo
              </p>
            </>
          ) : (
            <p className="text-xs text-zinc-500">Carregando jardim...</p>
          )}
        </div>
      )}

      {tab === 'canvas' && (
        <div className="min-h-0 flex-1 bg-[#0e0e0e]">
          {canvas ? (
            <CanvasView canvas={canvas} />
          ) : (
            <p className="p-4 text-xs text-zinc-500">Carregando canvas...</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotesPanel;

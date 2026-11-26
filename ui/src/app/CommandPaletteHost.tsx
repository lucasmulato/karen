import React, { useCallback, useMemo } from 'react';
import { Columns2, Rows2 } from 'lucide-react';
import CommandPalette from '../components/CommandPalette';
import type { PaletteAction } from '../components/CommandPalette';
import { PALETTE_ICONS } from '../components/paletteIcons';
import { toast } from '../toast';
import { useGraph } from './providers/graphContext';
import { useWorkspace } from './providers/workspaceContext';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const CommandPaletteHost: React.FC = () => {
  const {
    paletteOpen,
    setPaletteOpen,
    openTab,
    openNote,
    mode,
    toggleMode,
    runChatCommand,
    attention,
    select,
    splitWith,
    closeSplit,
    toggleSplitOrientation,
    state,
  } = useWorkspace();
  const graph = useGraph();

  const actions = useMemo<PaletteAction[]>(
    () => [
      { id: 'hub', label: 'Abrir Hub', hint: 'vault', group: 'Abrir', icon: PALETTE_ICONS.notes, run: () => openTab('hub') },
      { id: 'graph', label: 'Abrir Grafo', hint: 'D3', group: 'Abrir', icon: PALETTE_ICONS.mapa, run: () => openTab('graph') },
      { id: 'chat', label: 'Abrir Chat', hint: 'assistente', group: 'Abrir', icon: PALETTE_ICONS.chat, run: () => openTab('chat') },
      { id: 'queue', label: 'Fila executiva', hint: `${attention.length} itens`, group: 'Abrir', icon: PALETTE_ICONS.eva, run: () => openTab('queue') },
      { id: 'leads', label: 'Leads', hint: 'prospecção', group: 'Abrir', icon: PALETTE_ICONS.leads, run: () => openTab('leads') },
      { id: 'conversations', label: 'Conversas', hint: 'Climara', group: 'Abrir', icon: PALETTE_ICONS.chat, run: () => openTab('conversations') },
      { id: 'outreach', label: 'Mensagens prontas', hint: 'envio manual', group: 'Abrir', icon: PALETTE_ICONS.leads, run: () => openTab('outreach') },
      { id: 'commands', label: 'Comandos', hint: 'allowlist', group: 'Abrir', icon: PALETTE_ICONS.commands, run: () => openTab('commands') },
      { id: 'eva', label: 'Painel EVA', hint: 'co-sócia', group: 'Abrir', icon: PALETTE_ICONS.eva, run: () => openTab('eva') },
      { id: 'mapa', label: 'Mapa de notas', group: 'Abrir', icon: PALETTE_ICONS.mapa, run: () => openTab('mapa') },
      { id: 'projetos', label: 'Projetos', group: 'Abrir', icon: PALETTE_ICONS.projetos, run: () => openTab('projetos') },
      { id: 'jardim', label: 'Jardim', group: 'Abrir', icon: PALETTE_ICONS.garden, run: () => openTab('jardim') },
      { id: 'canvas', label: 'Canvas', group: 'Abrir', icon: PALETTE_ICONS.canvas, run: () => openTab('canvas') },
      {
        id: 'mode',
        label: `Alternar para ${mode === 'eva' ? 'KAREN' : 'EVA'}`,
        hint: `modo atual: ${mode}`,
        group: 'Ações',
        icon: PALETTE_ICONS.mode,
        run: () => void toggleMode(),
      },
      {
        id: 'diagnosis',
        label: 'Diagnóstico da KAREN',
        hint: '/diagnosis',
        group: 'Ações',
        icon: PALETTE_ICONS.health,
        run: () => runChatCommand('/diagnosis'),
      },
      {
        id: 'sync',
        label: 'Sincronizar grafo',
        hint: 'notas → Postgres',
        group: 'Ações',
        icon: PALETTE_ICONS.sync,
        run: async () => {
          try {
            const response = await fetch(`${API_BASE}/notes/sync`, { method: 'POST' });
            const data = (await response.json()) as { notes?: number; edges?: number; error?: string };
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            toast(`Sincronizado: ${data.notes} notas, ${data.edges} arestas`);
            await graph.refresh();
          } catch (err) {
            toast(`Falha ao sincronizar: ${err instanceof Error ? err.message : String(err)}`);
          }
        },
      },
      {
        id: 'health',
        label: 'Ver saúde do sistema',
        hint: 'real',
        group: 'Ações',
        icon: PALETTE_ICONS.health,
        run: async () => {
          try {
            const data = (await fetch(`${API_BASE}/health/full`).then((r) => r.json())) as {
              api?: string; db?: string; llama?: string;
            };
            toast(`API ${data.api} · DB ${data.db} · modelo ${data.llama}`);
          } catch {
            toast('Não consegui ler a saúde do sistema.');
          }
        },
      },
      {
        id: 'keys',
        label: 'Ver status das chaves',
        hint: 'configured/missing',
        group: 'Ações',
        icon: PALETTE_ICONS.keys,
        run: async () => {
          try {
            const data = (await fetch(`${API_BASE}/chat/status`).then((r) => r.json())) as {
              leads?: { configured?: boolean }; model?: string;
            };
            toast(`leads: ${data.leads?.configured ? 'on' : 'off'} · modelo ${data.model}`);
          } catch {
            toast('Não consegui ler o status das chaves.');
          }
        },
      },
      {
        id: 'split',
        label: state.split.secondaryTabId ? 'Fechar divisão' : 'Dividir aba atual',
        group: 'Layout',
        icon: Columns2,
        run: () => (state.split.secondaryTabId ? closeSplit() : splitWith()),
      },
      {
        id: 'orientation',
        label: 'Alternar orientação da divisão',
        group: 'Layout',
        icon: Rows2,
        run: toggleSplitOrientation,
      },
    ],
    [
      openTab,
      attention.length,
      mode,
      toggleMode,
      runChatCommand,
      graph,
      state.split.secondaryTabId,
      closeSplit,
      splitWith,
      toggleSplitOrientation,
    ]
  );

  const onSearch = useCallback(
    async (query: string): Promise<PaletteAction[]> => {
      const needle = query.toLowerCase();
      const results: PaletteAction[] = [
        {
          id: 'search-all',
          label: `Ver todos os resultados para “${query}”`,
          group: 'Busca',
          icon: PALETTE_ICONS.search,
          run: () => {
            openTab('search', { payload: query });
          },
        },
      ];
      try {
        const [filesResponse, nodesResponse] = await Promise.all([
          fetch(`${API_BASE}/notes`),
          fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&limit=8`),
        ]);
        const filesData = (await filesResponse.json()) as { files?: string[] };
        const nodes = await nodesResponse.json();
        for (const file of (filesData.files ?? []).filter((f) => f.toLowerCase().includes(needle)).slice(0, 8)) {
          results.push({
            id: `note:${file}`,
            label: file,
            hint: 'nota',
            group: 'Notas',
            icon: PALETTE_ICONS.notes,
            run: () => openNote(file),
          });
        }
        if (Array.isArray(nodes)) {
          for (const node of nodes as { id: string; name: string; type: string }[]) {
            results.push({
              id: `node:${node.id}`,
              label: node.name,
              hint: node.type,
              group: 'Nós',
              icon: PALETTE_ICONS.mapa,
              run: () => {
                graph.selectNode(node);
                openTab('graph');
              },
            });
          }
        }
      } catch {
        // Finder stays honest: no results rather than invented ones.
      }
      for (const item of attention.filter((a) => `${a.label} ${a.detail}`.toLowerCase().includes(needle)).slice(0, 5)) {
        results.push({
          id: `attention:${item.topic}`,
          label: item.label,
          hint: item.topic,
          group: 'Atenção',
          icon: PALETTE_ICONS.eva,
          run: () => {
            select({
              kind: 'queue',
              id: item.topic,
              label: item.label,
              detail: item.detail,
            });
            openTab('queue');
          },
        });
      }
      return results;
    },
    [openTab, openNote, graph, attention, select]
  );

  return (
    <CommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      actions={actions}
      onSearch={onSearch}
    />
  );
};

export default CommandPaletteHost;

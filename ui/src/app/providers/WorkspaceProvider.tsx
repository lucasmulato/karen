import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import {
  loadState,
  persistState,
  workspaceReducer,
} from '../../store/workspaceStore';
import type { TabKind } from '../../store/workspaceStore';
import { toast } from '../../toast';
import { TAB_LABELS, WorkspaceContext } from './workspaceContext';
import type { AttentionItem, WorkspaceContextValue, WorkspaceSelection } from './workspaceContext';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, loadState);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mode, setModeState] = useState<'karen' | 'eva'>('karen');
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const [chatCommand, setChatCommand] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/eva/mode`);
        if (response.ok && active) {
          const data = (await response.json()) as { mode?: string };
          if (data.mode === 'karen' || data.mode === 'eva') setModeState(data.mode);
        }
      } catch {
        // Keep the local default when the API is unavailable.
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/dashboard/attention`);
        if (response.ok && active) {
          const data = (await response.json()) as { items?: AttentionItem[] };
          setAttention(data.items ?? []);
        }
      } catch {
        // The badge simply stays empty; no invented data.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const openTab = useCallback(
    (kind: TabKind, options: { title?: string; payload?: string } = {}): string => {
      const existing = state.openTabs.find(
        (tab) => tab.kind === kind && tab.payload === options.payload
      );
      if (existing) {
        dispatch({ type: 'focus-tab', id: existing.id });
        return existing.id;
      }
      const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      dispatch({
        type: 'open-tab',
        tab: {
          id,
          kind,
          title: options.title ?? TAB_LABELS[kind],
          pinned: false,
          payload: options.payload,
        },
      });
      return id;
    },
    [state.openTabs]
  );

  const splitWith = useCallback(
    (tabId?: string) => {
      const other =
        tabId ??
        state.openTabs.find((tab) => tab.id !== state.activeTabId)?.id ??
        openTab('hub');
      if (other === state.activeTabId) return;
      dispatch({ type: 'set-split-secondary', id: other });
    },
    [state.openTabs, state.activeTabId, openTab]
  );

  const closeSplit = useCallback(() => {
    dispatch({ type: 'set-split-secondary', id: null });
  }, []);

  const toggleSplitOrientation = useCallback(() => {
    dispatch({
      type: 'set-split-orientation',
      orientation: state.split.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    });
  }, [state.split.orientation]);

  const toggleMode = useCallback(async () => {
    const next = mode === 'eva' ? 'karen' : 'eva';
    try {
      const response = await fetch(`${API_BASE}/eva/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (response.ok) {
        setModeState(next);
        toast(`Modo ${next.toUpperCase()} ativo`);
      }
    } catch {
      // No optimistic mode change: the server is the source of truth.
    }
  }, [mode]);

  const openNote = useCallback(
    (path: string) => {
      setSelection({ kind: 'note', path });
      openTab('note', { payload: path, title: path.split('/').pop()?.replace(/\.md$/i, '') ?? 'Nota' });
    },
    [openTab]
  );

  const runChatCommand = useCallback(
    (text: string) => {
      setChatCommand({ id: Date.now(), text });
      openTab('chat');
    },
    [openTab]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      dispatch,
      openTab,
      focusTab: (id) => dispatch({ type: 'focus-tab', id }),
      closeTab: (id) => dispatch({ type: 'close-tab', id }),
      moveTab: (from, to) => dispatch({ type: 'move-tab', from, to }),
      togglePin: (id) => dispatch({ type: 'toggle-pin', id }),
      toggleRail: () => dispatch({ type: 'set-rail', collapsed: !state.railCollapsed }),
      toggleInspector: () => dispatch({ type: 'toggle-inspector' }),
      toggleStatusFooter: () => dispatch({ type: 'toggle-status-footer' }),
      splitWith,
      closeSplit,
      toggleSplitOrientation,
      paletteOpen,
      setPaletteOpen,
      mode,
      toggleMode,
      attention,
      selection,
      select: setSelection,
      openNote,
      chatCommand,
      runChatCommand,
    }),
    [
      state,
      openTab,
      splitWith,
      closeSplit,
      toggleSplitOrientation,
      paletteOpen,
      mode,
      toggleMode,
      attention,
      selection,
      openNote,
      chatCommand,
      runChatCommand,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export default WorkspaceProvider;

import React, { useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import {
  loadState,
  persistState,
  workspaceReducer,
} from '../../store/workspaceStore';
import type { TabKind } from '../../store/workspaceStore';
import { TAB_LABELS, WorkspaceContext } from './workspaceContext';
import type { WorkspaceContextValue } from './workspaceContext';

const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, loadState);

  useEffect(() => {
    persistState(state);
  }, [state]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const openTab = (
      kind: TabKind,
      options: { title?: string; payload?: string } = {}
    ): string => {
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
    };

    return {
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
    };
  }, [state]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export default WorkspaceProvider;

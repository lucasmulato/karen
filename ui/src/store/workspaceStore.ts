/**
 * Workspace tab state — pure reducer + persistence helpers.
 *
 * Fase 0: only the shell and the Hub tab are used. The other tab kinds are
 * already typed so Fase 1/2 can add them without changing the storage shape.
 */

export type TabKind =
  | 'hub'
  | 'note'
  | 'graph'
  | 'mapa'
  | 'projetos'
  | 'jardim'
  | 'chat'
  | 'leads'
  | 'outreach'
  | 'conversations'
  | 'commands'
  | 'queue'
  | 'eva'
  | 'canvas'
  | 'search';

export interface WorkspaceTab {
  id: string;
  kind: TabKind;
  title: string;
  pinned: boolean;
  /** Lazy tabs: note path, graph node id, search query, etc. */
  payload?: string;
}

export interface WorkspaceState {
  version: 1;
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
  /** Split view: horizontal = side by side, vertical = stacked. */
  split: { orientation: 'horizontal' | 'vertical'; ratio: number; secondaryTabId: string | null };
  railCollapsed: boolean;
  inspectorOpen: boolean;
  inspectorWidth: number;
  statusFooterOpen: boolean;
}

export type WorkspaceAction =
  | { type: 'open-tab'; tab: WorkspaceTab }
  | { type: 'focus-tab'; id: string }
  | { type: 'close-tab'; id: string }
  | { type: 'move-tab'; from: number; to: number }
  | { type: 'toggle-pin'; id: string }
  | { type: 'set-rail'; collapsed: boolean }
  | { type: 'toggle-inspector' }
  | { type: 'set-inspector-width'; width: number }
  | { type: 'toggle-status-footer' }
  | { type: 'set-split-secondary'; id: string | null }
  | { type: 'set-split-orientation'; orientation: 'horizontal' | 'vertical' }
  | { type: 'set-split-ratio'; ratio: number };

const STORAGE_KEY = 'karen-workspace-v1';
const LEGACY_KEY = 'karen-pane-width';

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** The old only-persisted preference becomes the initial split ratio. */
function readLegacyRatio(): number {
  if (typeof window === 'undefined') return 50;
  return clamp(window.localStorage.getItem(LEGACY_KEY), 25, 75, 50);
}

export function createHubTab(): WorkspaceTab {
  return { id: 'hub', kind: 'hub', title: 'Hub', pinned: true };
}

export function defaultState(): WorkspaceState {
  return {
    version: 1,
    openTabs: [createHubTab()],
    activeTabId: 'hub',
    split: { orientation: 'horizontal', ratio: readLegacyRatio(), secondaryTabId: null },
    railCollapsed: false,
    inspectorOpen: false,
    inspectorWidth: 320,
    statusFooterOpen: false,
  };
}

function isTab(value: unknown): value is WorkspaceTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Partial<WorkspaceTab>;
  return (
    typeof tab.id === 'string' &&
    typeof tab.kind === 'string' &&
    typeof tab.title === 'string'
  );
}

export function loadState(): WorkspaceState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<WorkspaceState> & { version?: number };
    if (parsed.version !== 1 || !Array.isArray(parsed.openTabs)) return defaultState();
    const openTabs = parsed.openTabs.filter(isTab);
    if (openTabs.length === 0) return defaultState();
    const activeTabId =
      typeof parsed.activeTabId === 'string' && openTabs.some((t) => t.id === parsed.activeTabId)
        ? parsed.activeTabId
        : (openTabs[0]?.id ?? null);
    const split = parsed.split;
    return {
      version: 1,
      openTabs,
      activeTabId,
      split: {
        orientation: split?.orientation === 'vertical' ? 'vertical' : 'horizontal',
        ratio: clamp(split?.ratio, 25, 75, readLegacyRatio()),
        secondaryTabId:
          typeof split?.secondaryTabId === 'string' &&
          openTabs.some((tab) => tab.id === split?.secondaryTabId)
            ? (split?.secondaryTabId ?? null)
            : null,
      },
      railCollapsed: Boolean(parsed.railCollapsed),
      inspectorOpen: Boolean(parsed.inspectorOpen),
      inspectorWidth: clamp(parsed.inspectorWidth, 220, 480, 320),
      statusFooterOpen: Boolean(parsed.statusFooterOpen),
    };
  } catch {
    return defaultState();
  }
}

/** Writes the new state and keeps the legacy key alive for one release. */
export function persistState(state: WorkspaceState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.setItem(LEGACY_KEY, String(Math.round(state.split.ratio)));
  } catch {
    // Storage can be disabled or full — the workspace still works in memory.
  }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'open-tab': {
      const existing = state.openTabs.find(
        (t) => t.kind === action.tab.kind && t.payload === action.tab.payload
      );
      if (existing) return { ...state, activeTabId: existing.id };
      return {
        ...state,
        openTabs: [...state.openTabs, action.tab],
        activeTabId: action.tab.id,
      };
    }
    case 'focus-tab':
      return state.openTabs.some((t) => t.id === action.id)
        ? { ...state, activeTabId: action.id }
        : state;
    case 'close-tab': {
      const index = state.openTabs.findIndex((t) => t.id === action.id);
      if (index < 0) return state;
      const openTabs = state.openTabs.filter((t) => t.id !== action.id);
      const activeTabId =
        state.activeTabId === action.id
          ? (openTabs[Math.min(index, openTabs.length - 1)]?.id ?? null)
          : state.activeTabId;
      return {
        ...state,
        openTabs,
        activeTabId,
        split: {
          ...state.split,
          secondaryTabId:
            state.split.secondaryTabId === action.id || state.split.secondaryTabId === activeTabId
              ? null
              : state.split.secondaryTabId,
        },
      };
    }
    case 'move-tab': {
      if (action.from === action.to) return state;
      const openTabs = [...state.openTabs];
      if (action.from < 0 || action.from >= openTabs.length) return state;
      if (action.to < 0 || action.to >= openTabs.length) return state;
      const [moved] = openTabs.splice(action.from, 1);
      if (!moved) return state;
      openTabs.splice(action.to, 0, moved);
      return { ...state, openTabs };
    }
    case 'toggle-pin':
      return {
        ...state,
        openTabs: state.openTabs.map((t) =>
          t.id === action.id ? { ...t, pinned: !t.pinned } : t
        ),
      };
    case 'set-rail':
      return { ...state, railCollapsed: action.collapsed };
    case 'toggle-inspector':
      return { ...state, inspectorOpen: !state.inspectorOpen };
    case 'set-inspector-width':
      return { ...state, inspectorWidth: clamp(action.width, 220, 480, 320) };
    case 'toggle-status-footer':
      return { ...state, statusFooterOpen: !state.statusFooterOpen };
    case 'set-split-secondary':
      return {
        ...state,
        split: { ...state.split, secondaryTabId: action.id },
      };
    case 'set-split-orientation':
      return {
        ...state,
        split: { ...state.split, orientation: action.orientation },
      };
    case 'set-split-ratio':
      return {
        ...state,
        split: { ...state.split, ratio: clamp(action.ratio, 25, 75, 50) },
      };
    default:
      return state;
  }
}

/**
 * Participant in-app Back: History API stack so Android Back / iOS edge-swipe
 * close overlays instead of leaving the SPA.
 *
 * Admin/test routes must not install this (App.tsx only).
 */

export const BINPC_NAV_KEY = 'binpcNav';

export type NavClose = () => void;
export type NavLayer = { id: string; close: NavClose };

export type HistoryLike = {
  state: unknown;
  pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  back: () => void;
  go: (delta: number) => void;
};

export type ParticipantNavOptions = {
  history?: HistoryLike;
  getPathname?: () => string;
  basePath?: string;
};

export type PopResult = 'closed-layer' | 'trapped-root' | 'ignored';

function currentHref(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function isParticipantAppPath(pathname: string, basePath = ''): boolean {
  const base = basePath.replace(/\/$/, '');
  const path = (base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname) || '/';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return !normalized.startsWith('/admin') && !normalized.startsWith('/test');
}

export function createParticipantNav(opts: ParticipantNavOptions = {}) {
  const history = opts.history ?? (typeof window !== 'undefined' ? window.history : null);
  const getPathname = opts.getPathname ?? (() => (typeof window !== 'undefined' ? window.location.pathname : '/'));
  const basePath = opts.basePath ?? (typeof import.meta !== 'undefined' ? String(import.meta.env?.BASE_URL ?? '').replace(/\/$/, '') : '');

  const layers: NavLayer[] = [];
  let ignorePops = 0;
  let disposed = false;
  let installed = false;

  function href(): string {
    return currentHref();
  }

  function silentGo(delta: number) {
    if (!history || delta === 0) return;
    ignorePops += 1;
    history.go(delta);
  }

  const api = {
    depth: () => layers.length,
    topId: () => layers.at(-1)?.id ?? null,
    has: (id: string) => layers.some(l => l.id === id),
    layers: () => layers.map(l => l.id),

    install() {
      if (!history || disposed || installed) return;
      const mark = { [BINPC_NAV_KEY]: 'root' };
      history.replaceState({ ...(typeof history.state === 'object' && history.state ? history.state : {}), ...mark }, '', href());
      history.pushState({ [BINPC_NAV_KEY]: 'home' }, '', href());
      installed = true;
    },

    dispose() {
      disposed = true;
      layers.length = 0;
    },

    push(id: string, close: NavClose) {
      if (disposed || !history) return;
      const existing = layers.find(l => l.id === id);
      if (existing) {
        existing.close = close;
        return;
      }
      layers.push({ id, close });
      history.pushState({ [BINPC_NAV_KEY]: id }, '', href());
    },

    replaceTop(id: string, close: NavClose) {
      if (disposed || !history) return;
      if (layers.length === 0) {
        api.push(id, close);
        return;
      }
      layers[layers.length - 1] = { id, close };
    },

    /** UI dismissed this layer; sync History without running close(). */
    notifyClosed(id: string) {
      api.dropMatching([id]);
    },

    dropMatching(ids: string[]) {
      if (disposed || !history || ids.length === 0) return;
      const set = new Set(ids);
      let fromTop = 0;
      while (layers.length && set.has(layers[layers.length - 1].id)) {
        layers.pop();
        fromTop += 1;
      }
      for (let i = layers.length - 1; i >= 0; i--) {
        if (set.has(layers[i].id)) layers.splice(i, 1);
      }
      if (fromTop > 0) silentGo(-fromTop);
    },

    requestBack() {
      if (disposed || !history) return;
      if (layers.length > 0) history.back();
    },

    handlePopState(): PopResult {
      if (disposed) return 'ignored';
      if (ignorePops > 0) {
        ignorePops -= 1;
        return 'ignored';
      }
      if (layers.length > 0) {
        const layer = layers.pop()!;
        try { layer.close(); } catch { /* overlay close must not break Back */ }
        return 'closed-layer';
      }
      if (!isParticipantAppPath(getPathname(), basePath)) return 'ignored';
      if (!history || !installed) return 'ignored';
      history.pushState({ [BINPC_NAV_KEY]: 'home' }, '', href());
      return 'trapped-root';
    },
  };

  return api;
}

export type ParticipantNavController = ReturnType<typeof createParticipantNav>;

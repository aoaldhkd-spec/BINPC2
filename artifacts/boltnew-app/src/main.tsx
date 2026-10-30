import { BossAccessBoundary } from "./components/BossAccessBoundary";
// @refresh reset
import { StrictMode, useState, useEffect, lazy, Suspense, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { SeasonalSkin } from './themes/SeasonalSkin';
import { applyDisplayScale } from './lib/display-scale';
import { clearLegacyThemeArtifacts } from './lib/theme';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { TestGate } from './components/TestGate';
import { clientNavigationHref, resolveClientNavigation } from './lib/client-navigation';
import { refreshSseAccessScope } from './lib/localdb';

const loadParticipantApp = () => import('./App');
const App = lazy(loadParticipantApp);
const loadUnsubscribePage = () => import('./event-hub/NotificationReadiness').then(m=>({default:m.UnsubscribePage}));
const UnsubscribePage = lazy(loadUnsubscribePage);
const loadEventHubPage = () => import('./event-hub/EventHubPage');
const EventHubPage = lazy(loadEventHubPage);

const loadAdminApp = () => import('./AdminApp');
const AdminApp = lazy(loadAdminApp);

// Fetch only static route code while the independent server access check runs.
// The page still mounts inside BossAccessBoundary; no state API runs here.
const initialPath = window.location.pathname.slice(import.meta.env.BASE_URL.replace(/\/$/, '').length) || '/';
const initialCode = initialPath.startsWith('/admin') ? loadAdminApp
  : initialPath.startsWith('/events/unsubscribe') ? loadUnsubscribePage
  : initialPath.startsWith('/events') ? loadEventHubPage
  : initialPath.startsWith('/test') ? null : loadParticipantApp;
if (initialCode) void initialCode().catch(() => {});

clearLegacyThemeArtifacts();
applyDisplayScale();

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sw.js?v=20261029-boss-gate`;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL as string }).catch(() => {});
  });
}

// ─── 라우팅 ───────────────────────────────────────────────────────────────────
function Root() {
  const [path, setPath] = useState(window.location.pathname);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  useEffect(() => {
    const syncPath = () => {
      refreshSseAccessScope();
      startTransition(() => setPath(window.location.pathname));
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;

      if (anchor.classList.contains("ui-skip-link") && anchor.getAttribute("href") === "#root") {
        event.preventDefault();
        document.getElementById("root")?.focus({ preventScroll: true });
        return;
      }

      const next = resolveClientNavigation(anchor.href, window.location.href, base);
      if (!next) return;

      event.preventDefault();
      const href = clientNavigationHref(next);
      if (href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.pushState({}, '', href);
      }
      syncPath();
      window.scrollTo(0, 0);
    };
    // Download route code on mouse, keyboard or touch intent. This never reads
    // personal state or skips BossAccessBoundary/server authorization.
    const onRouteIntent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      const next = resolveClientNavigation(anchor.href, window.location.href, base);
      if (next?.pathname.startsWith(`${base}/admin`)) void loadAdminApp().catch(() => {});
      else if (next?.pathname.startsWith(`${base}/events`) && !next.pathname.startsWith(`${base}/events/unsubscribe`))
        void loadEventHubPage().catch(() => {});
    };

    const onPop = () => syncPath();
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onRouteIntent, { passive: true });
    document.addEventListener('pointerdown', onRouteIntent, { passive: true });
    document.addEventListener('focusin', onRouteIntent);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onRouteIntent);
      document.removeEventListener('pointerdown', onRouteIntent);
      document.removeEventListener('focusin', onRouteIntent);
    };
  }, [base]);

  const normalized = path.replace(new RegExp(`^${base}`), '') || '/';

  if (normalized.startsWith('/admin')) return <AppErrorBoundary variant="app" onReset={() => window.location.reload()}><AdminApp /></AppErrorBoundary>;
  if (normalized.startsWith('/test')) return <TestGate />;
  if (normalized.startsWith('/events/unsubscribe')) return <UnsubscribePage />;
  if (normalized.startsWith('/events')) return <EventHubPage path={normalized} />;
  return <AppErrorBoundary variant="app" onReset={() => window.location.reload()}><App /></AppErrorBoundary>;
}

// HMR 환경에서 createRoot()를 같은 컨테이너에 두 번 호출하면 "Maximum update depth" 오류가 발생.
// 이미 생성된 root를 재사용하여 이중 마운트 방지.
const rootEl = document.getElementById('root')!;
const existingRoot = (rootEl as unknown as { __reactRoot?: ReturnType<typeof createRoot> }).__reactRoot;
const appRoot = existingRoot ?? createRoot(rootEl);
if (!existingRoot) {
  (rootEl as unknown as { __reactRoot: ReturnType<typeof createRoot> }).__reactRoot = appRoot;
}
appRoot.render(
  <StrictMode>
        <AppErrorBoundary variant="app" onReset={() => window.location.reload()}>
      <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
          {import.meta.env.VITE_PRIVATE_PREVIEW === "1" && <div role="status" className="bg-amber-100 text-amber-950 px-3 py-2 text-center text-sm font-bold">비공개 실앱 시험 · 가상 정보만 입력 · 실제 입금/외부 발송 없음</div>}
          <BossAccessBoundary><SeasonalSkin><Root /></SeasonalSkin></BossAccessBoundary>
        </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
);

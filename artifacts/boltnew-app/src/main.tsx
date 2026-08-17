// @refresh reset
import { StrictMode, useState, useEffect, lazy, Suspense, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './lib/theme';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { TestGate } from './components/TestGate';
import { clientNavigationHref, resolveClientNavigation } from './lib/client-navigation';

const loadAdminApp = () => import('./AdminApp');
const AdminApp = lazy(loadAdminApp);

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sw.js?v=20260816-pw-dim`;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL as string }).catch(() => {});
  });
}

// ─── 라우팅 ───────────────────────────────────────────────────────────────────
function Root() {
  const [path, setPath] = useState(window.location.pathname);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  useEffect(() => {
    const syncPath = () => startTransition(() => setPath(window.location.pathname));
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
    const onPointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      const next = resolveClientNavigation(anchor.href, window.location.href, base);
      if (next?.pathname.startsWith(`${base}/admin`)) void loadAdminApp();
    };

    const onPop = () => syncPath();
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onPointerOver);
    };
  }, [base]);

  const normalized = path.replace(new RegExp(`^${base}`), '') || '/';

  if (normalized.startsWith('/admin')) return <AppErrorBoundary variant="app" onReset={() => window.location.reload()}><AdminApp /></AppErrorBoundary>;
  if (normalized.startsWith('/test'))  return <TestGate />;
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
    {/* ThemeProvider/ThemeSwitcher를 AppErrorBoundary 안으로 이동 —
        테마 렌더 오류가 전역 ErrorBoundary 밖으로 새어 나가는 것을 방지 */}
    <AppErrorBoundary variant="app" onReset={() => window.location.reload()}>
      <ThemeProvider>
        <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
          <Root />
        </Suspense>
        <ThemeSwitcher />
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

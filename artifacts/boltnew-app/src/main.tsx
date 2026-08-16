// @refresh reset
import { StrictMode, useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './lib/theme';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { TestGate } from './components/TestGate';

const AdminApp = lazy(() => import('./AdminApp'));

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sw.js?v=20260816-pw-dim`;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL as string }).catch(() => {});
  });
}

// ─── 라우팅 ───────────────────────────────────────────────────────────────────
function Root() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
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

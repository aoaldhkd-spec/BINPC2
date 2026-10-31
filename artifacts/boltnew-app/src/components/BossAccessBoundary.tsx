import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LoginScreen } from '../admin/LoginScreen';
import { setBossSseTicket } from '../lib/boss-access-client';

type Status = { locked: boolean; authorized: boolean; sseTicket?: string; heartnowPublic?: boolean };
const BossTestContext = createContext(false);
const HeartNowContext = createContext(false);
export const useHeartNowPublicAccess = () => useContext(HeartNowContext);
export const useBossTestAccess = () => useContext(BossTestContext);
export function BossAccessBoundary({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener('app-route-changed', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('app-route-changed', sync);
    };
  }, []);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const legacyHome = path === base + '/' || path === base + '/index.html';
  useEffect(() => {
    if (legacyHome) setBossSseTicket('');
  }, [legacyHome]);
  // The ordinary app has its own profile/session authentication. It must not
  // wait for, poll, or lose its draft to the owner-only event/admin gate.
  // Server-side route and per-user guards remain authoritative.
  if (legacyHome) return <HeartNowContext.Provider value={true}><BossTestContext.Provider value={false}><div data-boss-access="heartnow-public">{children}</div></BossTestContext.Provider></HeartNowContext.Provider>;
  return <ProtectedBossAccessBoundary>{children}</ProtectedBossAccessBoundary>;
}

function ProtectedBossAccessBoundary({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null), [failed, setFailed] = useState(false), [login, setLogin] = useState(false);
  const request = useRef(0);
  const [mayMount, setMayMount] = useState(false);
  const check = useCallback(async () => {
    const current = ++request.current;
    try {
      const response = await fetch('/api/boss-access', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error('Access unavailable');
      const next: Status = await response.json();
      if (typeof next.locked !== 'boolean' || typeof next.authorized !== 'boolean') throw Error('Incomplete access response');
      if (current !== request.current) return;
      setBossSseTicket(next.authorized ? next.sseTicket ?? '' : '');
      setStatus(next); setMayMount(!next.locked || next.authorized || next.heartnowPublic === true); setFailed(false);
    } catch {
      if (current === request.current) { setFailed(true); setStatus(null); setBossSseTicket(''); }
    }
  }, []);
  useEffect(() => {
    void check();
    const refresh = () => { setStatus(null); void check(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const interval = setInterval(() => { void check(); }, 60000);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('boss-access-changed', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { request.current++; clearInterval(interval); window.removeEventListener('pageshow', refresh); window.removeEventListener('online', refresh); window.removeEventListener('boss-access-changed', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [check]);
  const denied = !!status && status.locked && !status.authorized;
  const overlay = !status ? <main className="brand-auth-screen min-h-screen bg-slate-950 text-white grid place-items-center p-6"><div role="status"><p>{failed ? '접근 권한을 확인하지 못했습니다.' : '접근 권한 확인 중…'}</p><button className="mt-4 rounded-xl border px-5 py-3" onClick={() => void check()}>다시 확인</button></div></main>
    : denied ? login
      ? <LoginScreen bossOnly onLogin={() => { setLogin(false); void check(); }} />
      : <main className="brand-auth-screen min-h-screen bg-slate-950 text-white grid place-items-center p-6 text-center"><div className="max-w-md"><h1 className="text-2xl font-bold">현재 테스트 중입니다</h1><button className="mt-8 rounded-xl border border-slate-600 px-5 py-3" onClick={() => setLogin(true)}>운영자 로그인</button></div></main>
    : null;
  // A transient access lookup must hide, not destroy, the already mounted profile/chat draft.
  // A confirmed unauthenticated result unmounts service screens; saved records stay untouched.
  return <HeartNowContext.Provider value={false}><BossTestContext.Provider value={status?.locked === true && status.authorized === true}>{overlay}<div hidden={!!overlay} data-boss-access={status?.authorized ? 'authorized' : 'locked'}>{mayMount && !denied && children}</div></BossTestContext.Provider></HeartNowContext.Provider>;
}

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LoginScreen } from '../admin/LoginScreen';
import { setBossSseTicket, logoutBossAccess } from '../lib/boss-access-client';

type Status = { locked: boolean; authorized: boolean; sseTicket?: string };
const BossTestContext = createContext(false);
export const useBossTestAccess = () => useContext(BossTestContext);
export function BossAccessBoundary({ children }: { children: ReactNode }) {
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
      setStatus(next); setMayMount(!next.locked || next.authorized); setFailed(false);
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
  const overlay = !status ? <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6"><div role="status"><p>{failed ? '접근 권한을 확인하지 못했습니다.' : '접근 권한 확인 중…'}</p><button className="mt-4 rounded-xl border px-5 py-3" onClick={() => void check()}>다시 확인</button></div></main>
    : status.locked && !status.authorized ? login
      ? <LoginScreen bossOnly onLogin={() => { setLogin(false); void check(); }} />
      : <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6 text-center"><div className="max-w-md"><h1 className="text-2xl font-bold">현재 테스트 중입니다</h1><p className="mt-4 leading-7">더 안정적인 이용을 위해 점검하고 있습니다.<br />테스트 완료 후 신청이 열립니다.</p><button className="mt-8 rounded-xl border border-slate-600 px-5 py-3" onClick={() => setLogin(true)}>운영자 로그인</button></div></main>
    : null;
  // A transient access lookup must hide, not destroy, the already mounted profile/chat draft.
  // A confirmed unauthenticated result unmounts service screens; saved records stay untouched.
  return <BossTestContext.Provider value={status?.locked === true && status.authorized === true}>{overlay}<div hidden={!!overlay}>{mayMount && <>
    {status?.locked && <div className="bg-slate-900 text-white text-sm flex flex-wrap items-center justify-center gap-3 px-3 py-2"><span>보스 테스트 중 · 일반 이용은 잠겨 있습니다</span><a className="underline" href="/admin">관리자</a><button className="underline" onClick={() => void logoutBossAccess().then(check).catch(() => setFailed(true))}>테스트 로그아웃</button>{failed && <span role="alert">로그아웃을 확인하지 못했습니다. 다시 시도해 주세요.</span>}</div>}
    {status?.locked && status.authorized && <nav className="bg-slate-900 px-3 pb-2 text-center text-sm text-white"><a className="underline" href="/events">일반 화면에서 신청·입장</a></nav>}
    {children}
  </>}</div></BossTestContext.Provider>;
}

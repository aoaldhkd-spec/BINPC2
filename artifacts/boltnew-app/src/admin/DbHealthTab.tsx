import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  Shield, LogOut, Trash2, Users,
  LayoutGrid, X, AlertTriangle, ChevronDown,
  Heart, MessageCircle, Send, CheckCircle, BellRing, Eye, EyeOff,
  PlayCircle, StopCircle, Timer, RefreshCw, Sparkles,
  Lock, Unlock, Search, Database as DatabaseIcon, Activity,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getPositionLabel, getDomSubLabel, getKoreanAge } from '../lib/profile';
import { HEART_TYPE_META } from '../lib/constants';
import {
  withAdminImageToken, setAdminToken, loadAdminSession, getAdminPassword, refreshAdminToken,
  adminApiRpc, patchAdminSettings, adminApiSelect, adminApiOp, adminSupabase,
  ADMIN_TOKEN_KEY, ADMIN_PW_KEY, ADMIN_SESSION_KEY, ADMIN_API, MAX_ADMIN_MESSAGES,
  type Profile, type AppSettings, type SessionHistory, type Like, type Chat, type Message, type AnonymousReport, type DbHealthData, type AdminSession,
} from './shared';


// ─── DB Health Tab ────────────────────────────────────────────────────────────
export function DbHealthTab({ health, loading, onRefresh, onClearErrors }: { health: DbHealthData | null; loading: boolean; onRefresh: () => void; onClearErrors?: () => Promise<void> }) {
  const hasErrors = (health?.persistErrors ?? 0) > 0;
  const dbUnavailable = health?.db.messages === -1;
  const [clearing, setClearing] = useState(false);

  const CountBox = ({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) => (
    <div className={`rounded-xl border p-3 flex flex-col gap-0.5 ${warn ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-black tabular-nums ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-bold text-gray-700">DB 헬스 모니터</h2>
          {hasErrors && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
              오류 {health!.persistErrors}건
            </span>
          )}
          {!hasErrors && health && (
            <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded-full">정상</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* Error alert banner */}
      {hasErrors && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">DB 저장 오류 감지</p>
            <p className="text-xs text-red-600 mt-0.5">
              {health!.persistErrors}건의 DB 저장 실패가 누적되어 있습니다.
              In-memory 데이터와 PostgreSQL 간 불일치가 발생했을 수 있습니다.
            </p>
          </div>
          {onClearErrors && (
            <button
              onClick={async () => { setClearing(true); await onClearErrors(); setClearing(false); }}
              disabled={clearing}
              className="flex-shrink-0 px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50"
            >
              {clearing ? '초기화 중…' : '초기화'}
            </button>
          )}
        </div>
      )}

      {/* PIN Pool utilization */}
      {health && (() => {
        const { remaining, total } = health.pinPool ?? { remaining: null, total: null };
        if (remaining == null || total == null) return null;
        const used = total - remaining;
        const pct = Math.round((used / total) * 100);
        const isWarn = pct >= 85;
        const barColor = pct >= 95 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-400' : 'bg-teal-400';
        return (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">PIN 풀 사용량</p>
            {isWarn && (
              <div className="mb-2 bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-700">PIN 풀 {pct}% 소진 — 즉시 조치 필요</p>
                  <p className="text-xs text-amber-600 mt-0.5">잔여 PIN: {remaining.toLocaleString()}개 / {total.toLocaleString()}개. 새 참가자 등록이 곧 불가능해집니다.</p>
                </div>
              </div>
            )}
            <div className="rounded-xl border bg-white border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>사용 {used.toLocaleString()} / {total.toLocaleString()}개</span>
                <span className={`font-bold ${isWarn ? 'text-amber-600' : 'text-teal-600'}`}>{pct}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-gray-400">잔여: {remaining.toLocaleString()}개</p>
            </div>
          </div>
        );
      })()}

      {/* Last 5-min comparison */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">최근 5분 활동 (in-memory vs DB)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-white border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-teal-500" />
              <span className="text-xs font-semibold text-gray-600">채팅 메시지</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-center">
                <div className="text-xl font-black text-gray-800 tabular-nums">{health?.inMemory.messages ?? '—'}</div>
                <div className="text-[9px] text-gray-400">메모리</div>
              </div>
              <div className="text-gray-300 text-sm mb-0.5">vs</div>
              <div className="text-center">
                <div className={`text-xl font-black tabular-nums ${dbUnavailable ? 'text-gray-400' : 'text-gray-800'}`}>
                  {dbUnavailable ? '—' : (health?.db.messages ?? '—')}
                </div>
                <div className="text-[9px] text-gray-400">DB</div>
              </div>
              {!dbUnavailable && health && health.inMemory.messages !== health.db.messages && (
                <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                  불일치
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-semibold text-gray-600">하트</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-center">
                <div className="text-xl font-black text-gray-800 tabular-nums">{health?.inMemory.likes ?? '—'}</div>
                <div className="text-[9px] text-gray-400">메모리</div>
              </div>
              <div className="text-gray-300 text-sm mb-0.5">vs</div>
              <div className="text-center">
                <div className={`text-xl font-black tabular-nums ${dbUnavailable ? 'text-gray-400' : 'text-gray-800'}`}>
                  {dbUnavailable ? '—' : (health?.db.likes ?? '—')}
                </div>
                <div className="text-[9px] text-gray-400">DB</div>
              </div>
              {!dbUnavailable && health && health.inMemory.likes !== health.db.likes && (
                <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                  불일치
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <CountBox
          label="누적 오류"
          value={health?.persistErrors ?? '—'}
          sub="DB에 영구 저장됨"
          warn={hasErrors}
        />
        <CountBox
          label="SSE 연결"
          value={health?.sseConnections ?? '—'}
          sub="현재 연결된 클라이언트"
        />
        <CountBox
          label="DB 상태"
          value={dbUnavailable ? '오류' : '정상'}
          sub={dbUnavailable ? 'DB 쿼리 실패' : '쿼리 성공'}
          warn={dbUnavailable}
        />
      </div>

      {/* Recent error log */}
      {hasErrors && health!.recentErrors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">최근 오류 로그 (최대 10건)</p>
          <div className="rounded-xl border border-red-200 bg-red-50 divide-y divide-red-100 overflow-hidden">
            {health!.recentErrors.map((e, i) => (
              <div key={i} className="px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{e.table}</span>
                  <span className="text-[10px] text-gray-400">{new Date(e.time).toLocaleTimeString('ko-KR')}</span>
                </div>
                <p className="text-[10px] text-red-600 break-all">{e.msg}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {health && (
        <p className="text-[10px] text-gray-400 text-center flex items-center justify-center gap-1">
          <Activity className="w-3 h-3" />
          마지막 확인: {new Date(health.checkedAt).toLocaleTimeString('ko-KR')} · 30초마다 자동 갱신
        </p>
      )}
      {!health && !loading && (
        <p className="text-sm text-gray-400 text-center py-4">데이터를 불러오지 못했습니다. 새로고침을 눌러주세요.</p>
      )}
    </div>
  );
}


// ─── Dashboard Tab ────────────────────────────────────────────────────────────

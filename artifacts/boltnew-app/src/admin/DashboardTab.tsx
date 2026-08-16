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
  type Profile, type AppSettings, type SessionHistory, type Like, type Chat, type Message, type Suggestion, type AnonymousReport, type DbHealthData, type AdminSession,
} from './shared';
import { ConfirmDialog } from './ConfirmDialog';

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

export function DashboardTab({ settings, profiles, onToggleSession, onEventEndReset, onToggleFunctionsLock,
  onClearLikes, onClearChats, onClearProfiles, onClearHistory,
  restoreMap }: {
  settings: AppSettings | null; profiles: Profile[];
  onToggleSession: () => void; onEventEndReset: () => void;
  onToggleFunctionsLock: () => void;
  onClearLikes: () => Promise<void>;
  onClearChats: () => Promise<void>;
  onClearProfiles: () => Promise<void>;
  onClearHistory: () => Promise<void>;
  restoreMap: Map<string, () => Promise<void>>;
}) {
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [confirmEventEnd, setConfirmEventEnd] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const isActive = settings?.session_active ?? false;
  const isFunctionsLocked = (settings as any)?.functions_locked ?? false;

  return (
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '참여자', value: profiles.length, color: 'bg-cyan-50 text-cyan-700' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.color} rounded-2xl p-5 text-center`}>
            <div className="text-2xl font-black">{stat.value}</div>
            <div className="text-xs font-semibold mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Session control */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">회식 세션</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => !isActive && setConfirmToggle(true)}
            disabled={isActive}
            className={`rounded-2xl p-4 border-2 flex flex-col items-center gap-2 transition-all ${
              !isActive
                ? 'bg-teal-50 border-teal-300 hover:bg-teal-100 active:scale-95 cursor-pointer shadow-sm'
                : 'bg-slate-50 border-slate-200 opacity-35 cursor-not-allowed'
            }`}
          >
            <PlayCircle className={`w-7 h-7 ${!isActive ? 'text-teal-500' : 'text-slate-400'}`} />
            <span className={`text-sm font-black ${!isActive ? 'text-teal-700' : 'text-slate-400'}`}>회식 시작</span>
            <span className={`text-[10px] font-medium ${!isActive ? 'text-teal-500' : 'text-slate-400'}`}>
              {isActive ? '진행 중' : '클릭하여 세션 열기'}
            </span>
          </button>
          <button
            onClick={() => isActive && setConfirmToggle(true)}
            disabled={!isActive}
            className={`rounded-2xl p-4 border-2 flex flex-col items-center gap-2 transition-all ${
              isActive
                ? 'bg-red-50 border-red-300 hover:bg-red-100 active:scale-95 cursor-pointer shadow-sm'
                : 'bg-slate-50 border-slate-200 opacity-35 cursor-not-allowed'
            }`}
          >
            <StopCircle className={`w-7 h-7 ${isActive ? 'text-red-500' : 'text-slate-400'}`} />
            <span className={`text-sm font-black ${isActive ? 'text-red-700' : 'text-slate-400'}`}>회식 종료</span>
            <span className={`text-[10px] font-medium ${isActive ? 'text-red-500' : 'text-slate-400'}`}>
              {isActive ? '클릭하여 세션 닫기' : '대기 중'}
            </span>
          </button>
        </div>
      </div>

      {/* 잠금 제어 */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">잠금 제어</h3>
        <div className="space-y-2">
          {/* 기능 잠금 (functions_locked) */}
          <button
            onClick={onToggleFunctionsLock}
            className={`w-full rounded-2xl p-4 border-2 flex items-center gap-3 transition-all active:scale-[0.98] shadow-sm ${
              isFunctionsLocked ? 'bg-red-50 border-red-300 hover:bg-red-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isFunctionsLocked ? 'bg-red-500' : 'bg-slate-400'}`}>
              {isFunctionsLocked ? <Lock className="w-5 h-5 text-white" /> : <Unlock className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 text-left">
              <p className={`font-black text-sm ${isFunctionsLocked ? 'text-red-700' : 'text-slate-700'}`}>
                {isFunctionsLocked ? '🔒 채팅·기능 잠금 중' : '💬 채팅·기능 열려있음'}
              </p>
              <p className={`text-[10px] mt-0.5 ${isFunctionsLocked ? 'text-red-500' : 'text-slate-400'}`}>
                {isFunctionsLocked ? '하트·채팅·시그널·단톡·운세 사용 불가 — 통계·랭킹은 그대로 — 탭하여 해제' : '하트·채팅·시그널·단톡·운세 잠금 가능 — 통계·랭킹은 항상 열림 — 탭하여 잠금'}
              </p>
            </div>
            <div className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0 ${isFunctionsLocked ? 'bg-red-500' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isFunctionsLocked ? 'left-4' : 'left-0.5'}`} />
            </div>
          </button>
        </div>
      </div>

      {/* 데이터 초기화 */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">데이터 초기화 / 복구</h3>
        <div className="space-y-2.5">
          {([
            { key: 'likes', emoji: '❤️', label: '하트', desc: '모든 하트 기록 삭제', bg: 'bg-pink-50 border-pink-200 hover:bg-pink-100', title: '하트 초기화', msg: '모든 하트(좋아요) 기록을 삭제합니다.', fn: onClearLikes },
            { key: 'chats', emoji: '💬', label: '채팅', desc: '채팅·메시지 전체 삭제', bg: 'bg-teal-50 border-teal-200 hover:bg-teal-100', title: '채팅 초기화', msg: '모든 채팅방과 메시지를 삭제합니다.', fn: onClearChats },
            { key: 'profiles', emoji: '👤', label: '참여자', desc: '모든 프로필 삭제', bg: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100', title: '참여자 초기화', msg: '모든 참여자 프로필을 삭제합니다.', fn: onClearProfiles },
            { key: 'history', emoji: '📋', label: '이력', desc: '회식 이력 모두 삭제', bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100', title: '이력 초기화', msg: '저장된 회식 이력을 모두 삭제합니다.', fn: onClearHistory },
          ] as const).map(item => {
            const hasRestore = restoreMap.has(item.key);
            return (
              <div key={item.label} className="flex gap-1.5">
                <button
                  onClick={() => setConfirmAction({ title: item.title, message: item.msg, onConfirm: item.fn })}
                  className={`flex-1 rounded-2xl px-3 py-2.5 border-2 flex items-center gap-2.5 transition-all active:scale-[0.97] text-left ${item.bg}`}
                >
                  <span className="text-lg leading-none flex-shrink-0">{item.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-800 leading-tight">{item.label} 초기화</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{item.desc}</p>
                  </div>
                </button>
                <button
                  onClick={() => hasRestore && restoreMap.get(item.key)!()}
                  disabled={!hasRestore}
                  className={`flex-shrink-0 w-14 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all text-center ${
                    hasRestore
                      ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100 active:scale-95 cursor-pointer'
                      : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed opacity-50'
                  }`}
                >
                  <span className="text-base leading-none">↩</span>
                  <span className="text-[9px] font-black leading-tight">복구</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 회식 종료 전체 초기화 */}
      <div className="rounded-2xl p-5 border-2 border-red-300 bg-red-50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-black text-red-600 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">위험</span>
              <h3 className="font-bold text-red-900 text-sm">회식 종료 전체 초기화</h3>
            </div>
            <p className="text-xs text-red-600 mt-0.5 font-semibold">참여자·하트·채팅·공지·이력 모두 삭제 — 복구 불가</p>
          </div>
          <button onClick={() => setConfirmEventEnd(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-all border-2 border-red-800">
            <Trash2 className="w-4 h-4" />
            전체 초기화
          </button>
        </div>
      </div>

      {confirmToggle && (
        <ConfirmDialog
          title={isActive ? '회식을 종료하시겠습니까?' : '회식을 시작하시겠습니까?'}
          message={isActive ? '종료 시 모든 유저 화면이 "회식 종료 대기 화면"으로 전환됩니다.' : '시작 시 유저들이 앱에 입장할 수 있습니다.'}
          onConfirm={() => { setConfirmToggle(false); onToggleSession(); }}
          onCancel={() => setConfirmToggle(false)}
        />
      )}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          danger
          onConfirm={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmEventEnd && (
        <ConfirmDialog title="회식 종료 전체 초기화"
          message={`참여자 · 하트 · 채팅 · 공지 · 이력\n모든 데이터를 초기화합니다.\n\n진짜로 전체 초기화하시겠습니까?`}
          danger
          onConfirm={() => { setConfirmEventEnd(false); onEventEndReset(); }}
          onCancel={() => setConfirmEventEnd(false)}
        />
      )}
    </div>
  );
}

// ─── Hearts Tab ───────────────────────────────────────────────────────────────

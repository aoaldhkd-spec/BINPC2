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

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({ title, message, danger, confirmText, onConfirm, onCancel }: {
  title: string; message: string; danger?: boolean; confirmText?: string; onConfirm: () => void; onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = !confirmText || typed === confirmText;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
          <AlertTriangle className={`w-6 h-6 ${danger ? 'text-red-600' : 'text-amber-600'}`} />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        {confirmText && (
          <div>
            <p className="text-xs text-red-600 font-bold mb-1.5 text-center">확인을 위해 <span className="bg-red-100 px-1.5 py-0.5 rounded font-black">{confirmText}</span> 를 입력하세요</p>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={confirmText}
              className="w-full border-2 border-red-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-red-400"
            />
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">취소</button>
          <button onClick={onConfirm} disabled={!canConfirm} className={`flex-1 py-3 font-semibold rounded-xl transition-all text-white ${danger ? 'bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600'}`}>확인</button>
        </div>
      </div>
    </div>
  );
}


import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { AppSettings } from './shared';

// ─── Admin QR Tab ─────────────────────────────────────────────────────────────

export function AdminQrTab({ settings, onSaveQrBase }: { settings: AppSettings | null; onSaveQrBase: (url: string) => Promise<void> }) {
  const normalizeBase = (url: string) => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return 'https://' + trimmed;
  };

  // DB 우선, localStorage 폴백 (기존 설정 마이그레이션용)
  const [customBase, setCustomBase] = useState(() => {
    const dbVal = (settings as Record<string, unknown> | null)?.qr_base_url as string | null | undefined;
    const raw = dbVal ?? localStorage.getItem('qr_base_url') ?? 'https://binpc2.netlify.app';
    const normalized = normalizeBase(raw);
    if (!normalized || /localhost|127\.0\.0\.1/i.test(normalized)) return 'https://binpc2.netlify.app';
    return normalized;
  });
  const [editingBase, setEditingBase] = useState(false);
  const [baseInput, setBaseInput] = useState(customBase);
  const [saving, setSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // settings가 로드되면 DB 값으로 동기화
  useEffect(() => {
    const dbVal = (settings as Record<string, unknown> | null)?.qr_base_url as string | null | undefined;
    if (dbVal) {
      const normalized = normalizeBase(dbVal);
      const safe = !normalized || /localhost|127\.0\.0\.1/i.test(normalized)
        ? 'https://binpc2.netlify.app'
        : normalized;
      setCustomBase(safe);
      setBaseInput(safe);
    }
  }, [settings]);

  const saveBase = async () => {
    let val = baseInput.trim().replace(/\/$/, '');
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      val = 'https://' + val;
    }
    if (val && /localhost|127\.0\.0\.1/i.test(val)) {
      val = 'https://binpc2.netlify.app';
    }
    if (!val) val = 'https://binpc2.netlify.app';
    setCustomBase(val);
    setBaseInput(val);
    localStorage.setItem('qr_base_url', val); // 폴백 백업
    setSaving(true);
    await onSaveQrBase(val);
    setSaving(false);
    setEditingBase(false);
  };

  const getEntryUrl = () => {
    return `${customBase}/`;
  };

  const makeQr = (url: string, size = 160) =>
    `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=${size}x${size}&margin=8`;

  const copyUrl = (url: string) => navigator.clipboard.writeText(url);

  const isDefaultUrl = customBase.includes('localhost') || customBase.includes('127.0.0.1') || !customBase.startsWith('https://');
  const entryUrl = getEntryUrl();

  return (
    <div className="p-4 space-y-6">
      {/* Base URL 설정 */}
      <div className={`rounded-xl border px-4 py-3 ${isDefaultUrl ? 'bg-red-950/40 border-red-500/50' : 'bg-green-950/40 border-green-500/50'}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className={`text-xs font-black ${isDefaultUrl ? 'text-red-400' : 'text-green-400'}`}>
              {isDefaultUrl ? '!! QR 도메인 미설정 — 핸드폰에서 작동 안 됩니다' : 'QR 도메인 설정됨'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 break-all">{customBase}</p>
          </div>
          <button
            onClick={() => { setBaseInput(customBase); setEditingBase(true); }}
            className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
          >수정</button>
        </div>
        {editingBase && (
          <div className="flex gap-2 mt-2">
            <input
              type="url"
              value={baseInput}
              onChange={e => setBaseInput(e.target.value)}
              placeholder="https://your-app.netlify.app"
              className="flex-1 text-xs px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              autoFocus
            />
            <button onClick={saveBase} disabled={saving} className="text-xs font-bold px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-all disabled:opacity-60">{saving ? '저장중…' : '저장'}</button>
            <button onClick={() => setEditingBase(false)} className="text-xs px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all">취소</button>
          </div>
        )}
        {isDefaultUrl && !editingBase && (
          <p className="text-[10px] text-red-400/80 mt-1">
            Netlify 배포 후 받은 주소 (예: https://xxx.netlify.app)를 위 수정 버튼으로 입력해주세요.
          </p>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 font-medium">
        QR 하나로 모든 참가자가 접속합니다. 스캔 즉시 닉네임 설정 또는 메인 화면으로 진입합니다.
      </div>

      {/* 단일 접속 QR */}
      {!isDefaultUrl && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white">
            <p className="font-black text-sm">접속 QR (전체 공용)</p>
            <p className="text-xs text-white/90 mt-0.5">이 QR 하나만 인쇄/전시하면 됩니다</p>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setFullscreen(true)}
                className="flex-shrink-0 p-2 bg-slate-50 rounded-2xl border-2 border-slate-200 hover:border-teal-400 transition-all"
              >
                <img src={makeQr(entryUrl, 320)} alt="접속 QR" className="w-40 h-40 rounded-xl" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-2 leading-relaxed">
                  이 QR을 스캔하면 앱 메인으로 접속합니다.<br />
                  기존 참가자는 즉시 메인 화면, 신규 참가자는 닉네임 설정 화면으로 진입합니다.
                </p>
                <p className="text-[10px] font-mono text-gray-400 break-all bg-gray-50 rounded-lg px-2 py-1 mb-2">{entryUrl}</p>
                <div className="flex gap-2">
                  <button onClick={() => copyUrl(entryUrl)} className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all">링크 복사</button>
                  <button onClick={() => setFullscreen(true)} className="text-xs px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-all">크게 보기</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 패널 QR */}
      {!isDefaultUrl && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
          <p className="text-xs font-black text-slate-300 mb-3">관리자 패널 QR (내 핸드폰용)</p>
          <div className="flex items-center gap-4">
            <img
              src={makeQr(`${customBase}/admin`, 240)}
              alt="admin QR"
              className="w-32 h-32 rounded-xl bg-white p-1"
            />
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 leading-relaxed">이 QR을 스캔하면 관리자 패널로 바로 이동합니다. 처음 접속 시 로그인 1회 필요, 이후 30일간 자동 유지됩니다.</p>
              <button
                onClick={() => copyUrl(`${customBase}/admin`)}
                className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
              >링크 복사</button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen QR */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-gray-900">접속 QR</h3>
              <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white rounded-2xl border-2 border-gray-100 shadow-inner">
                <img src={makeQr(entryUrl, 480)} alt="QR" className="w-80 h-80 rounded-xl" />
              </div>
            </div>
            <div className="mb-3 px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700">
              스캔 즉시 닉네임 설정 또는 메인 화면으로 진입
            </div>
            <button
              onClick={() => copyUrl(entryUrl)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-all"
            >링크 복사</button>
          </div>
        </div>
      )}
    </div>
  );
}


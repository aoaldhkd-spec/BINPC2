import { useState } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function ProfileRecoveryScreen({
  onRecover,
  onBack,
}: {
  onRecover: (profileId: string) => void;
  onBack: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = pin.trim();
    if (trimmed.length !== 4 || !/^\d{4}$/.test(trimmed)) {
      setError('숫자 4자리를 정확히 입력하세요');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('profiles')
        .select('id, nickname, photo_url, mbti')
        .eq('pin_code', trimmed)
        .single();
      if (qErr || !data) {
        setError('해당 번호로 등록된 프로필을 찾을 수 없어요.\n번호를 다시 확인해 주세요.');
      } else {
        onRecover(data.id as string);
      }
    } catch {
      setError('오류가 발생했어요. 잠시 후 다시 시도하세요.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-white font-black text-xl">프로필 복구</h2>
            </div>
            <p className="text-white/80 text-xs">고유번호 4자리로 내 프로필을 되찾아요</p>
          </div>

          <div className="p-5 space-y-4">
            {/* 안내 */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-black text-amber-700">📌 고유번호란?</p>
              <p className="text-[11px] text-amber-600 leading-relaxed">
                기존 기기의 <strong>내 상태 탭</strong>에서 <strong>QR 보기</strong>를 누르면<br />
                프로필 QR 화면에 4자리 숫자가 표시돼요.
              </p>
            </div>

            {/* 핀 입력 */}
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">고유번호 4자리</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(v);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="● ● ● ●"
                className={`w-full text-center text-4xl font-black tracking-[0.6em] py-5 rounded-xl border-2 outline-none transition-all ${
                  error
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : pin.length === 4
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-gray-200 focus:border-amber-400 text-gray-800'
                }`}
                autoFocus
              />
              {error && (
                <p className="text-xs text-red-500 font-medium mt-1.5 whitespace-pre-line">⚠ {error}</p>
              )}
            </div>

            {/* 복구 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={loading || pin.length !== 4}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-sm shadow-amber-200"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  찾는 중...
                </span>
              ) : (
                '내 프로필 복구하기'
              )}
            </button>

            {/* 뒤로 */}
            <button
              onClick={onBack}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-gray-400 text-sm font-medium hover:text-gray-600 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              신규 등록으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

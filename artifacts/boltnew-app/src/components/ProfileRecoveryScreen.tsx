import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function ProfileRecoveryScreen({
  onRecover,
  onBack,
}: {
  onRecover: (profileId: string) => void;
  onBack: () => void;
}) {
  const [digits, setDigits] = useState<[string, string, string, string]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 개별 ref 선언 (배열 리터럴 내 useRef 금지)
  const ref0 = useRef<HTMLInputElement>(null);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);
  const refs = [ref0, ref1, ref2, ref3] as const;

  useEffect(() => { ref0.current?.focus(); }, []);

  const submit = async (code: string) => {
    if (code.length !== 4 || !/^\d{4}$/.test(code)) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('profiles')
        .select('id, nickname, photo_url, mbti')
        .eq('pin_code', code)
        .single();
      if (qErr || !data) {
        setError('해당 번호로 등록된 프로필이 없어요.\n번호를 다시 확인해 주세요.');
        setDigits(['', '', '', '']);
        setTimeout(() => ref0.current?.focus(), 80);
      } else {
        onRecover(data.id as string);
      }
    } catch {
      setError('오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
    }
    setLoading(false);
  };

  const handleChange = (idx: 0 | 1 | 2 | 3, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1);
    setError(null);
    const next: [string, string, string, string] = [...digits] as [string, string, string, string];
    next[idx] = d;
    setDigits(next);
    if (d) {
      if (idx < 3) refs[idx + 1].current?.focus();
      if (idx === 3) setTimeout(() => submit(next.join('')), 60);
    }
  };

  const handleKey = (idx: 0 | 1 | 2 | 3, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs[idx - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const v = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (v.length === 4) {
      setDigits(v.split('') as [string, string, string, string]);
      setError(null);
      setTimeout(() => submit(v), 60);
    }
    e.preventDefault();
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4"
      style={{ touchAction: 'none' }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-white font-black text-xl">프로필 복구</h2>
            </div>
            <p className="text-white/80 text-sm">고유번호 4자리로 내 프로필을 되찾아요</p>
          </div>

          <div className="p-6 space-y-5">
            {/* 안내 */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-black text-amber-700 mb-1">📌 고유번호 위치</p>
              <p className="text-[12px] text-amber-700 leading-relaxed">
                기존 기기 앱 → <strong>내 상태 탭</strong> → 프로필 카드의 <strong>고유번호</strong> 4자리
              </p>
            </div>

            {/* OTP 4칸 */}
            <div>
              <p className="text-sm font-bold text-gray-700 mb-3 text-center">고유번호 4자리 입력</p>
              <div className="flex gap-3 justify-center" onPaste={handlePaste}>
                {([0, 1, 2, 3] as const).map((idx) => (
                  <input
                    key={idx}
                    ref={refs[idx]}
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={1}
                    value={digits[idx]}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKey(idx, e)}
                    disabled={loading}
                    className={[
                      'w-16 h-16 text-center text-3xl font-black rounded-2xl border-2 outline-none transition-all',
                      error ? 'border-red-400 bg-red-50 text-red-600'
                        : digits[idx] ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-gray-200 focus:border-amber-400 bg-gray-50 text-gray-800',
                      'disabled:opacity-40',
                    ].join(' ')}
                  />
                ))}
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-500 rounded-full animate-spin" />
                  <p className="text-sm text-amber-600 font-semibold">프로필 찾는 중…</p>
                </div>
              )}
              {error && (
                <p className="text-xs text-red-500 font-medium mt-3 text-center whitespace-pre-line">⚠ {error}</p>
              )}
            </div>

            {/* 뒤로 */}
            <button
              onClick={onBack}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-gray-400 text-sm font-semibold hover:text-gray-600 transition-all rounded-xl hover:bg-gray-50"
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

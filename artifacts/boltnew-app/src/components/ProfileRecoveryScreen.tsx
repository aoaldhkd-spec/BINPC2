import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';

export function ProfileRecoveryScreen({
  onRecover,
  onBack,
}: {
  onRecover: (profileId: string, pinCode: string) => void;
  onBack: () => void;
}) {
  const [digits, setDigits] = useState<[string, string, string, string]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'pin' | 'confirm'>('pin');
  const [maskedNickname, setMaskedNickname] = useState('');
  const [nickInput, setNickInput] = useState('');
  const [pendingPin, setPendingPin] = useState('');

  const ref0 = useRef<HTMLInputElement>(null);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);
  const refs = [ref0, ref1, ref2, ref3] as const;

  useEffect(() => { ref0.current?.focus(); }, []);

  const submitPin = async (code: string) => {
    if (code.length !== 4 || !/^\d{4}$/.test(code)) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/db/by-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });
      const json = await resp.json() as {
        data: { step?: string; maskedNickname?: string; id?: string } | null;
        error: { message: string } | null;
      };
      if (resp.status === 429) {
        setError(json.error?.message ?? '시도 횟수 초과. 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }
      if (json.error || !json.data) {
        setError(json.error?.message ?? '해당 번호로 등록된 프로필이 없어요.\n번호를 다시 확인해 주세요.');
        setDigits(['', '', '', '']);
        setTimeout(() => ref0.current?.focus(), 80);
        setLoading(false);
        return;
      }
      if (json.data.step === 'confirm') {
        setPendingPin(code);
        setMaskedNickname(json.data.maskedNickname ?? '**');
        setNickInput('');
        setStep('confirm');
        setLoading(false);
        return;
      }
      const profileId = json.data.id;
      if (profileId) {
        onRecover(profileId, code);
      } else {
        setError('프로필을 찾을 수 없어요');
      }
    } catch {
      setError('오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
    }
    setLoading(false);
  };

  const confirmNickname = async () => {
    if (!nickInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/db/by-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pendingPin, nickname: nickInput.trim() }),
      });
      const json = await resp.json() as {
        data: { id?: string } | null;
        error: { message: string } | null;
      };
      if (resp.status === 429) {
        setError(json.error?.message ?? '시도 횟수 초과. 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }
      if (json.error || !json.data?.id) {
        setError(json.error?.message ?? '닉네임이 일치하지 않습니다. 본인 닉네임을 정확히 입력해주세요.');
        setLoading(false);
        return;
      }
      onRecover(json.data.id, pendingPin);
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
      if (idx === 3) setTimeout(() => submitPin(next.join('')), 60);
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
      setTimeout(() => submitPin(v), 60);
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
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-white font-black text-xl">{step === 'confirm' ? '본인 확인' : '프로필 복구'}</h2>
            </div>
            <p className="text-white/80 text-sm">
              {step === 'confirm'
                ? <>닉네임 <strong>{maskedNickname}</strong> — 정확한 닉네임을 입력해주세요</>
                : '고유번호 4자리로 내 프로필을 되찾아요'}
            </p>
          </div>

          <div className="p-6 space-y-5">
            {step === 'pin' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-black text-amber-700 mb-1">📌 고유번호 위치</p>
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  기존 기기 앱 → <strong>내 상태 탭</strong> → 프로필 카드의 <strong>고유번호</strong> 4자리
                </p>
              </div>
            )}

            {step === 'pin' ? (
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
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 text-center">
                  가입 시 설정한 닉네임을 정확히 입력하면 입장할 수 있어요
                </p>
                <input
                  type="text"
                  autoFocus
                  placeholder="닉네임 입력"
                  value={nickInput}
                  onChange={(e) => { setNickInput(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && void confirmNickname()}
                  disabled={loading}
                  className="w-full rounded-2xl px-4 py-3 text-center text-gray-900 text-lg font-black tracking-wider bg-gray-50 border-2 border-gray-200 focus:border-amber-400 outline-none transition-all disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => void confirmNickname()}
                  disabled={!nickInput.trim() || loading}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? '확인 중…' : '본인 확인 완료'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('pin'); setError(null); setNickInput(''); setTimeout(() => ref0.current?.focus(), 80); }}
                  className="w-full py-2 text-gray-400 font-semibold text-sm hover:text-gray-600 transition-colors"
                >
                  ← 고유번호 다시 입력
                </button>
              </div>
            )}

            {loading && step === 'pin' && (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-sm text-amber-600 font-semibold">프로필 찾는 중…</p>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-500 font-medium text-center whitespace-pre-line">⚠ {error}</p>
            )}

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

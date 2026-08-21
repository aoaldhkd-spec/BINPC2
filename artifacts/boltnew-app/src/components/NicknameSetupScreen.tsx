import { useState, useRef, useCallback } from 'react';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getPositionBg, getDomSubBg } from '../lib/profile';
import { containsBannedNicknameWord } from '../lib/bannedWords';
import {
  clampNicknameInput,
  countGraphemes,
  isNicknameImeComposing,
  isNicknameLengthValid,
  NICKNAME_MAX_GRAPHEMES,
  nicknameCompositionAllowed,
  shouldBlockNicknameBeforeInput,
} from '../lib/nickname-input';
import { BIO_CATEGORIES } from '../lib/interests';
import { InterestPicker } from './InterestPicker';
import { maxAdultBirthYear, minBirthYearForEventMaxAge } from '../lib/korean-age';

// ─── 데이터 ────────────────────────────────────────────────────────────────────

const POSITION_OPTIONS: { label: string; val: number }[] = [
  { label: '비선호', val: -1 },
  { label: '바텀', val: 15 },
  { label: '올텀', val: 35 },
  { label: '올', val: 50 },
  { label: '올탑', val: 70 },
  { label: '퓨어탑', val: 100 },
];

const DOM_SUB_OPTIONS: { label: string; val: number }[] = [
  { label: '완전섭', val: 0 },
  { label: '섭', val: 25 },
  { label: '스위치', val: 50 },
  { label: '돔', val: 75 },
  { label: '완전돔', val: 100 },
];

const MBTI_GROUPS = [
  {
    label: 'IN', emoji: '🌙',
    desc: '내향 + 직관',
    bg: 'bg-indigo-50', border: 'border-indigo-200', labelColor: 'text-indigo-700',
    activeBg: 'bg-indigo-500', activeBorder: 'border-indigo-500',
    types: ['INTJ', 'INTP', 'INFJ', 'INFP'],
  },
  {
    label: 'IS', emoji: '🌿',
    desc: '내향 + 감각',
    bg: 'bg-teal-50', border: 'border-teal-200', labelColor: 'text-teal-700',
    activeBg: 'bg-teal-500', activeBorder: 'border-teal-500',
    types: ['ISTJ', 'ISFJ', 'ISTP', 'ISFP'],
  },
  {
    label: 'EN', emoji: '⚡',
    desc: '외향 + 직관',
    bg: 'bg-amber-50', border: 'border-amber-200', labelColor: 'text-amber-700',
    activeBg: 'bg-amber-500', activeBorder: 'border-amber-500',
    types: ['ENTJ', 'ENTP', 'ENFJ', 'ENFP'],
  },
  {
    label: 'ES', emoji: '🌟',
    desc: '외향 + 감각',
    bg: 'bg-rose-50', border: 'border-rose-200', labelColor: 'text-rose-700',
    activeBg: 'bg-rose-500', activeBorder: 'border-rose-500',
    types: ['ESTJ', 'ESFJ', 'ESTP', 'ESFP'],
  },
];

function buildDecadeGroups(now: Date = new Date()): Record<string, number[]> {
  const maxYear = maxAdultBirthYear(now);
  const minYear = minBirthYearForEventMaxAge(now);
  const inRange = (y: number) => y >= minYear && y <= maxYear;
  const groups: Record<string, number[]> = {
    '80년대': Array.from({ length: 5 }, (_, i) => 1989 - i).reverse().filter(inRange),
    '90년대': Array.from({ length: 10 }, (_, i) => 1990 + i).filter(inRange),
    '00년대': Array.from({ length: 10 }, (_, i) => 2000 + i).filter(inRange),
  };
  return Object.fromEntries(Object.entries(groups).filter(([, years]) => years.length > 0));
}

const DECADE_GROUPS = buildDecadeGroups();

const LOCATION_GROUPS: Record<string, string[]> = {
  '광역시': ['부산', '서울', '인천', '대구', '울산', '대전', '광주', '세종'],
  '경기': ['수원', '성남', '용인', '고양', '부천', '안산', '화성', '남양주', '평택', '안양', '의정부', '파주'],
  '경남': ['창원', '김해', '양산', '거제', '진주', '통영', '밀양', '사천', '고성', '남해', '하동', '산청', '함양', '거창', '합천'],
  '경북': ['포항', '구미', '경주', '안동', '김천', '영주', '문경', '상주', '칠곡'],
  '전북': ['전주', '익산', '군산', '정읍', '남원', '김제', '완주'],
  '전남': ['순천', '여수', '광양', '목포', '나주', '담양', '고흥'],
  '충남': ['천안', '아산', '공주', '논산', '서산', '당진', '계룡'],
  '충북': ['청주', '충주', '제천', '음성', '진천'],
  '강원': ['춘천', '원주', '강릉', '속초', '동해', '삼척', '횡성'],
  '기타': ['제주', '해외'],
};

// ─── 5단계 라벨 ────────────────────────────────────────────────────────────────
const STEP_LABELS = ['MBTI', '년생·지역', '관심사', '성향', '닉네임'] as const;
type Step = 1 | 2 | 3 | 4 | 5;

// ─── NicknameSetupScreen ──────────────────────────────────────────────────────

export function NicknameSetupScreen({ onSubmit, loading, registrationError, onReset, onShowRecovery }: {
  onSubmit: (data: {
    birthYear: number; birthMonth: number | null; birthDay: number | null;
    location: string; mbti: string; interests: string[];
    personalityScore: number; domSubScore: number | null; nickname: string;
    kakaoId: string; instagramId: string; phoneNumber: string; contactPrivate: boolean;
  }) => void;
  loading: boolean; registrationError?: string | null; onReset: () => void; onShowRecovery?: () => void;
}) {
  const [step, setStep] = useState<Step>(1);

  // 닉네임
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const [dupChecked, setDupChecked] = useState(false);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customInputRef = useRef('');
  const nickInputElRef = useRef<HTMLInputElement>(null);
  const nickComposingRef = useRef(false);
  const nickFinishSyllableRef = useRef(false);

  // MBTI
  const [mbti, setMbti] = useState<string | null>(null);

  // 년생·지역
  const [decadeFilter, setDecadeFilter] = useState<string>('90년대');
  const [birthYear, setBirthYear] = useState<string>('1995');
  const [regionFilter, setRegionFilter] = useState<string>('광역시');
  const [location, setLocation] = useState<string>('부산');

  // 관심사
  const [selectedBio, setSelectedBio] = useState<string[]>([]);
  const [bioFilter, setBioFilter] = useState<string>(BIO_CATEGORIES[0].label);

  // 성향
  const [positionScore, setPositionScore] = useState<number | null>(null);
  const [domSubEnabled, setDomSubEnabled] = useState(false);
  const [domSubScore, setDomSubScore] = useState(50);

  // contact (숨김 — 입장 후 설정)
  const kakaoId = '';
  const instagramId = '';
  const phoneNumber = '';
  const contactPrivate = false;
  const birthMonth = null;
  const birthDay = null;

  // ── 닉네임 검증 ───────────────────────────────────────────────────────────────
  const validateCustom = useCallback(async (val: string) => {
    const trimmed = val.trim();
    const n = countGraphemes(trimmed);
    if (n === 0) { setCustomError(null); setDupChecked(false); return; }
    if (n > NICKNAME_MAX_GRAPHEMES) { setCustomError('최대 6글자까지 입력할 수 있어요'); setDupChecked(false); return; }
    if (containsBannedNicknameWord(trimmed)) { setCustomError('사용할 수 없는 단어가 포함되어 있어요'); setDupChecked(false); return; }
    if (n < 2) { setCustomError('최소 2글자 이상 입력하세요'); setDupChecked(false); return; }
    setCustomError(null);
    setCheckingDup(true);
    setDupChecked(false);
    try {
      const { data } = await supabase.from('profiles').select('id').eq('nickname', trimmed).limit(1);
      if (data && data.length > 0) {
        setCustomError('이미 사용 중인 닉네임이에요');
        setDupChecked(false);
      } else {
        setCustomError(null);
        setDupChecked(true);
      }
    } catch { setCustomError(null); setDupChecked(true); }
    setCheckingDup(false);
  }, []);

  const applyCustomInput = (val: string, isComposing: boolean) => {
    const next = clampNicknameInput(val, {
      isComposing,
      previous: customInputRef.current,
      allowFinishSyllable: nickFinishSyllableRef.current,
    });
    customInputRef.current = next;
    setCustomInput(next);
    if (nickInputElRef.current && nickInputElRef.current.value !== next) {
      nickInputElRef.current.value = next;
    }
    setDupChecked(false);
    setCustomError(null);
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    if (isComposing) return;
    dupTimerRef.current = setTimeout(() => validateCustom(next), 500);
  };

  const toggleBio = (tag: string) => {
    if (selectedBio.includes(tag)) setSelectedBio(selectedBio.filter(t => t !== tag));
    else if (selectedBio.length < 5) setSelectedBio([...selectedBio, tag]);
  };

  // ── 유효성 ────────────────────────────────────────────────────────────────────
  const customFinalNick = customInput.trim();
  const customValid = isNicknameLengthValid(customFinalNick) && !customError && dupChecked;
  const atMaxBio = selectedBio.length >= 5;

  const isStepValid = (s: Step): boolean => {
    if (s === 1) return !!mbti;
    if (s === 2) return !!birthYear && !!location;
    if (s === 3) return selectedBio.length >= 2;
    if (s === 4) return positionScore !== null;
    if (s === 5) return customValid;
    return false;
  };

  const canEnter = [1, 2, 3, 4, 5].every(s => isStepValid(s as Step)) && !loading;

  // ── 제출 ──────────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!canEnter || !mbti || positionScore === null) return;
    onSubmit({
      birthYear: parseInt(birthYear, 10),
      birthMonth,
      birthDay,
      location: location.trim(),
      mbti,
      interests: selectedBio,
      personalityScore: positionScore,
      domSubScore: domSubEnabled ? domSubScore : null,
      nickname: customFinalNick,
      kakaoId,
      instagramId,
      phoneNumber,
      contactPrivate,
    });
  };

  const goNext = () => { if (step < 5) setStep((step + 1) as Step); };
  const goPrev = () => { if (step > 1) setStep((step - 1) as Step); else onReset(); };

  // ── 렌더 ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
    <div className="w-full max-w-md flex flex-col max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden">

      {/* ── 헤더 ── */}
      <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-5 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white/75 text-[11px] font-semibold tracking-wide">닉네임 설정</p>
            <h2 className="text-white font-black text-xl leading-tight">{STEP_LABELS[step - 1]}</h2>
          </div>
        </div>
        {onShowRecovery && step === 1 && (
          <button
            type="button"
            onClick={onShowRecovery}
            className="mb-3 w-full py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all active:scale-[0.98]"
          >
            🔑 이미 가입했다면 고유번호로 복구
          </button>
        )}

        {/* 5단계 진행 표시 */}
        <div className="flex items-center gap-0">
          {STEP_LABELS.map((label, i) => {
            const idx = (i + 1) as Step;
            const done = idx < step;
            const active = idx === step;
            return (
              <div key={idx} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-0.5">
                  <div className={`flex items-center justify-center rounded-full font-black transition-all ${
                    done ? 'w-6 h-6 bg-white text-cyan-600 text-xs' :
                    active ? 'w-7 h-7 bg-white text-cyan-600 text-sm shadow-lg ring-2 ring-white/40' :
                    'w-5 h-5 bg-white/25 text-white text-[10px]'
                  }`}>
                    {done ? '✓' : idx}
                  </div>
                  <span className={`text-[9px] font-bold leading-none whitespace-nowrap transition-all ${
                    active ? 'text-white' : done ? 'text-white/80' : 'text-white/40'
                  }`}>{label}</span>
                </div>
                {i < 4 && (
                  <div className={`flex-1 h-0.5 rounded-full mx-1 mb-3 transition-all ${done ? 'bg-white/80' : 'bg-white/25'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>


      {/* ── 콘텐츠 ── */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="p-5">

          {/* ─── Step 5: 닉네임 ─── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="text-center pt-2 pb-1">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-100 to-teal-100 flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">✏️</span>
                </div>
                <p className="text-gray-500 text-sm">2~6글자로 나만의 닉네임을 정해요</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700">닉네임 입력</label>
                  <span className={`text-xs font-bold tabular-nums ${countGraphemes(customInput) >= NICKNAME_MAX_GRAPHEMES ? 'text-rose-500' : 'text-gray-400'}`}>
                    {Math.min(countGraphemes(customInput), NICKNAME_MAX_GRAPHEMES)} / {NICKNAME_MAX_GRAPHEMES}
                  </span>
                </div>
                <div className="relative">
                  <input
                    ref={nickInputElRef}
                    type="text"
                    value={customInput}
                    onCompositionStart={() => {
                      nickComposingRef.current = true;
                      nickFinishSyllableRef.current = nicknameCompositionAllowed(customInputRef.current);
                    }}
                    onCompositionEnd={(e) => {
                      nickComposingRef.current = false;
                      nickFinishSyllableRef.current = false;
                      applyCustomInput(e.currentTarget.value, false);
                    }}
                    onBeforeInput={(e) => {
                      if (shouldBlockNicknameBeforeInput(customInputRef.current, NICKNAME_MAX_GRAPHEMES, nickFinishSyllableRef.current)) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      const composing = isNicknameImeComposing(nickComposingRef.current, e.nativeEvent);
                      applyCustomInput(e.target.value, composing);
                    }}
                    placeholder="예: 서울고수"
                    autoFocus
                    className={`w-full px-4 py-3.5 rounded-2xl border-2 text-base font-bold transition-all outline-none bg-white ${
                      customError ? 'border-rose-400 focus:border-rose-500' :
                      dupChecked ? 'border-emerald-400 focus:border-emerald-500' :
                      'border-gray-200 focus:border-cyan-400'
                    }`}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {checkingDup && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
                    {!checkingDup && dupChecked && !customError && (
                      <span className="text-emerald-500 text-xs font-bold">사용 가능 ✓</span>
                    )}
                  </div>
                </div>
                {customError && (
                  <p className="text-xs text-rose-500 font-semibold flex items-center gap-1 px-1">
                    ⚠ {customError}
                  </p>
                )}
                {dupChecked && !customError && isNicknameLengthValid(customInput) && (
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200">
                    <p className="text-xs text-gray-400 mb-0.5">사용할 닉네임</p>
                    <p className="text-xl font-black text-emerald-700">{customInput.trim()}</p>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 bg-amber-50 rounded-2xl border border-amber-100 space-y-1">
                <p className="text-xs font-black text-amber-700">입력 규칙</p>
                <p className="text-[11px] text-amber-600 leading-relaxed">
                  · 최소 2글자 · 최대 6글자<br />
                  · 욕설·정치·종교·지역감정 포함 불가<br />
                  · 이미 사용 중인 닉네임 불가
                </p>
              </div>
            </div>
          )}

          {/* ─── Step 1: MBTI ─── */}
          {step === 1 && (
            <div className="space-y-2.5">
              <p className="text-xs text-gray-400 mb-1">해당하는 MBTI를 선택하세요</p>
              {MBTI_GROUPS.map(g => (
                <div key={g.label} className={`rounded-2xl border-2 ${g.border} ${g.bg} px-3 py-2.5`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base leading-none">{g.emoji}</span>
                    <span className={`text-sm font-black ${g.labelColor}`}>{g.label}</span>
                    <span className={`text-[11px] font-semibold ${g.labelColor} opacity-60`}>{g.desc}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {g.types.map(type => (
                      <button key={type} type="button" onClick={() => setMbti(type)}
                        className={`py-2 rounded-xl text-sm font-black border-2 transition-all active:scale-95 ${
                          mbti === type
                            ? `${g.activeBg} ${g.activeBorder} text-white shadow-md`
                            : `bg-white border-gray-200 text-gray-700 hover:${g.activeBorder}`
                        }`}>{type}</button>
                    ))}
                  </div>
                </div>
              ))}
              {mbti && (
                <div className="flex items-center justify-center gap-2 py-2.5 bg-teal-50 rounded-2xl border border-teal-100">
                  <span className="text-sm">✅</span>
                  <span className="text-teal-700 font-black text-base">{mbti} 선택됨</span>
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2: 출생년도 / 사는곳 ─── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* 출생년도 */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-base">🎂</span>
                  <span className="text-sm font-black text-gray-800">출생년도</span>
                  <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                </div>
                {/* 연대 탭 */}
                <div className="flex gap-2 mb-2.5">
                  {Object.keys(DECADE_GROUPS).map(d => (
                    <button key={d} type="button"
                      onClick={() => {
                        setDecadeFilter(d);
                        const years = DECADE_GROUPS[d];
                        if (!years.includes(Number(birthYear))) setBirthYear(String(years[Math.floor(years.length / 2)]));
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                        decadeFilter === d
                          ? 'bg-cyan-500 border-cyan-500 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-cyan-300'
                      }`}>{d}</button>
                  ))}
                </div>
                {/* 연도 그리드 */}
                <div className="grid grid-cols-5 gap-1.5">
                  {DECADE_GROUPS[decadeFilter].map(year => (
                    <button key={year} type="button" onClick={() => setBirthYear(String(year))}
                      className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                        birthYear === String(year)
                          ? 'bg-cyan-500 border-cyan-500 text-white shadow-md'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-cyan-300 hover:bg-cyan-50'
                      }`}>
                      {String(year).slice(2)}년
                    </button>
                  ))}
                </div>
                {birthYear && (
                  <p className="text-center text-xs text-cyan-600 font-bold mt-2">{birthYear}년생 선택됨</p>
                )}
              </div>

              {/* 사는 곳 */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-base">📍</span>
                  <span className="text-sm font-black text-gray-800">사는 곳</span>
                  <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                </div>
                {/* 지역 탭 */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {Object.keys(LOCATION_GROUPS).map(r => (
                    <button key={r} type="button"
                      onClick={() => {
                        setRegionFilter(r);
                        const cities = LOCATION_GROUPS[r];
                        setLocation(r === '광역시' || r === '기타' ? cities[0] : `${r} ${cities[0]}`);
                      }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                        regionFilter === r
                          ? 'bg-teal-500 border-teal-500 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-teal-300'
                      }`}>{r}</button>
                  ))}
                </div>
                {/* 도시 그리드 */}
                <div className="grid grid-cols-4 gap-1.5">
                  {LOCATION_GROUPS[regionFilter].map(city => {
                    const val = regionFilter === '광역시' || regionFilter === '기타' ? city : `${regionFilter} ${city}`;
                    return (
                      <button key={city} type="button" onClick={() => setLocation(val)}
                        className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                          location === val
                            ? 'bg-teal-500 border-teal-500 text-white shadow-md'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50'
                        }`}>{city}</button>
                    );
                  })}
                </div>
                {location && (
                  <p className="text-center text-xs text-teal-600 font-bold mt-2">{location} 선택됨</p>
                )}
              </div>
            </div>
          )}

          {/* ─── Step 3: 관심사 ─── */}
          {step === 3 && (
            <div className="space-y-3">
              {/* 헤더 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <span className="text-sm font-black text-gray-800">관심사 선택</span>
                  <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">2개 이상</span>
                </div>
                <div className={`flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full transition-all ${
                  atMaxBio ? 'bg-rose-500 text-white' : selectedBio.length >= 2 ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{selectedBio.length} / 5</div>
              </div>

              <InterestPicker
                selected={selectedBio}
                onToggle={toggleBio}
                filter={bioFilter}
                onFilter={setBioFilter}
              />
            </div>
          )}

          {/* ─── Step 4: 성향 ─── */}
          {step === 4 && (
            <div className="space-y-5">
              {/* 포지션 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">💫</span>
                  <span className="text-sm font-black text-gray-800">성향 (포지션)</span>
                  <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {POSITION_OPTIONS.map(({ label, val }) => {
                    const selected = positionScore === val;
                    const bg = getPositionBg(val);
                    return (
                      <button key={val} type="button" onClick={() => setPositionScore(val)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left active:scale-95 ${
                          selected ? 'border-transparent shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                        style={selected ? { background: bg, borderColor: bg } : {}}>
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 border-2 ${
                          selected ? 'bg-white border-white' : 'border-gray-300'
                        }`}>
                          {selected && (
                            <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: bg }} />
                            </svg>
                          )}
                        </div>
                        <span className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-700'}`}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 돔/섭 */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚖️</span>
                    <span className="text-sm font-black text-gray-800">성향 (돔/섭)</span>
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">선택</span>
                  </div>
                  <button type="button" onClick={() => setDomSubEnabled(!domSubEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-all ${domSubEnabled ? 'bg-cyan-500' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${domSubEnabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {!domSubEnabled ? (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-50 rounded-2xl border-2 border-gray-200">
                    <div className="w-3 h-3 rounded-full bg-gray-400" />
                    <span className="text-gray-500 text-sm font-semibold">일반 / 보통</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5">
                    {DOM_SUB_OPTIONS.map(({ label, val }) => {
                      const selected = domSubScore === val;
                      const bg = getDomSubBg(val);
                      return (
                        <button key={val} type="button" onClick={() => setDomSubScore(val)}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border-2 transition-all text-left active:scale-95 ${
                            selected ? 'border-transparent shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          style={selected ? { background: bg, borderColor: bg } : {}}>
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 border-2 ${selected ? 'bg-white border-white' : 'border-gray-300'}`}>
                            {selected && (
                              <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: bg }} />
                              </svg>
                            )}
                          </div>
                          <span className={`font-semibold text-sm ${selected ? 'text-white' : 'text-gray-700'}`}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {registrationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2">
                  <span className="text-rose-500 flex-shrink-0">⚠️</span>
                  <p className="text-sm font-semibold text-rose-700 leading-snug">{registrationError}</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── 하단 버튼 ── */}
      <div className="bg-white border-t-2 border-gray-100 px-4 py-3 flex gap-2.5 flex-shrink-0">
        <button type="button" onClick={goPrev}
          className="flex-[2] flex items-center justify-center gap-1.5 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm rounded-2xl transition-all active:scale-95">
          <ArrowLeft className="w-4 h-4" />
          {step === 1 ? '이전하기' : '이전'}
        </button>

        {step < 5 ? (
          <button type="button" onClick={goNext} disabled={!isStepValid(step)}
            className="flex-[3] flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98]">
            다음 <ChevronRight className="w-5 h-5" />
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={!canEnter}
            className="flex-[3] flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98]">
            {loading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> 입장 중...</>
            ) : (
              <>입장하기 <ChevronRight className="w-5 h-5" /></>
            )}
          </button>
        )}
      </div>

    </div>
    </div>
  );
}

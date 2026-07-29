import { useState, useRef, useCallback } from 'react';
import { ArrowLeft, ChevronRight, RefreshCw, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DrumRoller from './DrumRoller';
import { getPositionBg, getDomSubBg } from '../lib/profile';
import { generateNicknameCandidates, containsBannedNicknameWord } from '../lib/nicknameGenerator';
import { BIO_CATEGORIES } from '../lib/interests';

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
    desc: '내향 + 직관 — 독창·이상형',
    bg: 'bg-indigo-50', border: 'border-indigo-200', labelColor: 'text-indigo-700',
    activeBg: 'bg-indigo-500', activeBorder: 'border-indigo-500',
    hoverBorder: 'hover:border-indigo-300', hoverBg: 'hover:bg-indigo-50',
    types: ['INTJ','INTP','INFJ','INFP'],
  },
  {
    label: 'IS', emoji: '🌿',
    desc: '내향 + 감각 — 성실·안정형',
    bg: 'bg-teal-50', border: 'border-teal-200', labelColor: 'text-teal-700',
    activeBg: 'bg-teal-500', activeBorder: 'border-teal-500',
    hoverBorder: 'hover:border-teal-300', hoverBg: 'hover:bg-teal-50',
    types: ['ISTJ','ISFJ','ISTP','ISFP'],
  },
  {
    label: 'EN', emoji: '⚡',
    desc: '외향 + 직관 — 활발·전략형',
    bg: 'bg-amber-50', border: 'border-amber-200', labelColor: 'text-amber-700',
    activeBg: 'bg-amber-500', activeBorder: 'border-amber-500',
    hoverBorder: 'hover:border-amber-300', hoverBg: 'hover:bg-amber-50',
    types: ['ENTJ','ENTP','ENFJ','ENFP'],
  },
  {
    label: 'ES', emoji: '🌟',
    desc: '외향 + 감각 — 현실·사교형',
    bg: 'bg-rose-50', border: 'border-rose-200', labelColor: 'text-rose-700',
    activeBg: 'bg-rose-500', activeBorder: 'border-rose-500',
    hoverBorder: 'hover:border-rose-300', hoverBg: 'hover:bg-rose-50',
    types: ['ESTJ','ESFJ','ESTP','ESFP'],
  },
];

const DECADE_GROUPS: Record<string, number[]> = {
  '80년대생': Array.from({ length: 5 }, (_, i) => 1989 - i),   // 1985~1989
  '90년대생': Array.from({ length: 10 }, (_, i) => 1999 - i),  // 1990~1999
  '00년대생': Array.from({ length: 8 }, (_, i) => 2007 - i),   // 2000~2007
};

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

// ─── NicknameSetupScreen ──────────────────────────────────────────────────────

export function NicknameSetupScreen({ onSubmit, loading, onReset, onShowRecovery }: {
  onSubmit: (data: {
    birthYear: number; birthMonth: number | null; birthDay: number | null;
    location: string; mbti: string; interests: string[];
    personalityScore: number; domSubScore: number | null; nickname: string;
    kakaoId: string; instagramId: string; phoneNumber: string; contactPrivate: boolean;
  }) => void;
  loading: boolean; onReset: () => void; onShowRecovery?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // contact fields
  const [kakaoId] = useState('');
  const [instagramId] = useState('');
  const [phoneNumber] = useState('');
  const [contactPrivate] = useState(false);
  const [mbti, setMbti] = useState<string | null>(null);
  const [birthYear, setBirthYear] = useState<string>(String(DECADE_GROUPS['90년대생'][0]));
  const [birthMonth] = useState<number | null>(1);
  const [birthDay] = useState<number | null>(1);
  const [location, setLocation] = useState<string>(LOCATION_GROUPS['광역시'][0]);
  const [selectedBio, setSelectedBio] = useState<string[]>([]);
  const [positionScore, setPositionScore] = useState<number | null>(null);
  const [domSubEnabled, setDomSubEnabled] = useState(false);
  const [domSubScore, setDomSubScore] = useState(50);

  const [decadeFilter, setDecadeFilter] = useState<string>('90년대생');
  const [regionFilter, setRegionFilter] = useState<string>('광역시');
  const [candidates, setCandidates] = useState<{ nickname: string; concept: string }[]>([]);
  const [selectedNickname, setSelectedNickname] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [nicknameMode, setNicknameMode] = useState<'random' | 'custom'>('random');
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const [dupChecked, setDupChecked] = useState(false);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleBio = (tag: string) => {
    if (selectedBio.includes(tag)) {
      setSelectedBio(selectedBio.filter((t) => t !== tag));
    } else if (selectedBio.length < 5) {
      setSelectedBio([...selectedBio, tag]);
    }
  };

  const atMaxBio = selectedBio.length >= 5;
  const [bioFilter, setBioFilter] = useState<string | null>(null);

  const birthDateFilled = birthMonth !== null && birthDay !== null;
  void birthDateFilled; // used externally to check completeness
  const step1Valid = !!mbti && !!birthYear && !!location;
  const step2Valid = selectedBio.length >= 2 && positionScore !== null;
  const canGenerate = !!mbti && !!birthYear && !!location && selectedBio.length >= 2 && positionScore !== null;
  const customFinalNick = customInput.trim();
  const customValid = nicknameMode === 'custom'
    ? customFinalNick.length >= 2 && customFinalNick.length <= 6 && !customError && dupChecked
    : false;
  const canEnter = canGenerate && (nicknameMode === 'random' ? !!selectedNickname : customValid) && !loading;

  const validateCustom = useCallback(async (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length === 0) { setCustomError(null); setDupChecked(false); return; }
    if (trimmed.length > 6) { setCustomError('최대 6글자까지 입력할 수 있어요'); setDupChecked(false); return; }
    if (containsBannedNicknameWord(trimmed)) { setCustomError('사용할 수 없는 단어가 포함되어 있어요'); setDupChecked(false); return; }
    if (trimmed.length < 2) { setCustomError('최소 2글자 이상 입력하세요'); setDupChecked(false); return; }
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

  const handleCustomChange = (val: string) => {
    const sliced = [...val].slice(0, 6).join('');
    setCustomInput(sliced);
    setDupChecked(false);
    setCustomError(null);
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    dupTimerRef.current = setTimeout(() => validateCustom(sliced), 500);
  };

  const handleGenerate = () => {
    if (!canGenerate) return;
    setGenerating(true);
    setSelectedNickname(null);
    const year = parseInt(birthYear, 10);
    const next = generateNicknameCandidates(year, location, selectedBio);
    setTimeout(() => {
      setCandidates(next);
      setGenerating(false);
    }, 600);
  };

  const handleSubmit = () => {
    if (!canEnter || !mbti || positionScore === null) return;
    const finalNick = nicknameMode === 'random' ? selectedNickname! : customFinalNick;
    if (!finalNick) return;
    onSubmit({
      birthYear: parseInt(birthYear, 10),
      birthMonth,
      birthDay,
      location: location.trim(),
      mbti,
      interests: selectedBio,
      personalityScore: positionScore,
      domSubScore: domSubEnabled ? domSubScore : null,
      nickname: finalNick,
      kakaoId: kakaoId.trim(),
      instagramId: instagramId.trim(),
      phoneNumber: phoneNumber.trim(),
      contactPrivate,
    });
  };

  const stepLabels = ['기본 정보', '관심사·성향', '닉네임'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-white/80 text-xs font-semibold mb-0.5">QR 접속 완료</p>
              <h2 className="text-white font-black text-xl">닉네임 설정</h2>
              <p className="text-white/90 text-xs mt-1">3단계로 나의 프로필을 완성해요</p>
            </div>
            {onShowRecovery && (
              <button
                type="button"
                onClick={onShowRecovery}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 transition-all border border-white/30"
              >
                <span className="text-lg leading-none">🔑</span>
                <span className="text-white text-[10px] font-bold leading-tight whitespace-nowrap">프로필 복구</span>
              </button>
            )}
          </div>
          <div className="px-5 pt-4">
          </div>

          {/* Step indicator */}
          <div className="px-6 pt-4 pb-2 flex items-center gap-2">
            {stepLabels.map((label, i) => {
              const idx = i + 1;
              const done = idx < step;
              const active = idx === step;
              return (
                <div key={label} className="flex items-center flex-1 last:flex-none">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                      done ? 'bg-teal-500 text-white' : active ? 'bg-cyan-500 text-white ring-4 ring-cyan-100' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {done ? <CheckCircle className="w-4 h-4" /> : idx}
                    </div>
                    <span className={`text-xs font-bold ${active ? 'text-gray-800' : done ? 'text-teal-500' : 'text-gray-400'}`}>{label}</span>
                  </div>
                  {idx < 3 && <div className={`flex-1 h-0.5 mx-2 rounded-full ${done ? 'bg-teal-400' : 'bg-gray-200'}`} />}
                </div>
              );
            })}
          </div>

          <div className="p-5 space-y-5">
            {/* ─── Step 1: 기본 정보 (MBTI + 년생 + 사는곳) ─── */}
            {step === 1 && (
              <>
                {/* MBTI */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-sm font-semibold text-gray-800">MBTI</label>
                    <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                  </div>
                  <div className="space-y-2">
                    {MBTI_GROUPS.map((g) => (
                      <div key={g.label} className={`rounded-2xl border-2 ${g.border} ${g.bg} p-3`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-sm">{g.emoji}</span>
                          <span className={`text-xs font-black ${g.labelColor}`}>{g.label}</span>
                          <span className={`text-[10px] font-semibold ${g.labelColor} opacity-70`}>{g.desc}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {g.types.map((type) => (
                            <button key={type} type="button" onClick={() => setMbti(type)}
                              className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all active:scale-95 ${
                                mbti === type
                                  ? `${g.activeBg} ${g.activeBorder} text-white shadow-md scale-105`
                                  : `bg-white border-gray-200 text-gray-700 ${g.hoverBorder} ${g.hoverBg}`
                              }`}>{type}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <label className="text-sm font-semibold text-gray-800">출생년도</label>
                      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                    </div>
                    <div className="flex gap-1 mb-1.5">
                      {Object.keys(DECADE_GROUPS).map((d) => (
                        <button key={d} type="button"
                          onClick={() => { setDecadeFilter(d); setBirthYear(String(DECADE_GROUPS[d][0])); }}
                          className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all ${decadeFilter === d ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-cyan-300'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
                      <DrumRoller
                        key={decadeFilter}
                        items={DECADE_GROUPS[decadeFilter]}
                        selected={birthYear ? Number(birthYear) : null}
                        onSelect={(v) => setBirthYear(String(v))}
                        renderItem={(v) => `${String(v).slice(2)}년생`}
                        itemHeight={36}
                        visibleCount={3}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <label className="text-sm font-semibold text-gray-800">사는 곳</label>
                      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                    </div>
                    <div className="flex gap-1 mb-1.5 overflow-x-auto pb-0.5 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                      {Object.keys(LOCATION_GROUPS).map((r) => (
                        <button key={r} type="button"
                          onClick={() => { setRegionFilter(r); setLocation(r === '광역시' || r === '기타' ? LOCATION_GROUPS[r][0] : `${r} ${LOCATION_GROUPS[r][0]}`); }}
                          className={`flex-shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold border transition-all ${regionFilter === r ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-teal-300'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
                      <DrumRoller
                        key={regionFilter}
                        items={LOCATION_GROUPS[regionFilter]}
                        selected={(() => {
                          const prefix = regionFilter === '광역시' || regionFilter === '기타' ? '' : `${regionFilter} `;
                          const stripped = location.startsWith(prefix) ? location.slice(prefix.length) : null;
                          return LOCATION_GROUPS[regionFilter].includes(stripped ?? '') ? stripped : null;
                        })()}
                        onSelect={(v) => setLocation(regionFilter === '광역시' || regionFilter === '기타' ? v : `${regionFilter} ${v}`)}
                        itemHeight={36}
                        visibleCount={3}
                      />
                    </div>
                  </div>
                </div>

                {/* 생월·생일 안내 — 입장 후 사주 탭에서 설정 */}
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 flex items-start gap-2">
                  <span className="text-purple-500 text-sm mt-0.5">🔮</span>
                  <p className="text-[12px] text-purple-700 leading-relaxed">
                    <span className="font-black">생월·생일</span>은 입장 후 <span className="font-bold">운세·사주 탭</span>에서 언제든 설정할 수 있어요.
                  </p>
                </div>

                {/* Step 1 summary chips */}
                {(mbti || birthYear || location) && (
                  <div className="flex gap-2 flex-wrap">
                    {mbti && (
                      <span className="px-3 py-1.5 bg-teal-50 text-teal-700 text-sm font-bold rounded-full border border-teal-100">{mbti}</span>
                    )}
                    {birthYear && (
                      <span className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-sm font-bold rounded-full border border-cyan-100">
                        {String(birthYear).slice(2)}년생
                      </span>
                    )}
                    {location && (
                      <span className="px-3 py-1.5 bg-teal-50 text-teal-700 text-sm font-bold rounded-full border border-teal-100">
                        {location}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onReset}
                    className="flex items-center justify-center gap-1.5 px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all">
                    <ArrowLeft className="w-4 h-4" /> 이전
                  </button>
                  <button type="button" onClick={() => setStep(2)} disabled={!step1Valid}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    다음 <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {/* ─── Step 2: 관심사·성향 (관심사 + 포지션 + 돔/섭) ─── */}
            {step === 2 && (
              <>
                {/* 관심사 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-semibold text-gray-800">관심사</label>
                      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all ${
                      atMaxBio ? 'bg-rose-500 text-white' : selectedBio.length >= 2 ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{selectedBio.length} / 5</div>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">2개 이상 선택 — 닉네임 생성에 사용됩니다</p>
                  {selectedBio.length > 0 && (
                    <div className="flex gap-2 p-2.5 bg-cyan-50 rounded-xl border border-cyan-100 flex-wrap mb-2">
                      {selectedBio.map((tag) => (
                        <button key={tag} type="button" onClick={() => toggleBio(tag)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-lg hover:bg-cyan-600 transition-all">
                          {tag} <span className="opacity-70">×</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 카테고리 필터 탭 */}
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    <button
                      type="button"
                      onClick={() => setBioFilter(null)}
                      className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all ${
                        bioFilter === null
                          ? 'bg-gray-800 text-white border-gray-800 shadow-sm'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}
                    >전체</button>
                    {BIO_CATEGORIES.map((cat) => {
                      const active = bioFilter === cat.label;
                      const hasSelected = cat.tags.some(t => selectedBio.includes(t));
                      return (
                        <button
                          key={cat.label}
                          type="button"
                          onClick={() => setBioFilter(active ? null : cat.label)}
                          className={`relative px-3 py-1.5 rounded-full text-xs font-black border transition-all ${
                            active
                              ? `${cat.color.selected} border-transparent shadow-sm`
                              : `bg-white border-gray-200 ${cat.color.label} hover:border-current`
                          }`}
                        >
                          {cat.label}
                          {hasSelected && !active && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyan-500 rounded-full border border-white" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* 태그 목록 — 카테고리 선택 시 헤더 없이 단순 표시, 전체 시 카테고리별 그룹 */}
                  <div className="space-y-3">
                    {BIO_CATEGORIES.filter((cat) => bioFilter === null || cat.label === bioFilter).map((cat) => (
                      <div key={cat.label} className={bioFilter === null ? `rounded-xl border ${cat.color.normal.includes('green') ? 'border-green-100' : cat.color.normal.includes('amber') ? 'border-amber-100' : cat.color.normal.includes('sky') ? 'border-sky-100' : cat.color.normal.includes('rose') ? 'border-rose-100' : cat.color.normal.includes('orange') ? 'border-orange-100' : 'border-pink-100'} overflow-hidden` : ''}>
                        {bioFilter === null && (
                          <div className={`px-3 py-1.5 flex items-center gap-1.5 ${cat.color.normal.includes('green') ? 'bg-green-50' : cat.color.normal.includes('amber') ? 'bg-amber-50' : cat.color.normal.includes('sky') ? 'bg-sky-50' : cat.color.normal.includes('rose') ? 'bg-rose-50' : cat.color.normal.includes('orange') ? 'bg-orange-50' : 'bg-pink-50'}`}>
                            <span className={`text-[11px] font-black ${cat.color.label}`}>{cat.label}</span>
                          </div>
                        )}
                        <div className={`flex flex-wrap gap-1.5 ${bioFilter === null ? 'p-2.5' : ''}`}>
                          {cat.tags.map((tag) => {
                            const selected = selectedBio.includes(tag);
                            const isHot = tag === '뜨밤';
                            const disabled = !selected && atMaxBio;
                            return (
                              <button key={tag} type="button" onClick={() => toggleBio(tag)}
                                disabled={disabled}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all active:scale-95 ${
                                  selected ? cat.color.selected : disabled ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : cat.color.normal
                                }`}>
                                {isHot && <span className="mr-1">🔥</span>}
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 성향 (포지션) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-sm font-semibold text-gray-800">성향 (포지션)</label>
                    <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">필수</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {POSITION_OPTIONS.map(({ label, val }) => {
                      const selected = positionScore === val;
                      const bg = getPositionBg(val);
                      return (
                        <button key={val} type="button" onClick={() => setPositionScore(val)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                            selected ? 'border-transparent shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          style={selected ? { background: bg, borderColor: bg } : {}}>
                          <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                            selected ? 'bg-white border-white' : 'border-gray-300'
                          }`}>
                            {selected && (
                              <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: bg }} />
                              </svg>
                            )}
                          </div>
                          <span className={`font-semibold text-xs ${selected ? 'text-white' : 'text-gray-700'}`}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 성향 (돔/섭) — 선택 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-800">성향 (돔/섭)</label>
                    <div onClick={() => setDomSubEnabled(!domSubEnabled)}
                      className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${domSubEnabled ? 'bg-cyan-500' : 'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${domSubEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </div>
                  {!domSubEnabled ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="w-3 h-3 rounded-full bg-gray-400" />
                      <span className="text-gray-500 text-sm font-medium">일반/보통</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5">
                      {DOM_SUB_OPTIONS.map(({ label, val }) => {
                        const selected = domSubScore === val;
                        const bg = getDomSubBg(val);
                        return (
                          <button key={val} type="button" onClick={() => setDomSubScore(val)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all text-left ${
                              selected ? 'border-transparent shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                            style={selected ? { background: bg, borderColor: bg } : {}}>
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 ${selected ? 'bg-white border-white' : 'border-gray-300'}`}>
                              {selected && (
                                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: bg }} />
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

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex items-center justify-center gap-1.5 px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all">
                    <ArrowLeft className="w-4 h-4" /> 이전
                  </button>
                  <button type="button" onClick={() => setStep(3)} disabled={!step2Valid}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    다음 <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {/* ─── Step 3: 닉네임 생성 ─── */}
            {step === 3 && (
              <>
                {/* 입력 요약 */}
                <div className="flex gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-gray-200">
                  {mbti && <span className="px-2.5 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">{mbti}</span>}
                  {birthYear && <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 text-xs font-bold rounded-full">{String(birthYear).slice(2)}년생</span>}
                  {location && <span className="px-2.5 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">{location}</span>}
                  {selectedBio.map((t) => <span key={t} className="px-2.5 py-1 bg-cyan-100 text-cyan-700 text-xs font-bold rounded-full">{t}</span>)}
                </div>

                {/* 모드 선택 탭 */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                  <button type="button" onClick={() => { setNicknameMode('random'); setSelectedNickname(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${nicknameMode === 'random' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    ✨ 랜덤 생성
                  </button>
                  <button type="button" onClick={() => { setNicknameMode('custom'); setSelectedNickname(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${nicknameMode === 'custom' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    ✏️ 직접 입력
                  </button>
                </div>

                {/* 랜덤 생성 모드 */}
                {nicknameMode === 'random' && (
                  <div className="pt-1 space-y-3">
                    <button type="button" onClick={handleGenerate} disabled={!canGenerate || generating}
                      className="w-full py-3 px-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold rounded-xl hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                      {generating ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" />생성 중...</>
                      ) : candidates.length > 0 ? (
                        <><RefreshCw className="w-4 h-4" />다시 생성하기</>
                      ) : (
                        <>✨ 닉네임 5개 만들기</>
                      )}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center">지역·나이·관심사를 조합해 자동으로 만들어드려요 · 최대 8글자</p>

                    {candidates.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-500 text-center">마음에 드는 닉네임을 선택하세요</p>
                        {candidates.map(({ nickname, concept }) => {
                          const isSel = selectedNickname === nickname;
                          return (
                            <button key={nickname} type="button" onClick={() => setSelectedNickname(nickname)}
                              className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                                isSel ? 'border-cyan-500 bg-cyan-50 shadow-md' : 'border-gray-200 bg-white hover:border-cyan-300'
                              }`}>
                              <div className="text-left min-w-0">
                                <span className={`font-black text-sm block ${isSel ? 'text-cyan-700' : 'text-gray-800'}`}>{nickname}</span>
                                <span className={`text-[11px] font-medium block mt-0.5 truncate ${isSel ? 'text-cyan-500' : 'text-gray-400'}`}>{concept}</span>
                              </div>
                              {isSel ? (
                                <span className="text-xs font-bold text-cyan-600 bg-cyan-100 px-2 py-1 rounded-full flex-shrink-0">선택됨</span>
                              ) : (
                                <span className="text-[11px] text-gray-300 flex-shrink-0">선택</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedNickname && (
                      <div className="p-3 bg-gradient-to-r from-cyan-50 to-teal-50 rounded-xl border border-cyan-200">
                        <p className="text-xs text-gray-400 mb-0.5">선택된 닉네임 (입장 후 변경 불가)</p>
                        <p className="text-lg font-black text-cyan-700">{selectedNickname}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 직접 입력 모드 */}
                {nicknameMode === 'custom' && (
                  <div className="pt-1 space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-600">닉네임 직접 입력</label>
                        <span className={`text-xs font-bold tabular-nums ${customInput.length >= 6 ? 'text-rose-500' : 'text-gray-400'}`}>
                          {customInput.length} / 6
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={customInput}
                          onChange={(e) => handleCustomChange(e.target.value)}
                          maxLength={6}
                          placeholder="예: 서울고수"
                          className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all outline-none bg-white ${
                            customError ? 'border-rose-400 focus:border-rose-500' :
                            dupChecked ? 'border-emerald-400 focus:border-emerald-500' :
                            'border-gray-200 focus:border-cyan-400'
                          }`}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {checkingDup && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
                          {!checkingDup && dupChecked && !customError && <span className="text-emerald-500 text-xs font-bold">사용 가능 ✓</span>}
                        </div>
                      </div>

                      {/* 에러 메시지 */}
                      {customError && (
                        <p className="text-xs text-rose-500 font-medium flex items-center gap-1">
                          <span>⚠</span> {customError}
                        </p>
                      )}

                      {/* 안내 문구 */}
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 space-y-1">
                        <p className="text-[11px] font-bold text-amber-700">입력 규칙</p>
                        <ul className="text-[11px] text-amber-600 space-y-0.5 list-none">
                          <li>· 공백 포함 최대 6글자</li>
                          <li>· 정치·종교·지역감정·욕설 포함 불가</li>
                          <li>· 이미 사용 중인 닉네임 불가</li>
                          <li>· 입장 후 변경이 불가능하니 신중히 선택하세요</li>
                        </ul>
                      </div>
                    </div>

                    {dupChecked && !customError && customInput.trim().length >= 2 && (
                      <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                        <p className="text-xs text-gray-400 mb-0.5">사용할 닉네임 (입장 후 변경 불가)</p>
                        <p className="text-lg font-black text-emerald-700">{customInput.trim()}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 연락처 안내 */}
                <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="text-sky-500 text-sm mt-0.5">📋</span>
                  <p className="text-[12px] text-sky-700 leading-relaxed">
                    <span className="font-black">연락처</span>는 입장 후 <span className="font-bold">내 상태 탭 → 연락처 설정</span>에서 언제든 입력할 수 있어요.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(2)}
                    className="flex items-center justify-center gap-1.5 px-5 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all">
                    <ArrowLeft className="w-4 h-4" /> 이전
                  </button>
                  <button type="button" onClick={handleSubmit} disabled={!canEnter}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl hover:from-cyan-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {loading ? '입장 중...' : <>이 닉네임으로 입장하기 <ChevronRight className="w-5 h-5" /></>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

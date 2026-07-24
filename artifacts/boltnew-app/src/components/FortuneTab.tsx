import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Info } from 'lucide-react';
import type { Database } from '../types/database';
import {
  getZodiac, getOhaeng, getOhaengColor, getOhaengEmoji, getOhaengDesc,
  drawTodayTarot, getTodayFortune,
  getCompatibility, getNumerologyCompat, getOhaengCompat, getBedCompat, getMbtiCompat,
  type DrawnCard,
} from '../lib/fortune';

type Profile = Database['public']['Tables']['profiles']['Row'];
type FortuneSubTab = 'tarot' | 'saju' | 'gungham';
type CompatMethod = 'saju' | 'numerology' | 'ohaeng' | 'mbti';

// ── 툴팁 버블 ──────────────────────────────────────────────────────────────
function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen(v => !v)} className="ml-1 text-slate-500 hover:text-slate-300 transition-colors">
        <Info className="w-3.5 h-3.5 inline" />
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-5 w-56 bg-slate-700 border border-slate-600 rounded-xl p-3 text-xs text-slate-200 leading-relaxed shadow-xl" onClick={() => setOpen(false)}>
          {text}
        </div>
      )}
    </span>
  );
}

// ── 점수 바 ────────────────────────────────────────────────────────────────
function ScoreBar({ score, color = 'purple' }: { score: number; color?: string }) {
  const colors: Record<string, string> = {
    purple: 'from-purple-500 to-pink-500',
    rose: 'from-rose-500 to-orange-500',
    cyan: 'from-cyan-500 to-teal-500',
    amber: 'from-amber-500 to-yellow-400',
  };
  return (
    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r ${colors[color] ?? colors.purple} transition-all duration-700`} style={{ width: `${score}%` }} />
    </div>
  );
}

// ── 생년월일 셀렉트 ────────────────────────────────────────────────────────
function BirthSelect({ label, value, options, onChange }: {
  label: string; value: number; options: number[]; onChange: (v: number) => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold text-slate-400 mb-1 truncate">{label}</p>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-slate-700 border border-slate-600 text-white text-sm font-bold rounded-xl px-2 py-2 appearance-none text-center"
      >
        {options.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}

// ── 타로 카드 단일 ─────────────────────────────────────────────────────────
function TarotCardEl({ drawn, idx, flipped, onFlip }: {
  drawn: DrawnCard; idx: number; flipped: boolean; onFlip: () => void;
}) {
  const positions = ['과거', '현재', '미래'];
  const posColors = ['text-slate-400', 'text-cyan-400', 'text-purple-400'];
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className={`text-[10px] font-black tracking-widest uppercase ${posColors[idx]}`}>{positions[idx]}</p>
      <button
        onClick={onFlip}
        className={`w-full aspect-[2/3] rounded-2xl border-2 transition-all duration-500 relative overflow-hidden active:scale-95 ${
          flipped
            ? 'border-purple-500/60 bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg shadow-purple-500/20'
            : 'border-slate-600 bg-gradient-to-br from-slate-700 to-slate-800 hover:border-purple-500/40 hover:scale-105'
        }`}
      >
        {flipped ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-2 gap-1">
            <span className="text-3xl">{drawn.card.emoji}</span>
            <p className="text-white text-[11px] font-black text-center leading-tight">{drawn.card.nameKo}</p>
            {drawn.isReversed && (
              <span className="px-1.5 py-0.5 bg-rose-500/30 border border-rose-500/50 text-rose-300 text-[9px] font-bold rounded-full">역방향</span>
            )}
            <p className="text-slate-300 text-[10px] text-center font-bold mt-0.5">
              {drawn.isReversed ? drawn.card.reversedKey : drawn.card.uprightKey}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-3xl opacity-30">🔮</span>
            <p className="text-slate-500 text-[10px] font-bold">눌러서 공개</p>
          </div>
        )}
      </button>
      {flipped && (
        <div className="w-full">
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">{drawn.isReversed ? drawn.card.reversed : drawn.card.upright}</p>
          <button onClick={() => setShowDetail(v => !v)} className="w-full mt-1 text-[10px] text-purple-400 hover:text-purple-300 font-semibold">
            {showDetail ? '▲ 접기' : '▼ 쉬운 설명'}
          </button>
          {showDetail && (
            <p className="text-[10px] text-slate-300 leading-relaxed mt-1 bg-slate-800 rounded-xl p-2">{drawn.card.easyDesc}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 궁합 결과 블록 ─────────────────────────────────────────────────────────
function CompatBlock({ title, score, grade, emoji, children }: {
  title: string; score: number; grade: string; emoji: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-purple-500/25 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-purple-300 text-[10px] font-black uppercase tracking-widest">{title}</p>
        <span className="text-lg">{emoji}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-center shrink-0">
          <p className="text-3xl font-black text-white">{score}</p>
          <p className="text-slate-400 text-[9px]">/ 100</p>
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-white font-black text-sm">{grade}등급</p>
          <ScoreBar score={score} />
        </div>
      </div>
      {children}
    </div>
  );
}

// ── NoBirthday 안내 ────────────────────────────────────────────────────────
function NoBirthday() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-4">
      <span className="text-5xl">🔮</span>
      <div>
        <p className="text-white font-black text-lg">생년월일이 필요해요</p>
        <p className="text-slate-400 text-sm mt-1 leading-relaxed">
          사주·타로·궁합 기능을 사용하려면<br />프로필에서 생년월일을 등록해 주세요
        </p>
      </div>
      <div className="px-4 py-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold leading-relaxed">
        ⚠️ 생년월일을 등록하지 않으면<br />사주·타로·궁합 기능을 사용할 수 없어요
      </div>
    </div>
  );
}

// ── 메인 FortuneTab ────────────────────────────────────────────────────────
export default function FortuneTab({
  currentUserId, myProfile, profiles, likedIds,
}: {
  currentUserId: string | null;
  myProfile: Profile | null;
  profiles: Profile[];
  likedIds: Set<string>;
}) {
  const [subTab, setSubTab] = useState<FortuneSubTab>('tarot');
  const hasBirthday = !!(myProfile?.birth_year && myProfile?.birth_month && myProfile?.birth_day);

  // ── 타로 ──────────────────────────────────────────────────────────────────
  const drawnCards = useMemo(() =>
    currentUserId ? drawTodayTarot(currentUserId) : [],
  [currentUserId]);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false]);
  const allFlipped = flipped.every(Boolean);
  const flipCard = (i: number) => setFlipped(prev => prev.map((v, idx) => idx === i ? true : v));
  const resetTarot = () => setFlipped([false, false, false]);

  // ── 사주 ──────────────────────────────────────────────────────────────────
  const todayFortune = useMemo(() => {
    if (!hasBirthday) return null;
    return getTodayFortune(myProfile!.birth_year!, myProfile!.birth_month!, myProfile!.birth_day!);
  }, [hasBirthday, myProfile]);

  // ── 궁합 ──────────────────────────────────────────────────────────────────
  const [targetMode, setTargetMode] = useState<'profile' | 'manual'>('profile');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [manualYear, setManualYear] = useState(1993);
  const [manualMonth, setManualMonth] = useState(6);
  const [manualDay, setManualDay] = useState(15);
  const [activeMethod, setActiveMethod] = useState<CompatMethod>('saju');
  const [showBed, setShowBed] = useState(false);

  const targetProfile = profiles.find(p => p.id === selectedProfileId);
  const targetHasBd = targetMode === 'manual'
    ? true
    : !!(targetProfile?.birth_year && targetProfile?.birth_month && targetProfile?.birth_day);

  const tYear = targetMode === 'profile' ? (targetProfile?.birth_year ?? 0) : manualYear;
  const tMonth = targetMode === 'profile' ? (targetProfile?.birth_month ?? 0) : manualMonth;
  const tDay = targetMode === 'profile' ? (targetProfile?.birth_day ?? 0) : manualDay;
  const tMbti = targetMode === 'profile' ? (targetProfile?.mbti ?? '') : '';
  const tDomScore = targetMode === 'profile' ? (targetProfile?.dom_sub_score ?? null) : null;
  const hasTarget = targetHasBd && tYear > 0;

  const compat = useMemo(() => {
    if (!hasBirthday || !hasTarget) return null;
    return getCompatibility(myProfile!.birth_year!, myProfile!.birth_month!, myProfile!.birth_day!, tYear, tMonth, tDay);
  }, [hasBirthday, hasTarget, myProfile, tYear, tMonth, tDay]);

  const numerologyC = useMemo(() => {
    if (!hasBirthday || !hasTarget) return null;
    return getNumerologyCompat(myProfile!.birth_year!, myProfile!.birth_month!, myProfile!.birth_day!, tYear, tMonth, tDay);
  }, [hasBirthday, hasTarget, myProfile, tYear, tMonth, tDay]);

  const ohaengC = useMemo(() => {
    if (!hasBirthday || !hasTarget) return null;
    return getOhaengCompat(myProfile!.birth_year!, tYear);
  }, [hasBirthday, hasTarget, myProfile, tYear]);

  const mbtiC = useMemo(() => {
    const myMbti = myProfile?.mbti ?? '';
    if (!myMbti || !tMbti) return null;
    return getMbtiCompat(myMbti, tMbti);
  }, [myProfile, tMbti]);

  const bedC = useMemo(() => {
    if (!hasBirthday || !hasTarget) return null;
    return getBedCompat(myProfile!.birth_year!, myProfile!.birth_month!, myProfile!.birth_day!, tYear, tMonth, tDay, myProfile?.dom_sub_score, tDomScore);
  }, [hasBirthday, hasTarget, myProfile, tYear, tMonth, tDay, tDomScore]);

  const heartedProfiles = profiles.filter(p => p.id !== currentUserId && likedIds.has(p.id));
  const otherProfiles = profiles.filter(p => p.id !== currentUserId);

  return (
    <div className="text-white overflow-x-hidden w-full">
      {/* 서브탭 */}
      <div className="flex border-b border-slate-700 bg-slate-900 sticky top-0 z-10">
        {([
          { id: 'tarot' as FortuneSubTab, label: '🃏 타로' },
          { id: 'saju' as FortuneSubTab, label: '📅 사주' },
          { id: 'gungham' as FortuneSubTab, label: '💕 궁합' },
        ]).map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 py-3 text-xs font-black tracking-wide transition-all border-b-2 ${
              subTab === t.id
                ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >{t.label}</button>
        ))}
      </div>

      <div className="bg-slate-900">

        {/* ── 타로 ────────────────────────────────────────────────────────── */}
        {subTab === 'tarot' && (
          <div className="p-4 space-y-5 pb-safe">
            <div className="text-center">
              <p className="text-white font-black text-lg">오늘의 타로 운세</p>
              <p className="text-slate-400 text-xs mt-1">카드를 눌러 운명을 공개하세요</p>
              <p className="text-slate-600 text-[10px] mt-0.5">타로 = 78장의 카드로 현재 에너지를 읽는 점술이에요</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {drawnCards.map((drawn, i) => (
                <TarotCardEl key={i} drawn={drawn} idx={i} flipped={flipped[i]} onFlip={() => flipCard(i)} />
              ))}
            </div>

            {allFlipped && (
              <div className="bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-500/30 rounded-2xl p-4 space-y-2">
                <p className="text-purple-300 text-[10px] font-black uppercase tracking-widest">오늘의 타로 메시지</p>
                <p className="text-white text-sm leading-relaxed font-semibold">
                  <span className="text-slate-400">[과거]</span> {drawnCards[0].isReversed ? drawnCards[0].card.reversedKey : drawnCards[0].card.uprightKey}에서 출발해{' '}
                  <span className="text-slate-400">[현재]</span> {drawnCards[1].isReversed ? drawnCards[1].card.reversedKey : drawnCards[1].card.uprightKey}을 살고,{' '}
                  <span className="text-slate-400">[미래]</span> {drawnCards[2].isReversed ? drawnCards[2].card.reversedKey : drawnCards[2].card.uprightKey}으로 나아가는 하루예요.
                </p>
              </div>
            )}

            <button onClick={resetTarot}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-2xl transition-all active:scale-95">
              <RefreshCw className="w-4 h-4" /> 카드 다시 섞기
            </button>
            <p className="text-center text-slate-600 text-[10px]">매일 자정 갱신 · 같은 날은 같은 결과</p>
          </div>
        )}

        {/* ── 사주 ────────────────────────────────────────────────────────── */}
        {subTab === 'saju' && (
          <div className="p-4 space-y-4 pb-safe">
            {!hasBirthday ? <NoBirthday /> : todayFortune && (
              <>
                <div className="text-center">
                  <p className="text-white font-black text-lg">오늘의 사주 운세</p>
                  <p className="text-slate-400 text-xs mt-1">
                    {myProfile!.birth_year}년 {myProfile!.birth_month}월 {myProfile!.birth_day}일 기준
                  </p>
                  <p className="text-slate-600 text-[10px] mt-0.5">사주 = 태어난 날의 하늘 기운으로 운명을 읽어요</p>
                </div>

                {/* 띠 + 오행 카드 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800 rounded-2xl p-4 text-center border border-slate-600">
                    <p className="text-slate-400 text-[10px] font-bold mb-2">
                      나의 띠
                      <Tip text="띠는 태어난 해의 동물이에요. 12년마다 반복되고, 같은 띠끼리는 비슷한 기질을 가져요." />
                    </p>
                    <span className="text-4xl">{todayFortune.zodiac.emoji}</span>
                    <p className="text-white font-black mt-1">{todayFortune.zodiac.name}띠</p>
                    <p className="text-slate-400 text-xs leading-relaxed mt-1">{todayFortune.zodiac.desc}</p>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-4 text-center border border-slate-600">
                    <p className="text-slate-400 text-[10px] font-bold mb-2">
                      나의 오행
                      <Tip text="오행은 목(나무)·화(불)·토(흙)·금(쇠)·수(물) 5가지 기운이에요. 태어난 해의 천간으로 결정돼요." />
                    </p>
                    <span className="text-4xl">{getOhaengEmoji(todayFortune.ohaeng)}</span>
                    <p className="font-black mt-1" style={{ color: getOhaengColor(todayFortune.ohaeng) }}>
                      {todayFortune.ohaeng}({({'목':'木','화':'火','토':'土','금':'金','수':'水'} as Record<string,string>)[todayFortune.ohaeng]})
                    </p>
                    <p className="text-slate-400 text-[10px] leading-relaxed mt-1">{todayFortune.ohaengDesc}</p>
                  </div>
                </div>

                {/* 에너지 게이지 */}
                <div className="bg-slate-800 rounded-2xl p-4 border border-slate-600">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-slate-300 text-xs font-bold">오늘의 에너지 지수</p>
                    <span className="text-purple-300 font-black text-sm">{todayFortune.energyLevel}%</span>
                  </div>
                  <ScoreBar score={todayFortune.energyLevel} color="cyan" />
                  <p className="text-slate-500 text-[10px] mt-1.5">오늘 나에게 흐르는 기운의 강도예요</p>
                </div>

                {/* 오늘 메시지 */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl p-4">
                  <p className="text-purple-300 text-[10px] font-black uppercase tracking-widest mb-2">오늘의 한마디</p>
                  <p className="text-white text-sm leading-relaxed">{todayFortune.message}</p>
                </div>

                {/* 행운 정보 */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '행운의 색', value: todayFortune.luckyColor, emoji: '🎨' },
                    { label: '행운 숫자', value: String(todayFortune.luckyNumber), emoji: '🔢' },
                    { label: '행운 아이템', value: todayFortune.luckyItem, emoji: '✨' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-800 rounded-xl p-3 text-center border border-slate-700">
                      <span className="text-xl">{item.emoji}</span>
                      <p className="text-slate-400 text-[9px] font-bold mt-1">{item.label}</p>
                      <p className="text-white text-[10px] font-black mt-0.5 leading-tight">{item.value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-center text-slate-600 text-[10px]">생년월일 기반 · 매일 자정 갱신</p>
              </>
            )}
          </div>
        )}

        {/* ── 궁합 ────────────────────────────────────────────────────────── */}
        {subTab === 'gungham' && (
          <div className="p-4 space-y-4 pb-safe">
            {!hasBirthday ? <NoBirthday /> : (
              <>
                <div className="text-center">
                  <p className="text-white font-black text-lg">궁합 보기</p>
                  <p className="text-slate-400 text-xs mt-1">4가지 방법으로 보는 사랑 궁합</p>
                </div>

                {/* 내 정보 */}
                <div className="bg-slate-800 rounded-2xl p-3 border border-slate-700 flex items-center gap-3">
                  <span className="text-2xl shrink-0">{getZodiac(myProfile!.birth_year!).emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-black truncate">{myProfile?.nickname ?? '나'}</p>
                    <p className="text-slate-400 text-[10px] truncate">
                      {myProfile!.birth_year}년 {myProfile!.birth_month}월 {myProfile!.birth_day}일 ·{' '}
                      {getZodiac(myProfile!.birth_year!).name}띠 · {getOhaeng(myProfile!.birth_year!)}
                      {myProfile?.mbti ? ` · ${myProfile.mbti}` : ''}
                    </p>
                  </div>
                  <span className="text-slate-400 text-sm shrink-0">나</span>
                </div>

                {/* 상대 선택 */}
                <div className="flex gap-2">
                  {(['profile', 'manual'] as const).map(m => (
                    <button key={m} onClick={() => setTargetMode(m)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${targetMode === m ? 'bg-purple-500/20 border-purple-500/60 text-purple-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                      {m === 'profile' ? '참여자 선택' : '생년월일 직접 입력'}
                    </button>
                  ))}
                </div>

                {targetMode === 'profile' && (
                  <div className="space-y-2">
                    {heartedProfiles.length > 0 && (
                      <div>
                        <p className="text-slate-400 text-[10px] font-bold mb-1.5">💕 내가 하트 보낸 사람</p>
                        <div className="flex gap-2 flex-wrap">
                          {heartedProfiles.map(p => (
                            <button key={p.id} onClick={() => setSelectedProfileId(p.id)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                selectedProfileId === p.id ? 'bg-purple-500/30 border-purple-500 text-purple-200' : 'border-slate-600 text-slate-300 hover:border-slate-500'
                              }`}>
                              {p.birth_year ? getZodiac(p.birth_year).emoji : '?'} {p.nickname}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <select value={selectedProfileId} onChange={e => setSelectedProfileId(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2.5">
                      <option value="">-- 상대를 선택하세요 --</option>
                      {otherProfiles.map(p => (
                        <option key={p.id} value={p.id} disabled={!p.birth_year || !p.birth_month || !p.birth_day}>
                          {p.nickname}{!p.birth_year || !p.birth_month || !p.birth_day ? ' (생년월일 없음)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {targetMode === 'manual' && (
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold mb-2">상대방 생년월일 입력</p>
                    <div className="flex gap-2">
                      <BirthSelect label="태어난 년도" value={manualYear}
                        options={Array.from({ length: 56 }, (_, i) => 2005 - i)} onChange={setManualYear} />
                      <BirthSelect label="월" value={manualMonth}
                        options={Array.from({ length: 12 }, (_, i) => i + 1)} onChange={setManualMonth} />
                      <BirthSelect label="일" value={manualDay}
                        options={Array.from({ length: 31 }, (_, i) => i + 1)} onChange={setManualDay} />
                    </div>
                    <p className="text-slate-500 text-[10px] mt-1.5 text-center">
                      {getZodiac(manualYear).emoji} {getZodiac(manualYear).name}띠 · {getOhaeng(manualYear)}의 기운
                    </p>
                  </div>
                )}

                {/* 계산 방법 탭 */}
                {hasTarget && (
                  <>
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold mb-2">
                        계산 방법 선택
                        <Tip text="궁합은 보는 방법에 따라 결과가 달라요. 여러 방법을 비교해보세요!" />
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'saju' as CompatMethod, label: '🐯 전통 사주', desc: '12지신 기반' },
                          { id: 'numerology' as CompatMethod, label: '🔢 수비학', desc: '생년월일 숫자' },
                          { id: 'ohaeng' as CompatMethod, label: '🌊 오행 상성', desc: '5원소 기운' },
                          { id: 'mbti' as CompatMethod, label: '🧠 MBTI', desc: mbtiC ? '' : '둘 다 MBTI 필요', disabled: !mbtiC },
                        ] as Array<{ id: CompatMethod; label: string; desc: string; disabled?: boolean }>).map(m => (
                          <button key={m.id} onClick={() => !m.disabled && setActiveMethod(m.id)} disabled={!!m.disabled}
                            className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left ${
                              activeMethod === m.id ? 'bg-purple-500/20 border-purple-500/60 text-purple-200' : m.disabled ? 'border-slate-700 text-slate-600 cursor-not-allowed' : 'border-slate-600 text-slate-300 hover:border-slate-500'
                            }`}>
                            <p>{m.label}</p>
                            <p className="text-[9px] opacity-70 mt-0.5">{m.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 사주 궁합 결과 */}
                    {activeMethod === 'saju' && compat && (
                      <CompatBlock title="전통 사주 궁합 (12지신)" score={compat.score} grade={compat.grade} emoji={compat.emoji}>
                        <p className="text-slate-400 text-[10px] font-semibold">{compat.relation}</p>
                        <p className="text-white text-sm font-semibold">{compat.summary}</p>
                        <p className="text-slate-400 text-xs leading-relaxed">{compat.advice}</p>
                        <div className="bg-slate-700/50 rounded-xl p-2.5 text-[10px] text-slate-400 leading-relaxed">
                          💡 <strong className="text-slate-300">전통 사주 궁합이란?</strong> 태어난 해의 동물(띠)을 기준으로 보는 전통 방식이에요. 삼합(최상)·육합(좋음)·상충(충돌) 관계를 봐요.
                        </div>
                      </CompatBlock>
                    )}

                    {/* 수비학 결과 */}
                    {activeMethod === 'numerology' && numerologyC && (
                      <CompatBlock title="수비학 궁합" score={numerologyC.score} grade={`${numerologyC.num1}·${numerologyC.num2}번`} emoji="🔢">
                        <p className="text-white text-sm font-semibold">{numerologyC.desc}</p>
                        <div className="flex gap-3 mt-1">
                          <div className="flex-1 bg-slate-700 rounded-xl p-3 text-center">
                            <p className="text-[10px] text-slate-400">나의 운명수</p>
                            <p className="text-2xl font-black text-purple-300 mt-0.5">{numerologyC.num1}</p>
                          </div>
                          <div className="flex items-center text-slate-500 font-black">💕</div>
                          <div className="flex-1 bg-slate-700 rounded-xl p-3 text-center">
                            <p className="text-[10px] text-slate-400">상대 운명수</p>
                            <p className="text-2xl font-black text-pink-300 mt-0.5">{numerologyC.num2}</p>
                          </div>
                        </div>
                        <div className="bg-slate-700/50 rounded-xl p-2.5 text-[10px] text-slate-400 leading-relaxed">
                          💡 <strong className="text-slate-300">수비학이란?</strong> 생년월일의 모든 숫자를 더해 1자리로 만든 '운명수'로 성격과 궁합을 보는 방법이에요.
                        </div>
                      </CompatBlock>
                    )}

                    {/* 오행 결과 */}
                    {activeMethod === 'ohaeng' && ohaengC && (
                      <CompatBlock title="오행 상성 궁합" score={ohaengC.score} grade={ohaengC.grade} emoji={ohaengC.emoji}>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xl" style={{ color: getOhaengColor(ohaengC.element1) }}>{getOhaengEmoji(ohaengC.element1)} {ohaengC.element1}</span>
                          <span className="text-slate-500">vs</span>
                          <span className="font-black text-xl" style={{ color: getOhaengColor(ohaengC.element2) }}>{getOhaengEmoji(ohaengC.element2)} {ohaengC.element2}</span>
                        </div>
                        <p className="text-slate-300 text-xs font-bold">{ohaengC.relation}</p>
                        <p className="text-white text-sm">{ohaengC.summary}</p>
                        <div className="bg-slate-700/50 rounded-xl p-2.5 text-[10px] text-slate-400 leading-relaxed">
                          💡 <strong className="text-slate-300">오행 상성이란?</strong> 목·화·토·금·수 5가지 기운의 관계를 봐요. 상생(서로 키움)은 최고, 상극(서로 억제)은 충돌하지만 자극이 돼요.
                        </div>
                      </CompatBlock>
                    )}

                    {/* MBTI 결과 */}
                    {activeMethod === 'mbti' && mbtiC && (
                      <CompatBlock title="MBTI 성격 궁합" score={mbtiC.score} grade={`${mbtiC.overlap}/4 일치`} emoji="🧠">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-teal-500/20 border border-teal-500/40 text-teal-300 text-sm font-black rounded-lg">{myProfile?.mbti}</span>
                          <span className="text-slate-500">+</span>
                          <span className="px-3 py-1 bg-pink-500/20 border border-pink-500/40 text-pink-300 text-sm font-black rounded-lg">{tMbti}</span>
                        </div>
                        <p className="text-white text-sm">{mbtiC.note}</p>
                        <div className="bg-slate-700/50 rounded-xl p-2.5 text-[10px] text-slate-400 leading-relaxed">
                          💡 <strong className="text-slate-300">MBTI 궁합이란?</strong> 4가지 성격 축(E/I, N/S, T/F, J/P)이 얼마나 겹치는지 봐요. 반드시 많이 겹쳐야 좋은 건 아니에요!
                        </div>
                      </CompatBlock>
                    )}

                    {/* 침대 궁합 🔞 */}
                    {bedC && (
                      <div className="bg-slate-800 border border-rose-500/30 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setShowBed(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-all active:scale-98"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-rose-400 text-sm">🔥</span>
                            <span className="text-rose-300 text-xs font-black">침대 궁합</span>
                            <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[9px] font-bold rounded-full">🔞 성인</span>
                          </div>
                          {showBed ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        {showBed && (
                          <div className="px-4 pb-4 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="text-center shrink-0">
                                <p className="text-4xl font-black text-white">{bedC.score}</p>
                                <p className="text-slate-400 text-[9px]">/ 100</p>
                              </div>
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xl">{bedC.emoji}</span>
                                  <span className="text-white font-black">{bedC.grade}</span>
                                  <span className="text-slate-300 text-sm">· {bedC.chemistry}</span>
                                </div>
                                <ScoreBar score={bedC.score} color="rose" />
                              </div>
                            </div>
                            <p className="text-slate-300 text-sm leading-relaxed">{bedC.style}</p>
                            <div className="bg-rose-900/30 border border-rose-500/30 rounded-xl px-3 py-2.5">
                              <p className="text-rose-300 text-[10px] font-black mb-1">오늘의 팁 💋</p>
                              <p className="text-slate-200 text-xs leading-relaxed">{bedC.tip}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {!hasTarget && (
                  <div className="text-center py-8 text-slate-500 text-sm leading-relaxed">
                    상대방을 선택하거나<br />생년월일을 직접 입력하면<br />궁합 결과가 나타나요 🔮
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

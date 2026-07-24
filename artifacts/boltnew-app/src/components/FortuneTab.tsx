import { useState, useMemo } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import type { Database } from '../types/database';
import {
  getZodiac, getOhaeng, getOhaengColor, getOhaengEmoji,
  drawTodayTarot, getTodayFortune,
  getCompatibility, getIntimateCompatibility,
  type DrawnCard,
} from '../lib/fortune';

type Profile = Database['public']['Tables']['profiles']['Row'];

// ── 드럼롤러 (월·일 선택) ─────────────────────────────────────────────────────
function SmallSelect({ label, value, options, onChange }: {
  label: string; value: number; options: number[]; onChange: (v: number) => void;
}) {
  return (
    <div className="flex-1">
      <p className="text-[10px] font-bold text-slate-400 mb-1">{label}</p>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-slate-700 border border-slate-600 text-white text-sm font-bold rounded-xl px-3 py-2.5 appearance-none text-center"
      >
        {options.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}

// ── 타로 카드 ─────────────────────────────────────────────────────────────────
function TarotCardEl({ drawn, idx, flipped, onFlip }: {
  drawn: DrawnCard; idx: number; flipped: boolean; onFlip: () => void;
}) {
  const positions = ['과거', '현재', '미래'];
  const posColors = ['text-slate-400', 'text-cyan-400', 'text-purple-400'];
  return (
    <div className="flex flex-col items-center gap-2">
      <p className={`text-[10px] font-black tracking-widest uppercase ${posColors[idx]}`}>{positions[idx]}</p>
      <button
        onClick={onFlip}
        className={`w-full aspect-[2/3] rounded-2xl border-2 transition-all duration-500 relative overflow-hidden ${
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
            <p className="text-slate-300 text-[10px] text-center leading-tight mt-1">
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
        <p className="text-[10px] text-slate-400 text-center leading-relaxed px-1">
          {drawn.isReversed ? drawn.card.reversed : drawn.card.upright}
        </p>
      )}
    </div>
  );
}

// ── 메인 FortuneTab ────────────────────────────────────────────────────────────
type FortuneSubTab = 'tarot' | 'saju' | 'gungham';

export default function FortuneTab({
  currentUserId, myProfile, profiles, likedIds, darkMode,
}: {
  currentUserId: string | null;
  myProfile: Profile | null;
  profiles: Profile[];
  likedIds: Set<string>;
  darkMode: boolean;
}) {
  const [subTab, setSubTab] = useState<FortuneSubTab>('tarot');

  const hasBirthday = !!(myProfile?.birth_year && myProfile?.birth_month && myProfile?.birth_day);

  // ── 타로 상태 ────────────────────────────────────────────────────────────────
  const drawnCards = useMemo(() =>
    currentUserId ? drawTodayTarot(currentUserId) : [],
  [currentUserId]);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false]);
  const allFlipped = flipped.every(Boolean);
  const flipCard = (i: number) => setFlipped(prev => prev.map((v, idx) => idx === i ? true : v));
  const resetTarot = () => setFlipped([false, false, false]);

  // ── 사주 상태 ────────────────────────────────────────────────────────────────
  const todayFortune = useMemo(() => {
    if (!hasBirthday) return null;
    return getTodayFortune(myProfile!.birth_year!, myProfile!.birth_month!, myProfile!.birth_day!);
  }, [hasBirthday, myProfile]);

  // ── 궁합 상태 ────────────────────────────────────────────────────────────────
  const [targetMode, setTargetMode] = useState<'profile' | 'manual'>('profile');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [manualYear, setManualYear] = useState(1995);
  const [manualMonth, setManualMonth] = useState(6);
  const [manualDay, setManualDay] = useState(15);
  const [showIntimate, setShowIntimate] = useState(false);

  const targetProfile = profiles.find(p => p.id === selectedProfileId);
  const targetHasBirthday = !!(targetProfile?.birth_year && targetProfile?.birth_month && targetProfile?.birth_day);

  const compat = useMemo(() => {
    if (!hasBirthday) return null;
    const ty = targetMode === 'profile' ? (targetProfile?.birth_year ?? null) : manualYear;
    const tm = targetMode === 'profile' ? (targetProfile?.birth_month ?? null) : manualMonth;
    const td = targetMode === 'profile' ? (targetProfile?.birth_day ?? null) : manualDay;
    if (!ty || !tm || !td) return null;
    return getCompatibility(myProfile!.birth_year!, myProfile!.birth_month!, myProfile!.birth_day!, ty, tm, td);
  }, [hasBirthday, myProfile, targetMode, targetProfile, manualYear, manualMonth, manualDay]);

  const intimate = useMemo(() => {
    if (!hasBirthday) return null;
    const ty = targetMode === 'profile' ? (targetProfile?.birth_year ?? null) : manualYear;
    const tm = targetMode === 'profile' ? (targetProfile?.birth_month ?? null) : manualMonth;
    const td = targetMode === 'profile' ? (targetProfile?.birth_day ?? null) : manualDay;
    if (!ty || !tm || !td) return null;
    return getIntimateCompatibility(myProfile!.birth_year!, myProfile!.birth_month!, myProfile!.birth_day!, ty, tm, td);
  }, [hasBirthday, myProfile, targetMode, targetProfile, manualYear, manualMonth, manualDay]);

  // 하트 보낸/받은 프로필 (궁합 추천)
  const heartedProfiles = profiles.filter(p => p.id !== currentUserId && likedIds.has(p.id));
  const otherProfiles = profiles.filter(p => p.id !== currentUserId);

  const base = 'bg-slate-900 text-white min-h-0';

  const NoBirthday = () => (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-4">
      <span className="text-5xl">🔮</span>
      <div>
        <p className="text-white font-black text-lg">생년월일이 필요해요</p>
        <p className="text-slate-400 text-sm mt-1 leading-relaxed">
          사주·타로·궁합 기능을 사용하려면<br />
          프로필에서 생년월일을 등록해 주세요
        </p>
      </div>
      <div className="px-4 py-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold">
        ⚠️ 생년월일 미등록 시 운세 기능을 사용할 수 없어요
      </div>
    </div>
  );

  return (
    <div className={`${base} flex flex-col`}>
      {/* 서브탭 */}
      <div className="flex border-b border-slate-700 bg-slate-900 sticky top-0 z-10">
        {([
          { id: 'tarot' as FortuneSubTab, label: '🃏 타로', },
          { id: 'saju' as FortuneSubTab, label: '📅 사주', },
          { id: 'gungham' as FortuneSubTab, label: '💕 궁합', },
        ]).map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 py-3 text-xs font-black tracking-wider transition-all border-b-2 ${
              subTab === t.id
                ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── 타로 탭 ─────────────────────────────────────────────────── */}
        {subTab === 'tarot' && (
          <div className="p-4 space-y-5">
            <div className="text-center">
              <p className="text-white font-black text-lg">오늘의 타로</p>
              <p className="text-slate-400 text-xs mt-1">카드를 눌러 운명을 확인하세요</p>
            </div>

            {/* 3카드 그리드 */}
            <div className="grid grid-cols-3 gap-3">
              {drawnCards.map((drawn, i) => (
                <TarotCardEl key={i} drawn={drawn} idx={i} flipped={flipped[i]} onFlip={() => flipCard(i)} />
              ))}
            </div>

            {/* 전체 공개 후 종합 메시지 */}
            {allFlipped && (
              <div className="bg-gradient-to-br from-purple-900/40 to-slate-900 border border-purple-500/30 rounded-2xl p-4 space-y-2">
                <p className="text-purple-300 text-[10px] font-black uppercase tracking-widest">오늘의 타로 메시지</p>
                <p className="text-white text-sm leading-relaxed font-semibold">
                  {drawnCards[0].isReversed ? drawnCards[0].card.reversedKey : drawnCards[0].card.uprightKey}에서 시작해{' '}
                  {drawnCards[1].isReversed ? drawnCards[1].card.reversedKey : drawnCards[1].card.uprightKey}의 현재를 살고,{' '}
                  {drawnCards[2].isReversed ? drawnCards[2].card.reversedKey : drawnCards[2].card.uprightKey}으로 나아가는 하루예요.
                </p>
              </div>
            )}

            <button onClick={resetTarot}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold rounded-2xl transition-all active:scale-95">
              <RefreshCw className="w-4 h-4" />
              카드 다시 섞기
            </button>

            <p className="text-center text-slate-600 text-[10px]">오늘 날짜 기반 · 매일 자정 갱신</p>
          </div>
        )}

        {/* ── 사주 탭 ─────────────────────────────────────────────────── */}
        {subTab === 'saju' && (
          <div className="p-4 space-y-4">
            {!hasBirthday ? <NoBirthday /> : todayFortune && (
              <>
                <div className="text-center">
                  <p className="text-white font-black text-lg">오늘의 사주 운세</p>
                  <p className="text-slate-400 text-xs mt-1">
                    {myProfile!.birth_year}년 {myProfile!.birth_month}월 {myProfile!.birth_day}일생
                  </p>
                </div>

                {/* 띠 + 오행 카드 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800 rounded-2xl p-4 text-center border border-slate-600">
                    <p className="text-slate-400 text-[10px] font-bold mb-2">나의 띠</p>
                    <span className="text-4xl">{todayFortune.zodiac.emoji}</span>
                    <p className="text-white font-black mt-1">{todayFortune.zodiac.name}띠</p>
                    <p className="text-slate-400 text-xs">{todayFortune.zodiac.yinyang}({todayFortune.zodiac.element})</p>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-4 text-center border border-slate-600">
                    <p className="text-slate-400 text-[10px] font-bold mb-2">오행</p>
                    <span className="text-4xl">{getOhaengEmoji(todayFortune.ohaeng)}</span>
                    <p className="font-black mt-1" style={{ color: getOhaengColor(todayFortune.ohaeng) }}>
                      {todayFortune.ohaeng}(木火土金水)
                    </p>
                    <p className="text-slate-400 text-xs">{todayFortune.ohaeng}의 기운</p>
                  </div>
                </div>

                {/* 에너지 게이지 */}
                <div className="bg-slate-800 rounded-2xl p-4 border border-slate-600">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-slate-300 text-xs font-bold">오늘의 에너지</p>
                    <span className="text-purple-300 font-black text-sm">{todayFortune.energyLevel}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all"
                      style={{ width: `${todayFortune.energyLevel}%` }}
                    />
                  </div>
                </div>

                {/* 오늘의 메시지 */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl p-4">
                  <p className="text-purple-300 text-[10px] font-black uppercase tracking-widest mb-2">오늘의 운세</p>
                  <p className="text-white text-sm leading-relaxed">{todayFortune.message}</p>
                </div>

                {/* 행운 정보 */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '행운의 색', value: todayFortune.luckyColor, emoji: '🎨' },
                    { label: '행운의 숫자', value: String(todayFortune.luckyNumber), emoji: '🔢' },
                    { label: '행운 아이템', value: todayFortune.luckyItem, emoji: '✨' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-800 rounded-xl p-3 text-center border border-slate-700">
                      <span className="text-xl">{item.emoji}</span>
                      <p className="text-slate-400 text-[9px] font-bold mt-1">{item.label}</p>
                      <p className="text-white text-[11px] font-black mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>

                <p className="text-center text-slate-600 text-[10px]">생년월일 기반 · 매일 자정 갱신</p>
              </>
            )}
          </div>
        )}

        {/* ── 궁합 탭 ─────────────────────────────────────────────────── */}
        {subTab === 'gungham' && (
          <div className="p-4 space-y-4">
            {!hasBirthday ? <NoBirthday /> : (
              <>
                <div className="text-center">
                  <p className="text-white font-black text-lg">궁합 보기</p>
                  <p className="text-slate-400 text-xs mt-1">일반궁합 + 속궁합</p>
                </div>

                {/* 내 정보 */}
                <div className="bg-slate-800 rounded-2xl p-3 border border-slate-700 flex items-center gap-3">
                  <span className="text-2xl">{getZodiac(myProfile!.birth_year!).emoji}</span>
                  <div>
                    <p className="text-white text-sm font-black">{myProfile?.nickname ?? '나'}</p>
                    <p className="text-slate-400 text-xs">
                      {myProfile!.birth_year}년 {myProfile!.birth_month}월 {myProfile!.birth_day}일 ·{' '}
                      {getZodiac(myProfile!.birth_year!).name}띠 · {getOhaeng(myProfile!.birth_year!)}
                    </p>
                  </div>
                  <span className="ml-auto text-slate-400 text-lg">나</span>
                </div>

                {/* 상대 선택 모드 */}
                <div className="flex gap-2">
                  <button onClick={() => setTargetMode('profile')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${targetMode === 'profile' ? 'bg-purple-500/20 border-purple-500/60 text-purple-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                    참여자 선택
                  </button>
                  <button onClick={() => setTargetMode('manual')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${targetMode === 'manual' ? 'bg-purple-500/20 border-purple-500/60 text-purple-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                    직접 입력
                  </button>
                </div>

                {/* 참여자 선택 */}
                {targetMode === 'profile' && (
                  <div>
                    {heartedProfiles.length > 0 && (
                      <div className="mb-2">
                        <p className="text-slate-400 text-[10px] font-bold mb-2">💕 내가 하트 보낸 사람</p>
                        <div className="flex gap-2 flex-wrap">
                          {heartedProfiles.map(p => (
                            <button key={p.id} onClick={() => setSelectedProfileId(p.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                selectedProfileId === p.id
                                  ? 'bg-purple-500/30 border-purple-500 text-purple-200'
                                  : 'border-slate-600 text-slate-300 hover:border-slate-500'
                              }`}>
                              {p.birth_year && p.birth_month && p.birth_day
                                ? <span>{getZodiac(p.birth_year).emoji}</span>
                                : <span className="text-slate-500">?</span>}
                              {p.nickname}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-slate-400 text-[10px] font-bold mb-2">전체 참여자</p>
                    <select
                      value={selectedProfileId}
                      onChange={e => setSelectedProfileId(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2.5"
                    >
                      <option value="">-- 상대를 선택하세요 --</option>
                      {otherProfiles.map(p => (
                        <option key={p.id} value={p.id} disabled={!p.birth_year || !p.birth_month || !p.birth_day}>
                          {p.nickname}{(!p.birth_year || !p.birth_month || !p.birth_day) ? ' (생년월일 미등록)' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedProfileId && !targetHasBirthday && (
                      <p className="text-amber-400 text-xs mt-2 text-center">⚠️ 이 참여자는 생년월일을 등록하지 않았어요</p>
                    )}
                  </div>
                )}

                {/* 직접 입력 */}
                {targetMode === 'manual' && (
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold mb-2">상대방 생년월일</p>
                    <div className="flex gap-2">
                      <SmallSelect label="년도" value={manualYear}
                        options={Array.from({length: 50}, (_, i) => 2005 - i)}
                        onChange={setManualYear} />
                      <SmallSelect label="월" value={manualMonth}
                        options={Array.from({length: 12}, (_, i) => i + 1)}
                        onChange={setManualMonth} />
                      <SmallSelect label="일" value={manualDay}
                        options={Array.from({length: 31}, (_, i) => i + 1)}
                        onChange={setManualDay} />
                    </div>
                    <p className="text-slate-500 text-[10px] mt-1.5 text-center">
                      {getZodiac(manualYear).emoji} {getZodiac(manualYear).name}띠 · {getOhaeng(manualYear)}
                    </p>
                  </div>
                )}

                {/* 궁합 결과 */}
                {compat && (
                  <div className="space-y-3">
                    {/* 일반궁합 */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-purple-300 text-[10px] font-black uppercase tracking-widest">일반궁합</p>
                        <span className="text-xs font-bold text-slate-400">{compat.relation}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-4xl font-black text-white">{compat.score}</p>
                          <p className="text-slate-400 text-[10px]">/ 100점</p>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">{compat.emoji}</span>
                            <span className="text-white font-black text-lg">{compat.grade}등급</span>
                          </div>
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                              style={{ width: `${compat.score}%` }} />
                          </div>
                        </div>
                      </div>
                      <p className="text-white text-sm font-semibold">{compat.summary}</p>
                      <p className="text-slate-400 text-xs leading-relaxed">{compat.advice}</p>
                    </div>

                    {/* 속궁합 (접기/펼치기) */}
                    {intimate && (
                      <div className="bg-slate-800 border border-rose-500/30 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setShowIntimate(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
                            <span className="text-rose-300 text-xs font-black">속궁합</span>
                            <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[9px] font-bold rounded-full">어른들만 👀</span>
                          </div>
                          {showIntimate
                            ? <ChevronUp className="w-4 h-4 text-slate-400" />
                            : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        {showIntimate && (
                          <div className="px-4 pb-4 space-y-3">
                            <div className="flex items-center gap-4">
                              <div className="text-center">
                                <p className="text-4xl font-black text-white">{intimate.score}</p>
                                <p className="text-slate-400 text-[10px]">/ 100점</p>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-2xl">{intimate.emoji}</span>
                                  <span className="text-white font-black text-lg">{intimate.grade}등급</span>
                                </div>
                                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all"
                                    style={{ width: `${intimate.score}%` }} />
                                </div>
                              </div>
                            </div>
                            <p className="text-white text-sm font-semibold">{intimate.summary}</p>
                            <p className="text-slate-400 text-xs leading-relaxed">{intimate.detail}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!compat && (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    상대방을 선택하거나 생년월일을 입력하면<br />궁합 결과가 나와요
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

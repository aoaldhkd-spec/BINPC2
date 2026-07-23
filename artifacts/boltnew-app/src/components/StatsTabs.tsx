import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import {
  BarChart3, Trophy, Heart, Users, TrendingUp, Award,
} from 'lucide-react';
import { getKoreanAge, getPositionLabel } from '../lib/profile';
import { HEART_META, HeartType } from '../lib/constants';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Like = Database['public']['Tables']['likes']['Row'];
type Seat = Database['public']['Tables']['seats']['Row'];

const CHART_COLORS = ['#0891b2', '#0d9488', '#059669', '#16a34a', '#65a30d', '#ca8a04', '#d97706', '#ea580c', '#dc2626', '#db2777', '#9333ea', '#7c3aed'];

function ageBand(by: number | null): string | null {
  const ageStr = getKoreanAge(by);
  if (ageStr === '나이 미입력') return null;
  const age = parseInt(ageStr, 10);
  if (isNaN(age)) return null;
  const decade = Math.floor(age / 10) * 10;
  return `${decade}대`;
}

function BarRow({ label, count, max, color, dark }: { label: string; count: number; max: number; color: string; dark: boolean }) {
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-xs font-semibold w-20 sm:w-24 truncate text-right ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{label}</span>
      <div className={`flex-1 h-6 rounded-lg overflow-hidden relative ${dark ? 'bg-slate-700' : 'bg-gray-100'}`}>
        <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        <span className={`absolute inset-y-0 right-2 flex items-center text-[11px] font-bold ${dark ? 'text-slate-200' : 'text-gray-700'}`}>{count}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-2xl p-4 border border-gray-100 shadow-sm" style={{ background: color }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-white/85 uppercase tracking-wide">{label}</p>
        <div className="text-white/80">{icon}</div>
      </div>
      <p className="text-2xl font-black text-white mt-2 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-white/80 mt-1">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, subtitle, children, accent = '#0891b2', dark }: {
  title: string; subtitle?: string; children: React.ReactNode; accent?: string; dark: boolean;
}) {
  return (
    <div className={`rounded-2xl shadow-sm p-5 border transition-colors duration-300 ${dark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-5 rounded-full" style={{ background: accent }} />
        <h3 className={`text-sm font-black ${dark ? 'text-white' : 'text-gray-800'}`}>{title}</h3>
      </div>
      {subtitle && <p className={`text-[11px] mb-4 ml-3.5 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

function EmptyNote({ text, dark }: { text: string; dark: boolean }) {
  return <p className={`text-center text-xs py-4 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{text}</p>;
}


// ─── 통계 탭 ──────────────────────────────────────────────────────────────────
export function StatsTab({ profiles, seats, darkMode }: { profiles: Profile[]; seats: Seat[]; darkMode: boolean }) {
  const [allLikes, setAllLikes] = useState<Like[]>([]);

  useEffect(() => {
    let active = true;
    supabase.from('likes').select('*').then(({ data }) => {
      if (active && data) setAllLikes(data as Like[]);
    });
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const mbtiCounts = new Map<string, number>();
    const positionCounts = new Map<string, number>();
    const interestCounts = new Map<string, number>();
    const locationCounts = new Map<string, number>();
    const ageCounts = new Map<string, number>();
    const heartCounts: Record<HeartType, number> = { red: 0, blue: 0, pink: 0, green: 0 };

    profiles.forEach((p) => {
      if (p.mbti) mbtiCounts.set(p.mbti, (mbtiCounts.get(p.mbti) ?? 0) + 1);
      const pos = getPositionLabel(p.personality_score ?? 50);
      positionCounts.set(pos, (positionCounts.get(pos) ?? 0) + 1);
      const interests = Array.isArray(p.interests)
        ? p.interests as string[]
        : typeof p.interests === 'string' && p.interests
          ? (p.interests as string).split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      interests.forEach((i) => {
        interestCounts.set(i, (interestCounts.get(i) ?? 0) + 1);
      });
      if (p.location) locationCounts.set(p.location, (locationCounts.get(p.location) ?? 0) + 1);
      const band = ageBand(p.birth_year);
      if (band) ageCounts.set(band, (ageCounts.get(band) ?? 0) + 1);
    });

    allLikes.forEach((l) => {
      const t = (l.heart_type ?? 'red') as HeartType;
      heartCounts[t] = (heartCounts[t] ?? 0) + 1;
    });

    const occupied = seats.filter((s) => s.status === 'occupied').length;
    const totalHearts = allLikes.length;
    const matched = allLikes.filter((l) => l.status === 'accepted').length;

    return {
      mbti: [...mbtiCounts.entries()].sort((a, b) => b[1] - a[1]),
      position: [...positionCounts.entries()].sort((a, b) => b[1] - a[1]),
      interest: [...interestCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      location: [...locationCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      age: [...ageCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      heart: heartCounts,
      occupied, totalHearts, matched,
    };
  }, [profiles, allLikes, seats]);

  const maxMbti = Math.max(1, ...stats.mbti.map((e) => e[1]));
  const maxPos = Math.max(1, ...stats.position.map((e) => e[1]));
  const maxInterest = Math.max(1, ...stats.interest.map((e) => e[1]));
  const maxLocation = Math.max(1, ...stats.location.map((e) => e[1]));
  const maxAge = Math.max(1, ...stats.age.map((e) => e[1]));
  const totalHeartsForChart = Math.max(1, Object.values(stats.heart).reduce((a, b) => a + b, 0));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2 px-1">
        <BarChart3 className="w-5 h-5 text-cyan-500" />
        <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-800'}`}>오늘의 통계</h2>
        <span className={`text-[11px] ml-auto ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>익명 집계 · 개인 식별 없음</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="참여자" value={profiles.length} sub="명" icon={<Users className="w-4 h-4" />} color="#0891b2" />
        <StatCard label="보낸 하트" value={stats.totalHearts} sub="개" icon={<Heart className="w-4 h-4" />} color="#ef4444" />
        <StatCard label="매칭 성사" value={stats.matched} sub="건" icon={<TrendingUp className="w-4 h-4" />} color="#10b981" />
      </div>

      <div className={`rounded-2xl shadow-sm p-5 border transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
        <h3 className={`text-sm font-black mb-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>하트 종류별 비율</h3>
        <div className={`h-7 rounded-xl overflow-hidden flex border ${darkMode ? 'border-slate-600' : 'border-gray-200'}`}>
          {(Object.keys(HEART_META) as HeartType[]).map((t) => {
            const v = stats.heart[t];
            if (v === 0) return null;
            const pct = (v / totalHeartsForChart) * 100;
            return <div key={t} style={{ width: `${pct}%`, background: HEART_META[t].color }} title={`${HEART_META[t].label} ${v}개`} />;
          })}
          {stats.totalHearts === 0 && <div className={`w-full ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`} />}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {(Object.keys(HEART_META) as HeartType[]).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: HEART_META[t].color }} />
              <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{HEART_META[t].emoji} {stats.heart[t]}</span>
            </div>
          ))}
        </div>
      </div>

      <SectionCard title="MBTI 분포" subtitle={`총 ${stats.mbti.length}종류`} accent="#3b82f6" dark={darkMode}>
        {stats.mbti.length === 0 ? <EmptyNote text="아직 MBTI 데이터가 없습니다." dark={darkMode} /> : (
          <div className="space-y-2">
            {stats.mbti.map(([m, c], i) => (
              <BarRow key={m} label={m} count={c} max={maxMbti} color={CHART_COLORS[i % CHART_COLORS.length]} dark={darkMode} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="포지션 분포" subtitle="성향 점수 기준" accent="#8b5cf6" dark={darkMode}>
        {stats.position.length === 0 ? <EmptyNote text="아직 포지션 데이터가 없습니다." dark={darkMode} /> : (
          <div className="space-y-2">
            {stats.position.map(([p, c], i) => (
              <BarRow key={p} label={p} count={c} max={maxPos} color={CHART_COLORS[(i + 2) % CHART_COLORS.length]} dark={darkMode} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="연령대 분포" accent="#f59e0b" dark={darkMode}>
        {stats.age.length === 0 ? <EmptyNote text="아직 연령 데이터가 없습니다." dark={darkMode} /> : (
          <div className="space-y-2">
            {stats.age.map(([a, c], i) => (
              <BarRow key={a} label={a} count={c} max={maxAge} color={CHART_COLORS[(i + 4) % CHART_COLORS.length]} dark={darkMode} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="인기 관심사 TOP 10" accent="#ea580c" dark={darkMode}>
        {stats.interest.length === 0 ? <EmptyNote text="아직 관심사 데이터가 없습니다." dark={darkMode} /> : (
          <div className="space-y-2">
            {stats.interest.map(([t, c], i) => (
              <BarRow key={t} label={t} count={c} max={maxInterest} color={CHART_COLORS[(i + 6) % CHART_COLORS.length]} dark={darkMode} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="사는 곳 분포" accent="#ec4899" dark={darkMode}>
        {stats.location.length === 0 ? <EmptyNote text="아직 지역 데이터가 없습니다." dark={darkMode} /> : (
          <div className="space-y-2">
            {stats.location.map(([l, c], i) => (
              <BarRow key={l} label={l} count={c} max={maxLocation} color={CHART_COLORS[(i + 8) % CHART_COLORS.length]} dark={darkMode} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── 랭킹 탭 ──────────────────────────────────────────────────────────────────
export function RankingTab({ seats, darkMode, profiles: propProfiles }: { seats: Seat[]; darkMode: boolean; profiles?: Profile[] }) {
  const [allLikes, setAllLikes] = useState<Like[]>([]);
  const [fetchedProfiles, setFetchedProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (propProfiles) return;
    let active = true;
    supabase.from('profiles').select('*').then(({ data }) => {
      if (active && data) setFetchedProfiles(data as Profile[]);
    });
    return () => { active = false; };
  }, [propProfiles]);

  useEffect(() => {
    let active = true;
    supabase.from('likes').select('*').then(({ data }) => {
      if (active && data) setAllLikes(data as Like[]);
    });
    return () => { active = false; };
  }, []);

  const ranked = useMemo(() => {
    const counts = new Map<string, Record<HeartType, number>>();
    allLikes.forEach((l) => {
      const t = (l.heart_type ?? 'red') as HeartType;
      const cur = counts.get(l.liked_id) ?? { red: 0, blue: 0, pink: 0, green: 0 };
      cur[t] = (cur[t] ?? 0) + 1;
      counts.set(l.liked_id, cur);
    });
    const arr = [...counts.entries()].map(([id, hearts]) => {
      const total = hearts.red + hearts.blue + hearts.pink + hearts.green;
      return { id, hearts, total };
    }).sort((a, b) => b.total - a.total).slice(0, 10);
    return arr;
  }, [allLikes]);

  const maxTotal = ranked.length > 0 ? ranked[0].total : 1;
  const medalColors = ['#f59e0b', '#94a3b8', '#b45309'];
  const allProfiles = propProfiles ?? fetchedProfiles;
  const profileMap = new Map(allProfiles.map(p => [p.id, p]));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Trophy className="w-5 h-5 text-amber-500" />
        <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-800'}`}>인기도 랭킹</h2>
        <span className={`text-[11px] ml-auto ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>하트 많이 받은 순</span>
      </div>

      <div className={`rounded-2xl shadow-sm p-4 border transition-colors duration-300 flex items-start gap-2.5 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
        <Award className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className={`text-xs font-bold leading-relaxed ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
            하트를 가장 많이 받은 인기인 TOP 10
          </p>
          <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
            누가 보냈는지는 공개되지 않으며, 받은 하트 종류별 통계만 표시됩니다.
          </p>
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className={`rounded-2xl shadow-sm p-10 border transition-colors duration-300 text-center ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
          <Heart className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-300'}`} />
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 하트가 오가지 않았습니다.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {ranked.map((r, i) => {
            const seat = seats.find((s) => s.profile_id === r.id);
            const profile = profileMap.get(r.id);
            const isTop3 = i < 3;
            const medal = i === 0 ? '👑' : i === 1 ? '🥈' : '🥉';
            return (
              <div key={r.id} className={`rounded-2xl p-4 border shadow-sm transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white text-sm flex-shrink-0 shrink-0"
                    style={{ background: isTop3 ? medalColors[i] : '#0891b2' }}>
                    {isTop3 ? medal : i + 1}
                  </div>
                  {profile?.photo_url ? (
                    <img src={profile.photo_url} alt={profile.nickname} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-black flex-shrink-0 ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-100 text-gray-500'}`}>
                      {profile?.nickname?.charAt(0) ?? '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-black truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      {profile?.nickname ?? `${i + 1}위`}
                      <span className={`text-xs font-bold ml-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>총 {r.total}개</span>
                    </p>
                    {seat && (
                      <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{seat.seat_label} · 테이블 {seat.table_number}</p>
                    )}
                  </div>
                </div>
                <div className={`mt-2.5 h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all duration-500"
                    style={{ width: `${(r.total / maxTotal) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {(Object.keys(HEART_META) as HeartType[]).map((t) => (
                    r.hearts[t] > 0 && (
                      <span key={t} className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: HEART_META[t].color + '22', color: HEART_META[t].color }}>
                        {HEART_META[t].emoji} {r.hearts[t]}
                      </span>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

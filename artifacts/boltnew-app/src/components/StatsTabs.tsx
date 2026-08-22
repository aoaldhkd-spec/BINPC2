import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import {
  BarChart3, Trophy, Heart, Users, Share2, Award,
} from 'lucide-react';
import { parseProfileInterests } from '../lib/interests';
import { HEART_META, HeartType } from '../lib/constants';
import { collectProfileBreakdowns, countTodayContactExchanges, countTodayHeartStats, filterProfilesForPublicStats, rankByReceivedHearts } from '../lib/stats-ranking';
import { getAvatarSrc } from '../lib/profile';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Like = Database['public']['Tables']['likes']['Row'];

const PUBLIC_LIKES_POLL_MS = 15_000;

function usePublicLikes() {
  const [allLikes, setAllLikes] = useState<Like[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const load = () => {
      const fail = () => {
        if (!active) return;
        if (tries >= 3) {
          setLoading(false);
          return;
        }
        tries += 1;
        retryTimer = setTimeout(load, 800 * tries);
      };
      supabase.from('likes').select('id, liked_id, heart_type, status, created_at').then(({ data }: { data: unknown }) => {
        if (!active) return;
        if (Array.isArray(data)) {
          setAllLikes(data as Like[]);
          tries = 0;
          setLoading(false);
          return;
        }
        fail();
      }, fail);
    };

    load();
    let poll: ReturnType<typeof setInterval> | undefined;
    const startPoll = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        load();
      }, PUBLIC_LIKES_POLL_MS);
    };
    const stopPoll = () => {
      if (poll) {
        window.clearInterval(poll);
        poll = undefined;
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        load();
        startPoll();
      } else {
        stopPoll();
      }
    };
    startPoll();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      stopPoll();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return { allLikes, loading };
}

type ContactShareRow = { created_at?: string | null };

const PUBLIC_CONTACT_SHARES_POLL_MS = 15_000;

function usePublicContactShares() {
  const [allShares, setAllShares] = useState<ContactShareRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const load = () => {
      const fail = () => {
        if (!active) return;
        if (tries >= 3) {
          setLoading(false);
          return;
        }
        tries += 1;
        retryTimer = setTimeout(load, 800 * tries);
      };
      supabase.from('contact_shares').select('created_at').then(({ data }: { data: unknown }) => {
        if (!active) return;
        if (Array.isArray(data)) {
          setAllShares(data as ContactShareRow[]);
          tries = 0;
          setLoading(false);
          return;
        }
        fail();
      }, fail);
    };

    load();
    let poll: ReturnType<typeof setInterval> | undefined;
    const startPoll = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        load();
      }, PUBLIC_CONTACT_SHARES_POLL_MS);
    };
    const stopPoll = () => {
      if (poll) {
        window.clearInterval(poll);
        poll = undefined;
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        load();
        startPoll();
      } else {
        stopPoll();
      }
    };
    startPoll();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      stopPoll();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return { allShares, loading };
}

const CHART_COLORS = ['#0891b2', '#0d9488', '#059669', '#16a34a', '#65a30d', '#ca8a04', '#d97706', '#ea580c', '#dc2626', '#db2777', '#9333ea', '#7c3aed'];

function BarRow({ label, count, max, color, dark }: { label: string; count: number; max: number; color: string; dark: boolean }) {
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-xs font-semibold w-20 sm:w-24 shrink-0 text-right leading-tight break-keep ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{label}</span>
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

export function StatsTab({ profiles, darkMode }: { profiles: Profile[]; darkMode: boolean }) {
  const { allLikes, loading: likesLoading } = usePublicLikes();
  const { allShares: allContactShares, loading: sharesLoading } = usePublicContactShares();
  const initialLoading = likesLoading || sharesLoading;

  const stats = useMemo(() => {
    const publicProfiles = filterProfilesForPublicStats(profiles);
    const breakdowns = collectProfileBreakdowns(publicProfiles, parseProfileInterests);
    const { heart, totalHearts } = countTodayHeartStats(allLikes);
    const contactExchanges = countTodayContactExchanges(allContactShares);
    return { ...breakdowns, heart, totalHearts, contactExchanges, participantCount: publicProfiles.length };
  }, [profiles, allLikes, allContactShares]);

  const maxMbti = Math.max(1, ...stats.mbti.map((e) => e[1]));
  const maxPos = Math.max(1, ...stats.position.map((e) => e[1]));
  const maxInterest = Math.max(1, ...stats.interest.map((e) => e[1]));
  const maxLocation = Math.max(1, ...stats.location.map((e) => e[1]));
  const maxAge = Math.max(1, ...stats.age.map((e) => e[1]));
  const totalHeartsForChart = Math.max(1, Object.values(stats.heart).reduce((a, b) => a + b, 0));

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2 px-1">
        <BarChart3 className="w-5 h-5 text-cyan-500" />
        <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-800'}`}>오늘의 통계</h2>
        <span className={`text-[11px] ml-auto ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
          {initialLoading ? '불러오는 중…' : '하트·연락처는 오늘(한국시간) · 익명 집계'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="참여자" value={stats.participantCount} sub="명" icon={<Users className="w-4 h-4" />} color="#0891b2" />
        <StatCard label="보낸 하트" value={stats.totalHearts} sub="개" icon={<Heart className="w-4 h-4" />} color="#ef4444" />
        <StatCard label="연락처 교환" value={stats.contactExchanges} sub="회" icon={<Share2 className="w-4 h-4" />} color="#10b981" />
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
export function RankingTab({ darkMode, profiles: propProfiles }: { darkMode: boolean; profiles?: Profile[] }) {
  const { allLikes, loading: likesLoading } = usePublicLikes();
  const [fetchedProfiles, setFetchedProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (propProfiles) return;
    let active = true;
    supabase.from('profiles').select('*').then(({ data }: { data: unknown }) => {
      if (active && Array.isArray(data)) setFetchedProfiles(data as Profile[]);
    });
    return () => { active = false; };
  }, [propProfiles]);

  const allProfiles = propProfiles ?? fetchedProfiles;
  const ranked = useMemo(() => {
    const knownIds = allProfiles.length > 0 ? new Set(allProfiles.map((p) => p.id)) : undefined;
    return rankByReceivedHearts(allLikes, { knownIds, limit: 10 });
  }, [allLikes, allProfiles]);

  const maxTotal = ranked.length > 0 ? ranked[0].total : 1;
  const medalColors = ['#f59e0b', '#94a3b8', '#b45309'];
  const profileMap = new Map(allProfiles.map(p => [p.id, p]));

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2 px-1">
        <Trophy className="w-5 h-5 text-amber-500" />
        <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-800'}`}>인기도 랭킹</h2>
        <span className={`text-[11px] ml-auto ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
          {likesLoading ? '불러오는 중…' : '하트 많이 받은 순'}
        </span>
      </div>

      <div className={`rounded-2xl shadow-sm p-4 border transition-colors duration-300 flex items-start gap-2.5 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
        <Award className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className={`text-xs font-bold leading-relaxed ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>
            하트를 가장 많이 받은 인기인 TOP 10 — 닉네임이 공개됩니다
          </p>
          <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
            누가 보냈는지는 공개되지 않습니다. 받은 사람의 닉네임·하트 종류별 수만 표시됩니다.
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
          {ranked.map((r) => {
            const profile = profileMap.get(r.id);
            const isTop3 = r.rank <= 3;
            const medal = r.rank === 1 ? '👑' : r.rank === 2 ? '🥈' : '🥉';
            return (
              <div key={r.id} className={`rounded-2xl p-4 border shadow-sm transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white text-sm flex-shrink-0 shrink-0"
                    style={{ background: isTop3 ? medalColors[r.rank - 1] : '#0891b2' }}>
                    {isTop3 ? medal : r.rank}
                  </div>
                  {profile ? (
                    <img src={getAvatarSrc(profile.photo_url, profile.nickname, undefined, profile.avatar_color)} alt={profile.nickname} className="w-9 h-9 rounded-full object-cover flex-shrink-0" loading="lazy" />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-black flex-shrink-0 ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-100 text-gray-500'}`}>
                      {profile?.nickname?.charAt(0) ?? '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {profile?.nickname
                        ? <><span>{profile.nickname}</span><span className={`text-xs font-bold ml-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>총 {r.total}개</span></>
                        : <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>(알 수 없음) · 총 {r.total}개</span>
                      }
                    </p>                  </div>
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

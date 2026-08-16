import { Sparkles } from 'lucide-react';
import { HEART_TYPE_META } from '../lib/constants';
import type { Profile, Like } from './shared';



export function PopularityTab({ likes, profileMap }: { likes: Like[]; profileMap: Map<string, Profile> }) {
  const stats = new Map<string, { total: number; byType: Record<string, number> }>();
  for (const like of likes) {
    const ht = like.heart_type ?? 'red';
    const cur = stats.get(like.liked_id) ?? { total: 0, byType: {} };
    cur.total++;
    cur.byType[ht] = (cur.byType[ht] ?? 0) + 1;
    stats.set(like.liked_id, cur);
  }
  const ranked = [...stats.entries()]
    .map(([id, s]) => ({ profile: profileMap.get(id), ...s }))
    .filter(r => r.profile)
    .sort((a, b) => b.total - a.total);
  const maxTotal = ranked.length > 0 ? ranked[0].total : 1;
  const allTypes = ['red', 'blue', 'pink', 'green'];

  if (ranked.length === 0) {
    return (
      <div className="p-8 text-center">
        <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-sm text-gray-400">아직 하트가 없습니다. 하트가 오가면 여기에 실시간 인기 순위가 표시됩니다.</p>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 px-1 mb-2">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-bold text-gray-700">하트 많이 받은 사람 TOP {ranked.length}</span>
      </div>
      <p className="text-xs text-gray-400 px-1 -mt-2">누가 보냈는지는 공개되지 않습니다. 받은 하트 종류별 통계만 표시됩니다.</p>
      <div className="space-y-2">
        {ranked.map((r, i) => {
          const rank = i + 1;
          const pct = Math.round((r.total / maxTotal) * 100);
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
          return (
            <div key={r.profile!.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              <div className="flex items-center gap-3 mb-2">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black ${rank <= 3 ? 'bg-amber-50' : 'bg-gray-100 text-gray-500'}`}>{medal}</span>
                <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                  <img src={r.profile!.photo_url} alt={r.profile!.nickname} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{r.profile!.nickname}</p>
                  <p className="text-xs text-gray-400">총 {r.total}개</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                <div className="h-full bg-gradient-to-r from-rose-400 via-pink-400 to-amber-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTypes.map(t => {
                  const c = r.byType[t] ?? 0;
                  if (c === 0) return null;
                  const m = HEART_TYPE_META[t];
                  return (
                    <span key={t} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${m.bg} ${m.color}`}>
                      <span>{m.emoji}</span>{c}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 px-1">실시간으로 갱신됩니다.</p>
    </div>
  );
}

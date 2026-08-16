import { useState } from 'react';
import { Trash2, Heart, RefreshCw } from 'lucide-react';
import { HEART_TYPE_META } from '../lib/constants';
import type { Profile, Like } from './shared';
import { ConfirmDialog } from './ConfirmDialog';

// ─── Hearts Tab ───────────────────────────────────────────────────────────────

export function HeartsTab({ likes, profileMap, onClear, onRefresh }: { likes: Like[]; profileMap: Map<string, Profile>; onClear: () => void; onRefresh: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
  };

  if (likes.length === 0) {
    return (
      <div className="p-8 text-center">
        <Heart className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-sm text-gray-400 mb-4">아직 하트 기록이 없습니다.</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className={`flex items-center gap-1.5 mx-auto px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
        </button>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
          <span className="text-sm font-bold text-gray-700">총 {likes.length}개의 하트</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600'}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
          <button onClick={() => setConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all">
            <Trash2 className="w-3 h-3" />이력 삭제
          </button>
        </div>
      </div>
      <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
        <div className="grid grid-cols-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
          <span>보낸 사람</span>
          <span className="text-center">→</span>
          <span className="text-right">받은 사람</span>
        </div>
        {likes.map((like) => {
          const liker = profileMap.get(like.liker_id);
          const liked = profileMap.get(like.liked_id);
          const ht = like.heart_type ?? 'red';
          const htMeta = ht === 'blue' ? { emoji: '💙', color: 'text-blue-400 fill-blue-400', label: '친구' }
            : ht === 'pink' ? { emoji: '💗', color: 'text-pink-400 fill-pink-400', label: '뜨밤' }
            : ht === 'green' ? { emoji: '💚', color: 'text-emerald-400 fill-emerald-400', label: '칭찬' }
            : { emoji: '❤️', color: 'text-rose-400 fill-rose-400', label: '호감' };
          return (
            <div key={like.id} className="grid grid-cols-3 items-center px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                {liker && (
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                    <img src={liker.photo_url} alt={liker.nickname} className="w-full h-full object-cover" />
                  </div>
                )}
                <span className="text-sm font-semibold text-gray-800 truncate">{liker?.nickname ?? '알 수 없음'}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Heart className={`w-4 h-4 ${htMeta.color}`} />
                <span className="text-[9px] font-bold text-gray-400">{htMeta.label}</span>
                {like.created_at && (
                  <span className="text-[9px] text-gray-400 tabular-nums leading-none mt-0.5">
                    {new Date(like.created_at).toLocaleString('ko-KR', {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-sm font-semibold text-gray-800 truncate">{liked?.nickname ?? '알 수 없음'}</span>
                {liked && (
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                    <img src={liked.photo_url} alt={liked.nickname} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 px-1">하트 현황은 실시간으로 갱신됩니다.</p>
      {confirm && (
        <ConfirmDialog title="하트 이력 삭제"
          message="모든 하트 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다."
          danger
          onConfirm={() => { setConfirm(false); onClear(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── Popularity Tab ───────────────────────────────────────────────────────────


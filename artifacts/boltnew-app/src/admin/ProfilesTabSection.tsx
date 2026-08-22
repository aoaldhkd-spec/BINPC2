import { useState } from 'react';
import { Trash2, Users, X, Search } from 'lucide-react';
import { getPositionLabel, getDomSubLabel, getKoreanAge } from '../lib/profile';
import type { Profile, AppSettings } from './shared';
import { adminAvatarSrc } from './shared';
import { ConfirmDialog } from './ConfirmDialog';

// ─── Game Tab ─────────────────────────────────────────────────────────────────

export function ProfilesTabSection({ profiles, settings: _settings, onClear, onDeleteProfile }: {
  profiles: Profile[];
  settings: AppSettings | null;
  onClear: () => void;
  onDeleteProfile: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = q
    ? profiles.filter(p => {
        return (
          p.nickname?.toLowerCase().includes(q) ||
          (p.mbti ?? '').toLowerCase().includes(q) ||
          (p.location ?? '').toLowerCase().includes(q) ||
          ((p as any).bio ?? '').toLowerCase().includes(q) ||
          ((p as any).pin_code ?? '').includes(q)
        );
      })
    : profiles;

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-bold text-gray-700">
            참여자 {q ? <>{filtered.length}<span className="font-normal text-gray-400">/{profiles.length}</span></> : profiles.length}명
          </span>
        </div>
        {profiles.length > 0 && (
          <button onClick={() => setConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-all">
            <Trash2 className="w-3 h-3" />전체 초기화
          </button>
        )}
      </div>
      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="닉네임, MBTI, 지역, 관심사, 고유번호 검색…"
          className="w-full pl-8 pr-8 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-cyan-400 focus:bg-white transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {filtered.map((p) => {
          const posLabel = getPositionLabel(p.personality_score ?? 50);
          const domLabel = p.dom_sub_score !== null ? getDomSubLabel(p.dom_sub_score) : null;
          const age = p.birth_year ? getKoreanAge(p.birth_year) : null;
          const bioTags = (p.bio ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
              {/* 원형 아바타 */}
              <div className="relative flex-shrink-0 w-10 h-10">
                <img
                  src={adminAvatarSrc(p)}
                  alt={p.nickname ?? ''}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <button
                  onClick={() => setDeleteTarget(p)}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow transition-all"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* 닉네임 + 태그 2행 */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-[13px] text-gray-900 leading-tight break-words mb-1.5">
                  {p.nickname ?? '(이름 없음)'}
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-100 px-1.5 py-0.5 rounded-full">{posLabel}</span>
                  {p.mbti && <span className="text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full">{p.mbti}</span>}
                  {domLabel && <span className="text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded-full">{domLabel}</span>}
                  {age && <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full">{age}</span>}
                  {p.location && <span className="text-[9px] font-bold bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full">{p.location}</span>}
                  {bioTags.map(tag => (
                    <span key={tag} className="text-[9px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>

              {/* 고유번호 + 차단 해제 */}
              <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-1.5">
                  <span className="text-teal-700 font-black text-sm tabular-nums tracking-widest">{p.pin_code ?? '—'}</span>
                </div>
              </div>
            </div>
          );
        })}
        {profiles.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">참여자가 없습니다.</div>
        )}
      </div>
      {confirm && (
        <ConfirmDialog title="참여자 초기화"
          message="모든 참여자 프로필을 삭제합니다."
          danger
          onConfirm={() => { setConfirm(false); onClear(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog title="참여자 삭제"
          message={`"${deleteTarget.nickname}" 프로필을 삭제합니다.`}
          danger
          onConfirm={() => { onDeleteProfile(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

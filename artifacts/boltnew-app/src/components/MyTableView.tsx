/**
 * MyTableView — "내 테이블" 탭 전용 인라인 렌더러
 *
 * ⚠️ 중요: 이 파일에는 module-level React 컴포넌트(sub-component)를 두지 않는다.
 *    Vite Fast Refresh가 module-level non-exported 컴포넌트를 fiber에 잘못 등록하면
 *    "Invalid hook call"이 발생하기 때문.
 *    모든 렌더링은 renderSeat() 헬퍼 함수(컴포넌트 X)로 MyTableView 안에서 처리한다.
 */

import type { SyntheticEvent } from 'react';
import type { Database } from '../types/database';
import { TABLE_POSITIONS } from '../lib/constants';
import { genAvatar } from '../lib/profile';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Seat    = Database['public']['Tables']['seats']['Row'];

export interface MyTableViewProps {
  tableNumber: number;
  seats: Seat[];
  profileMap: Map<string, Profile>;
  currentUserId: string | null;
  darkMode?: boolean;
  tableLabels?: Record<string, string> | null;
  onProfileClick?: (p: Profile) => void;
  onSeatClick?: (s: Seat) => void;
}

export default function MyTableView({
  tableNumber, seats, profileMap, currentUserId,
  darkMode = true, tableLabels, onProfileClick, onSeatClick,
}: MyTableViewProps) {
  // ── 아바타 헬퍼 (컴포넌트 body 내부에서 정의 — module-level 아님) ──────────────
  const getAvatarSrc = (url: string | null | undefined, nick: string): string => {
    if (!url) return genAvatar(nick);
    if (url.includes('dicebear') && !url.includes('backgroundColor')) return genAvatar(nick);
    return url;
  };
  const handleImgErr = (nick: string) => (e: SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = genAvatar(nick);
  };

  // ── 테마 ─────────────────────────────────────────────────────────────────────
  const dk = darkMode;
  const emptyBorderCls = dk ? 'border-slate-600' : 'border-gray-300';
  const labelCls       = dk ? 'text-slate-300'  : 'text-gray-700';
  const labelMeCls     = dk ? 'text-blue-300'   : 'text-blue-600';
  const dimCls         = dk ? 'text-slate-500'  : 'text-gray-400';
  const faintCls       = dk ? 'text-slate-600'  : 'text-gray-300';
  const unknownBgCls   = dk ? 'bg-slate-700/60 border-slate-600/50' : 'bg-gray-100 border-gray-200';
  const unknownTextCls = dk ? 'text-slate-400'  : 'text-gray-400';

  // ── 데이터 헬퍼 ──────────────────────────────────────────────────────────────
  const cfg = TABLE_POSITIONS[tableNumber];
  const tableSeats = seats.filter(s => s.table_number === tableNumber);
  const occupiedCount = tableSeats.filter(s => s.status === 'occupied').length;
  const label = tableLabels?.[String(tableNumber)] ?? String(tableNumber);

  const getSeat = (pos: number) => seats.find(s => s.table_number === tableNumber && s.seat_position === pos) ?? null;
  const getProf = (s: Seat | null) => s?.profile_id ? profileMap.get(s.profile_id) : undefined;
  const isMe    = (s: Seat | null) => !!s && s.profile_id === currentUserId;

  // ── 자리 렌더 함수 (컴포넌트가 아닌 일반 함수 — JSX를 반환하지만 React fiber 미등록) ──
  const renderSeat = (pos: number) => {
    const seat    = getSeat(pos);
    const profile = getProf(seat);
    const me      = isMe(seat);
    const dim     = 'w-14 h-14';

    if (!seat) return <div key={pos} className={`${dim} rounded-xl bg-transparent`} />;

    const posLabel = seat.seat_label.split(' ').pop() ?? '';
    const seatOccupied = seat.status === 'occupied';

    // 착석 + 프로필 있음
    if (seatOccupied && profile) {
      return (
        <div key={pos} className="flex flex-col items-center gap-1">
          <button
            onClick={() => onProfileClick?.(profile)}
            className={`${dim} rounded-xl overflow-hidden border-2 transition-all active:scale-95 shadow relative
              ${me ? 'border-blue-400 ring-2 ring-blue-300/60' : 'border-white/20 hover:border-teal-300'}`}
            title={profile.nickname}
          >
            <img
              src={getAvatarSrc(profile.photo_url, profile.nickname)}
              alt={profile.nickname}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={handleImgErr(profile.nickname)}
            />
            {me && (
              <div className="absolute inset-0 bg-blue-500/50 flex items-center justify-center">
                <span className="text-sm font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">나</span>
              </div>
            )}
          </button>
          <span className={`text-[9px] font-bold truncate max-w-[3.5rem] text-center ${me ? labelMeCls : labelCls}`}>
            {me ? '나' : profile.nickname}
          </span>
        </div>
      );
    }

    // 착석했지만 프로필 없음
    if (seatOccupied) {
      return (
        <div key={pos} className="flex flex-col items-center gap-1">
          <div className={`${dim} rounded-xl ${unknownBgCls} flex items-center justify-center`}>
            <span className={`text-xs ${unknownTextCls}`}>?</span>
          </div>
          <span className={`text-[9px] ${dimCls}`}>{posLabel}</span>
        </div>
      );
    }

    // 빈 자리 + 클릭 가능
    if (onSeatClick) {
      return (
        <div key={pos} className="flex flex-col items-center gap-1">
          <button
            onClick={() => onSeatClick(seat)}
            className={`${dim} rounded-xl border-2 border-dashed border-teal-500/50 hover:border-teal-400 hover:bg-teal-500/10 flex items-center justify-center transition-all active:scale-95`}
            title={seat.seat_label}
          >
            <span className="text-[10px] font-bold text-teal-400/60">+</span>
          </button>
          <span className={`text-[9px] ${faintCls}`}>{posLabel}</span>
        </div>
      );
    }

    // 빈 자리 (읽기 전용)
    return (
      <div key={pos} className="flex flex-col items-center gap-1">
        <div className={`${dim} rounded-xl border-2 border-dashed ${emptyBorderCls} flex items-center justify-center`} />
        <span className={`text-[9px] ${faintCls}`}>{posLabel}</span>
      </div>
    );
  };

  // ── cfg 없음 ─────────────────────────────────────────────────────────────────
  if (!cfg) {
    return (
      <div className={`max-w-lg mx-auto rounded-3xl p-8 text-center ${dk ? 'bg-slate-800 text-slate-400' : 'bg-white text-gray-500'}`}>
        <p className="text-sm">테이블 정보를 찾을 수 없습니다</p>
      </div>
    );
  }

  // ── 테이블 블록 (가운데 나무 테이블 이미지) ───────────────────────────────────
  const tableBlock = cfg.type === 'row1'
    ? (
      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-800/90 to-amber-900/90 border border-amber-700/60 shadow-inner flex flex-col items-center justify-center">
        <span className="text-sm font-black text-amber-300/90 leading-none">{label}</span>
        <span className="text-[9px] text-amber-400/60 mt-0.5">번 테이블</span>
      </div>
    ) : (
      <div className="w-12 self-stretch rounded-xl bg-gradient-to-br from-amber-800/90 to-amber-900/90 border border-amber-700/60 shadow-inner flex flex-col items-center justify-center gap-0.5">
        <span className="text-[11px] font-black text-amber-300/90 leading-none">{label}</span>
        <span className="text-[9px] text-amber-400/60">번</span>
      </div>
    );

  // ── 왼쪽·오른쪽 열 ───────────────────────────────────────────────────────────
  const leftColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'sofa' && (
        <span className={`text-[9px] font-black ${cfg.sofaOnLeft ? 'text-sky-400/80' : 'text-slate-400/80'}`}>
          {cfg.sofaOnLeft ? '소파' : '맞은편'}
        </span>
      )}
      <div className={`flex flex-col gap-2 ${cfg.type === 'sofa' && cfg.sofaOnLeft ? 'p-2 rounded-2xl bg-sky-500/10 border border-sky-500/30' : ''}`}>
        {cfg.leftCol.map(pos => renderSeat(pos))}
      </div>
    </div>
  );
  const rightColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'sofa' && (
        <span className={`text-[9px] font-black ${!cfg.sofaOnLeft ? 'text-sky-400/80' : 'text-slate-400/80'}`}>
          {!cfg.sofaOnLeft ? '소파' : '맞은편'}
        </span>
      )}
      <div className={`flex flex-col gap-2 ${cfg.type === 'sofa' && !cfg.sofaOnLeft ? 'p-2 rounded-2xl bg-sky-500/10 border border-sky-500/30' : ''}`}>
        {cfg.rightCol.map(pos => renderSeat(pos))}
      </div>
    </div>
  );

  // ── 레이아웃 ─────────────────────────────────────────────────────────────────
  const layoutJsx = cfg.type === 'row1' ? (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="h-2" />
      <div className="flex items-center gap-2">
        {leftColEl}{tableBlock}{rightColEl}
      </div>
      {cfg.bottomRow && <div className="flex gap-2">{cfg.bottomRow.map(pos => renderSeat(pos))}</div>}
      {cfg.topRow    && <div className="flex gap-2">{cfg.topRow.map(pos => renderSeat(pos))}</div>}
    </div>
  ) : (
    <div className="flex flex-col items-center gap-2 py-2">
      {cfg.topRow ? <div className="flex gap-2">{cfg.topRow.map(pos => renderSeat(pos))}</div> : <div className="h-2" />}
      <div className="flex items-stretch gap-2">
        {leftColEl}{tableBlock}{rightColEl}
      </div>
      {cfg.bottomRow ? <div className="flex gap-2">{cfg.bottomRow.map(pos => renderSeat(pos))}</div> : <div className="h-2" />}
    </div>
  );

  // ── 최종 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div className={`max-w-lg mx-auto rounded-3xl overflow-hidden shadow-xl border ${
      dk ? 'bg-slate-800/90 border-slate-600/60' : 'bg-white border-gray-100'
    }`}>
      {/* 헤더 */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${
        dk ? 'bg-slate-700/70 border-slate-600/50' : 'bg-gray-50 border-gray-100'
      }`}>
        <div>
          <h3 className={`text-base font-black ${dk ? 'text-white' : 'text-gray-900'}`}>
            {label}번 테이블
          </h3>
          <p className={`text-xs mt-0.5 ${dk ? 'text-slate-400' : 'text-gray-400'}`}>
            {occupiedCount}/{Math.min(tableSeats.length, 8)}명 착석
          </p>
        </div>
        <div className={`px-3 py-1 rounded-xl text-xs font-bold ${
          dk ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
             : 'bg-teal-50 text-teal-600 border border-teal-200'
        }`}>
          내 테이블
        </div>
      </div>

      {/* 테이블 레이아웃 */}
      <div className="px-4 pb-5 overflow-x-auto">
        {layoutJsx}
      </div>
    </div>
  );
}

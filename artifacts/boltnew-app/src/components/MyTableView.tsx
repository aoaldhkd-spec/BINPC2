// @refresh reset
/**
 * MyTableView — "내 테이블" 탭 전용
 *
 * SeatingMap의 TableExpandModal과 동일한 모양·기능을 모달 없이 카드 형태로 렌더링.
 * ExpandedLayout을 SeatingMap에서 직접 임포트해 코드 중복 없이 동일한 UI를 유지.
 * useState를 사용해 Vite Fast Refresh boundary를 올바르게 확보.
 */
import { useState } from 'react';
import type { Database } from '../types/database';
import { ExpandedLayout, type LayoutProps } from './SeatingMap';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Seat    = Database['public']['Tables']['seats']['Row'];

export interface MyTableViewProps {
  tableNumber: number;
  seats: Seat[];
  profileMap: Map<string, Profile>;
  currentUserId: string | null;
  isAdmin?: boolean;
  darkMode?: boolean;
  tableLabels?: Record<string, string> | null;
  onProfileClick?: (p: Profile) => void;
  onSeatClick?: (s: Seat) => void;
  onClearSeat?: (s: Seat) => void;
  onShowQr?: (s: Seat) => void;
}

export default function MyTableView({
  tableNumber, seats, profileMap, currentUserId,
  isAdmin = false, darkMode = true, tableLabels,
  onProfileClick, onSeatClick, onClearSeat, onShowQr,
}: MyTableViewProps) {
  // useState → 이 컴포넌트를 Vite Fast Refresh boundary로 등록 + 어드민 confirm 다이얼로그
  const [confirmSeat, setConfirmSeat] = useState<Seat | null>(null);

  const tableSeats  = seats.filter(s => s.table_number === tableNumber);
  const occupied    = tableSeats.filter(s => s.status === 'occupied').length;
  const label       = tableLabels?.[String(tableNumber)] ?? String(tableNumber);
  const confirmProfile = confirmSeat
    ? profileMap.get(String(confirmSeat.profile_id ?? ''))
    : undefined;

  // ExpandedLayout에 전달할 공통 props
  const layoutProps: Omit<LayoutProps, 'tableNum'> = {
    seats,
    profileMap,
    currentUserId,
    isAdmin,
    darkMode,
    tableLabels,
    seatLg: true,   // 내 테이블 탭 전용: 자리·테이블 그래픽을 배치도 확대 모달보다 크게
    // 프로필 클릭 — 탭 자체는 닫히지 않음
    onProfileClick,
    // 빈 자리 클릭 — 탭 자체는 닫히지 않음 (내 테이블 뷰 유지)
    onSeatClick,
    // 어드민 자리 비우기 → confirm 다이얼로그
    onClearSeat: isAdmin ? (s) => setConfirmSeat(s) : undefined,
    onShowQr,
  };

  return (
    <div className="max-w-sm mx-auto">
      {/* ── 어드민 자리 비우기 confirm ─────────────────────── */}
      {confirmSeat && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmSeat(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 w-72 text-center"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-black text-gray-900 text-base mb-1">자리 비우기</p>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{confirmProfile?.nickname}</strong>을(를) 이 자리에서 제거합니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmSeat(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm"
              >취소</button>
              <button
                onClick={() => { onClearSeat?.(confirmSeat); setConfirmSeat(null); }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all"
              >강제 삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 테이블 카드 (TableExpandModal과 동일한 스타일) ── */}
      <div className="bg-slate-900 rounded-3xl shadow-2xl w-full border border-slate-700 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-800 border-b border-slate-700">
          <div>
            <h3 className="font-black text-white text-base">
              {label}번 테이블
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {occupied}/{Math.min(tableSeats.length, 8)}명 착석 · 내 테이블
            </p>
          </div>
          <div className="px-3 py-1 rounded-xl text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
            확대 보기
          </div>
        </div>

        {/* 테이블 레이아웃 — SeatingMap의 ExpandedLayout 그대로 사용 */}
        <div className="px-4 pb-4 overflow-x-auto">
          <ExpandedLayout tableNum={tableNumber} {...layoutProps} />
        </div>
      </div>
    </div>
  );
}

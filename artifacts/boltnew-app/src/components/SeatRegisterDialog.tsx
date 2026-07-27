import React from 'react';
import type { Seat } from '../types/app';

export function SeatRegisterDialog({
  seat, currentUserSeat, onConfirm, onCancel,
}: {
  seat: Seat; currentUserSeat: Seat | null; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-cyan-50 border-2 border-dashed border-cyan-300 flex items-center justify-center mx-auto mb-3">
            <span className="text-cyan-500 text-2xl font-light">+</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">{seat.seat_label}</h3>
          {currentUserSeat ? (
            <p className="text-sm text-amber-600 mt-1.5">
              현재 <strong>{currentUserSeat.seat_label}</strong>에 있습니다.<br />자리를 변경하시겠습니까?
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1.5">이 자리에 등록하시겠습니까?</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">취소</button>
          <button onClick={onConfirm} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-xl hover:from-cyan-600 hover:to-teal-600 transition-all">등록</button>
        </div>
      </div>
    </div>
  );
}

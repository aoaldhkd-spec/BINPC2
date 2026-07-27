import React from 'react';
import { RefreshCw, CheckCircle } from 'lucide-react';

export function RefreshBtn({ onRefresh, refreshed, dark = false }: { onRefresh: () => void; refreshed: boolean; dark?: boolean }) {
  return (
    <button
      onClick={onRefresh}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border shadow-sm transition-all active:scale-95 ${
        refreshed
          ? dark
            ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
            : 'bg-teal-50 border-teal-300 text-teal-600'
          : dark
            ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
            : 'bg-white hover:bg-gray-50 text-gray-500 border-gray-200'
      }`}
    >
      {refreshed ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5" />
      )}
      {refreshed ? '완료!' : '새로고침'}
    </button>
  );
}

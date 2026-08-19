import React from 'react';
import { RefreshCw, CheckCircle } from 'lucide-react';

export function RefreshBtn({ onRefresh, refreshed, dark = false, compact = false }: { onRefresh: () => void; refreshed: boolean; dark?: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-label={compact ? (refreshed ? '새로고침 완료' : '새로고침') : undefined}
      className={`flex items-center justify-center shrink-0 transition-all active:scale-95 border shadow-sm font-semibold ${
        compact ? 'p-1.5 rounded-lg' : 'gap-1.5 px-3 py-1.5 text-xs rounded-full'
      } ${
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
        <CheckCircle className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      ) : (
        <RefreshCw className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      )}
      {!compact && (refreshed ? '완료!' : '새로고침')}
    </button>
  );
}

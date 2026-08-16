import React from 'react';

const NOTIF_STYLES: Record<string, { bar: string; icon: string; label: string }> = {
  info:   { bar: 'bg-blue-600',    icon: '📢', label: '공지' },
  urgent: { bar: 'bg-red-600',     icon: '🚨', label: '긴급' },
  event:  { bar: 'bg-amber-500',   icon: '🎉', label: '이벤트' },
};

export function NotifModal({ notif, onClose }: { notif: { id: string; message: string; type: string; target: string }; onClose: () => void }) {
  const cfg = NOTIF_STYLES[notif.type] ?? NOTIF_STYLES.info;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-[scaleIn_0.25s_ease-out]">
        <div className={`${cfg.bar} px-6 py-5 text-white text-center`}>
          <div className="text-4xl mb-2">{cfg.icon}</div>
          <p className="text-xs font-black uppercase tracking-widest opacity-80">{cfg.label}</p>
        </div>
        <div className="px-6 py-5 text-center">
          <p className="text-gray-800 font-semibold text-base leading-relaxed whitespace-pre-line">{notif.message}</p>
        </div>
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className={`w-full py-3 rounded-2xl font-black text-white text-sm transition-all ${cfg.bar} hover:opacity-90 active:scale-95`}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

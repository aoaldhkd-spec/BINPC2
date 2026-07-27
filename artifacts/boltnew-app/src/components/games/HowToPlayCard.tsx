import React, { useState } from 'react';

export function HowToPlayCard({ steps, color }: { steps: { icon: string; text: string }[]; color: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${color}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-xs font-black tracking-wide flex items-center gap-2">
          <span className="text-base">💡</span> 이렇게 하세요!
        </span>
        <span className={`text-xs font-bold transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▲</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center flex-shrink-0 text-[11px] font-black text-gray-600 shadow-sm">{i + 1}</div>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-lg leading-none">{s.icon}</span>
                <p className="text-xs text-gray-700 font-medium leading-snug">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

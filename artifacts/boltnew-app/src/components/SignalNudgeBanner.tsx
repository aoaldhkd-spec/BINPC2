import { useEffect } from 'react';

export function SignalNudgeBanner({
  message,
  onOpen,
  onClose,
}: {
  message: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 7_000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  return (
    <div className="fixed bottom-24 left-0 right-0 z-[32] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-sm w-full px-4 py-2.5 rounded-2xl shadow-lg bg-rose-500/95 text-white flex items-start gap-2">
        <button type="button" onClick={onOpen} className="flex-1 text-left flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">💕</span>
          <p className="flex-1 text-xs font-bold leading-relaxed">{message}</p>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-white/70 hover:text-white text-sm leading-none px-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}

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
    <div className="fixed bottom-[calc(0.75rem+var(--participant-tabbar,0px))] left-0 right-0 z-[45] flex justify-center px-3 min-[360px]:px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-sm w-full px-4 py-2.5 rounded-2xl shadow-lg bg-rose-500/95 text-white flex items-start gap-2">
        <button type="button" onClick={onOpen} className="flex-1 text-left flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">💕</span>
          <p className="flex-1 text-xs font-bold leading-relaxed">{message}</p>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="touch-target text-white/70 hover:text-white text-sm leading-none flex items-center justify-center flex-shrink-0"
        >
          ×
        </button>
      </div>
    </div>
  );
}

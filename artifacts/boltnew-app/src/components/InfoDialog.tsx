import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLayer } from '../hooks/useParticipantNav';

/** Shared small-screen-safe informational dialog, with keyboard focus containment. */
export function InfoDialog({ open, title, children, onClose, closeLabel = '확인했어요', dark = false }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; closeLabel?: string; dark?: boolean;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]') ?? []);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === box.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = oldOverflow; previous?.focus?.(); };
  }, [open]);
  return <>
    <NavLayer id={`info-${id}`} open={open} onClose={onClose} />
    {open && createPortal(
      <div className="fixed inset-0 z-[11000] safe-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}
          className={`binpc-info-dialog flex flex-col overflow-hidden rounded-2xl border shadow-2xl ${dark ? 'bg-slate-900 text-slate-100 border-slate-600' : 'bg-white text-slate-800 border-slate-200'}`}>
          <h2 id={id} className="px-5 pt-5 pb-3 text-lg font-black shrink-0">{title}</h2>
          <div className="min-h-0 overflow-y-auto px-5 pb-4 text-sm leading-relaxed space-y-3">{children}</div>
          <div className="p-4 shrink-0 border-t border-slate-200/30">
            <button type="button" onClick={onClose} className="touch-target w-full rounded-xl bg-teal-700 text-white font-bold px-4 py-3">{closeLabel}</button>
          </div>
        </div>
      </div>, document.body,
    )}
  </>;
}

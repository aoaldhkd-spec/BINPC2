import { useEffect, useState } from 'react';
import { DISPLAY_SCALE_EVENT, DISPLAY_SCALE_STEPS, readDisplayScale, saveDisplayScale, applyDisplayScale } from '../lib/display-scale';

/** Compact in-context controls; no floating button over hearts, tabs or dialogs. */
export function DisplayScaleControls({ dark = false }: { dark?: boolean }) {
  const [scale, setScale] = useState(readDisplayScale);
  useEffect(() => {
    const sync = () => setScale(applyDisplayScale());
    window.addEventListener(DISPLAY_SCALE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(DISPLAY_SCALE_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const index = DISPLAY_SCALE_STEPS.findIndex(s => s === scale);
  return (
    <div role="group" aria-label="화면 글자 크기" className={`display-scale-controls ${dark ? 'display-scale-dark' : ''}`}>
      <button type="button" aria-label="글자 작게" disabled={index === 0}
        onClick={() => setScale(saveDisplayScale(DISPLAY_SCALE_STEPS[Math.max(0, index - 1)]))}>가−</button>
      <button type="button" aria-label="글자 기본 크기로" onClick={() => setScale(saveDisplayScale(1))}>
        <span aria-live="polite">{Math.round(scale * 100)}%</span>
      </button>
      <button type="button" aria-label="글자 크게" disabled={index === DISPLAY_SCALE_STEPS.length - 1}
        onClick={() => setScale(saveDisplayScale(DISPLAY_SCALE_STEPS[Math.min(DISPLAY_SCALE_STEPS.length - 1, index + 1)]))}>가+</button>
    </div>
  );
}

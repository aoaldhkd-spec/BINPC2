import type { MouseEvent, PointerEvent, SyntheticEvent } from 'react';

type TouchState = {
  pointerId: number; x: number; y: number; started: number; moved: boolean;
  scroll: [Element, number, number][]; suppressUntil: number;
};
const touches = new WeakMap<EventTarget, TouchState>();
const TAP_SLOP_PX = 10;
const MAX_TAP_MS = 650;
function scrollPositions(target: EventTarget): [Element, number, number][] {
  const positions: [Element, number, number][] = [];
  let el = target instanceof Element ? target : null;
  while (el) { positions.push([el, el.scrollLeft, el.scrollTop]); el = el.parentElement; }
  return positions;
}
function movedSinceDown(s: TouchState, e: PointerEvent): boolean {
  return Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_SLOP_PX
    || s.scroll.some(([el, x, y]) => Math.abs(el.scrollLeft - x) > 2 || Math.abs(el.scrollTop - y) > 2);
}
/** iOS pointerup fallback, only for a genuine tap. Scrolling/pinch/long-press never activates. */
export function bindMobileTap(handler: (e: SyntheticEvent) => void) {
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') { touches.delete(e.currentTarget); return; }
      touches.set(e.currentTarget, {
        pointerId: e.pointerId, x: e.clientX, y: e.clientY, started: Date.now(),
        moved: e.isPrimary === false, scroll: scrollPositions(e.currentTarget), suppressUntil: 0,
      });
    },
    onPointerMove: (e: PointerEvent) => {
      const s = touches.get(e.currentTarget);
      if (s && s.pointerId === e.pointerId && movedSinceDown(s, e)) s.moved = true;
      // Never preventDefault here: the browser owns pan and pinch gestures.
    },
    onPointerCancel: (e: PointerEvent) => {
      const s = touches.get(e.currentTarget);
      if (s) { s.moved = true; s.suppressUntil = Date.now() + 800; }
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const s = touches.get(e.currentTarget);
      if (!s || s.pointerId !== e.pointerId) return;
      s.suppressUntil = Date.now() + 800;
      if (s.moved || movedSinceDown(s, e) || Date.now() - s.started > MAX_TAP_MS) return;
      s.moved = true; // even a duplicate pointerup cannot activate twice
      e.preventDefault();
      handler(e);
    },
    onClick: (e: MouseEvent) => {
      const s = touches.get(e.currentTarget);
      const native = e.nativeEvent as globalThis.PointerEvent;
      if (native.pointerType === 'touch') return;
      // Safari synthesizes a MouseEvent without pointerType after pointerup.
      if (e.detail !== 0 && s && Date.now() < s.suppressUntil) { e.preventDefault(); return; }
      handler(e); // mouse and keyboard activation are preserved
    },
  };
}

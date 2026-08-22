export type MenuTriggerRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ViewportBox = {
  vw: number;
  vh: number;
  offsetTop: number;
  offsetLeft: number;
};

/** Participant tab bar (~4.5rem) + safe-bottom — flip menu above when near bottom chrome. */
export const CARD_MENU_BOTTOM_CHROME = 80;

/** Visual viewport metrics — clamp menu inside visible area on dense grids. */
export function readViewportBox(): ViewportBox {
  if (typeof window === 'undefined') {
    return { vw: 360, vh: 640, offsetTop: 0, offsetLeft: 0 };
  }
  const vv = window.visualViewport;
  return {
    vw: vv?.width ?? window.innerWidth,
    vh: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
  };
}

/**
 * Position the ⋯ dropdown directly under the trigger (fixed coords from getBoundingClientRect).
 * Centers under the button; clamps left/right to safe margins so 1st/last grid columns stay on-screen.
 */
export function cardMenuBox(
  rect: MenuTriggerRect,
  viewport?: ViewportBox,
  menuHeight = 200,
  bottomChrome = CARD_MENU_BOTTOM_CHROME,
): { top: number; left: number; width: number } {
  const pad = 8;
  const gap = 4;
  const { vw, vh } = viewport ?? readViewportBox();
  const btnW = Math.max(0, rect.right - rect.left);
  const width = Math.min(192, Math.max(btnW, vw - pad * 2));
  const maxBottom = Math.max(pad + menuHeight, vh - bottomChrome);

  const triggerCenter = (rect.left + rect.right) / 2;
  let left = triggerCenter - width / 2;
  if (left < pad) left = pad;
  if (left + width > vw - pad) left = Math.max(pad, vw - pad - width);

  const below = rect.bottom + gap;
  const above = rect.top - gap - menuHeight;

  let top: number;
  if (below + menuHeight <= maxBottom - pad) {
    top = below;
  } else if (above >= pad) {
    top = above;
  } else {
    top = Math.max(pad, Math.min(below, maxBottom - pad - menuHeight));
  }

  return { top, left, width };
}

/** Rough menu height from item count (~44px per row + chrome). */
export function cardMenuHeight(itemCount: number): number {
  if (itemCount <= 0) return 0;
  return itemCount * 44 + 8;
}

/** Keep the ⋯ dropdown inside the viewport so left-column cards do not clip labels. */
export function cardMenuBox(
  rect: { right: number; bottom: number; top?: number },
  vw: number,
  vh: number,
  menuHeight = 200,
): { top: number; left: number; width: number } {
  const pad = 8;
  const gap = 6;
  const width = Math.min(192, Math.max(0, vw - pad * 2));
  let left = rect.right - width;
  if (left < pad) left = pad;
  if (left + width > vw - pad) left = Math.max(pad, vw - pad - width);

  const below = rect.bottom + gap;
  const anchorTop = rect.top ?? rect.bottom - 20;
  const above = anchorTop - gap - menuHeight;

  let top: number;
  if (below + menuHeight <= vh - pad) {
    top = below;
  } else if (above >= pad) {
    top = above;
  } else {
    top = Math.max(pad, Math.min(below, vh - pad - menuHeight));
  }
  return { top, left, width };
}

/** Rough menu height from item count (~44px per row + chrome). */
export function cardMenuHeight(itemCount: number): number {
  if (itemCount <= 0) return 0;
  return itemCount * 44 + 8;
}

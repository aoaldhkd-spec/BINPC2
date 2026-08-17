/** Keep the ⋯ dropdown inside the viewport so left-column cards do not clip labels. */
export function cardMenuBox(
  rect: { right: number; bottom: number },
  vw: number,
  vh: number,
): { top: number; left: number; width: number } {
  const pad = 8;
  const width = Math.min(192, Math.max(0, vw - pad * 2));
  let left = rect.right - width;
  if (left < pad) left = pad;
  if (left + width > vw - pad) left = Math.max(pad, vw - pad - width);
  const top = Math.max(pad, Math.min(rect.bottom + 6, vh - 208));
  return { top, left, width };
}

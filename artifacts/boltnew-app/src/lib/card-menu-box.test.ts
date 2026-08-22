import { describe, expect, it } from 'vitest';
import { cardMenuBox, cardMenuHeight, CARD_MENU_BOTTOM_CHROME, CARD_MENU_GAP } from './card-menu-box';

const VP = { vw: 360, vh: 640, offsetTop: 0, offsetLeft: 0 };
const VP320 = { vw: 320, vh: 568, offsetTop: 0, offsetLeft: 0 };

describe('cardMenuBox', () => {
  it('opens directly below trigger with CARD_MENU_GAP', () => {
    const trigger = { left: 150, right: 170, top: 4, bottom: 24 };
    const box = cardMenuBox(trigger, VP, 180);
    expect(box.top).toBe(trigger.bottom + CARD_MENU_GAP);
  });

  it('right-aligns under a 3-col grid ⋯ trigger on 320px width', () => {
    const trigger = { left: 280, right: 300, top: 4, bottom: 24 };
    const box = cardMenuBox(trigger, VP320, 180);
    expect(box.top).toBe(trigger.bottom + CARD_MENU_GAP);
    expect(box.left).toBe(trigger.right - box.width);
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.left + box.width).toBeLessThanOrEqual(320 - 8);
  });

  it('clamps left edge for first-column grid trigger', () => {
    const trigger = { left: 4, right: 24, top: 4, bottom: 24 };
    const box = cardMenuBox(trigger, VP320, 180);
    expect(box.top).toBe(trigger.bottom + CARD_MENU_GAP);
    expect(box.left).toBe(8);
    expect(box.left + box.width).toBeLessThanOrEqual(320 - 8);
  });

  it('right-aligns under a 2-col grid ⋯ trigger', () => {
    const trigger = { left: 320, right: 340, top: 4, bottom: 24 };
    const box = cardMenuBox(trigger, VP, 180);
    expect(box.top).toBe(trigger.bottom + CARD_MENU_GAP);
    expect(box.left).toBe(trigger.right - box.width);
    expect(box.left + box.width).toBeLessThanOrEqual(360 - 8);
  });

  it('keeps a right-column menu inside the screen', () => {
    const trigger = { left: 332, right: 352, top: 60, bottom: 80 };
    const box = cardMenuBox(trigger, VP, 180);
    expect(box.top).toBe(trigger.bottom + CARD_MENU_GAP);
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.left + box.width).toBeLessThanOrEqual(352);
  });

  it('opens above the trigger when there is no room below on small viewports', () => {
    const trigger = { left: 100, right: 120, top: 340, bottom: 360 };
    const box = cardMenuBox(trigger, { vw: 320, vh: 400, offsetTop: 0, offsetLeft: 0 }, 180);
    expect(box.top).toBeLessThan(trigger.top);
    expect(box.top).toBeGreaterThanOrEqual(8);
  });

  it('flips above bottom tab bar when trigger sits above chrome', () => {
    const vh = 640;
    const trigger = { left: 150, right: 170, top: vh - CARD_MENU_BOTTOM_CHROME - 30, bottom: vh - CARD_MENU_BOTTOM_CHROME - 10 };
    const box = cardMenuBox(trigger, { vw: 360, vh, offsetTop: 0, offsetLeft: 0 }, 180);
    expect(box.top + 180).toBeLessThanOrEqual(vh - CARD_MENU_BOTTOM_CHROME + 8);
  });

  it('returns fixed-position coords independent of vv offset', () => {
    const trigger = { left: 320, right: 340, top: 4, bottom: 24 };
    const box = cardMenuBox(trigger, { vw: 360, vh: 640, offsetTop: 12, offsetLeft: 4 }, 180);
    expect(box.top).toBe(trigger.bottom + CARD_MENU_GAP);
    expect(box.left).toBe(trigger.right - box.width);
  });
});

describe('cardMenuHeight', () => {
  it('estimates height from item count', () => {
    expect(cardMenuHeight(4)).toBe(184);
  });
});

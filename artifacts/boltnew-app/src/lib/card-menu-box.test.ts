import { describe, expect, it } from 'vitest';
import { cardMenuBox, cardMenuHeight } from './card-menu-box';

const VP = { vw: 360, vh: 640, offsetTop: 0, offsetLeft: 0 };
const VP320 = { vw: 320, vh: 568, offsetTop: 0, offsetLeft: 0 };

describe('cardMenuBox', () => {
  it('centers under a 3-col grid ⋯ trigger on 320px width', () => {
    const box = cardMenuBox({ left: 86, right: 106, top: 4, bottom: 24 }, VP320, 180);
    expect(box.top).toBe(30);
    expect(box.left).toBe(8);
    expect(box.width).toBe(192);
    expect(box.left + box.width).toBeLessThanOrEqual(320 - 8);
  });

  it('centers under a 2-col grid ⋯ trigger', () => {
    const box = cardMenuBox({ left: 150, right: 170, top: 4, bottom: 24 }, VP, 180);
    expect(box.top).toBe(30);
    expect(box.left).toBe(64);
    expect(box.left + box.width).toBeLessThanOrEqual(360 - 8);
  });

  it('keeps a right-column menu inside the screen', () => {
    const box = cardMenuBox({ left: 332, right: 352, top: 60, bottom: 80 }, VP, 180);
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.left + box.width).toBeLessThanOrEqual(352);
  });

  it('opens above the trigger when there is no room below on small viewports', () => {
    const box = cardMenuBox({ left: 100, right: 120, top: 340, bottom: 360 }, { vw: 320, vh: 400, offsetTop: 0, offsetLeft: 0 }, 180);
    expect(box.top).toBeLessThan(340);
    expect(box.top).toBeGreaterThanOrEqual(8);
  });

  it('applies visualViewport offset for iOS fixed positioning', () => {
    const box = cardMenuBox({ left: 150, right: 170, top: 4, bottom: 24 }, { vw: 360, vh: 640, offsetTop: 12, offsetLeft: 0 }, 180);
    expect(box.top).toBe(42);
    expect(box.left).toBe(64);
  });
});

describe('cardMenuHeight', () => {
  it('estimates height from item count', () => {
    expect(cardMenuHeight(4)).toBe(184);
  });
});

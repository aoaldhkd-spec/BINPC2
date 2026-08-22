import { describe, expect, it } from 'vitest';
import { cardMenuBox, cardMenuHeight } from './card-menu-box';

describe('cardMenuBox', () => {
  it('shifts the menu right when the left column would clip past x=0', () => {
    const box = cardMenuBox({ right: 170, bottom: 80, top: 60 }, 360, 640, 180);
    expect(box.left).toBe(8);
    expect(box.left + box.width).toBeLessThanOrEqual(360 - 8);
    expect(box.width).toBe(192);
    expect(box.top).toBe(86);
  });

  it('keeps a right-column menu inside the screen', () => {
    const box = cardMenuBox({ right: 352, bottom: 80, top: 60 }, 360, 640, 180);
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.left + box.width).toBeLessThanOrEqual(352);
  });

  it('opens above the trigger when there is no room below on small viewports', () => {
    const box = cardMenuBox({ right: 120, bottom: 360, top: 340 }, 320, 400, 180);
    expect(box.top).toBeLessThan(340);
    expect(box.top).toBeGreaterThanOrEqual(8);
  });
});

describe('cardMenuHeight', () => {
  it('estimates height from item count', () => {
    expect(cardMenuHeight(4)).toBe(184);
  });
});

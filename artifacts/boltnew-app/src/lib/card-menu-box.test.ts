import { describe, expect, it } from 'vitest';
import { cardMenuBox } from './card-menu-box';

describe('cardMenuBox', () => {
  it('shifts the menu right when the left column would clip past x=0', () => {
    const box = cardMenuBox({ right: 170, bottom: 80 }, 360, 640);
    expect(box.left).toBe(8);
    expect(box.left + box.width).toBeLessThanOrEqual(360 - 8);
    expect(box.width).toBe(192);
  });

  it('keeps a right-column menu inside the screen', () => {
    const box = cardMenuBox({ right: 352, bottom: 80 }, 360, 640);
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.left + box.width).toBeLessThanOrEqual(352);
  });
});

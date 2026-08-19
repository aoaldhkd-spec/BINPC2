import { describe, expect, it } from 'vitest';
import {
  EMOJI_CATEGORIES,
  QUICK_MSGS,
  QUICK_REACTIONS,
  STATUS_QUICK_MSGS,
  THEME_CYCLE,
  THEME_EMOJI,
} from './chat-picker-data';

describe('chat picker static data', () => {
  it('keeps every picker category populated and uniquely identified', () => {
    expect(new Set(EMOJI_CATEGORIES.map(category => category.id)).size).toBe(EMOJI_CATEGORIES.length);
    expect(EMOJI_CATEGORIES.every(category => category.emojis.length > 0)).toBe(true);
  });

  it('keeps quick actions and theme labels available', () => {
    expect(QUICK_MSGS).toContain('번호 교환해요! 📱');
    expect(STATUS_QUICK_MSGS.every(msg => msg.length <= 30)).toBe(true);
    expect(QUICK_REACTIONS).toEqual(['❤️', '😂', '👍', '🔥', '😮', '😢']);
    expect(THEME_CYCLE.every(theme => Boolean(THEME_EMOJI[theme]))).toBe(true);
  });
});

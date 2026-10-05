import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULE_FLAGS } from '../lib/module-flags';
import { tutorialBasicTopics } from './TutorialModal';

describe('TutorialModal module filtering', () => {
  it('hides detached feature topics and disabled stats/ranking tab tips', () => {
    const topics = tutorialBasicTopics({
      ...DEFAULT_MODULE_FLAGS,
      hearts: false,
      direct_chat: false,
      group_chat: false,
      stats: false,
      ranking: false,
    });

    const ids = topics.map((topic) => topic.id);
    expect(ids).not.toContain('heart');
    expect(ids).not.toContain('chat');
    expect(ids).not.toContain('group');
    expect(ids).toContain('guide');
    expect(ids).toContain('settings');

    const guide = topics.find((topic) => topic.id === 'guide');
    const tabs = guide?.sections?.find((section) => section.variant === 'tabs');
    const titles = tabs?.tips.map((tip) => tip.title) ?? [];
    expect(titles).not.toContain('통계');
    expect(titles).not.toContain('랭킹');
    expect(titles).toContain('참여자');
    expect(titles).toContain('설정');
  });

  it('keeps every current topic when all modules are on', () => {
    const ids = tutorialBasicTopics(DEFAULT_MODULE_FLAGS).map((topic) => topic.id);
    expect(ids).toContain('heart');
    expect(ids).toContain('chat');
    expect(ids).toContain('group');
  });
});

import { describe, expect, it } from 'vitest';
import {
  ensureDirectNoticeSlots,
  hasServerDirectNoticePresets,
  liveDirectNoticeText,
  loadDirectNoticePresets,
  loadDirectNotices,
  patchDirectNotice,
  removeDirectNotice,
  serializeDirectNotices,
  serializeQuickNoticeDraft,
  upsertDirectNotice,
  withLiveNoticeEnabled,
} from './event-schedule-apply';

describe('direct notice list helpers', () => {
  it('starts empty and migrates a legacy single draft once', () => {
    expect(loadDirectNotices(null)).toEqual([]);
    expect(loadDirectNotices('[]')).toEqual([]);
    expect(loadDirectNotices(null, serializeQuickNoticeDraft('잠시 후 하트 이벤트가 시작됩니다.'))).toEqual([
      { id: 'migrated-draft', text: '잠시 후 하트 이벤트가 시작됩니다.' },
    ]);
    expect(loadDirectNotices('[]', serializeQuickNoticeDraft('legacy'))).toEqual([]);
  });

  it('keeps order, isolated upsert, and isolated delete', () => {
    const raw = serializeDirectNotices([
      { id: 'a', text: '잠시 후 호감하트가 열립니다.' },
      { id: 'b', text: '자리 이동해주세요.' },
      { id: 'c', text: '잠시 후 무지개하트가 열립니다.' },
    ]);
    const loaded = loadDirectNotices(raw);
    expect(loaded.map(n => n.text)).toEqual([
      '잠시 후 호감하트가 열립니다.',
      '자리 이동해주세요.',
      '잠시 후 무지개하트가 열립니다.',
    ]);
    const edited = upsertDirectNotice(loaded, 'b', '자리 이동 후 앉아주세요.');
    expect(edited.map(n => n.text)).toEqual([
      '잠시 후 호감하트가 열립니다.',
      '자리 이동 후 앉아주세요.',
      '잠시 후 무지개하트가 열립니다.',
    ]);
    expect(loaded[1].text).toBe('자리 이동해주세요.');
    const removed = removeDirectNotice(edited, 'b');
    expect(removed.map(n => n.id)).toEqual(['a', 'c']);
    expect(JSON.parse(serializeDirectNotices(removed)).map((n: { id: string }) => n.id)).toEqual(['a', 'c']);
  });

  it('treats server [] as source of truth and does not remigrate local drafts', () => {
    expect(hasServerDirectNoticePresets('[]')).toBe(true);
    expect(hasServerDirectNoticePresets(undefined)).toBe(false);
    expect(loadDirectNoticePresets('[]')).toEqual([]);
    expect(loadDirectNoticePresets(serializeDirectNotices([{ id: 'x', text: '공지' }]))).toEqual([
      { id: 'x', text: '공지' },
    ]);
  });

  it('pads to four notice slots without injecting defaults into parse', () => {
    expect(loadDirectNotices(serializeDirectNotices([{ id: 'x', text: '공지' }]))).toEqual([
      { id: 'x', text: '공지' },
    ]);
    const padded = ensureDirectNoticeSlots([{ id: 'x', text: '공지' }]);
    expect(padded).toHaveLength(4);
    expect(padded[0]).toEqual({ id: 'x', text: '공지', at: '23:00', enabled: false });
    expect(padded.slice(1).map(n => n.id)).toEqual(['dn-fixed-2', 'dn-fixed-3', 'dn-fixed-4']);
    expect(ensureDirectNoticeSlots([
      { id: 'a', text: '1' },
      { id: 'b', text: '2' },
      { id: 'c', text: '3' },
      { id: 'd', text: '4' },
      { id: 'e', text: '5' },
    ]).map(n => n.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('broadcasts the first enabled non-empty notice and can seed from live text', () => {
    const items = ensureDirectNoticeSlots([
      { id: 'a', text: '첫 번째' },
      { id: 'b', text: '자리 이동해주세요.' },
    ]);
    expect(liveDirectNoticeText(items)).toBe('');
    const enabledSecond = patchDirectNotice(items, 'b', { enabled: true });
    expect(liveDirectNoticeText(enabledSecond)).toBe('자리 이동해주세요.');
    const both = patchDirectNotice(enabledSecond, 'a', { enabled: true });
    expect(liveDirectNoticeText(both)).toBe('첫 번째');
    expect(withLiveNoticeEnabled([{ id: 'a', text: '자리 이동해주세요.' }], '자리 이동해주세요.')[0]?.enabled).toBe(true);
    expect(withLiveNoticeEnabled([{ id: 'a', text: '다른 공지', enabled: true }], '자리 이동해주세요.')[0]?.enabled).toBe(true);
    expect(withLiveNoticeEnabled([{ id: 'a', text: '다른 공지', enabled: true }], '자리 이동해주세요.')[0]?.text).toBe('다른 공지');
  });
});

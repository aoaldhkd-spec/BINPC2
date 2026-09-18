import { describe, expect, it } from 'vitest';
import {
  hasServerDirectNoticePresets,
  loadDirectNoticePresets,
  loadDirectNotices,
  removeDirectNotice,
  serializeDirectNotices,
  serializeQuickNoticeDraft,
  upsertDirectNotice,
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
});

import { describe, expect, it } from 'vitest';
import type { Message } from '../types/app';
import {
  buildMessageMetaMap,
  collectInfoResponseTypes,
  isInfoAck,
  parseContactCard,
  parseInfoAckData,
  parseReply,
  parseStickerIdx,
} from './chat-message-format';

const message = (id: string, content: string): Message => ({
  id,
  content,
  sender_id: 'sender',
  chat_id: 'chat',
  created_at: '2026-08-17T12:34:00.000Z',
} as Message);

describe('chat message formatting', () => {
  it('parses the existing wire prefixes without changing content', () => {
    expect(parseContactCard('__contact__\n카카오: abc\n전화: 010')).toEqual(['카카오: abc', '전화: 010']);
    expect(parseReply('__reply__원문\n답장')).toEqual({ quote: '원문', text: '답장' });
    expect(parseStickerIdx('__sticker__12')).toBe(12);
    expect(parseInfoAckData('__infoack__:phone:010:1234')).toEqual({ type: 'phone', value: '010:1234' });
  });

  it('collects responses and preserves mutually exclusive render metadata', () => {
    const messages = [
      message('ack', '__infoack__:birthday:8월 17일'),
      message('reply', '__reply__원문\n답장'),
      message('card', '__contact__\n카카오: abc'),
    ];
    expect(collectInfoResponseTypes(messages, isInfoAck)).toEqual(new Set(['birthday']));

    const metadata = buildMessageMetaMap(messages);
    expect(metadata.get('ack')).toMatchObject({ isInfoAckMsg: true, isReply: false, isCard: false });
    expect(metadata.get('reply')).toMatchObject({ isReply: true, isInfoAckMsg: false });
    expect(metadata.get('card')).toMatchObject({ isCard: true, isReply: false });
  });
});

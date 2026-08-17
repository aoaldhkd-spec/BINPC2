import type { Message } from '../types/app';

export type InfoRequestType = 'birthday' | 'phone';

export function isContactCard(content: string | null | undefined): boolean {
  return Boolean(content?.startsWith('__contact__'));
}

export function parseContactCard(content: string): string[] {
  return content.replace(/^__contact__\n?/, '').split('\n').filter(Boolean);
}

export function isReplyMsg(content: string | null | undefined): boolean {
  return Boolean(content?.startsWith('__reply__'));
}

export function parseReply(content: string): { quote: string; text: string } {
  const body = content.replace(/^__reply__/, '');
  const newline = body.indexOf('\n');
  return newline === -1
    ? { quote: body, text: '' }
    : { quote: body.slice(0, newline), text: body.slice(newline + 1) };
}

export function isStickerMsg(content: string | null | undefined): boolean {
  return Boolean(content?.startsWith('__sticker__'));
}

export function parseStickerIdx(content: string): number {
  return Number.parseInt(content.replace('__sticker__', ''), 10);
}

export function isInfoReq(content: string | null | undefined): boolean {
  return Boolean(content?.startsWith('__inforeq__:'));
}

export function isInfoAck(content: string | null | undefined): boolean {
  return Boolean(content?.startsWith('__infoack__:'));
}

export function isInfoDecline(content: string | null | undefined): boolean {
  return Boolean(content?.startsWith('__infodecline__:'));
}

export function parseInfoReqType(content: string): InfoRequestType {
  return content.includes('birthday') ? 'birthday' : 'phone';
}

export function parseInfoAckData(content: string): { type: InfoRequestType; value: string } {
  const body = content.replace('__infoack__:', '');
  const separator = body.indexOf(':');
  return {
    type: body.slice(0, separator) as InfoRequestType,
    value: body.slice(separator + 1),
  };
}

export function collectInfoResponseTypes(
  messages: readonly Message[],
  predicate: (content: string | null | undefined) => boolean,
): Set<InfoRequestType> {
  return new Set(
    messages
      .filter(message => predicate(message.content))
      .map(message => parseInfoReqType(message.content!)),
  );
}

export function buildMessageMetaMap(messages: readonly Message[]) {
  return new Map(messages.map(message => {
    const isCard = isContactCard(message.content);
    const isSticker = !isCard && isStickerMsg(message.content);
    const stickerIdx = isSticker ? parseStickerIdx(message.content!) : -1;
    const isReply = !isCard && !isSticker && isReplyMsg(message.content);
    const replyData = isReply ? parseReply(message.content!) : null;
    const isInfoReqMsg = !isCard && !isSticker && !isReply && isInfoReq(message.content);
    const isInfoAckMsg = !isCard && !isSticker && !isReply && !isInfoReqMsg && isInfoAck(message.content);
    const isInfoDeclineMsg = !isCard && !isSticker && !isReply && !isInfoReqMsg && !isInfoAckMsg && isInfoDecline(message.content);
    return [message.id, {
      time: new Date(message.created_at).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      isCard,
      isSticker,
      stickerIdx,
      isReply,
      replyData,
      isInfoReqMsg,
      isInfoAckMsg,
      isInfoDeclineMsg,
    }] as const;
  }));
}

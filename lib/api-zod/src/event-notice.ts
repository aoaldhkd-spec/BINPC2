import type { HubEvent } from './event-hub';

type EventNotice = Pick<HubEvent, 'notice' | 'media' | 'materials'>;
/** Only explicitly public notice uploads count; maps and private posters never do. */
export function publicNoticeMaterials(event: EventNotice): {id:string;url:string;alt:string}[] {
  return event.media.flatMap(url => {
    const material=event.materials?.find(item=>item.url===url&&item.purpose==='notice'&&!item.hidden);
    return material ? [{id:material.id,url:material.url,alt:material.alt}] : [];
  });
}
export function hasPublicEventNotice(event: EventNotice): boolean {
  return Boolean(event.notice.trim() || publicNoticeMaterials(event).length);
}
export function publicNoticeSignature(event: EventNotice): string {
  return JSON.stringify({notice:event.notice,media:publicNoticeMaterials(event)});
}

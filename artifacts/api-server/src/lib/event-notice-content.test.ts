import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {HubEventInput,hasPublicEventNotice,publicNoticeMaterials,type HubEvent,type HubMaterial} from '@workspace/api-zod';
import {captureEventNotice,recordEventNoticeChange,recruitmentConfigurationIssue} from './event-operations.js';
const now='2026-10-30T10:00:00.000Z';
const event=():HubEvent=>({...HubEventInput.parse({title:'운영자 작성',date:'2026-10-30',area:'가상',address:'비공개 주소',fee:23000,account:'합성 계좌',deadline:'행사 전',notice:''}),id:randomUUID(),revision:1,recruitment:false,nextRank:3,history:[]});
const image=(purpose:HubMaterial['purpose'],hidden=false):HubMaterial=>{const id=randomUUID();return{id,url:`/api/event-hub/media/${id}.png`,purpose,hidden,alt:purpose==='notice'?'직접 작성한 공지':'승인 후 장소',at:now};};
it('permits an empty draft but requires authored text or explicit public notice images to open',()=>{
 const e=event();expect(e.notice).toBe('');expect(hasPublicEventNotice(e)).toBe(false);expect(recruitmentConfigurationIssue(e)).toContain('공지');
 e.notice=' ';expect(hasPublicEventNotice(e)).toBe(false);e.notice='운영자가 직접 작성한 공지';expect(hasPublicEventNotice(e)).toBe(true);expect(recruitmentConfigurationIssue(e)).toBeNull();
 e.notice='';const notice=image('notice');e.materials=[notice];e.media=[notice.url];expect(hasPublicEventNotice(e)).toBe(true);expect(recruitmentConfigurationIssue(e)).toBeNull();
});
it('private maps/posters and hidden or unlinked notice images never satisfy public notice',()=>{
 for(const purpose of ['map','poster','video'] as const){const e=event(),privateMedia=image(purpose);e.materials=[privateMedia];e.media=[privateMedia.url];expect(hasPublicEventNotice(e)).toBe(false);expect(publicNoticeMaterials(e)).toEqual([]);}
 const e=event(),notice=image('notice',true);e.materials=[notice];e.media=[notice.url];expect(hasPublicEventNotice(e)).toBe(false);notice.hidden=false;e.media=[];expect(hasPublicEventNotice(e)).toBe(false);
});
it('records prior public image and notice version without touching fee, rank, stock or private map',()=>{
 const e=event(),notice=image('notice'),map=image('map');e.materials=[notice,map];e.media=[notice.url,map.url];const before=captureEventNotice(e),replacement=image('notice');e.materials.push(replacement);e.media=[replacement.url,map.url];
 expect(recordEventNoticeChange(e,before,now)).toBe(true);expect(e.noticeVersion).toBe(2);expect(e.nextRank).toBe(3);expect(e.fee).toBe(23000);expect(e.versions?.[0]).toMatchObject({notice:'',noticeVersion:1,noticeMedia:[{id:notice.id,url:notice.url,alt:notice.alt}]});expect(JSON.stringify(e.versions?.[0].noticeMedia)).not.toContain(map.id);expect(e.materials).toContainEqual(notice);
});
it('private map metadata and relative map placement do not invalidate public notice acknowledgement',()=>{
 const e=event(),notice=image('notice'),map=image('map');e.materials=[notice,map];e.media=[notice.url,map.url];const before=captureEventNotice(e);map.alt='지도 설명 수정';e.materials=[map,notice];e.media=[map.url,notice.url];expect(recordEventNoticeChange(e,before,now)).toBe(false);expect(e.noticeVersion).toBe(1);expect(e.versions).toBeUndefined();
});
it('public notice ordering, alt text or visibility changes require acknowledgement exactly once',()=>{
 const e=event(),first=image('notice'),second=image('notice');e.materials=[first,second];e.media=[first.url,second.url];let before=captureEventNotice(e);e.media=[second.url,first.url];expect(recordEventNoticeChange(e,before,now)).toBe(true);expect(e.noticeVersion).toBe(2);
 before=captureEventNotice(e);first.alt='중요 안내 정정';expect(recordEventNoticeChange(e,before,now)).toBe(true);expect(e.noticeVersion).toBe(3);before=captureEventNotice(e);expect(recordEventNoticeChange(e,before,now)).toBe(false);second.hidden=true;expect(recordEventNoticeChange(e,before,now)).toBe(true);expect(e.noticeVersion).toBe(4);
});

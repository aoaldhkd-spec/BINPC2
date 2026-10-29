import {beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {HUB_CONSENT_VERSION} from '@workspace/api-zod';
import {companionCommand,companionDraftViews} from './companion-records.js';
import {type HubTx} from './event-hub-store.js';
let rows:Map<string,unknown>;
const clone=<T>(v:T)=>v===undefined?v:structuredClone(v);
const tx={
 async get(kind:string,id:string){return clone(rows.get(`${kind}:${id}`));},
 async put(kind:string,id:string,value:unknown){rows.set(`${kind}:${id}`,clone(value));},
 async applicationsForOwner(owner:string){return [...rows].filter(([k,v])=>k.startsWith('application:')&&(v as {owner:string}).owner===owner).map(([,v])=>clone(v));},
 async membersForOwner(owner:string){return [...rows].filter(([k,v])=>k.startsWith('member:')&&(v as {owner:string}).owner===owner).map(([,v])=>clone(v));},
} as unknown as HubTx;
const eventId='synthetic-event';
const token='A'.repeat(43),now='2026-10-30T10:00:00.000Z';
const run=(owner:string,action:string,data:Record<string,unknown>={},revision?:number,target='')=>companionCommand(tx,{
 owner,eventId,now,maxDrafts:5,invitationTtlMs:3600000,command:{action,target,data:{eventId,...data},revision},
},()=>token);
beforeEach(()=>{rows=new Map();rows.set('owner:sponsor',{id:'sponsor',basicDrafts:{unrelated:{revision:3}},marker:'preserved'});rows.set('owner:friend',{id:'friend'});});
async function prepared(){const id=randomUUID();await run('sponsor','companion.draft.save',{id,basic:{nickname:'친구시험',birthYear:1995,location:'파주'},permissionToProvide:true},0);await run('sponsor','companion.invite',{},1,id);return id;}
it('stores only friend draft; keeps sponsor own draft/member untouched and creates no application/rank',async()=>{
 const member={owner:'sponsor',basic:{nickname:'본인시험',birthYear:1994,location:'서울'},profile:{mbti:'INTJ'}};rows.set('member:sponsor',clone(member));
 await prepared();const sponsor=rows.get('owner:sponsor') as any;
 expect(sponsor.basicDrafts).toEqual({unrelated:{revision:3}});expect(sponsor.marker).toBe('preserved');expect(rows.get('member:sponsor')).toEqual(member);
 expect([...rows.keys()].some(k=>k.startsWith('application:'))).toBe(false);
 expect(JSON.stringify(companionDraftViews(sponsor))).not.toContain('inviteHash');
 expect(JSON.stringify([...rows.values()])).not.toContain(token);
});
it('requires a separate authenticated owner and friend collection consent',async()=>{
 await prepared();await expect(run('missing','companion.claim',{invitationToken:token,collection:true,version:HUB_CONSENT_VERSION})).rejects.toMatchObject({code:'AUTH'});
 await expect(run('sponsor','companion.claim',{invitationToken:token,collection:true,version:HUB_CONSENT_VERSION})).rejects.toMatchObject({code:'COMPANION_SELF'});
 await expect(run('friend','companion.claim',{invitationToken:token,collection:false,version:HUB_CONSENT_VERSION})).rejects.toThrow();
 expect((rows.get('owner:friend') as any).basicDrafts).toBeUndefined();
});
it('claims into only the friend draft; preserves friend member identity and does not copy sponsor profile',async()=>{
 const id=await prepared();const member={owner:'friend',basic:{nickname:'기존친구',birthYear:1993,location:'안산'},profile:{mbti:'ENFP'}};rows.set('member:friend',clone(member));
 await run('friend','companion.claim',{invitationToken:token,collection:true,version:HUB_CONSENT_VERSION});
 const friend=rows.get('owner:friend') as any;
 expect(friend.basicDrafts[eventId].basic.nickname).toBe('기존친구');expect(friend.companionOrigins[eventId]).toMatchObject({sponsorOwner:'sponsor',companionDraftId:id});
 expect(friend.basicDrafts[eventId].basic).not.toHaveProperty('profile');expect(rows.get('member:friend')).toEqual(member);
 await expect(run('friend','companion.claim',{invitationToken:token,collection:true,version:HUB_CONSENT_VERSION})).rejects.toMatchObject({code:'COMPANION_INVITE'});
 await expect(run('sponsor','companion.draft.remove',{},3,id)).rejects.toMatchObject({code:'COMPANION_LOCKED'});
});
it('does not merge or overwrite an existing friend application',async()=>{
 await prepared();const old={id:'existing',owner:'friend',eventId,payment:'approved',profileId:'existing-profile',cards:[{id:'kept'}]};rows.set('application:existing',clone(old));
 await expect(run('friend','companion.claim',{invitationToken:token,collection:true,version:HUB_CONSENT_VERSION})).rejects.toMatchObject({code:'COMPANION_CONFLICT'});
 expect(rows.get('application:existing')).toEqual(old);
});
it('stale saves fail; editing invalidates the prior invitation without deleting its record',async()=>{
 const id=await prepared();await expect(run('sponsor','companion.draft.save',{id,basic:{nickname:'수정친구'},permissionToProvide:true},0)).rejects.toMatchObject({code:'REVISION'});
 await run('sponsor','companion.draft.save',{id,basic:{nickname:'수정친구',birthYear:1995,location:'서울'},permissionToProvide:true},2);
 await expect(run('friend','companion.claim',{invitationToken:token,collection:true,version:HUB_CONSENT_VERSION})).rejects.toMatchObject({code:'COMPANION_INVITE'});
 expect([...rows.keys()].filter(k=>k.startsWith('settings:companion-invite:'))).toHaveLength(1);
});

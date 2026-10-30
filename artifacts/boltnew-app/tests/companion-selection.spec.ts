import {test,expect,type APIRequestContext,type BrowserContext,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {HUB_CONSENT_VERSION,PROFILE_CONSENT_VERSION} from '../../../lib/api-zod/src/event-hub';
import {eventCycleMilestones} from '../../../lib/api-zod/src/event-cycle-clock';

const adminToken=process.env.HUB_E2E_ADMIN_TOKEN;
if(!adminToken)throw Error('Explicit isolated administrator fixture required');
const adminHeaders={'x-admin-token':adminToken};
async function local(context:BrowserContext,admin=false){
  const origin=process.env.HUB_E2E_BASE_URL!;
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(({offset,token})=>{
    const Native=Date;class Clock extends Native{constructor(...args:unknown[]){super(...((args.length?args:[Native.now()+offset]) as [string]));}static now(){return Native.now()+offset;}}
    globalThis.Date=Clock as DateConstructor;
    if(token){localStorage.setItem('admin_token_v1',token);localStorage.setItem('admin_session_v1',JSON.stringify({phone:'01000000000',authedAt:Date.now()}));}
  },{offset:Number(process.env.HUB_E2E_CLOCK_OFFSET_MS??0),token:admin?adminToken:undefined});
}
async function command(request:APIRequestContext,action:string,target='',data:Record<string,unknown>={},revision?:number,admin=false){
  const response=await request.post('/api/event-hub/mutate',{headers:admin?adminHeaders:undefined,data:{action,target,data,revision,requestId:randomUUID()}});
  expect(response.status(),`${action}: ${await response.text()}`).toBe(200);return response.json();
}
async function state(request:APIRequestContext,admin=false){
  const response=await request.get(`/api/event-hub/${admin?'admin':'state'}`,{headers:admin?adminHeaders:undefined});expect(response.status()).toBe(200);return response.json();
}
async function createEvent(request:APIRequestContext,label:string){
  const ready=await (await request.get('/api/db/ready')).json();const milestones=eventCycleMilestones(String(ready.settings?.event_cycle_started_at??''));expect(milestones).toBeTruthy();
  const date=new Date(milestones!.grantAt.getTime()+9*3600000).toISOString().slice(0,10);
  const result=await command(request,'event.save','',{title:label,date,start:'22:00',end:'01:00',area:'격리 시험',address:'승인자만 보는 가상 장소',fee:23000,deposit:23000,account:'실제 송금 불가 가상 계좌',deadline:'행사 전',notice:'격리 시험 전용 공지',benefitsEnabled:false,benefits:[],cardsEnabled:false},undefined,true);
  await command(request,'event.recruitment',result.id,{enabled:true},1,true);return String(result.id);
}
const basic=(nickname:string)=>({nickname,birthYear:1995,location:'서울',depositor:'가상대표',collection:true,version:HUB_CONSENT_VERSION});
async function prepareDraft(page:Page,eventId:string,ownName:string,friendNames:string[]){
  await page.goto(`/events/e/${eventId}`);await expect(page.getByRole('button',{name:'신청하기',exact:true})).toBeVisible();
  await command(page.request,'application.basic-draft','',{eventId,basic:basic(ownName),nextStep:5},0);
  const draftIds:string[]=[];
  for(const nickname of friendNames){const group=(await state(page.request)).companionDrafts?.[eventId];const id=randomUUID();await command(page.request,'companion.draft.save','',{eventId,id,basic:{nickname,birthYear:1995,location:'서울'},permissionToProvide:true},group?.revision??0);draftIds.push(id);}
  return draftIds;
}
async function openFinal(page:Page,eventId:string){
  await page.goto(`/events/e/${eventId}`);await page.getByRole('button',{name:'신청하기',exact:true}).click();
  await page.getByRole('button',{name:'본인 정보 입력',exact:true}).click();
  await expect(page.getByLabel('실제 은행 입금 시 보내는 분 이름',{exact:true})).toBeVisible();
  await expect(page.getByLabel('연락용 전화번호',{exact:false})).toHaveCount(0);
}

test('actual server selection survives reload and authenticated recovery in another browser without adding the excluded person',async({page,context,request,browser},info)=>{
  test.setTimeout(120000);context.setDefaultTimeout(15000);await local(context);await page.setViewportSize({width:390,height:844});
  const suffix=randomBytes(2).toString('hex'),ownName=`본${suffix}`,included=`함${suffix}`,excluded=`제${suffix}`;
  const eventId=await createEvent(request,`선택복구 ${suffix}`),draftIds=await prepareDraft(page,eventId,ownName,[included,excluded]);
  await openFinal(page,eventId);
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/event-hub/mutate')&&response.request().postDataJSON()?.action==='companion.selection.save');
  await page.getByLabel(`${excluded} · 1995년생 · 서울`,{exact:true}).uncheck();expect((await saved).status()).toBe(200);
  await expect(page.getByRole('button',{name:'2명 함께 신청',exact:true})).toBeEnabled();
  expect((await state(page.request)).companionDrafts[eventId].selection.draftIds).toEqual([draftIds[0]]);
  await openFinal(page,eventId);await expect(page.getByLabel(`${excluded} · 1995년생 · 서울`,{exact:true})).not.toBeChecked();
  await page.screenshot({path:info.outputPath('selection-reopened-390.png'),fullPage:true});
  const recovery=await page.evaluate(()=>localStorage.getItem('binpc2_event_recovery_v6'));expect(typeof recovery).toBe('string');
  const recoveredContext=await browser.newContext({baseURL:process.env.HUB_E2E_BASE_URL,viewport:{width:768,height:1024}});
  try{
    await local(recoveredContext);
    const restored=await recoveredContext.request.post('/api/event-hub/session',{data:{recoveryCode:recovery,create:false}});expect(restored.status()).toBe(200);
    await recoveredContext.addInitScript(code=>localStorage.setItem('binpc2_event_recovery_v6',code!),recovery);
    const recovered=await recoveredContext.newPage();await openFinal(recovered,eventId);
    await expect(recovered.getByLabel(`${excluded} · 1995년생 · 서울`,{exact:true})).not.toBeChecked();
    expect(await recovered.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await recovered.screenshot({path:info.outputPath('selection-other-browser-768.png'),fullPage:true});
    await recovered.getByRole('button',{name:'2명 함께 신청',exact:true}).click();await expect(recovered).toHaveURL(/\/events\/a\//);
    const apps=(await state(request,true)).applications.filter((a:{eventId:string})=>a.eventId===eventId);
    expect(apps).toHaveLength(2);expect(apps.map((a:{basic:{nickname:string}})=>a.basic.nickname).sort()).toEqual([ownName,included].sort());
    expect(apps.map((a:{rank:number})=>a.rank).sort()).toEqual([1,2]);
    const remaining=(await state(recovered.request)).companionDrafts[eventId].items.find((item:{id:string})=>item.id===draftIds[1]);expect(remaining.applicationId).toBeUndefined();
  }finally{await recoveredContext.close();}
});

test('existing member identifies their own draft before atomic submission while profile, payment and account permissions stay separate',async({page,context,request,browser},info)=>{
  test.setTimeout(180000);context.setDefaultTimeout(15000);await local(context);await page.setViewportSize({width:390,height:844});
  const suffix=randomBytes(2).toString('hex'),ownName=`대${suffix}`,friendName=`기${suffix}`,password=`Isolated-${randomUUID()}`;
  const pastEvent=await createEvent(request,`기존회원 보존 ${suffix}`),eventId=await createEvent(request,`사전확인 ${suffix}`);
  const seed=await browser.newContext({baseURL:process.env.HUB_E2E_BASE_URL});
  let oldId='',memberBefore:unknown;
  try{
    const session=await seed.request.post('/api/event-hub/session',{data:{recoveryCode:randomBytes(32).toString('base64url'),create:true}});expect(session.status()).toBe(200);
    oldId=String((await command(seed.request,'application.basic','',{eventId:pastEvent,basic:basic(friendName)})).id);
    await command(seed.request,'application.consent',oldId,{consent:{collection:true,sharing:true,notice:true,reuse:true,version:HUB_CONSENT_VERSION},password},1);
    let previous=(await state(seed.request)).applications.find((a:{id:string})=>a.id===oldId);
    await command(seed.request,'application.profile',oldId,{profile:{mbti:'ENFP',interests:['음악'],personalityScore:50,privacyConsent:{collection:true,sharing:true,version:PROFILE_CONSENT_VERSION},pushDecision:'skip',lastStep:6}},previous.revision);
    previous=(await state(seed.request)).applications.find((a:{id:string})=>a.id===oldId);
    await command(seed.request,'application.confirm',oldId,{},previous.revision);
    const member=(await state(seed.request)).member;memberBefore={basic:member.basic,profile:member.profile};
  }finally{await seed.close();}
  const draftIds=await prepareDraft(page,eventId,ownName,[friendName]);
  const friendContext=await browser.newContext({baseURL:process.env.HUB_E2E_BASE_URL,viewport:{width:390,height:844}}),adminContext=await browser.newContext({baseURL:process.env.HUB_E2E_BASE_URL,viewport:{width:1440,height:1000}});
  try{
    await local(friendContext);await local(adminContext,true);friendContext.setDefaultTimeout(15000);adminContext.setDefaultTimeout(15000);
    const friend=await friendContext.newPage(),admin=await adminContext.newPage();
    await friend.goto('/events');await friend.getByText('이전 신청 복구 / 기존 신청자 로그인',{exact:true}).click();
    await friend.getByLabel('닉네임',{exact:true}).fill(friendName);await friend.getByLabel('비밀번호',{exact:true}).fill(password);
    await friend.getByRole('button',{name:'기존 신청자 로그인',exact:true}).click();
    await expect.poll(async()=>Boolean((await state(friend.request)).member)).toBe(true);
    await friend.goto(`/events/e/${eventId}`);await friend.getByRole('button',{name:'친구가 대신 신청했어요',exact:true}).click();
    await expect(friend.getByText(/관리자 확인 대기/)).toBeVisible();
    const pending=(await state(friend.request)).companionLinkRequests.find((r:{eventId:string})=>r.eventId===eventId);
    const adminBefore=await state(request,true),sponsor=adminBefore.owners.find((owner:{companionDrafts?:Record<string,unknown>})=>owner.companionDrafts?.[eventId]);
    expect(adminBefore.applications.filter((a:{eventId:string})=>a.eventId===eventId)).toHaveLength(0);
    await admin.goto('/admin');await admin.getByRole('button',{name:'🎉 술번개',exact:true}).click();await admin.getByLabel('관리할 행사').selectOption(eventId);await admin.getByRole('button',{name:'신청·입금',exact:true}).click();
    await admin.getByLabel(`연결할 친구 · ${pending.id.slice(0,8)}`,{exact:true}).selectOption(`draft:${sponsor.id}:${draftIds[0]}`);
    await admin.getByLabel('요청자 본인과 선택한 친구가 같은 사람임을 확인했습니다.',{exact:true}).check();await admin.getByRole('button',{name:'계정만 연결',exact:true}).click();
    await expect(admin.getByText(`${friendName} · 계정 연결됨 · 신청 전`,{exact:true})).toBeVisible();
    expect((await state(request,true)).applications.filter((a:{eventId:string})=>a.eventId===eventId)).toHaveLength(0);
    await friend.reload();await expect(friend.getByText(/대표자 신청 대기/)).toBeVisible();
    await admin.screenshot({path:info.outputPath('existing-member-prelinked-admin.png'),fullPage:true});
    await openFinal(page,eventId);await page.getByRole('button',{name:'2명 함께 신청',exact:true}).click();await expect(page).toHaveURL(/\/events\/a\//);
    const ownId=page.url().split('/').pop()!;
    let all=(await state(request,true)).applications.filter((a:{eventId:string})=>a.eventId===eventId);expect(all).toHaveLength(2);expect(all.map((a:{rank:number})=>a.rank).sort()).toEqual([1,2]);
    const childId=all.find((a:{id:string})=>a.id!==ownId).id;
    await page.getByLabel('필수 안내를 모두 확인하고 동의합니다',{exact:true}).check();await page.getByRole('button',{name:'동의하고 다음',exact:true}).click();await expect(page.getByText('총 2명 · 46,000원',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'2명 금액 확인·신청 확정',exact:true}).click();await page.getByRole('button',{name:'선택한 2명 입금 신고',exact:true}).click();
    await expect.poll(async()=>(await state(request,true)).applications.filter((a:{eventId:string})=>a.eventId===eventId).map((a:{payment:string})=>a.payment)).toEqual(['reported','reported']);
    all=(await state(request,true)).applications.filter((a:{eventId:string})=>a.eventId===eventId);
    await command(request,'admin.application.payment',ownId,{status:'approved',bankChecked:true},all.find((a:{id:string})=>a.id===ownId).revision,true);
    let child=(await state(request,true)).applications.find((a:{id:string})=>a.id===childId);expect(child.payment).toBe('reported');
    await command(request,'admin.application.payment',childId,{status:'approved',bankChecked:true},child.revision,true);
    child=(await state(request,true)).applications.find((a:{id:string})=>a.id===childId);const preserved={rank:child.rank,quote:child.quote,confirmedAt:child.confirmedAt};
    await friend.goto(`/events/a/${childId}`);await friend.getByLabel('[필수] 위 개인정보').check();await friend.getByRole('button',{name:'다음',exact:true}).click();
    await expect(friend.getByLabel('연락용 전화번호',{exact:false})).toHaveCount(0);await friend.getByLabel('실제 은행 입금 시 보내는 분 이름',{exact:true}).fill('가상친구');await friend.getByRole('button',{name:'다음',exact:true}).click();
    await friend.getByLabel('필수 안내를 모두 확인하고 동의합니다',{exact:true}).check();await friend.getByRole('button',{name:'동의하고 다음',exact:true}).click();await expect(friend.getByRole('heading',{name:'👤 내 프로필',exact:true})).toBeVisible();
    const privateState=await state(friend.request),member=privateState.member;expect({basic:member.basic,profile:member.profile}).toEqual(memberBefore);expect(privateState.applications.some((a:{id:string})=>a.id===oldId)).toBe(true);
    child=privateState.applications.find((a:{id:string})=>a.id===childId);expect(child.profile).toMatchObject({mbti:'ENFP',lastStep:6,interests:['음악']});expect(child.payment).toBe('approved');expect({quote:child.quote,confirmedAt:child.confirmedAt}).toEqual({quote:preserved.quote,confirmedAt:preserved.confirmedAt});const storedChild=(await state(request,true)).applications.find((a:{id:string})=>a.id===childId);expect({rank:storedChild.rank,quote:storedChild.quote,confirmedAt:storedChild.confirmedAt}).toEqual(preserved);
    const sponsorState=await state(page.request);expect(sponsorState.applications.map((a:{id:string})=>a.id)).toEqual([ownId]);for(const key of ['owner','profile','phone','cards','consent','depositor'])expect(sponsorState.companionApplications[0]).not.toHaveProperty(key);
    const rejected=await page.request.post('/api/event-hub/mutate',{data:{action:'application.profile',target:childId,revision:child.revision,data:{profile:{lastStep:1}},requestId:randomUUID()}});expect(rejected.ok()).toBe(false);
    expect(await friend.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await friend.screenshot({path:info.outputPath('existing-member-own-records-390.png'),fullPage:true});
  }finally{await friendContext.close();await adminContext.close();}
});

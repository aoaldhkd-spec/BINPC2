#!/usr/bin/env node
/** Real browser, SYNTHETIC API only. Never connects to BINPC2 production or reads real credentials. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, join, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(resolve('artifacts/boltnew-app/package.json'));
const { chromium } = require('@playwright/test');
const root = resolve('artifacts/boltnew-app/dist/public');
const out = resolve(process.env.REVIEW_REPORT_DIR || 'review-artifact/participant-browser');
mkdirSync(out, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.webp':'image/webp' };
const server = createServer((req,res) => {
  let path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403); res.end(); return; }
  if (!existsSync(path) || path === root) path = join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(8766, '127.0.0.1', r));
const profiles = Array.from({length:24}, (_,i) => ({ id:`synthetic-u${i}`, nickname:i===0?'검증본인':`검증참가자${i}`,pin_code:String(1000+i),birth_year:1994+i%6,birth_month:1,birth_day:1,mbti:i%2?'INTJ':'ENFP',location:'부산',interests:'["집콕","영화"]',personality_score:4,dom_sub_score:null,bio:'화면 크기와 스크롤 시험용 합성 프로필',photo_url:`/avatars/av${i+1}.webp`,avatar_color:i%8,contact_private:true,hide_personality:false,kakao_id:null,instagram_id:null,phone_number:null,created_at:'2026-10-13T00:00:00Z' }));
const settings = { id:1, session_active:true, functions_locked:false, active_tables:'[1,2,3]', reset_signal:null,module_flags:{hearts:true,direct_chat:true,group_chat:true,contact_qr:true,stats:true,ranking:true,push:true} };
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const browser=await chromium.launch({headless:true});
const results=[];
try {
  for(const [width,height] of [[320,640],[390,844],[430,932],[600,800],[768,1024],[1024,768]]) {
    for(const dark of [false,true]) {
      const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<768,serviceWorkers:'block'});
      await context.addInitScript(({profiles,dark})=>{
        localStorage.setItem('matching_app_user_id',profiles[0].id);
        localStorage.setItem('matching_profiles_cache',JSON.stringify(profiles));
        localStorage.setItem('binpc2_coach_marks_completed','1');
        localStorage.setItem('bolt_device_secret_'+profiles[0].id,'SYNTHETIC_NOT_REAL');
        localStorage.setItem('dark_mode',dark?'1':'0');
        class ES extends EventTarget {
          static CONNECTING=0;static OPEN=1;static CLOSED=2;
          constructor(url){super();this.url=url;this.readyState=1;this.timer=setInterval(()=>this.emit({type:'ping'}),2000);setTimeout(()=>{this.onopen?.(new Event('open'));this.emit({type:'ping'});},50);}
          emit(data){if(this.readyState!==1)return;const e=new MessageEvent('message',{data:JSON.stringify(data)});this.onmessage?.(e);this.dispatchEvent(e);}
          close(){this.readyState=2;clearInterval(this.timer);}
        }
        window.EventSource=ES;
      },{profiles,dark});
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname!=='127.0.0.1'){await route.abort();return;}
        if(!url.pathname.startsWith('/api/')){await route.continue();return;}
        const b=route.request().postDataJSON()||{};let response={data:[],error:null};
        if(url.pathname.endsWith('/op')){
          let data=b.table==='profiles'?profiles:b.table==='app_settings'?[settings]:[];
          for(const f of b.filters||[]){if((f.op==='eq'||f.type==='eq')&&f.column) data=data.filter(r=>r[f.column]===f.value);}
          if(b.single||b.maybeSingle)data=data[0]||null;
          response={data,error:null};
        } else if(url.pathname.endsWith('/sse-token'))response={token:`${Math.floor(Date.now()/1000)+3600}:SYNTHETIC`,expiresAt:Math.floor(Date.now()/1000)+3600};
        else if(url.pathname.endsWith('/auth/login'))response={ok:true,sessionToken:'SYNTHETIC',sessionExpiresAt:Math.floor(Date.now()/1000)+3600};
        else if(url.pathname.endsWith('/unread-counts'))response={data:{},error:null};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
      });
      const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const record={width,height,dark,checks:[],errors};const stamp=`${width}-${dark?'dark':'light'}`;
      const checkWidth=async label=>{
        const x=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        assert(x.scrollWidth<=x.width+1,label+' horizontal overflow');record.checks.push(label);
      };
      try {
        await page.goto('http://127.0.0.1:8766/',{waitUntil:'networkidle'});
        const nav=page.getByRole('navigation',{name:'참여자 메뉴'});await nav.waitFor();
        await page.getByTestId('profile-card-photo').first().waitFor();
        // The new unlock guide is intentionally modal. Exercise its real close
        // control rather than clicking through it or disabling it in the fixture.
        const guide=page.getByRole('dialog',{name:'🌈 무지개하트가 열렸어요'});
        if(await guide.isVisible()) {
          const box=await guide.boundingBox();
          assert(box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1,'rainbow guide clips viewport');
          await page.screenshot({path:join(out,`rainbow-guide-${stamp}.png`)});
          await guide.getByRole('button',{name:'확인했어요',exact:true}).click();
          await guide.waitFor({state:'hidden'});
          record.checks.push('rainbow-guide-fits-and-dismisses');
        }
        await checkWidth('profiles');
        await page.screenshot({path:join(out,`participants-${stamp}.png`)});
        if(width<768){
          const photo=page.getByTestId('profile-card-photo').first();const handle=await photo.elementHandle();const b=await photo.boundingBox();
          const session=await context.newCDPSession(page);
          const x=b.x+b.width/2,y=Math.min(b.y+b.height/2,height-120);
          await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
          for(let step=1;step<=5;step++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.max(40,y-step*25)}]});await new Promise(r=>setTimeout(r,35));}
          await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          assert(await handle.evaluate(el=>el.parentElement.style.transform)==='none','scroll unexpectedly flipped profile');
          record.checks.push('real-touch-scroll-no-flip');await session.detach();
        }
        await nav.getByRole('button',{name:'설정',exact:true}).click();
        await page.getByRole('checkbox',{name:'하트·1:1 채팅 알림 받기 (선택)'}).waitFor();
        await checkWidth('settings');
        await page.getByRole('button',{name:'글자 크게',exact:true}).click();
        await page.getByRole('button',{name:'글자 크게',exact:true}).click();
        await checkWidth('settings-110%');
        await page.screenshot({path:join(out,`settings-110-${stamp}.png`),fullPage:true});
        await page.reload({waitUntil:'networkidle'});await nav.waitFor();
        assert(await page.evaluate(()=>localStorage.getItem('binpc2-display-scale-v1'))==='1.1','display scale lost on reload');
        assert(!(await guide.isVisible()),'dismissed rainbow guide reappeared after reload');
        await checkWidth('profiles-110%-reopened');
        for(const name of ['하트, 채팅','통계','랭킹']){
          await nav.getByRole('button',{name,exact:true}).click();await checkWidth(name+'-110%');
          if(width===390&&!dark)await page.screenshot({path:join(out,`${name.replace(/[, ]/g,'')}-${stamp}.png`),fullPage:true});
        }
        assert(errors.length===0,'browser exception: '+errors.join(';'));
        record.status='PASS';
      }catch(e){record.status='FAIL';record.failure=String(e);writeFileSync(join(out,`failure-${stamp}.txt`),await page.locator('body').innerText());await page.screenshot({path:join(out,`failure-${stamp}.png`),fullPage:true});}
      results.push(record);console.log(JSON.stringify(record));await context.close();
    }
  }
}finally{writeFileSync(join(out,'results.json'),JSON.stringify({kind:'SYNTHETIC_API_REAL_CHROMIUM',results},null,2));await browser.close();await new Promise(r=>server.close(r));}
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;

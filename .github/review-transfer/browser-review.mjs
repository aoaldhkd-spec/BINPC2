import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(resolve('artifacts/boltnew-app/package.json'));
const { chromium } = require('@playwright/test');
const root = resolve('artifacts/boltnew-app/dist/public');
const out = join(process.env.RUNNER_TEMP, 'binpc2-reports/browser');
mkdirSync(out, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.webp':'image/webp', '.json':'application/json' };
const server = createServer((req,res) => {
  let path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root + '/') && path !== root) { res.writeHead(403); res.end(); return; }
  if (!existsSync(path) || path === root) path = join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(8765, '127.0.0.1', r));
const settings = { id:'1', session_active:true, functions_locked:true, active_tables:'[1,2,3]', heart_initial_count:1, reset_signal:null, module_flags:{hearts:true,direct_chat:true,group_chat:true,contact_qr:true,stats:true,ranking:true,push:true} };
const health = { persistErrors:0,recentErrors:[],inMemory:{messages:0,likes:0},db:{messages:0,likes:0},sseConnections:2,pinPool:{remaining:9998,total:10000},alarms:[],ok:true,checkedAt:new Date().toISOString(),runtime:{commit:'SYNTHETIC_PREVIEW',service:'isolated-fixture',uptimeSec:3600,processStartedAt:new Date().toISOString(),node:'22',pushConfigured:true,pushSubscriptions:2,dailyCycle:'automatic'} };
const results=[];
const browser = await chromium.launch({headless:true});
async function openFixture(scene, width, height) {
  const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<768,hasTouch:true,serviceWorkers:'block'});
  await context.addInitScript(({scene}) => {
    class FixtureEventSource extends EventTarget {
      static CONNECTING=0; static OPEN=1; static CLOSED=2;
      constructor(url) { super(); this.url=url; this.readyState=1; this.timer=setInterval(()=>this.emit({type:'ping'}),2000); setTimeout(()=>{this.onopen?.(new Event('open'));this.emit({type:'ping'});},50); }
      emit(data) { if(this.readyState!==1)return; const e=new MessageEvent('message',{data:JSON.stringify(data)}); this.onmessage?.(e); this.dispatchEvent(e); }
      close() { this.readyState=2;clearInterval(this.timer); }
    }
    window.EventSource=FixtureEventSource;
    if(scene==='admin') {
      localStorage.setItem('admin_session_v1',JSON.stringify({phone:'SYNTHETIC',authedAt:Date.now()}));
      localStorage.setItem('admin_token_v1','SYNTHETIC_TOKEN_NOT_REAL');
    } else localStorage.setItem('test_token_v1','SYNTHETIC_TOKEN_NOT_REAL');
  }, {scene});
  await context.route('**/*', async route => {
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1') { await route.abort(); return; }
    if(!url.pathname.startsWith('/api/')) { await route.continue();return; }
    const b=route.request().postDataJSON() || {};
    let response={data:[],error:null};
    if(url.pathname.endsWith('/op')) {
      let data=b.table==='app_settings'?[settings]:[];
      if(b.single||b.maybeSingle) data=data[0]||null;
      response={data,error:null};
    } else if(url.pathname.endsWith('/health')) response=health;
    else if(url.pathname.endsWith('/sse-token')) response={token:`${Math.floor(Date.now()/1000)+3600}:SYNTHETIC`,expiresAt:Math.floor(Date.now()/1000)+3600};
    else if(url.pathname.endsWith('/auth/login')) response={ok:true,sessionToken:'SYNTHETIC',expiresAt:Math.floor(Date.now()/1000)+3600};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765'+(scene==='admin'?'/admin':'/'),{waitUntil:'networkidle'});
  return {context,page,errors};
}
async function bounds(page) {
  return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,rootFont:getComputedStyle(document.documentElement).fontSize,bodyHeight:document.body.scrollHeight}));
}
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
try {
  for(const [width,height] of [[320,640],[360,740],[390,844],[430,932],[600,800],[768,1024],[1024,768],[1440,900],[844,390]]) {
    for(const scene of ['admin','register']) {
      const {context,page,errors}=await openFixture(scene,width,height);
      const record={scene,width,height,checks:[],errors};
      try {
        if(scene==='admin') {
          await page.getByTestId('daily-cycle-card').waitFor();
          assert(await page.getByTestId('sulbun-open-btn').count()===0,'manual open still present');
          assert(await page.getByTestId('ops-overview-card').count()===0,'ops panel still in dashboard');
          record.checks.push('manual-open-removed','dashboard-decluttered');
          await page.screenshot({path:join(out,`admin-${width}.png`),fullPage:true});
          await page.evaluate(()=>window.scrollTo(0,450));
          const top=await page.getByTestId('admin-sticky-header').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,Math.max(1,r.top+r.height/2)));});
          assert(top,'lock card overlays header');record.checks.push('header-not-obscured');
          await page.getByRole('button',{name:'DB헬스',exact:true}).click();
          await page.getByTestId('ops-overview-card').waitFor();
          assert(await page.getByTestId('module-switches-card').count()===1,'module panel not moved');record.checks.push('ops-and-modules-in-db');
          if(width===390||width===768) await page.screenshot({path:join(out,`db-health-${width}.png`),fullPage:true});
        } else {
          await page.getByRole('button',{name:'INTJ',exact:true}).click();
          await page.getByRole('button',{name:/다음/}).click();
          await page.getByRole('button',{name:/다음/}).click();
          await page.getByRole('button',{name:/엔터·사교·기타/}).click();
          await page.getByRole('button',{name:'집콕',exact:true}).click();
          await page.getByRole('button',{name:'기타',exact:true}).click();
          await page.getByRole('button',{name:/다음/}).click();
          await page.getByRole('button',{name:'올',exact:true}).click();
          const boxes=page.getByRole('checkbox');
          assert(await boxes.count()===3,'consent and opt-in row count');
          const next=page.getByRole('button',{name:/다음/});
          assert(await next.isDisabled(),'missing consent did not block');
          await boxes.nth(0).check();await boxes.nth(1).check();
          assert(!(await next.isDisabled()),'both consents did not allow next');
          assert(!(await boxes.nth(2).isChecked()),'notification must be optional');
          await boxes.nth(1).uncheck();assert(await next.isDisabled(),'revoked consent did not block');
          record.checks.push('consent-required','notification-optional','uncheck-blocks');
          await page.screenshot({path:join(out,`profile-consent-${width}.png`),fullPage:true});
          await page.getByRole('button',{name:'[필수] 개인정보 수집 및 이용 동의 내용 보기',exact:true}).click();
          await page.getByRole('dialog').waitFor();
          const r=await page.getByRole('dialog').boundingBox();
          assert(r.y>=-1&&r.x>=-1&&r.x+r.width<=width+1&&r.y+r.height<=height+1,'privacy modal clips viewport');
          if(width===320||width===768)await page.screenshot({path:join(out,`privacy-modal-${width}.png`)});
          await page.keyboard.press('Escape');record.checks.push('privacy-dialog-fits');
        }
        record.normal=await bounds(page);assert(record.normal.scrollWidth<=record.normal.width+1,'horizontal page overflow');
        await page.getByRole('button',{name:'글자 크게',exact:true}).click();
        await page.getByRole('button',{name:'글자 크게',exact:true}).click();
        record.enlarged=await bounds(page);assert(record.enlarged.scrollWidth<=record.enlarged.width+1,'enlarged horizontal overflow');
        assert(await page.evaluate(()=>localStorage.getItem('binpc2-display-scale-v1'))==='1.1','scale not saved');
        record.checks.push('normal-no-x-overflow','110%-no-x-overflow','scale-persisted');
        if(width===320||width===768)await page.screenshot({path:join(out,`${scene}-110-${width}.png`),fullPage:true});
        assert(errors.length===0,'browser exception: '+errors.join(';'));
        record.status='PASS';
      } catch(e) {
        record.status='FAIL';record.failure=String(e);writeFileSync(join(out,`${scene}-${width}-failure.txt`),await page.locator('body').innerText());
        await page.screenshot({path:join(out,`${scene}-${width}-FAIL.png`),fullPage:true});
      }
      results.push(record);console.log(JSON.stringify(record));await context.close();
    }
  }
} finally {
  writeFileSync(join(out,'results.json'),JSON.stringify({kind:'SYNTHETIC_API_REAL_CHROMIUM',results},null,2));
  await browser.close();await new Promise(r=>server.close(r));
}
if(results.some(r=>r.status!=='PASS')) process.exitCode=1;

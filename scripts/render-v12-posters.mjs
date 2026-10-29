/** Local A4 review artwork. Uses existing artwork and supplied logos; never publishes. */
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(root + "/artifacts/boltnew-app/package.json");
const { chromium } = require("@playwright/test");
const out = root + "/docs/campaign-20261029-v12/posters";
const sources = root + "/docs/campaign-20261029-v12";
await mkdir(out, { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const assets = [];
async function data(relative, mime = "image/png") {
  const bytes = await readFile(root + "/" + relative);
  assets.push({ path: relative, sha256: sha(bytes), bytes: bytes.length });
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
const lounge = await data("artifacts/boltnew-app/public/event-art/halloween-lounge.webp", "image/webp");
const party = await data("artifacts/boltnew-app/public/event-art/halloween-party.webp", "image/webp");
const logos = {};
for (const id of ["red_hole", "fake", "jack", "m_karaoke", "speed", "check_in", "on_top", "gorae", "black"])
  logos[id] = await data(`artifacts/boltnew-app/public/tour-logos-v3/${id}.png`);
const cities = [
  ["11.05–08", "인천", "레드홀 · 페이크", ["red_hole", "fake"]],
  ["11.12–15", "종로", "자크 JACK", ["jack"]],
  ["11.19–22", "광주", "M가라오케 · 스피드", ["m_karaoke", "speed"]],
  ["11.26–29", "신림", "체크인 · 온탑", ["check_in", "on_top"]],
  ["12.03–06", "대구", "블랙 BLACK · 개최 확정", ["black"]],
];
function route() {
  return `<div class="route">${cities.map(([date, city, venues, ids]) => `<div class="city"><div class="when">${date}<strong>${city}</strong></div><div class="city-logos">${ids.map((id) => `<img src="${logos[id]}" alt="${id}">`).join("")}</div><div class="venue">${venues}${city === "광주" ? "<small>M가라오케: 기존 제작 시안</small>" : ""}</div></div>`).join("")}</div>`;
}
const tourHours = `<div class="hours"><div><b>목 · 일</b><span>1차 21:00–23:30<br>2차 23:30–다음 날 01:30<br>3차 다음 날 01:30 이후</span></div><div><b>금 · 토</b><span>1차 22:00–다음 날 00:30<br>2차 다음 날 00:30–02:30<br>3차 다음 날 02:30 이후</span></div></div>`;
const thanks = `<div class="thanks"><img src="${logos.gorae}" alt="고래 감사용 로고"><span>대관에 도움을 주신 고래 사장님께 감사드립니다.<br>지역별 예정 매장 안내 · 상세 장소는 참가 승인 후 확인</span></div>`;
const halloweenTimes = `<div class="dates"><div><b>10.30 <small>금요일</small></b><span>22:30 → 다음 날 01:00</span></div><div><b>10.31 <small>토요일</small></b><span>22:00 → 다음 날 01:00</span></div></div>`;
const footer = `<footer><div class="closed"><b>현재 테스트·점검 중 · 일반 신청 닫힘</b><span>운영자의 별도 오픈 안내 전에는 신청·송금하지 마세요.</span></div><div class="address">상세 조건·이용 안내 <strong>binpc2.netlify.app</strong><small>운영 범일NPC · 검토용 / 모집 미공개</small></div></footer>`;
const editions = [
  {
    file: "Halloween", source: "01_할로윈_모집글.md", type: "halloween", eyebrow: "BUSAN · 2026 HALLOWEEN NIGHT",
    title: "시월의 마지막 밤,<br><em>우리 같이 놀아요.</em>", subtitle: "범일NPC 할로윈 술번개 · 부산 범일",
    body: `${halloweenTimes}<div class="feature"><b>입장 후 MY · 행사 카드</b><strong>무료 뽑기 1인 3장</strong><p>금요일 경품 23개 · 토요일 경품 49개<br>꽝 포함 · 남은 재고 안에서 지급</p><div class="pill">하리보 한 종류 · 참가자 1인 1개</div></div><div class="two"><div><b>복장도, 편한 옷도 좋아요</b><p>코스프레를 강요하지 않아요.<br>운영자 인정 의상·분장 혜택은<br>유효한 최저가 한 가지만 적용해요.</p></div><div><b>양일 모두 1차만 진행</b><p>성인 대상 · 현장 신분증 확인<br>상세 장소는 참가 승인 후 안내<br>회비·참가조건은 상세 공지 확인</p></div></div>`,
    required: ["10.30", "10.31", "22:30", "22:00", "다음 날 01:00", "23개", "49개", "한 종류"],
  },
  {
    file: "Tour", source: "02_전국투어_모집글.md", type: "tour", eyebrow: "2026 · NOVEMBER — DECEMBER",
    title: "이번엔,<br><em>우리 동네에서.</em>", subtitle: "범일NPC 11~12월 전국투어 · 목·금·토·일",
    body: `${route()}${tourHours}<div class="tour-note"><b>웹은 1차 · 2차는 오픈 후 오픈채팅 · 3차는 현장 안내</b><p>회차별 선입금 → 운영자가 직접 1/N 정산<br>금·토 1차 유효 선착순 10명 · 추억의 뽑기 2장 (할인권 1 + 꽝 1)</p></div>${thanks}`,
    required: ["12.03–06", "대구", "블랙 BLACK", "11.05–08", "11.12–15", "11.19–22", "11.26–29", "01:30", "02:30"],
  },
  {
    file: "Combined", source: "03_통합_모집글.md", type: "combined", eyebrow: "ONE AUTUMN · MANY GOOD NIGHTS",
    title: "할로윈부터<br><em>전국투어까지.</em>", subtitle: "범일NPC와 함께하는 2026 가을·겨울",
    body: `<div class="mini-halloween"><h2>부산 범일 · 할로윈</h2>${halloweenTimes}<p>1차만 진행 · 무료 뽑기 3장 · 금 23개 / 토 49개 경품<br>하리보 한 종류, 1인 1개 · 꽝 포함</p></div><h2 class="tour-title">11~12월 전국투어</h2>${route()}<div class="compact-times">목·일 1차 21:00–23:30 · 금·토 1차 22:00–다음 날 00:30<br>2·3차는 별도 시간표 · 선입금 후 운영자 수동 1/N 정산</div>${thanks}`,
    required: ["10.30", "10.31", "다음 날 01:00", "12.03–06", "대구", "블랙 BLACK", "하리보 한 종류"],
  },
  {
    file: "HeartNow", source: "05_하트나우_쉽게보는안내.md", type: "heartnow", eyebrow: "하트시그널 웹 →",
    title: "<em>하트나우</em>", subtitle: "신청부터 현장 소통까지, 한 걸음씩.",
    body: `<div class="steps">${[["01", "신청", "날짜 선택 → 기본정보 저장 → 공지·동의"], ["02", "대기방", "입금 신고와 실제 관리자 승인은 달라요."], ["03", "프로필", "미리 작성하고 저장한 단계부터 이어가세요."], ["04", "입장", "관리자 승인·필수 프로필·실제 시작을 확인해요."], ["05", "하트·1:1 채팅", "입장 후 화면 안내에 따라 마음을 전해요."]].map(([n, title, text]) => `<div><b>${n}</b><section><h2>${title}</h2><p>${text}</p></section></div>`).join("")}</div><div class="recovery"><b>다시 들어와도, 이어서.</b><p>내 신청은 닉네임·비밀번호로 로그인<br>현장 프로필은 내 4자리 고유번호로 복구<br>이미 송금했다면 다시 보내지 말고 관리자에게 문의</p></div><p class="help">문의는 신청·대기방 오른쪽 아래 · 휴대폰 알림은 선택<br>이용 시간과 개인정보 안내는 앱에서 확인해 주세요.</p>`,
    required: ["하트나우", "신청", "대기방", "프로필", "입장", "하트·1:1 채팅", "닉네임·비밀번호"],
  },
];
const css = `
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;width:1240px;height:1754px;font-family:'Noto Sans CJK KR',sans-serif;color:#fff3ed;background:#160e20}article{width:1240px;height:1754px;overflow:hidden;display:flex;flex-direction:column;background:radial-gradient(ellipse at 100% 0,#492243,transparent 65%),#160e20;border:14px solid #2c1b36}header{padding:57px 66px 50px;background:linear-gradient(90deg,#180e20ec,#180e20a8),url('${party}') center/cover;border-bottom:1px solid #b5758f}header .eyebrow{font-size:19px;letter-spacing:3px;color:#eec7a3;font-weight:700}h1{font-size:77px;letter-spacing:-4px;line-height:1.19;margin:26px 0 24px;font-weight:900}h1 em{font-style:normal;color:#ffb883}header p{font-size:25px;letter-spacing:-.7px;margin:0}main{padding:35px 66px 20px;flex:1;min-height:0}p{font-size:22px;line-height:1.65;margin:15px 0;word-break:keep-all}h2{font-size:29px;margin:0 0 17px}.dates{display:flex;gap:28px}.dates>div{flex:1;padding:25px 28px;border-top:3px solid #e89462;background:#ffffff08;border-radius:0 0 16px 16px}.dates b{font-size:44px;display:block;color:#ffcaa0}.dates small{font-size:23px}.dates span{display:block;font-size:22px;margin-top:9px}.feature{margin:33px 0;padding:46px;background:linear-gradient(130deg,#4a284e,#271930);border:1px solid #755578;border-radius:23px;text-align:center}.feature>b{display:block;font-size:22px;color:#e7b4e5}.feature>strong{display:block;font-size:55px;margin:19px 0}.feature p{font-size:26px}.pill{display:inline-block;margin-top:12px;background:#f6bb83;color:#361b2a;border-radius:50px;padding:14px 29px;font-size:24px;font-weight:800}.two{display:flex;gap:38px;padding:20px 0}.two>div{flex:1}.two b{font-size:25px;color:#efbe91}.two p{font-size:23px}.route{display:flex;flex-direction:column;gap:12px}.city{display:flex;align-items:center;gap:25px;background:#ffffff08;border:1px solid #705c7744;border-radius:14px;padding:15px 25px;min-height:120px}.when{min-width:170px;font-size:22px;color:#e0bfa7}.when strong{display:block;font-size:34px;color:#fff3ed}.city-logos{display:flex;gap:12px;width:270px;flex-shrink:0;align-items:center;justify-content:center}.city-logos img{width:122px;height:92px;object-fit:contain}.venue{font-size:26px;font-weight:700}.venue small{display:block;font-size:16px;font-weight:400;color:#ccb8d4;margin-top:5px}.hours{display:flex;gap:32px;margin-top:28px;padding-top:24px;border-top:1px solid #72537c}.hours>div{flex:1;display:flex;gap:23px}.hours b{font-size:26px;color:#ffcaa0;white-space:nowrap}.hours span{font-size:20px;line-height:1.7}.tour-note{margin-top:25px}.tour-note>b{font-size:21px}.tour-note p{font-size:20px}.thanks{display:flex;gap:18px;align-items:center;margin-top:20px}.thanks img{width:69px;height:69px;object-fit:contain}.thanks span{font-size:16px;line-height:1.65;color:#dccbdd}footer{padding:15px 66px 35px}.closed{color:#fff3ed;padding:20px 26px;border:1px solid #f2a87a;border-radius:13px;background:#3f242c}.closed b{display:block;color:#ffc79b;font-size:25px}.closed span{display:block;margin-top:8px;font-size:19px}.address{display:flex;align-items:center;gap:15px;font-size:16px;margin-top:22px;color:#cbb8ce}.address strong{font-size:24px;color:white}.address small{margin-left:auto;font-size:14px}.tour header{padding-top:43px;padding-bottom:35px}.tour h1{font-size:65px;margin:17px 0}.tour main{padding-top:26px}.combined header{padding-top:39px;padding-bottom:33px}.combined h1{font-size:64px;margin:19px 0}.combined main{padding-top:25px}.mini-halloween h2{font-size:27px;color:#ffc08c}.combined .dates>div{padding:13px 23px}.combined .dates b{font-size:31px}.combined .dates span{font-size:20px}.mini-halloween p{font-size:19px;line-height:1.6}.tour-title{font-size:28px;margin:23px 0 14px;color:#e5c0ff}.combined .city{min-height:91px;padding:10px 24px}.combined .city-logos img{height:68px;width:104px}.combined .when strong{font-size:29px}.combined .venue{font-size:24px}.combined .when{font-size:19px}.compact-times{font-size:19px;line-height:1.7;margin-top:18px}.combined .thanks{margin-top:12px}.combined .thanks img{width:53px;height:53px}.heartnow{background:#fff2f8;color:#3f2038}.heartnow header{background:linear-gradient(90deg,#3c1739ed,#411c3ab8),url('${lounge}') center/cover;padding-top:72px;padding-bottom:67px;color:white}.heartnow header .eyebrow{color:#ffd6e5;font-size:29px;letter-spacing:0}.heartnow h1{font-size:138px;margin:28px 0 15px;letter-spacing:-7px}.heartnow h1 em{color:#ffe0ef}.heartnow header p{font-size:29px}.steps>div{display:flex;gap:31px;align-items:center;border-bottom:1px solid #dbbacd;padding:21px 0}.steps>div>b{font-size:40px;font-weight:400;color:#b35385}.steps h2{font-size:29px;margin:0 0 8px}.steps p{margin:0;font-size:23px}.recovery{padding:29px 34px;background:#eed7e6;border-radius:18px;margin-top:27px}.recovery>b{font-size:32px;color:#7c2f5b}.recovery p{font-size:23px;margin-bottom:0}.help{font-size:20px}.heartnow .address{color:#63324d}.heartnow .address strong{color:#63324d}
`;
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
const context = await browser.newContext({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
await context.route("**/*", (r) => r.abort("blockedbyclient"));
const manifest = { format: "A4 portrait, one promotional page per campaign", width: 2480, height: 3508, published: false, publicAdmissionOpen: false, qr: "omitted: no unverified QR added", assets, posters: [] };
try {
  for (const e of editions) {
    const page = await context.newPage();
    await page.setContent(`<html lang="ko"><meta charset="utf-8"><style>${css}</style><article class="${e.type}"><header><div class="eyebrow">${e.eyebrow}</div><h1>${e.title}</h1><p>${e.subtitle}</p></header><main>${e.body}</main>${footer}</article></html>`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const text = await page.locator("article").innerText();
    for (const term of [...e.required, "일반 신청 닫힘", "오픈 안내 전에는 신청·송금하지 마세요."])
      if (!text.includes(term)) throw Error(`${e.file}: missing ${term}`);
    const layout = await page.evaluate(() => {
      const main = document.querySelector("main");
      const last = main.lastElementChild.getBoundingClientRect();
      return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, bottom: last.bottom, footer: document.querySelector("footer").getBoundingClientRect().top };
    });
    if (layout.width !== 1240 || layout.height !== 1754 || layout.bottom > layout.footer) throw Error(`${e.file}: overflow ${JSON.stringify(layout)}`);
    const file = `${e.file}.png`;
    await page.screenshot({ path: out + "/" + file, fullPage: false });
    const bytes = await readFile(out + "/" + file);
    if (bytes.length >= 5_000_000) throw Error(`${file} exceeds 5,000,000 bytes`);
    const sourceBytes = await readFile(sources + "/" + e.source);
    manifest.posters.push({ file, bytes: (await stat(out + "/" + file)).size, sha256: sha(bytes), source: e.source, sourceSha256: sha(sourceBytes), logoCount: ["tour", "combined"].includes(e.type) ? 9 : 0, wordingChecks: e.required, layout });
    console.log(`${file}: ${bytes.length} bytes; A4 portrait; required wording and no overlap verified`);
    await page.close();
  }
  await writeFile(out + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
} finally {
  await browser.close();
}

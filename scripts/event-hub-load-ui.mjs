/** Actual administrator/participant browser propagation on the same accumulated load DB. */
import { createRequire } from "node:module";
import { readFile, writeFile, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLegacyEventHubFixture } from "./lib/event-hub-legacy-fixture.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(root + "/artifacts/boltnew-app/package.json"),
  { chromium, expect } = require("@playwright/test"),
  out = root + "/.local/v6-finish";
const cfg = JSON.parse(await readFile(out + "/load-private-env.json", "utf8")),
  saved = JSON.parse(await readFile(out + "/cohort-private.json", "utf8"));
if (
  cfg.DATABASE_URL !==
  "postgresql://postgres@127.0.0.1:5432/binpc2_hub_load_v6?sslmode=disable"
)
  throw Error("Only the exact preserved local fixture is allowed");
const eventId = saved.clients[0].before.eventId,
  base = "http://127.0.0.1:3004",
  log = await open(out + "/load-ui-vite-private.log", "a");
const web = spawn(
  "corepack",
  [
    "pnpm",
    "--filter",
    "@workspace/boltnew-app",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
  ],
  {
    cwd: root,
    detached: true,
    env: {
      PATH: process.env.PATH,
      COREPACK_HOME: process.env.COREPACK_HOME,
      PORT: "3004",
      API_PROXY_TARGET: "http://127.0.0.1:8120",
      LOCAL_API: "1",
      VITE_SSE_ORIGIN: "",
    },
    stdio: ["ignore", log.fd, log.fd],
  },
);
let browser;
const results = {
  environment:
    "Actual Chromium UI + same Express/accumulated PostgreSQL as 150-person HTTP soak; loopback only",
  startedAt: new Date().toISOString(),
  physicalDevices: "UNKNOWN",
};
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/api/healthz")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const contexts = await Promise.all([
    browser.newContext({ baseURL: base }),
    browser.newContext({ baseURL: base }),
  ]);
  for (const c of contexts) {
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      return u.hostname === "127.0.0.1" && u.port === "3004"
        ? r.continue()
        : r.abort();
    });
    await c.addInitScript((offset) => {
      const NativeDate = Date;
      class FixtureDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [NativeDate.now() + offset]));
        }
        static now() {
          return NativeDate.now() + offset;
        }
      }
      globalThis.Date = FixtureDate;
    }, Number(cfg.HUB_LOAD_CLOCK_OFFSET_MS));
  }
  const [participant, administrator] = contexts,
    login = await administrator.request.post(
      "/api/db/rpc/admin_create_session",
      {
        data: {
          p_phone: "01000000000",
          p_admin_password: cfg.BOOTSTRAP_ADMIN_PASSWORD,
        },
      },
    );
  expect(login.status()).toBe(200);
  const token = (await login.json()).data;
  await prepareLegacyEventHubFixture({
    databaseUrl: cfg.DATABASE_URL, baseUrl: base, adminToken: token,
  });
  await administrator.addInitScript((value) => {
    localStorage.setItem("admin_token_v1", value);
    localStorage.setItem(
      "admin_session_v1",
      JSON.stringify({ phone: "01000000000", authedAt: Date.now() }),
    );
  }, token);
  expect(
    (
      await participant.request.post("/api/event-hub/session", {
        data: { recoveryCode: randomUUID() + randomUUID(), create: true },
      })
    ).status(),
  ).toBe(200);
  async function mutate(
    client,
    action,
    target = "",
    data = {},
    revision,
    admin = false,
  ) {
    const r = await client.request.post("/api/event-hub/mutate", {
      headers: admin ? { "x-admin-token": token } : {},
      data: { action, target, data, revision, requestId: randomUUID() },
    });
    expect(r.status()).toBe(200);
    return r.json();
  }
  const tag = String(Date.now()).slice(-5),
    nick = "화" + Number(tag).toString(36),
    b = await mutate(participant, "application.basic", "", {
      eventId,
      basic: {
        nickname: nick,
        birthYear: 1995,
        location: "합성",
        phone: "01000009999",
        depositor: "격리 화면",
        collection: true,
        version: "2026-10-27-event-v6",
      },
    });
  await mutate(
    participant,
    "application.consent",
    b.id,
    {
      consent: {
        collection: true,
        sharing: true,
        notice: true,
        version: "2026-10-27-event-v6",
      },
    },
    1,
  );
  await mutate(participant, "application.confirm", b.id, {}, 2);
  await mutate(participant, "application.report", b.id, {}, 3);
  const p = await participant.newPage(),
    a = await administrator.newPage();
  await p.goto("/events/a/" + b.id);
  await expect(
    p.getByText("입금 신고 · 승인 대기", { exact: true }),
  ).toBeVisible();
  await a.goto("/admin");
  await a.getByRole("button", { name: "🎉 술번개", exact: true }).click();
  await a.getByLabel("관리할 행사").selectOption(eventId);
  await a.getByRole("button", { name: "신청·입금", exact: true }).click();
  const card = a
    .locator("section")
    .filter({ has: a.getByText("신청번호 " + b.id, { exact: true }) });
  a.once("dialog", (d) => d.accept());
  const approvalStart = performance.now();
  await card.getByRole("button", { name: "입금 승인", exact: true }).click();
  await expect(
    p.getByText("관리자 입금 확인 완료", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  results.approvalToParticipantVisibleMs = Math.round(
    performance.now() - approvalStart,
  );
  await p.getByRole("button", { name: /💬 관리자 문의/ }).click();
  await p
    .getByLabel("문의 내용", { exact: true })
    .fill("동시 부하 화면 문의 " + tag);
  await p.getByLabel("문의 처리 목적으로").check();
  await p.getByRole("button", { name: "문의 보내기", exact: true }).click();
  const state = await (
    await administrator.request.get("/api/event-hub/admin", {
      headers: { "x-admin-token": token },
    })
  ).json();
  const owner = state.applications.find((x) => x.id === b.id).owner;
  await a.getByRole("button", { name: "관리자 문의", exact: true }).click();
  await a.getByLabel("문의 대상").selectOption(owner);
  await a
    .getByRole("textbox", { name: "관리자 답장", exact: true })
    .fill("부하 중 실제 답장 " + tag);
  const replyStart = performance.now();
  await a
    .getByRole("button", { name: "수정한 답장 보내기", exact: true })
    .click();
  await expect(
    p.getByText("관리자 · 부하 중 실제 답장 " + tag, { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  results.replyToParticipantVisibleMs = Math.round(
    performance.now() - replyStart,
  );
  results.pass = true;
} catch (e) {
  results.pass = false;
  results.reason = e.message;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  try {
    process.kill(-web.pid, "SIGTERM");
  } catch {}
  await log.close();
  results.finishedAt = new Date().toISOString();
  await writeFile(
    out + "/load-ui-public.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
}

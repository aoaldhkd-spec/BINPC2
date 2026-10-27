/** Real HTTP + actual PostgreSQL; fixed loopback targets only; never invokes operating services. */
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import {
  randomBytes,
  randomUUID,
  createHash,
  createCipheriv,
  hkdfSync,
} from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(root + "/artifacts/api-server/package.json"),
  { Pool } = require("pg");
const args = process.argv.slice(2),
  option = (key, fallback) => {
    const i = args.indexOf(key);
    return i < 0 ? fallback : args[i + 1];
  };
const mode = option("--mode", "mixed"),
  minutes = Number(option("--minutes", "15")),
  apiDir = path.resolve(option("--api-dir", root + "/artifacts/api-server")),
  port = Number(option("--port", "8120"));
if (
  !["baseline", "mixed"].includes(mode) ||
  !Number.isFinite(minutes) ||
  minutes < 0 ||
  minutes > 60 ||
  port < 8120 ||
  port > 8129
)
  throw Error("Invalid explicit internal load mode/port/duration");
const out = root + "/.local/v6-finish";
await mkdir(out, { recursive: true });
const databaseName = "binpc2_hub_load_v6",
  auth = process.env.HUB_LOAD_DB_PASSWORD
    ? ":" + encodeURIComponent(process.env.HUB_LOAD_DB_PASSWORD)
    : "",
  databaseUrl = `postgresql://postgres${auth}@127.0.0.1:5432/${databaseName}?sslmode=disable`;
const control = new Pool({
  connectionString: `postgresql://postgres${auth}@127.0.0.1:5432/postgres?sslmode=disable`,
  max: 1,
});
const exists = (
  await control.query("SELECT 1 FROM pg_database WHERE datname=$1", [
    databaseName,
  ])
).rowCount;
if (!exists) await control.query(`CREATE DATABASE ${databaseName}`);
await control.end();
let cfg;
try {
  cfg = JSON.parse(await readFile(out + "/load-private-env.json", "utf8"));
} catch {
  if (exists)
    throw Error(
      "Existing fixture database has no preserved private key; refusing to replace it",
    );
  cfg = {
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: randomBytes(48).toString("hex"),
    BOOTSTRAP_ADMIN_PASSWORD: randomBytes(32).toString("hex"),
    BOOTSTRAP_TEST_PASSWORD: randomBytes(32).toString("hex"),
    HUB_LOAD_CLOCK_OFFSET_MS: String(
      Date.parse("2026-10-30T13:40:00Z") - Date.now(),
    ),
  };
  await writeFile(out + "/load-private-env.json", JSON.stringify(cfg), {
    mode: 0o600,
  });
}
if (cfg.DATABASE_URL !== databaseUrl)
  throw Error("Refusing a non-fixture database");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
await pool.query(
  await readFile(
    root + "/artifacts/api-server/migrations/20261027_event_hub.sql",
    "utf8",
  ),
);
await pool.query(
  "CREATE TABLE IF NOT EXISTS app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(table_name,row_id))",
);
await pool.query(
  "INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('app_settings','1',$1) ON CONFLICT DO NOTHING",
  [
    JSON.stringify({
      id: 1,
      session_active: false,
      event_cycle_reset_complete: true,
      admin_phone: "010-0000-0000",
      admin_password: cfg.BOOTSTRAP_ADMIN_PASSWORD,
      test_password: cfg.BOOTSTRAP_TEST_PASSWORD,
      reset_password: cfg.BOOTSTRAP_ADMIN_PASSWORD,
      entry_password: "internal-fixture",
      module_flags: JSON.stringify({ event_hub: true, push: false }),
      qr_base_url: "https://example.invalid/isolated-fixture",
    }),
  ],
);
const key = Buffer.from(
  hkdfSync(
    "sha256",
    cfg.SESSION_SECRET,
    "binpc2-event-hub-v6",
    "private-records",
    32,
  ),
);
function encryptedOwner() {
  const id = randomUUID(),
    recoveryHash = createHash("sha256").update(randomBytes(32)).digest("hex"),
    value = { id, recoveryHash, createdAt: "2026-10-01T00:00:00Z" },
    iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(`owner:${id}:v1`));
  const body = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return {
    kind: "owner",
    id,
    data: {
      id,
      recoveryHash,
      crypto_box: {
        v: 1,
        iv: iv.toString("base64"),
        tag: c.getAuthTag().toString("base64"),
        ciphertext: body.toString("base64"),
      },
    },
  };
}
const count = Number(
  (
    await pool.query(
      "SELECT count(*) n FROM event_hub_records WHERE kind='owner'",
    )
  ).rows[0].n,
);
for (let n = count; n < 5000; n += 250) {
  const rows = Array.from({ length: Math.min(250, 5000 - n) }, encryptedOwner);
  await pool.query(
    "INSERT INTO event_hub_records(kind,id,data) SELECT kind,id,data FROM jsonb_to_recordset($1::jsonb) AS x(kind text,id text,data jsonb)",
    [JSON.stringify(rows)],
  );
}
if(mode==='mixed'){
 const prep=execFileSync(process.execPath,[apiDir+'/dist/event-hub-lookup-cli.mjs','--scope','isolated','--apply'],{cwd:apiDir,env:{PATH:process.env.PATH,...cfg,NODE_ENV:'development'},encoding:'utf8'}).trim();
 await writeFile(out+'/lookup-preparation-public.json',prep+'\n');
}
const before = Number(
    (await pool.query("SELECT count(*) n FROM event_hub_records")).rows[0].n,
  ),
  runId = mode + "-" + Date.now(),
  logs = await open(out + "/" + runId + "-server-private.log", "a");
let child,
  started = performance.now(),
  requests = [],
  resources = [],
  dbSamples = [],
  stage = "boot",
  observerBusy = false,
  serverGeneration = 0;
function start() {
  serverGeneration++;
  child = spawn(
    process.execPath,
    [
      "--import",
      root + "/scripts/event-hub-load-clock.mjs",
      apiDir + "/dist/index.mjs",
    ],
    {
      cwd: apiDir,
      env: {
        PATH: process.env.PATH,
        ...cfg,
        NODE_ENV: "development",
        PORT: String(port),
        PG_POOL_MAX: "10",
        PGAPPNAME: "binpc2_internal_soak",
      },
      stdio: ["ignore", logs.fd, logs.fd, "ipc"],
    },
  );
  child.on("message", (m) => {
    if (m.type === "load-resource-sample")
      resources.push({
        ...m,
        generation: serverGeneration,
        seconds: Math.round((performance.now() - started) / 1000),
      });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const current = child;
  current.kill("SIGTERM");
  await Promise.race([
    new Promise((r) => current.once("exit", r)),
    new Promise((r) => setTimeout(r, 12000)),
  ]);
  if (current.exitCode === null) {
    current.kill("SIGKILL");
    await new Promise((r) => current.once("exit", r));
  }
}
async function all(promises) {
  const settled = await Promise.allSettled(promises),
    failed = settled.filter((x) => x.status === "rejected");
  if (failed.length)
    throw Error(
      failed[0].reason.message + " (" + failed.length + " concurrent failures)",
    );
  return settled.map((x) => x.value);
}
const base = `http://127.0.0.1:${port}`,
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
let clients = Array.from({ length: 150 }, (_, i) => ({
    i,
    cookie: "",
    code: randomBytes(32).toString("base64url"),
    device: randomBytes(32).toString("base64url"),
    revision: 1,
  })),
  admin = { cookie: "" };
let adminToken = "";
async function req(
  client,
  pathname,
  data,
  role = false,
  tag = "",
  allowRetry = true,
) {
  const t = performance.now();
  const response = await new Promise((resolve) => {
    const q = http.request(
      base + pathname,
      {
        method: data === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          ...(client.cookie ? { cookie: client.cookie } : {}),
          ...(role ? { "x-admin-token": adminToken } : {}),
        },
      },
      (r) => {
        let b = "";
        r.on("data", (chunk) => (b += chunk));
        r.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(b);
          } catch {}
          if (r.headers["set-cookie"])
            client.cookie = r.headers["set-cookie"]
              .map((c) => c.split(";")[0])
              .join("; ");
          resolve({
            status: r.statusCode,
            json,
            retry: Number(r.headers["retry-after"] ?? 1),
          });
        });
      },
    );
    q.setTimeout(30000, () => q.destroy());
    q.on("error", () => resolve({ status: 0, json: { code: "TRANSPORT" } }));
    if (data !== undefined) q.write(JSON.stringify(data));
    q.end();
  });
  requests.push({
    stage,
    tag: tag || data?.action || pathname,
    status: response.status,
    ms: Math.round((performance.now() - t) * 10) / 10,
    code: response.json.code,
    seconds: Math.round((performance.now() - started) / 1000),
    generation: serverGeneration,
  });
  if (response.status === 429 && allowRetry) {
    await delay(Math.max(1, response.retry) * 1000 + 250);
    return req(client, pathname, data, role, tag, false);
  }
  return response;
}
function must(r, label) {
  if (r.status !== 200 || r.json.error)
    throw Error(label + ": HTTP" + r.status + " " + (r.json.code ?? ""));
  return r.json;
}
async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + "/api/healthz", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        await delay(800);
        return;
      }
    } catch {}
    await delay(250);
  }
  throw Error("Local real API did not become ready");
}
async function mutation(
  c,
  action,
  target = "",
  data = {},
  role = false,
  revision,
  requestId = randomUUID(),
) {
  const r = await req(
    c,
    "/api/event-hub/mutate",
    { action, target, data, revision, requestId },
    role,
  );
  return { r, requestId };
}
async function action(c, name, data = {}, role = false, duplicate = false) {
  const m = {
    action: name,
    target: c.id,
    data,
    revision: c.revision,
    requestId: randomUUID(),
  };
  const sender = role ? admin : c;
  const results = duplicate
    ? await all([
        req(sender, "/api/event-hub/mutate", m, role),
        req(sender, "/api/event-hub/mutate", m, role),
      ])
    : [await req(sender, "/api/event-hub/mutate", m, role)];
  for (const r of results) must(r, name);
  c.revision++;
  return results[0].json;
}
async function state(c) {
  return must(await req(c, "/api/event-hub/state"), "state");
}
async function observe() {
  if (observerBusy) return;
  observerBusy = true;
  try {
    const r = await pool.query(
      "SELECT count(*)::int connections,count(*) FILTER(WHERE wait_event_type='Lock')::int lock_waiters,count(*) FILTER(WHERE state='active')::int active,coalesce(max(extract(epoch FROM clock_timestamp()-xact_start)) FILTER(WHERE xact_start IS NOT NULL),0)::float8 max_transaction_seconds FROM pg_stat_activity WHERE datname=$1",
      [databaseName],
    );
    dbSamples.push({
      seconds: Math.round((performance.now() - started) / 1000),
      ...r.rows[0],
    });
  } finally {
    observerBusy = false;
  }
}
const sampling = setInterval(() => {
  void observe().catch(() => {});
}, 1000);
let result = {
  runId,
  mode,
  environment:
    "real HTTP -> compiled Express -> actual PostgreSQL16; loopback only; development mode with normal rate limits and PG-backed sessions; business clock offset fixture only",
  sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: apiDir,
    encoding: "utf8",
  }).trim(),
  builtIdentity: await readFile(apiDir + "/dist/build-identity.json", "utf8")
    .then(JSON.parse)
    .catch(() => null),
  preexistingOwnerRows: Math.max(5000, count),
  recordsBefore: before,
  startedAt: new Date().toISOString(),
  businessClockStart: new Date(
    Date.now() + Number(cfg.HUB_LOAD_CLOCK_OFFSET_MS),
  ).toISOString(),
  cohortSizes: [],
  failures: [],
  lostResponseReplay: false,
  restartVerified: false,
};
try {
  start();
  await waitReady();
  if (mode === "baseline") {
    stage = "accumulated-100-sessions";
    result.cohortSizes = [100];
    await all(
      clients.slice(0, 100).map((c) =>
        req(c, "/api/event-hub/session", {
          recoveryCode: c.code,
          create: true,
        }),
      ),
    );
    result.expectedBaselineProbe = true;
  } else {
    stage = "fixture-activation";
    const login = must(
      await req(admin, "/api/db/rpc/admin_create_session", {
        p_phone: "01000000000",
        p_admin_password: cfg.BOOTSTRAP_ADMIN_PASSWORD,
      }),
      "admin-login",
    );
    adminToken = login.data ?? login;
    if (args.includes("--resume")) {
      clients = JSON.parse(
        await readFile(out + "/cohort-private.json", "utf8"),
      ).clients;
      result.resumedExistingCohort = true;
      result.cohortSizes = [100, 150];
      await all(
        clients.map(async (c) =>
          must(
            await req(c, "/api/event-hub/session", {
              recoveryCode: c.code,
              create: false,
            }),
            "resume",
          ),
        ),
      );
    } else {
      must(
        await req(admin, "/api/db/rpc/admin_update_settings", {
          p_payload: { module_flags: { event_hub: true } },
          adminToken,
        }),
        "module-on",
      );
      must(
        await req(admin, "/api/db/rpc/admin_toggle_session", {
          p_active: true,
          adminToken,
        }),
        "start-cycle",
      );
      const event = must(
        (
          await mutation(
            admin,
            "event.save",
            "",
            {
              title: "격리150명 혼합·누적 시험",
              date: "2026-10-30",
              start: "22:00",
              end: "01:00",
              type: "normal",
              area: "합성 시험 지역",
              address: "합성 승인 후 장소",
              fee: 30000,
              deposit: 0,
              account: "실제 송금 금지 · 격리 시험",
              deadline: "격리 시험",
              notice: "내부 자동검사 전용",
              cardsEnabled: true,
            },
            true,
          )
        ).r,
        "event-save",
      );
      must(
        (
          await mutation(
            admin,
            "event.recruitment",
            event.id,
            { enabled: true },
            true,
            1,
          )
        ).r,
        "recruitment",
      );
      must(
        (
          await mutation(
            admin,
            "stock.save",
            "",
            { eventId: event.id, label: "소품 2번", add: 500 },
            true,
          )
        ).r,
        "stock",
      );
      stage = "150-real-sessions";
      await all(
        clients.map(async (c) =>
          must(
            await req(c, "/api/event-hub/session", {
              recoveryCode: c.code,
              create: true,
            }),
            "session",
          ),
        ),
      );
      const basic = (c) => ({
        eventId: event.id,
        basic: {
          nickname:
            "부" +
            ((Number(runId.split("-")[1]) % 100000) * 150 + c.i).toString(36),
          birthYear: 1995,
          location: "합성",
          phone: "0100000" + c.i.toString().padStart(4, "0"),
          depositor: "격리 시험",
          collection: true,
          version: "2026-10-27-event-v6",
        },
      });
      async function apply(c) {
        const m = {
          action: "application.basic",
          requestId: randomUUID(),
          data: basic(c),
        };
        const r = must(await req(c, "/api/event-hub/mutate", m), "basic");
        c.id = r.id;
      }
      stage = "100-concurrent-applications";
      result.cohortSizes.push(100);
      await all(clients.slice(0, 100).map(apply));
      stage = "150-mixed-applications-and-consent";
      result.cohortSizes.push(150);
      const consent = {
        collection: true,
        sharing: true,
        notice: true,
        version: "2026-10-27-event-v6",
      };
      await all(
        clients.map(async (c) => {
          if (!c.id) await apply(c);
          await action(
            c,
            "application.consent",
            { consent },
            false,
            c.i % 15 === 0,
          );
          await action(c, "application.confirm");
          await action(c, "application.report");
        }),
      );
      stage = "150-profile-payment-inquiry";
      await all(
        clients.map(async (c) => {
          await action(c, "application.profile", {
            profile: {
              lastStep: 6,
              mbti: "ENFP",
              interests: ["여행", "음악"],
              personalityScore: 50,
              privacyConsent: {
                collection: true,
                sharing: true,
                version: "2026-10-13-v1",
              },
              pushDecision: "skip",
            },
          });
          await action(
            c,
            "admin.application.payment",
            { status: "approved", bankChecked: true },
            true,
            c.i % 15 === 0,
          );
          await action(
            c,
            "admin.application.attendance",
            { status: "confirmed" },
            true,
          );
          await action(c, "admin.application.checkin", { checked: true }, true);
          must(
            (
              await mutation(c, "thread.send", "", {
                text: "격리 문의 " + c.i,
                collection: true,
              })
            ).r,
            "inquiry",
          );
        }),
      );
      stage = "150-enter-and-three-cards";
      await all(
        clients.map(async (c) => {
          await action(
            c,
            "application.enter",
            { deviceSecret: c.device },
            false,
            c.i % 15 === 0,
          );
          await action(c, "application.draw", {}, false, true);
          await action(c, "application.draw");
          await action(c, "application.draw");
          const s = await state(c),
            a = s.applications.find((a) => a.id === c.id);
          if (a.cards.length !== 3 || a.payment !== "approved" || !a.profileId)
            throw Error("Final flow invariant");
          c.profileId = a.profileId;
          c.owner = (
            await pool.query(
              "SELECT data->>'owner' owner FROM event_hub_records WHERE kind='application' AND id=$1",
              [c.id],
            )
          ).rows[0].owner;
          c.before = a;
        }),
      );
      stage = "duplicate-prize-rejection";
      for (const c of clients.slice(0, 8)) {
        const card = c.before.cards.find((x) => x.prize !== "다음 기회에");
        if (!card) continue;
        await action(
          c,
          "admin.application.prize",
          { cardId: card.id },
          true,
          true,
        );
        const repeated = (
          await mutation(
            c,
            "admin.application.prize",
            c.id,
            { cardId: card.id },
            true,
            c.revision,
          )
        ).r;
        if (repeated.status !== 409)
          throw Error("Duplicate payout was not blocked");
      }
      stage = "stored-response-lost-replay";
      const c = clients[0],
        lost = {
          action: "thread.send",
          requestId: randomUUID(),
          data: { text: "응답 유실 검증용 합성 문의", collection: true },
        };
      await new Promise((resolve, reject) => {
        const q = http.request(
          base + "/api/event-hub/mutate",
          {
            method: "POST",
            headers: { "content-type": "application/json", cookie: c.cookie },
          },
          (r) => {
            if (r.statusCode !== 200) {
              r.resume();
              reject(Error("Lost-response commit HTTP" + r.statusCode));
              return;
            }
            r.destroy();
            requests.push({
              stage,
              tag: "expected-response-body-dropped",
              status: 200,
              ms: 0,
              seconds: Math.round((performance.now() - started) / 1000),
              generation: serverGeneration,
            });
            resolve();
          },
        );
        q.on("error", reject);
        q.end(JSON.stringify(lost));
      });
      const again = must(
        await req(c, "/api/event-hub/mutate", lost),
        "lost-replay",
      );
      const st = await state(c);
      if (
        st.threads[0].messages.filter((m) => m.text === lost.data.text)
          .length !== 1
      )
        throw Error("Lost reply duplicated");
      result.lostResponseReplay = !!again.saved;
      await writeFile(
        out + "/cohort-private.json",
        JSON.stringify({ clients }),
        { mode: 0o600 },
      );
    }
    stage = "restart";
    for (const c of clients) {
      const p = (
        await pool.query(
          "SELECT data FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1",
          [c.profileId],
        )
      ).rows[0]?.data;
      if (!p) throw Error("Live profile missing before restart");
      c.actualPin = p.pin_code;
      c.actualNickname = p.nickname;
    }
    await stop();
    start();
    await waitReady();
    await all(
      clients.map(async (c) => {
        must(
          await req(c, "/api/event-hub/session", {
            recoveryCode: c.code,
            create: false,
          }),
          "restart-recovery",
        );
        const a = (await state(c)).applications.find((a) => a.id === c.id);
        if (
          a.profileId !== c.profileId ||
          a.cards.length !== 3 ||
          a.payment !== "approved"
        )
          throw Error("Restart lost record");
        c.revision = a.revision;
        const recovered = await action(c, "application.enter", {
          deviceSecret: c.device,
        });
        if (
          recovered.profile?.pin_code !== c.actualPin ||
          recovered.profile?.nickname !== c.actualNickname
        )
          throw Error("Restart lost profile PIN or nickname");
      }),
    );
    result.restartVerified = true;
    result.profilePinAndNicknameRecovered = true;
    stage = "sustained-150-mixed";
    const until = performance.now() + minutes * 60000;
    let tick = 0;
    while (performance.now() < until) {
      tick++;
      await all(
        clients.map(async (c) => {
          if ((c.i + tick) % 5 === 0)
            must(
              (
                await mutation(c, "thread.send", "", {
                  text: "장시간 합성 문의 " + tick,
                  collection: true,
                })
              ).r,
              "soak-inquiry",
            );
          else {
            const s = await state(c),
              a = s.applications.find((a) => a.id === c.id);
            if (
              !a ||
              a.profileId !== c.profileId ||
              a.payment !== "approved" ||
              a.cards.length !== 3
            )
              throw Error("Soak lost identity or payment");
          }
        }),
      );
      if (tick % 3 === 0) {
        const c = clients[tick % 150];
        must(
          (
            await mutation(
              admin,
              "thread.send",
              c.owner,
              { text: "합성 운영자 답장 " + tick },
              true,
            )
          ).r,
          "admin-reply",
        );
      }
      await delay(Math.min(15000, Math.max(0, until - performance.now())));
    }
    result.soakCycles = tick;
    result.sustainedMinutes = minutes;
  }
} catch (e) {
  result.failures.push({ stage, reason: e.message });
  process.exitCode = 1;
} finally {
  clearInterval(sampling);
  await observe().catch(() => {});
  await stop();
  await logs.close();
  result.finishedAt = new Date().toISOString();
  result.durationSeconds = Math.round((performance.now() - started) / 1000);
  result.requestCount = requests.length;
  result.statusCounts = {};
  for (const r of requests)
    result.statusCounts[r.status] = (result.statusCounts[r.status] ?? 0) + 1;
  result.requestLatencyByStage = {};
  for (const tag of new Set(requests.map((r) => r.stage))) {
    const list = requests.filter((r) => r.stage === tag),
      times = list
        .filter((r) => r.status === 200)
        .map((r) => r.ms)
        .sort((a, b) => a - b);
    result.requestLatencyByStage[tag] = {
      requests: list.length,
      p50Ms: times[Math.floor(times.length * 0.5)] ?? null,
      p95Ms: times[Math.floor(times.length * 0.95)] ?? null,
      maxMs: times.at(-1) ?? null,
    };
  }
  result.resources = resources;
  result.databaseSamples = dbSamples;
  result.recordsAfter = Number(
    (await pool.query("SELECT count(*) n FROM event_hub_records")).rows[0].n,
  );
  result.requests = requests;
  await pool.end();
  await writeFile(
    out + "/" + runId + "-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      runId,
      mode,
      durationSeconds: result.durationSeconds,
      requestCount: result.requestCount,
      statusCounts: result.statusCounts,
      failures: result.failures,
      resultFile: out + "/" + runId + "-result.json",
    }),
  );
}

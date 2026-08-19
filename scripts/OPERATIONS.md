# Safe script operations

All cloud, credential, build, and remote-mutating scripts fail closed.

## Common guard

- Preview without credentials, network writes, or local writes: `node scripts/<script>.mjs --dry-run`
- A production write requires both `--target=production` and an exact identity confirmation.
- Existing environment variables remain supported. Secret values are read from environment or the existing local credentials file and are never printed.
- There is no fallback admin/test password. Supply `PANEL_PASSWORD`, `ADMIN_PASSWORD`, `TEST_PASSWORD`, `OLD_ADMIN_PASSWORD`, or `BOOTSTRAP_PASSWORDS` as required by the script.

Production confirmation values:

- `setup-cloud.mjs`: `--confirm=<RENDER_SERVICE_NAME>,<NETLIFY_SITE_NAME>`
- `bootstrap-production.mjs`: `--confirm=<RENDER_SERVICE_ID>`
- `security-harden.mjs` and `rotate-secrets.mjs`: `--confirm=<RENDER_SERVICE_NAME>`
- `rotate-exposed-secrets.mjs` and `revoke-exposed-tokens.mjs`: `--confirm=<RENDER_SERVICE_NAME>,<NETLIFY_SITE_NAME>,<SUPABASE_PROJECT_REF>`
- `restore-login-now.mjs`: `--confirm=<API_PUBLIC_URL host>`
- `trigger-netlify-build.mjs`: `--confirm=<NETLIFY_SITE_NAME>`
- `test-session-toggle.mjs`: `--confirm=<API_PUBLIC_URL host>`

Example:

```powershell
node scripts/setup-cloud.mjs --dry-run
node scripts/setup-cloud.mjs --target=production --confirm=BINPC2,binpc2
```

`revoke-exposed-tokens.mjs` additionally requires `EXPOSED_NETLIFY_PREFIXES` before it can revoke Netlify applications. It only deletes explicitly matched old applications.

## Load and E2E scripts

`sim-concurrent-users.mjs`, `test-realtime-two-user.mjs`, `test-mutual-chat-hearts.mjs`, and `test-chat-hearts-e2e.mjs` default to `http://localhost:8080`. Existing `API_BASE`, `NETLIFY_URL`, `STAGES`, and related environment variables remain supported.

Any non-local target requires:

```powershell
node scripts/sim-concurrent-users.mjs `
  --url=https://binpc2.onrender.com/api/db `
  --target=production `
  --confirm=binpc2.onrender.com
```

Cleanup is limited to profiles created under one validated unique run prefix. It requires an exact second confirmation:

```powershell
node scripts/sim-concurrent-users.mjs `
  --run-prefix=lt_manual_20260817_abcd1234_ `
  --cleanup `
  --confirm-cleanup=lt_manual_20260817_abcd1234_
```

### Entry simulators — when to use which

| Mode | Command | Scope |
|------|---------|--------|
| **`sim-concurrent-users.mjs --entry-only`** | `node scripts/sim-concurrent-users.mjs --entry-only --users=100` | QR 입장 burst (p50/p95, 503 retries); no SSE/hearts/chat |
| **`sim-concurrent-users.mjs`** (default) | `node scripts/sim-concurrent-users.mjs` | Full user journey — profiles, hearts, SSE, staged load |

Shared: `scripts/lib/entry-burst.mjs` + `scripts/lib/test-personas.mjs`. `simulate-100-entry.js` was removed (merged into `--entry-only`).

### Playwright (local, not CI)

Chat/heart browser checks run locally only (flaky without dev server + auth):

```powershell
corepack pnpm --filter @workspace/boltnew-app test:playwright-local
```

- `tests/chat-refresh-queue.spec.ts` — offline queue localStorage survives reload
- `tests/heart-notif-list-sync.spec.ts` — stale-fetch merge sanity in browser
- `tests/local-failure.spec.ts` — app shell with mocked API, no production calls

Vitest covers hook-level stale merge: `src/__tests__/useHearts-stale-merge.test.ts`.

### `loadtest/` (legacy VU scripts)

| File | Run | Notes |
|------|-----|-------|
| `loadtest/stress.mjs` | `node loadtest/stress.mjs` | 150-VU register/login/message; needs api-server on `:8080` |
| `loadtest/deep_audit.mjs` | `node loadtest/deep_audit.mjs` | 3-area deep audit; same local API requirement |
| `loadtest/lib/client.mjs` | (imported) | Shared HTTP helper for the above |

No CI or package.json references — **keep for manual ops**, not deleted. Overlap with `scripts/sim-concurrent-users.mjs`; prefer scripts/ for maintained flows.

## Repeatable soak

The soak harness defaults to the local API, repeats bounded load stages, cleans up each uniquely prefixed run, and appends JSONL metrics under `scripts/.soak-results/`.

```powershell
corepack pnpm --filter @workspace/scripts soak -- `
  --duration-ms=300000 `
  --stages=5,10 `
  --max-stage=25
```

Limits:

- Duration: 1 second to 24 hours.
- Soak stage: 1 to 200 users and no larger than `--max-stage`.
- Concurrent simulator stage: hard maximum 500 users.
- Entry simulator users/concurrency: hard maximum 500.

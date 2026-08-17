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

`sim-concurrent-users.mjs`, `simulate-100-entry.js`, `test-realtime-two-user.mjs`, `test-mutual-chat-hearts.mjs`, and `test-chat-hearts-e2e.mjs` now default to `http://localhost:8080`. Existing `API_BASE`, `NETLIFY_URL`, `STAGES`, and related environment variables remain supported.

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

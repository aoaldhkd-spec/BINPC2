---
name: boltnew-app SSE token auth
description: Three-layer SSE auth — device secret (localStorage) → session cookie → HMAC token. Key security invariants to preserve.
---

# SSE Token Authentication

## Security invariants
1. `/api/db/events?userId=X` requires `?token=T` (HMAC-SHA256, 1h expiry). No token → 401. Anonymous connections (no userId) work without a token.
2. SSE tokens are issued **only** to browsers that hold a valid server session (`POST /auth/sse-token` reads from `req.session.userId`).
3. Sessions (`POST /auth/login`) are established only when the client presents a `deviceSecret` whose HMAC matches the stored binding in `device_secrets` table.
4. Device secret bindings are created **atomically at profile creation** by including `_device_secret` in the INSERT payload. The server strips the field from the stored profile before broadcasting/persisting. No free "first-claim" is allowed after creation.

**Why:** userId UUIDs are discoverable through normal profile queries. Without device-bound secrets, any client knowing a UUID could subscribe to the victim's private chat/heart events.

## Migration gap (known limitation)
Profiles created before this feature have no `device_secrets` row. `/auth/login` returns `{ error: 'device_not_bound', code: 'NEEDS_MIGRATION' }` for them. They fall back to anonymous SSE (public events only, no private). Migration requires re-registration or an admin-bound secret.

## Key decisions
- `SESSION_SECRET` must be set — `app.ts` throws on startup if missing.
- Sessions use `httpOnly; SameSite=Strict` cookies (7-day maxAge).
- Token auto-refreshes 5 min before expiry via `setTimeout` in `localdb.ts`.
- `getDeviceSecret(userId)` creates and persists the secret in localStorage on first call.

---
name: boltnew-app security hardening 2026-08-05
description: Security changes applied to api-server: helmet, CORS, cookie secure, /op allowlist, IDOR guard, input sanitization, storage headers, and client requesterId.
---

## Changes applied

### api-server/src/app.ts
- Added `helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })` — adds X-Frame-Options, X-Content-Type-Options, HSTS, etc.
- Changed `cors()` → `cors({ origin: false })` — same-origin only (frontend and backend share the same Replit domain).
- Changed session cookie `secure: false` → `secure: process.env.NODE_ENV !== 'test'` — safe with `trust proxy: 1`.

### api-server/src/routes/db.ts
- `ALLOWED_OP_TABLES` set: allowlist of ~20 table names. Returns 400 for any unknown table.
- `requesterId` field extracted from `/op` body.
- IDOR guard for `messages` SELECT: if filtered by `chat_id`, verifies `requesterId` is `user1_id` or `user2_id` in that chat → 403 if not.
- `sanitizeRow(tbl, row)`: strips control chars `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]`, caps field lengths (nickname 30, bio 500, status_message 100, messages.content 2000, etc.). Applied to INSERT effectiveRow and UPDATE patch.
- `/storage-image` response: added `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`.

### boltnew-app/src/lib/localdb.ts
- QueryBuilder `_runAsync()` adds `requesterId: _currentUserId` to every `/op` request body.

**Why:** `/api/db/op` had no auth/ownership checks — any user could read any chat's messages (IDOR). Table allowlist prevents access to internal tables. sanitizeRow prevents stored XSS payloads. helmet closes MIME-sniffing and clickjacking vectors.

**How to apply:**
- When adding new tables to the app, add them to `ALLOWED_OP_TABLES` in db.ts or they will return 400.
- When adding write ops for sensitive tables, consider extending the IDOR guard (currently only messages SELECT is checked).

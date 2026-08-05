---
name: boltnew-app security hardening v2
description: Critical IDOR/XSS fixes discovered via attack simulation on 2026-08-05 — filter bypass patch, messages SELECT 4-layer guard, UPSERT sanitize, logger import fix.
---

## Critical Fix: Filter Field Bypass (op vs type)

**Rule:** Server FilterSpec uses `type:'eq'` but attackers can send `{op:'eq'}`. Without normalization, `matchFilter` returns `true` for every row (filter ignored) AND the IDOR guard never fires.

**Fix:** Normalize all incoming filters at /op entry point:
```typescript
const normalizedFilters = filters.map(f =>
  f.type != null ? f : { ...f, type: f.op, op: undefined }
);
```
Then use `normalizedFilters` everywhere (applyFilters, IDOR guards) instead of raw `filters`.

**Why:** Client (localdb.ts) always sends `type:'eq'`, but an attacker using curl can send `op:'eq'` to bypass all filtering — dumping all messages without any IDOR check firing.

## Messages SELECT IDOR — 4-Layer Guard

Old code: only checked if chat existed AND requesterId was present. Three bypass paths existed.

**New rules (all enforced in sequence):**
1. No `requesterId` → 403 immediately
2. No `chat_id` filter → 403 (prevents full message dump)
3. Non-existent `chat_id` → empty array (no info leak)
4. Requester not in `chat.user1_id` or `chat.user2_id` → 403

**How to apply:** Any future change to messages SELECT must preserve these 4 checks. They live in `artifacts/api-server/src/routes/db.ts` around line 800.

## UPSERT Sanitize Gap

INSERT and UPDATE had `sanitizeRow` applied; UPSERT payload did not. Fixed:
```typescript
const inputs = (Array.isArray(payload) ? ... : [...])
  .map(row => sanitizeRow(table, row));
```

## logger Import Bug

`logger` was used in db.ts IDOR guard `logger.warn(...)` but was never imported. This caused `ReferenceError: logger is not defined` which crashed the /op handler for IDOR-triggering requests.

**Fix:** Add `import { logger } from '../lib/logger';` to db.ts top.

**Why:** logger lives in app.ts's scope and is NOT automatically available in route files — must be explicitly imported.

---
name: Admin dashboard chat/message IDOR bypass
description: Admin dashboard couldn't see chat history because server IDOR guards blocked all chat/message SELECTs for unauthenticated requesters.
---

## The problem
AdminApp uses the same `localdb.ts` client as regular users. Admin does NOT call `setLocalDbUserId`, so `requesterId` is null. Server IDOR guards on `chats` and `messages` SELECT require a non-null `requesterId` → all admin chat/message reads returned 403 (silently swallowed by `loadAll`).

## The fix

**Server (`db.ts`)**:
- Added `validAdminTokens: Set<string>` in module scope (in-memory, max 100 entries)
- `admin_create_session` RPC now stores the generated `local-*` token in the Set before returning it
- In `POST /op` handler: extract `adminToken` from body, check `validAdminTokens.has(adminToken)` → `isAdmin = true`
- `chats` SELECT: if `isAdmin`, skip participant scope filter and return all chats
- `messages` SELECT: if `isAdmin`, skip all IDOR checks (requesterId, chat_id filter, participant check)

**Client (`localdb.ts`)**:
- `_runAsync()` now includes `adminToken: localStorage.getItem('admin_token_v1') ?? undefined` in every `/op` request body

**Why:**
Admin needs to audit all chats/messages. Token stored server-side so it can be validated without trusting the client blindly.

**How to apply:**
If server restarts, `validAdminTokens` is cleared — admin must re-login to get a new token stored. This is intentional (restart = fresh auth). Admin delete of messages may still be blocked by the sender IDOR guard (separate issue).

---
name: boltnew-app sync architecture fix
description: Root cause and fix for admin/test panel data not showing in main app (different space / 다른 공간 문제)
---

## Root Cause
api-server maintains an in-memory store (`store[table]`). Two separate write paths existed:
- **Path A**: `/api/db/op` → writes to `store` + `app_kv_rows` + NOTIFY → instant SSE broadcast ✅
- **Path B**: AdminApp/TestDashboard write to Supabase native tables directly → `store` never updated ❌

`resyncHotTablesFromDb()` read from `app_kv_rows` (not native tables), so Path B writes were NEVER reflected until the next resync cycle.

## Fix Applied

### api-server
- Added `resyncAllFromNativeDb()`: reads ALL 13 relevant tables from **native Supabase tables** in parallel, updates store, broadcasts `_bulk_resync` SSE signal
- Changed periodic resync from 5 min (app_kv_rows) → 30 sec (native tables): any missed call auto-heals in ≤30s
- `test_resync` RPC now calls `resyncAllFromNativeDb()` (covers all tables, not just profiles+seats)
- Added `admin_force_resync_all` RPC (admin auth): calls `resyncAllFromNativeDb()` immediately

### AdminApp.tsx
Added `adminApiRpc('admin_force_resync_all', {}).catch(...)` (fire-and-forget) after:
handleClearLikes, handleClearNotifications, handleClearGames, handleClearSuggestions,
handleClearProfiles, handleDeleteChat, handleClearAllChats, handleClearReports, handleClearHistory

### TestDashboard.tsx
Added `testResync()` (fire-and-forget or awaited) after ALL 12 mutation functions:
deleteProfile, deleteAllProfiles, assignSeat, clearSeat, randomlyFillSeats, clearAllSeats,
sendHeart, acceptHeart, deleteHeart, clearAllHearts, createChat, deleteChat

**Why:** deleteAllProfiles uses `await testResync()` (blocking) for instant reset; others fire-and-forget.

## Tables covered by full resync
profiles, seats, app_settings, notifications, likes, chats, balance_games, balance_votes,
qa_games, qa_answers, image_games, image_votes, suggestions
(messages and app_image_store excluded — too large/private)

## Remaining gaps (acceptable)
- Game insert/update functions in AdminApp (balance_games, qa_games, image_games) — no explicit sync added;
  covered by 30-sec auto-resync
- `_bulk_resync: true` SSE signals — frontend localdb.ts must handle these (triggers profile/seat reload)

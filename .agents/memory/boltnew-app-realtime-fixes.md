---
name: boltnew-app realtime fixes
description: Known gotchas with Supabase realtime subscriptions in boltnew-app
---

## profiles UPDATE subscription
The `profileChannel` in App.tsx must have INSERT + UPDATE + DELETE handlers.
Originally only had INSERT + DELETE — caused photo uploads, birth_month/day, and contact info to never reflect in real-time for other users.
Fix: `.on('postgres_changes', { event: 'UPDATE', ... }, payload => setProfiles(prev => prev.map(...)))` added between DELETE handler.

**Why:** Supabase postgres_changes requires explicit event type per handler.

**How to apply:** Any future field added to profiles that users can update must be covered by this UPDATE handler (it merges `payload.new` into the existing record).

## contactEventsChannel duplicate notifications
`contact_share_events` INSERT subscription re-fires stale events on Supabase reconnect.
Fix: Added `seenContactEventIdsRef` (Set<string>) keyed by `row.id` or `from:type:created_at`. Also added 30-second recency guard — events older than 30s are ignored entirely.

**Why:** Supabase realtime replays recent postgres_changes on reconnect to prevent missed events. Without deduplication, rejection toasts kept reappearing.

**How to apply:** Any INSERT-only subscription that triggers user-visible notifications should use a seenIdsRef + recency guard.

## Photo upload immediate refresh
`handlePhotoUpload` in MainScreen.tsx must call `onRefreshProfiles()` after the supabase update, even with the UPDATE subscription active — own-user sessions may not receive their own realtime events reliably.

## handleTabChange clearing
- `status` tab → clears hearts + contacts seen counts
- `profiles` tab → clears seenProfilesCount (new participants badge)
- `chats` OR `suggestions` tab → calls `onClearMsgCount()`
- `game` OR `fortune` tab → sets seenGameCount

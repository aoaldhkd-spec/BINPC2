---
name: boltnew-app entry race condition fix
description: Why new registration sometimes bounced back to entry-1 on first attempt, and how it was fixed.
---

## The Bug
`handleNicknameSetup` in App.tsx sets `setCurrentUserId(profile.id)`, which fires `useEffect([currentUserId, ...])`.
That effect calls `loadProfiles()`. If the DB hasn't propagated the new row yet, `allProfiles.some(p => p.id === currentUserId)` returns false → session is cleared → user is sent back to entry-1.

## The Fix (two-part)
1. In `handleNicknameSetup`, immediately push the returned profile into `profiles` state:
   ```tsx
   setProfiles(prev => prev.some(p => p.id === profile.id) ? prev : [profile as Profile, ...prev]);
   ```
2. In the `useEffect([currentUserId])` loadProfiles callback, check `isNewRegistration.current` FIRST and short-circuit to `setView('main')` without running the profile-not-found check:
   ```tsx
   if (isNewRegistration.current) {
     isNewRegistration.current = false;
     setView('main');
     setMainTab('status');
     return;
   }
   ```

**Why:** `isNewRegistration` is set to `true` synchronously before `setCurrentUserId`, so the effect always sees it as `true` on the first load.

**How to apply:** Any time registration involves an async DB insert followed by an immediate `setCurrentUserId`, use this pattern.

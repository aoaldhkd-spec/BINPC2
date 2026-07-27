---
name: boltnew-app file split
description: What was extracted from App.tsx and what still remains in it (for future refactoring).
---

## Extracted (App.tsx: 9041 → 1866 lines)

| File | Contents |
|------|----------|
| `src/types/app.ts` | Profile, Message, Seat, ContactShare, Suggestion, BalanceGame, BalanceVote, AnonymousReport, Chat, View, MainTab, TableMiniGameSession, GameState, NickTpl, UserGameSubTab, LadderBar, TutorialSlide |
| `src/lib/utils.ts` | hasBannedWord, koreanMatch, getKoreanChosung, getMbtiStyle |
| `src/lib/storage.ts` | safeLocalStorage(), ls (safe localStorage wrapper) |
| `src/components/DrumRoller.tsx` | DrumRoller<T> generic scroll picker |
| `src/components/ProfileScoreBar.tsx` | ProfileScoreBar |
| `src/components/ProfileDetail.tsx` | ProfileDetail (uses ProfileScoreBar, heartMeta local) |
| `src/components/ChatScreen.tsx` | ChatScreen (~910 lines: stickers, emoji, reply, swipe, compat/saju modals) |
| `src/components/BrowserGuidePopup.tsx` | BrowserGuidePopup |
| `src/components/ReconnectOverlay.tsx` | ReconnectOverlay |
| `src/components/TimerBanner.tsx` | TimerBanner |
| `src/components/RefreshBtn.tsx` | RefreshBtn |
| `src/components/ProfileInfoBadges.tsx` | ProfileInfoBadges |
| `src/components/LikeConfirmDialog.tsx` | LikeConfirmDialog |
| `src/components/ContactShareModal.tsx` | ContactShareModal |
| `src/components/ContactViewModal.tsx` | ContactViewModal |
| `src/components/NotifModal.tsx` | NotifModal |
| `src/components/WelcomeNoticeModal.tsx` | WelcomeNoticeModal |
| `src/components/SeatRegisterDialog.tsx` | SeatRegisterDialog |
| `src/components/ProfileQrModal.tsx` | ProfileQrModal (named export) |
| `src/components/ResetButton.tsx` | ResetButton (named export) |
| `src/components/TutorialModal.tsx` | TutorialModal (named export) |
| `src/components/NicknameSetupScreen.tsx` | NicknameSetupScreen (named export) |
| `src/components/WaitingOverlay.tsx` | WaitingOverlay (named export, hosts game overlay screens) |
| `src/components/MainScreen.tsx` | MainScreen (named export, ~1700 lines; also contains StatusErrorBoundary class) |
| `src/components/games/GameDisplays.tsx` | DiceDisplay, RouletteDisplay, LadderDisplay |
| `src/components/games/GameResultModal.tsx` | GameResultModal |
| `src/components/games/GameActiveBanner.tsx` | GameActiveBanner |
| `src/components/games/UserGameTab.tsx` | UserGameTab (named export) |
| `src/components/StatsTabs.tsx` | StatsTab, RankingTab (named exports) |
| `src/components/SeatingMap.tsx` | SeatingMap (default export) |
| `src/components/ProfileAvatar.tsx` | ProfileAvatar (default export) |
| `src/components/FortuneTab.tsx` | FortuneTab (default export, lazy-loaded) |

## Still in App.tsx (~1866 lines)

- `App()` — the root component: all state, effects, subscriptions, handlers, and top-level JSX (including modal/overlay stack)
- `playCuteSound`, `urlBase64ToUint8Array`, `registerPushSub` — module-level helpers used by App()
- BANNED_NICKNAME_WORDS, containsBannedNicknameWord — used only in NicknameSetupScreen (could move)

## Key import/export patterns

- MainScreen takes `setSeatDialog` as a new prop (was a closure var in App())
- saju state (sajuBirthMonth/Day/Saving) and statusPhone state → moved INTO MainScreen
- photoUploading + handlePhotoUpload → moved INTO MainScreen
- ls → now imported from `./lib/storage` in both App.tsx and MainScreen.tsx
- StatusErrorBoundary → class component defined in MainScreen.tsx (not exported)
- All game sub-components use named exports
- FortuneTab → default export, lazy-loaded in both App.tsx (was) and MainScreen.tsx

**Caution:** When Python-deleting by line number, always run the script BEFORE any Edit calls that change line counts. Prior session had an off-by-2 issue when edits ran first, corrupting playCuteSound (fixed by replacing safeLocalStorage header with playCuteSound declaration).

**Why:** App.tsx was 9041 lines making it unmaintainable. Extraction done without functional changes; build verified after each batch.

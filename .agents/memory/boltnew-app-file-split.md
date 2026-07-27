---
name: boltnew-app file split
description: What was extracted from App.tsx and what still remains in it (for future refactoring).
---

## Extracted so far (App.tsx: 9041 → ~7700 lines)

| File | Contents |
|------|----------|
| `src/types/app.ts` | Profile, Message, Seat, ContactShare, Suggestion, BalanceGame, BalanceVote, AnonymousReport, Chat, View, MainTab, TableMiniGameSession, GameState, NickTpl, UserGameSubTab, LadderBar, TutorialSlide |
| `src/lib/utils.ts` | hasBannedWord, koreanMatch, getKoreanChosung, getMbtiStyle |
| `src/components/DrumRoller.tsx` | DrumRoller<T> generic scroll picker |
| `src/components/ProfileScoreBar.tsx` | ProfileScoreBar |
| `src/components/ProfileDetail.tsx` | ProfileDetail (uses ProfileScoreBar, heartMeta local) |
| `src/components/ChatScreen.tsx` | ChatScreen (~910 lines: stickers, emoji, reply, swipe, compat/saju modals) |
| `src/components/BrowserGuidePopup.tsx` | BrowserGuidePopup |
| `src/components/ReconnectOverlay.tsx` | ReconnectOverlay |

## Still in App.tsx (candidates for future extraction)

- `SeatRegisterDialog` (L~178, ~60 lines)
- `DiceDisplay`, `RouletteDisplay`, `LadderDisplay`, `QaGameOverlay` (game display components)
- `GameAnnouncementModal`, `GameResultModal`, `GameActiveBanner` (game modals)
- `NotifModal`, `WelcomeNoticeModal` (notification modals)
- `BalanceGameCard`, `CreateGameModal` (balance game UI)
- `MiniGameTips`, `ParticipantSelector`, `HowToPlayCard` (game helpers)
- `RouletteGame`, `LadderGame` (full game UIs)
- `UserGameTab`, `TableMiniGameModal` (game tabs)
- `EntryGateScreen`, `WaitingOverlay` (~400 lines each)
- `ProfileInfoBadges`, `LikeConfirmDialog`, `ContactShareModal`, `ContactViewModal`
- `TutorialModal`, `ResetButton`, `ProfileQrModal`
- `NicknameSetupScreen` (~640 lines) - uses DrumRoller, generateNicknameCandidates
- `TimerBanner`, `RefreshBtn`
- `MainScreen` (~1290 lines — largest remaining, has 50+ props)
- `App()` function itself (~1750 lines with all state/effects/subscriptions)

## Key import patterns

- Types → `import type { ... } from '../types/app'`
- Utils → `import { hasBannedWord, koreanMatch, getMbtiStyle } from '../lib/utils'`
- heartMeta → defined locally in ProfileDetail.tsx (small, not worth separating)
- EMOJIS constant → defined locally in ChatScreen.tsx
- BANNED_NICKNAME_WORDS + containsBannedNicknameWord → still in App.tsx (used by NicknameSetupScreen)
- playCuteSound, urlBase64ToUint8Array, registerPushSub → still in App.tsx (used by App() function)
- heartMeta (for App() bottomNotif) → still in App.tsx (line ~2508)

**Why:** App.tsx was 9041 lines making it unmaintainable. Extraction done without functional changes; build verified after each batch.

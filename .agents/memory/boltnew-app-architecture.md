---
name: boltnew-app architecture
description: Korean queer social drinking app structure, key files, and component/hook rules
---

## App structure
- `artifacts/boltnew-app/src/App.tsx` (~7855 lines) — main user app (App component)
- `artifacts/boltnew-app/src/AdminApp.tsx` (~5135 lines) — admin panel (AdminDashboard component)
- `artifacts/boltnew-app/src/TestDashboard.tsx` (641 lines) — do NOT modify without explicit instruction
- `src/lib/localdb.ts` — Supabase mock (local state)

## App routing
- App: NicknameSetupScreen → WaitingOverlay → MainScreen → ProfileDetail → ChatScreen
- AdminApp: DashboardTab / SeatingTab / GameTabs / HistoryTab / ReportsTab
- TestDashboard: separate route

## Rules of Hooks — critical
`sentLikedProfiles` and `pendingHeartsCount` useMemo must be declared **before ALL early returns** in the App component.
Current position: ~line 4331-4345 (before `seatQrWithoutSession` check, which is the first early return in App).
The function has multiple early returns: seatQrWithoutSession → showWaiting → appLoading → view=loading-main → view=entry-1 → view=profile → view=chat → final return.

**Why:** React Rules of Hooks — hooks must not be called conditionally. Any useMemo/useState after an early return that sometimes triggers = runtime error "Rendered more hooks than during the previous render".

## AdminApp state summary (as of July 2026)
- `recovery` state: floating 30-sec banner with restore function
- `restoreMap` state: `Map<string, () => Promise<void>>` — persistent per-key restore buttons in DashboardTab
- `showRecovery(label, emoji, restore, mapKey?)` — also updates restoreMap when mapKey provided
- All handleClear* and handleFull/EventEnd reset functions pass their mapKey to showRecovery

## DashboardTab
- Props include `restoreMap: Map<string, () => Promise<void>>`
- Items layout: init button (flex-1) + restore button (w-14) side by side per row
- Restore button enabled only when restoreMap.has(key); keys: seats/likes/chats/notifications/games/suggestions/profiles/history/eventEnd

## Game sections (AdminApp)
- **OxGameSection**: single/batch mode toggle; OX_QUICK_GENERAL/HOT tabs; `oxPenalty` state + quick buttons; batch sends via `sendBatchOx`
- **ChosungGameSection**: `chosungPenalty` state; `targetTable` state with table selector UI
- **QaGameSection**: `qaPenalty` state; `qaTargetTable` state (null=전체, number=specific table); `startQa` uses scope `'qa_table'` when targetTable set; target table UI before start button
- **BalanceGameSection**: single/batch mode; `BALANCE_QUICK` batch quick-select buttons at top of batch section (all-table bulk apply)

## Quick content arrays (AdminApp top-level)
- `OX_QUICK_GENERAL` (12개), `OX_QUICK_HOT` (8개) — OX game quick prompts
- `BALANCE_QUICK` (25개 general + 13개 hot) — balance game quick options
- `IMAGE_QUICK` { general: 9, hot: 10 } — image game quick options
- `GAME_PENALTY_QUICK` (9개) — shared penalty quick buttons

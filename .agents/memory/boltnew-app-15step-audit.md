---
name: boltnew-app 15-step E2E audit (2026-08-06)
description: Zero-Bug audit Parts 1–5 결과 요약 — 핵심 발견 사항과 적용된 방어막
---

## Key decisions and patterns established

### Part 2 — Frontend Timer/Closure
- useCallback으로 메시지 핸들러 안정화; longPressTimer/focusTimerRef 언마운트 cleanup 추가
- baseline effect `[]` → `[pendingHeartsCount, receivedContactShares.length, profiles.length, activeGameCount]` + hasAnyData guard

### Part 3 — Backend Exception Handling
- `/op` `finally {}` was empty → `_activeOpCount` never decremented on success paths (concurrency slot leak)
- All route handlers now individually try-catch wrapped
- DELETE N+1 → `dbDeleteRows` batch; RPC seat loops → `Promise.all`
- SIGTERM handler: `gracefulShutdown()` closes pool + LISTEN client

### Part 4 — Security & Error Boundaries
- IDOR gap: messages UPDATE had `if (requesterId)` check → unauthenticated UPDATE possible; fixed to require requesterId for messages
- IDOR gap: messages INSERT had `if (effectiveRow.chat_id != null)` → orphan messages possible; fixed to always require chat_id
- `sanitizeStr` extended with Unicode direction-override strip (RTL attack)
- FIELD_LIMITS extended to notifications/suggestions/anonymous_reports/qa_games/balance_games
- Error Boundaries: MainScreen, GameActiveBanner, GameResultModal, TableMiniGameModal, AdminApp all wrapped

### Part 5 — Verified
- Stress test: 150 VU msg p99=221ms, like p99=165ms, 0 HTTP errors
- Unit tests: 60/60 pass
- TypeCheck: 0 errors

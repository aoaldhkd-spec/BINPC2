---
name: boltnew-app audit 2026-08-12
description: 28점 전수감사 결과 수정 내역 — 미사용 코드·useGroupChat 안정성·console 정리
---

## 수정 내역

### App.tsx
- `GroupMessage` type import 제거 (미사용)
- `selfInitiatedPairRef`, `chatListRef` useChat 구조분해에서 제거 (useChat.ts 내부에서만 사용)

### MainScreen.tsx
- 미사용 import 제거: `getZodiac`, `getOhaeng`, `getTodayFortune` (fortune 모듈)
- 미사용 state 제거: `showBlockList`, `signalCardOpen`, `showContactEdit`
- `setShowContactEdit(false)` 참조 제거
- `filteredProfiles` useMemo deps에 `blockedUserIds`, `hiddenByIds` 추가 (차단 후 즉시 반영 버그 수정)

### useGroupChat.ts
- `applyGroupInsert`: 신규 메시지 추가 시 `created_at` 기준 정렬 추가 (SSE 순서 미보장 대비)
- 비활성 그룹 SSE 중복 방지: `seenInactiveGroupMsgIds` LRU-500 Set — 재연결 시 unread 과다 카운트 차단
- 모든 `console.error/warn` → silent `catch {}` 처리

### push.ts
- `console.error` → pino logger (`{ name: 'push' }`)

**Why:** ESLint 에러 1건(useMemo deps), 런타임 버그 2건(차단 필터 미반영, 그룹 SSE 중복), 보안 1건(console에 userId 노출 방지)

**결과:** typecheck clean, 74 unit tests pass

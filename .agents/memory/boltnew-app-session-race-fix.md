---
name: boltnew-app session race fix
description: loginSession 완료 전 /op 요청이 날아가 서버가 session mismatch 403으로 전면 차단하는 경쟁 조건 수정
---

## 문제

서버 session에 구(舊) UUID, body.requesterId에 신(新) UUID → 불일치 → 403 "requesterId body-spoof attempt blocked"
→ 채팅 생성, 좋아요, 모든 /op 요청이 차단됨.

재현 조건: 사용자가 localStorage를 초기화하거나 새 UUID로 재가입 후 앱 열 때 첫 렌더 사이클.

## 근본 원인

`setLocalDbUserId(newUUID)` → `_currentUserId` 즉시 갱신 → React effects가 /op 요청 즉시 발사.
그런데 `loginSession(newUUID)` (서버 세션 갱신)는 비동기 → 구 세션이 아직 남아 있음.

## 수정 (localdb.ts)

세션 준비 게이트 패턴:
- `_markSessionPending()`: userId 바뀔 때 호출 → `_sessionReady = false`
- `_markSessionReady()`: `loginSession` 완료(성공/실패 모두)시 호출 → `_sessionReady = true`
- `_waitForSession()`: `_runAsync()` 시작 시 호출 → 준비될 때까지 대기 (최대 5초 타임아웃)

**Why:** session 체크는 보안상 필요(IDOR 방어). 제거 불가. 클라이언트에서 순서 보장이 더 안전.

**How to apply:** localdb.ts `_runAsync`에 `await _waitForSession()` 한 줄이 핵심. 
`setLocalDbUserId` → `_markSessionPending()`, `loginSession` 완료 → `_markSessionReady()`.
관리자(adminToken 사용, _currentUserId=null)는 `_sessionReady=true` 유지라 영향 없음.

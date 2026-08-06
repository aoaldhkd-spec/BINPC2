---
name: boltnew-app full audit 2026-08-06
description: 전수검사 결과 및 수정 내역 — 서버·채팅·연결·크래시 전 영역
---

## Critical fixes

### db.ts — _activeOpCount 이중 감소 (25개)
try/catch/finally 블록 안에서 `_activeOpCount--` + finally 이중 감소 버그.
**Why:** 카운터가 음수로 내려가 503 처리가 무력화됨.
**How:** try 블록 내 수동 감소 25개 제거, finally 단독 처리.

### db.ts — SSE cleanupConn 이중 호출
`close`+`aborted` 두 이벤트가 동시에 발생 시 _sseConnPerIp 두 번 감소.
**How:** `let _cleaned = false` 플래그로 idempotent 보장.

### db.ts — 초기 res.write 정리
cleanupConn 선언 이후로 초기 ping write 이동; 실패 시 cleanupConn() 호출.

## High fixes

### localdb.ts — subscribe() 재호출 시 핸들러 누수
같은 채널에 subscribe()를 두 번 호출하면 이전 핸들러가 _sseListeners에 남아 중복 실행.
**How:** subscribe() 시작에서 기존 핸들러 먼저 제거.

### localdb.ts — statusCb setTimeout 취소 누락
unsubscribe() 시 pending setTimeout이 취소되지 않아 이미 해제된 채널에 SUBSCRIBED 신호.
**How:** _statusTimer ref 보관, unsubscribe에서 clearTimeout.

### localdb.ts — broadcast callback 예외 묵음
`try { sub.callback() } catch {}` → `catch (err) { console.error }`.

### localdb.ts — fetchAndSetSseToken 실패 묵음
`catch { /* ignore */ }` → `catch (e) { console.warn }`. 이제 콘솔에서 원인 확인 가능.

## Cross-instance sync (이전 세션)
- NOTIFY 8KB 초과 시 tombstone 전송 → 수신 측 DB 재조회
- LISTEN 재연결 후 hot 테이블(profiles/seats/app_settings) 즉시 재동기화
- 5분 주기 hot-table reconciliation

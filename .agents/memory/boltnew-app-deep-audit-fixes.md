---
name: boltnew-app deep audit fixes
description: 2026-07-31 심층 버그 스캔 2차 수정 7건 — race, leak, serial-await, stale-closure 패턴
---

## 수정 항목

### useChat.ts — sendImage 스냅샷 (race)
진입 시 chatId/currentUserId를 로컬 변수에 스냅샷. 업로드 완료 후 채팅방/사용자가 달라졌으면 고아 파일 삭제 후 중단.
**Why:** await 중 뷰 전환 시 이미지가 다른 채팅방에 INSERT되거나 스토리지 고아 파일 발생.

### useChat.ts — deleteAllChats Promise.all (serial→parallel)
`for...of` 직렬 루프 → `Promise.all(snapshot.map(...))` 병렬화. snapshot으로 실행 중 chatList 변경 방지.
**Why:** 채팅방 10개 삭제 시 20 round-trip 직렬 = O(n) 지연.

### useHearts.ts — executeLike Promise.race 타임아웃 (AbortController 미전달 버그)
AbortController signal이 localdb.ts에 전달되지 않아 hung promise를 실제로 취소할 수 없었음. `Promise.race([insert, timeout])` 패턴으로 교체. targetId/likerId 스냅샷으로 stale 클로저 제거.
**Why:** 네트워크 지연 시 8초 후에도 likeInFlightRef 잠금이 유지되어 이후 하트 전송 불가.

### db.ts — SSE _sseCleanup Map (keepalive interval 누수)
`_sseCleanup: Map<Response, () => void>`에 각 SSE 연결의 `clearInterval(keepalive)` 함수 저장. `_send` write 실패 시 즉시 호출. `req.on('close')` 외에 `req.on('aborted')` 핸들러 추가.
**Why:** write 실패로 응답이 sseUserMap에서 제거되어도 keepalive interval이 계속 실행됨 → process 종료까지 누수.

### db.ts — startDailyEntryPasswordRenewal single-flight (_renewalInProgress)
1분 interval 중 dbPersistRow가 완료되지 않은 채 다음 tick이 실행될 경우 중복 갱신 방지.
**Why:** DB write 지연 시 설정값이 두 번 덮어쓰일 수 있음.

### db.ts — unreadCountsCache LRU 상한 200
`unreadCountsCache.size >= 200`이면 가장 오래된 항목(Map 삽입 순서 첫 번째) 제거 후 삽입.
**Why:** 임의 userId로 /unread-counts 호출 시 캐시가 무한 성장 가능. 30초 sweep만으로는 2초 TTL 내 폭발적 성장을 막지 못함.

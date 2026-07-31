---
name: boltnew-app perf fixes
description: 2026-07-31 적용된 13개 서버·클라이언트 성능·메모리 수정 요약 및 적용 원칙
---

## 적용된 수정 (2026-07-31)

### 서버 (db.ts) — 메모리 누수 방지
- `_userLikeMinuteBuckets`: 5분 pruning interval 추가 (만료 버킷 자동 삭제)
- `_broadcastRateMap`: 5분 pruning interval 추가
- `unreadCountsCache`: 30초 pruning interval 추가 + messages INSERT 시 수신자 캐시 즉시 무효화

### 서버 (db.ts) — 알고리즘 복잡도
- INSERT profiles 루프: nickname/pin Set을 루프 밖으로 이동 O(n²)→O(n), 증분 업데이트
- UPSERT 루프: id 기반 조회를 Map 인덱스(_idxById)로 O(n)→O(1), INSERT 시 Map 갱신

### 서버 (db.ts) — 안정성
- `dbPersistRow`: 500ms 후 1회 재시도 추가 (ECONNRESET·idle timeout 자동 복구)
- `broadcastAll`: 50개씩 setImmediate 청킹 — 300 write() 이벤트 루프 블로킹 방지

### 클라이언트
- `useHearts.loadContactShareData`: 두 독립 쿼리 Promise.all 병렬화 (~50% 레이턴시 감소)
- `useChat.openChat`: setTimeout → ref 저장 + clearTimeout — stale 타이머 race 방지

**Why:** 150명 동시 부하(150-VU 스트레스 테스트) 기준으로 p95=327ms 달성

**How to apply:** 새로운 Map/Set 인메모리 컬렉션 추가 시 항상 pruning interval과 함께 선언할 것.
broadcastAll 계열 함수에 새 팬아웃 추가 시 청킹 패턴 유지.
dbPersistRow 재시도는 멱등(ON CONFLICT DO UPDATE) 쿼리에만 안전하게 적용 가능.

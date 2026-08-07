---
name: boltnew-app admin SSE fix
description: 관리자 실시간이 새로고침 없이 안 되는 근본 원인과 수정 방법
---

## 규칙
AdminApp 마운트 초기 useEffect에서 반드시 `setLocalDbUserId(null)`을 호출해야 한다.

## Why
`localdb.ts` `createSse()`의 adminToken 분기:
```js
if (adminToken && !_currentUserId) params.push(`adminToken=...`);
```
`_currentUserId`가 null이어야만 adminToken이 SSE URL에 포함되어 `sseAdminClients`에 등록된다.
AdminApp은 `/admin` 경로에서 App.tsx를 거치지 않고 독립 렌더링되므로,
이전 일반 유저 세션의 `_currentUserId`가 메모리에 잔류하면 조건이 실패한다.
→ admin SSE가 `sseUserMap`에 일반 유저로 등록되어 프라이빗 이벤트(메시지·하트·채팅) 미수신.

## How to apply
AdminApp.tsx의 `useEffect(() => { loadAll(); supabase.channel('admin-realtime')... }, [loadAll])` 맨 앞에:
```js
import { setLocalDbUserId } from './lib/localdb';
// ...
setLocalDbUserId(null); // userId 초기화 → adminToken 조건 통과
```

## 추가 수정
- 헬스 폴링 30초 → 5초 (SSE 연결 수 표시 실시간성)
- flushPendingQueue: `finally { isFlushingRef.current = false }` + 항목별 8초 타임아웃
- handleSaveMyInfo: error 체크 후 실패 시 chatError 표시, 편집창 유지

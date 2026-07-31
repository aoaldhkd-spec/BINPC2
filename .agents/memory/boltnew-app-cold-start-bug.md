---
name: boltnew-app cold-start loading gate bug
description: reset_signal이 있는 상태에서 fresh localStorage로 접속하면 loading 화면이 무한 지속되는 버그 및 수정 내용
---

# Loading Gate Bug: reset_signal + Fresh Browser

## The Rule
`setSessionActive` / `setEntryPassword` / `setEntryVerified`는 반드시 reset_signal 분기 **이전**에 호출해야 한다.

## Why
`app_settings.reset_signal`이 설정된 상태에서 fresh localStorage(새 브라우저, 시크릿 탭)로 접속하면:
- `ls.getItem(MATCHING_LAST_RESET_KEY)` = null (없음)
- `serverReset !== localReset` → true → early return 분기 진입
- 기존 코드: early return 전에 `clearTimeout` 호출 → 1초 fallback 취소
- `sessionActive`, `entryPassword` 가 null로 남음
- 로딩 조건 `sessionActive === null || entryPassword === null` → 무한 로딩

## How to Apply
App.tsx의 `app_settings` then 핸들러에서:
1. **먼저** `setAppLoading(false)`, `setSessionActive(...)`, `setEntryPassword(...)`, `setEntryVerified(...)` 호출
2. **그 다음** reset_signal 체크 및 early return 처리

early return 시에도 loading gate는 이미 해제됨.

## Additional Fix
- Vite `server.warmup.clientFiles`에 `App.tsx`, `main.tsx`, `localdb.ts` 추가 → 첫 페이지 콜드컴파일 제거
- fallback timeout 1000ms → 300ms

# BINPC2 ops / smoke log

판매용 성과는 SALES_RESULTS.md 참고 (이 파일은 개발/스모크용).

앱 초기화·admin wipe와 무관한 기록입니다. Git에만 남깁니다. 항목은 짧게.

## 2026-09-15
- tip: `0628409` (safe Netlify headers); prior `a53178d` (image LRU 80→48 / 32→16MB)
- Verify: green
- Live smoke (binpc2.netlify.app): avatars PASS; /test heart PASS; /test chat pair → home+admin "실시간 테스트" PASS; admin hearts/chats PASS; console errors none
- Skipped: home 1:1 composer typed send (UI not exposed in that path)
- Deferred: CSP enforce, session/SSE TTL changes (break risk pre-event)

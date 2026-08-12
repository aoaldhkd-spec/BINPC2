---
name: QA 28원칙 2026-08-12
description: 이번 세션(2026-08-12)의 28개 원칙 전수검사 완료 결과 — 수정 항목·검증 수치·미구현 항목
---

## 이번 세션에서 완료된 수정

| # | 항목 | 파일 | 결과 |
|---|------|------|------|
| Task #1/#3 | SSE 토큰 없는 접속 침입 탐지 로그 | db.ts:3011 | `logger.warn({ userId, hasToken, ip }, ...)` |
| Task #153 | SSE socket timeout cleanupConn 호출 | db.ts:3043 | `_cleanupConnRef` forward reference 패턴 |
| §6 | db.ts 전체 console.* → pino logger | db.ts 전체 | 97개 구조화 로그, console 0건 잔존 |
| §17 | useGroupChat 4개 순차쿼리 → Promise.all | useGroupChat.ts:80 | 3개 병렬 쿼리 |
| §9-12 | MAX_MSG_LEN=1000 guard | useChat/useGroupChat/ChatScreen | textarea maxLength=1000, 빈 메시지 disabled |
| §6 | .bak 파일 삭제 | MainScreen.tsx.bak, WaitingOverlay.tsx.bak | 삭제됨 |

## 최종 검증 수치

- **소스 파일**: 52개 (프론트) + api-server db.ts 3158줄
- **컴포넌트**: 31개
- **훅**: 3개
- **API 엔드포인트**: 15개
- **보안 구조화 로그**: 97개 (logger.warn/error)
- **단위 테스트**: 74/74 PASS (8 파일)
- **타입체크**: 0 error
- **스트레스 테스트**: 150 VU, msg p99=304ms, like p99=151ms, 손실 0%
- **모바일 뷰(375×812)**: 레이아웃 이상 없음
- **XSS**: dangerouslySetInnerHTML 미사용, React 기본 방어

## GitHub 푸시

origin: https://github.com/aoaldhkd-spec/BINPC2.git
- GITHUB_TOKEN 환경 변수 필요 (현재 미설정)
- 사용자가 GITHUB_TOKEN을 시크릿으로 추가해야 푸시 가능

**Why:** GitHub은 HTTPS 인증에 토큰이 필요; SSH key도 없음

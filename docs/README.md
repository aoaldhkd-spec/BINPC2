# BINPC2 문서

2026-09-17 최종 보관 패키지(`BINPC2_FINAL_PACKAGE_20260917`)를 저장소 기준으로 통합한 인수인계 문서다. ZIP 원본은 Git에 넣지 않는다.

## 읽는 순서

1. [DEVELOPMENT_CONSTITUTION.md](./DEVELOPMENT_CONSTITUTION.md) — 개발 원칙
2. [MASTER_CONTEXT.md](./MASTER_CONTEXT.md) — 기능·하트·어드민 기준
3. [CURRENT_STATUS.md](./CURRENT_STATUS.md) — 현재 상태·버그 이력·남은 확인
4. 코드 지도: 루트 [ARCHITECTURE.md](../ARCHITECTURE.md)

## 목적

- 새 대화 / 새 Cursor 세션이 바로 이어받기
- 기존 정상 기능 보호
- 하트 잠금/해금 모델과 어드민 운영 기준 보존
- 실시간/DB/API/테스트 구조 보존
- 중요 버그 재발 방지

## 보안 · 격리

이 문서에는 어드민 비밀번호, API secret, service key, 실제 인증정보를 넣지 않는다.

BINPC2와 PARAMEDIA/PAMEDIA는 완전히 별도 프로젝트다. 코드/문서/DB/설정을 섞지 않는다.

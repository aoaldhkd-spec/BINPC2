# BINPC2 CURRENT STATUS — 2026-10-05

이 문서는 현재 실제 코드·테스트·GitHub·운영 배포 상태를 기준으로 갱신한다.
과거 기록과 다르면 과거 기록을 삭제하지 않고 변경 이유와 현재 상태를 함께 남긴다.

## 1. 현재 한눈에 보기

- 저장소: `aoaldhkd-spec/BINPC2`
- 브랜치: `main`
- 2026-10-05 기준 운영 기능 커밋: `5808dca` 이후 최적화/현황판 변경 작업 진행
- API: Render `https://binpc2.onrender.com`
- Frontend: Netlify
- DB: PostgreSQL JSON/KV + API 인메모리 캐시
- 실시간: 자체 SSE + PostgreSQL LISTEN/NOTIFY
- 모바일 백그라운드 알림: 설치형 PWA Web Push
- 운영 기준 시간대: Asia/Seoul

관리자 대시보드의 **개발·운영 현황** 카드가 서버 헬스 정보를 5초마다 자동 갱신한다.
현재 배포 커밋, API 가동시간, SSE 연결수, Push ON/OFF·구독수, DB 저장오류,
Push 성공·재시도·만료·오류를 한 화면에서 확인한다.

## 2. 매일 자동 운영

현재 고정 운영 흐름:

- 17:00 → 전체 자동 초기화, 다음 운영 준비, `functions_locked=false`
- 23:00 → ❤️💙💗💚 일반 하트 4종 자동 해금
- 24:00 → 🌈 무지개하트 자동 해금
- 01:00 → 회식 자동 종료, `session_active=false`, `functions_locked=true`

참가자 공지는 별도 수동 설정 없이 다음 단계와 남은 시간을 자동 표시한다.

- 17:00~23:00 → 23시에 일반 하트가 풀립니다
- 23:00~24:00 → 일반 하트가 풀렸습니다 / 24시에 무지개하트가 풀립니다
- 00:00~01:00 → 무지개하트가 풀렸습니다 / 01시에 술번개가 종료됩니다
- 01:00~17:00 → 술번개가 종료됐습니다 / 17시에 전체 초기화됩니다

## 3. 관리자 현재 기준

유지:
- 술번개 오픈
- 회식 시작 / 회식 종료
- 기능잠금
- 참여자·하트·채팅·기록 초기화 및 복구
- 전체 초기화

변경:
- 회식 시작은 비활성 상태에서만 활성
- 회식 종료는 진행 상태에서만 활성
- 술번개 오픈은 자동 17시 초기화 예약의 전제조건이 아니라 행사 상태 오픈용

제거:
- 관리자 하트 운영 카드
- 수동 하트 시간 편집
- 수동 직접공지/공지시간 편집
- 즉시 해금 중심의 수동 운영 UI

## 4. 하트 규칙

일반 하트:
- ❤️ 호감 1회
- 💙 친구 1회
- 💗 뜨밤 1회
- 💚 칭찬 1회

무지개:
- 일반 하트와 별도
- 해금 시 4회
- 클릭 후 ❤️/💙/💗/💚 의미 중 하나 선택
- 선택 의미로 상대에게 전달
- 일반 하트 사용량은 차감하지 않음

서버 출처:
- `likes.like_source=grant` → 일반 하트
- `likes.like_source=rainbow` → 무지개 하트

## 5. 모바일 Push

현재 Push 대상은 **하트 + 1:1 채팅**만이다.

- 하트 → 받는 사람에게만
- 본인이 보낸 하트는 본인에게 Push하지 않음
- 무지개는 “무지개”라고 알리지 않고 선택한 ❤️/💙/💗/💚 종류로 알림
- 1:1 채팅 → 상대방에게만
- 단체채팅 Push 없음
- 시그널 Push 없음
- 채팅방 생성만으로 Push하지 않음

딥링크:
- 하트 Push 클릭 → MY/상태/받은 하트 화면
- 1:1 채팅 Push 클릭 → 해당 상대와 채팅방

VAPID 키는 Render 운영 환경에 설정되어 있고 `/api/db/push/vapid-key`가 실제 공개키를 반환하는 상태를 확인했다.
실제 휴대폰 수신 여부는 실기기 권한 허용 후 별도 E2E 확인이 필요하다.

## 6. 실시간 구조

기본 흐름:
1. 클라이언트가 `/api/db/op`으로 변경 요청
2. 서버 권한/입력 검증
3. 중요 데이터 DB 저장 완료
4. SSE로 대상 사용자에게 전달
5. 하트/1:1 채팅이면 Push도 별도 전송
6. 다른 클라이언트는 SSE 이벤트를 증분 반영

보호:
- EventSource 1개 공유
- persist-before-broadcast
- Last-Event-ID ring buffer
- SSE ring 최대 약 1000개 / 20분
- 놓친 이벤트가 너무 많으면 HTTP SoT 재동기화
- reconnect resync coalesce
- visibility 복귀 보정
- 채팅 오프라인 대기열
- client_id 중복방지
- private table 사용자별 fanout
- listener cleanup

## 7. 최적화 최신 상태

2026-10-05 추가:
- SSE 장애 fallback polling: 고정 3초 반복 → 3초 / 5초 / 10초 / 15초 점진 백오프
- 느린 요청 중복실행 방지 `pollInFlight` 유지
- 관리자 activity polling은 백그라운드 탭에서 중지
- 관리자 DB health 5초 갱신은 대시보드/DB헬스 탭이 보일 때만 수행
- Push 성공/만료/재시도/오류 집계 추가
- API runtime commit/uptime/Push 설정/구독수 관측 추가
- `MainScreen`의 중복 static/dynamic import 제거 → 실제 lazy chunk 분리
- 초기 메인 JS: 488.06 kB → 311.83 kB
- 초기 메인 JS gzip: 144.66 kB → 94.19 kB
- `MainScreen` 별도 chunk: 149.50 kB / gzip 38.66 kB
- 정본 문서 최신성 검사 `verify:records` 추가

전체 코드 정적 검사:
- `full-code-audit` 전체 코드 스캔
- `knip` 실행 기준 별도 미사용 코드 보고 없음
- 대규모 `db.ts` 재작성은 실시간/저장 회귀 위험 때문에 하지 않고 순수 모듈 분리 구조 유지

## 8. 이스터에그

과거:
- 술번개를 3번 누르면 NPC/운영자 나이 영수증·소리·진동 노출

변경 이유:
- 실제 운영 기능과 무관하고 사용자가 제거 요청

현재:
- UI, 안내, 소리, 진동, helper, test까지 제거
- 튜토리얼에서도 관련 문구 제거

## 9. 최근 검증 기준

2026-10-05 직전 운영 기능 변경:
- recurrence guards: 571/571
- API tests: 473/473
- Frontend tests: 707/707
- code audit: error 0
- frontend typecheck/lint/build: 통과
- API lint/build: 통과
- GitHub Verify #357: success
- Render deploy: live

2026-10-05 최적화 변경 검증:
- 정본 최신성 검사: 통과
- recurrence guards: 571/571
- API 전체 테스트: 473/473
- Frontend 전체 테스트: 709/709
- 150명 SSE 토큰 부하 테스트: 5xx 없이 통과
- Frontend typecheck/lint/build: 통과
- API lint/build: 통과
- 최적화 집중 테스트: 통과
- 프론트 production build에서 기존 MainScreen 코드분할 경고 제거 확인

## 10. 알려진 미확인/운영 확인 필요

- 실제 iOS/Android 설치형 PWA에서 Push 권한 허용 후 하트 수신
- 실제 1:1 채팅 Push 수신과 딥링크
- 현장 150명 부하에서 최신 변경 후 지연 수치
- OS별 알림 표시/소리는 운영체제가 최종 제어

## 11. 문서 운영 규칙

정본:
- `docs/MASTER_CONTEXT.md` → 기능/운영 기준
- `docs/CURRENT_STATUS.md` → 실제 현재 상태
- `ARCHITECTURE.md` → 코드 경로 지도
- 날짜별 변경문서 → 역사

자동 보호:
- `pnpm run verify:records`
- `verify:ci`에 포함
- 예전 23:30/24:30 수동 하트 운영 문구가 정본으로 다시 들어가면 검증 실패

## 12. 변경 역사

### 과거 → 변경 이유 → 현재

하트 시간:
- 과거: 23:00 / 23:30 / 24:00 / 24:30
- 이유: 매일 운영 단순화, 수동설정 실수 제거
- 현재: 일반 4종 23:00 / 무지개 24:00

17시 초기화:
- 과거: 술번개 오픈 후 다음날 17시 1회 예약
- 이유: 오픈 버튼 의존 제거
- 현재: 매일 17시 자동 전체초기화

공지:
- 과거: 관리자 직접공지/시간설정
- 이유: 매일 같은 운영 흐름 자동화
- 현재: 단계별 자동공지 + 남은시간

Push:
- 과거: push 뼈대만 존재, likes/messages/chats/signals 혼합
- 이유: 실제 필요한 알림만 간단하고 정확하게 전달
- 현재: 하트 + 1:1 채팅만, 수신자 전용, 딥링크

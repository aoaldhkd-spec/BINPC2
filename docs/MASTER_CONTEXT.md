# BINPC2 MASTER CONTEXT — CURRENT CANON

## 2026-10-27 V6 최신 정정 V3 — 개발판, 운영 미반영

[최신 모바일 복구·V3·비공개 시험 준비 보고서](EVENT_HUB_V6_V3_PRIVATE_PREVIEW_2026-10-27.md)를 우선 읽는다. 할로윈 금·토01시 신규 입장 마감 / 해당 회차 익일17시 테마·기존 참가자 카드 만료가 정본이다. 로고8종 실제 수령·연결·원본/체크섬 보존. 실제 휴대폰은 UNKNOWN, 외부 HTTPS 시험 주소 미발급, 개인정보 정책 미확정으로 운영 모집 차단 유지. 기존 V6를 재제작하거나 main/V7을 병합하지 않는다. 이전 체크포인트와 실패 이력은 아래에 보존한다.

## 2026-10-13 최신 운영 상태 (CURRENT) — 프로젝트4 PR #9 배포됨

- 사용자 승인 후 PR #9의 행사 시작/종료·하트·NPC 정상충전·익명 행사기록·초기화 트랜잭션·신규 입장 보호가 `main` 병합 SHA `c2a2156821864a38fe4f6e22bb03ca0165b818d5`로 반영됐다. Render BINPC2 서비스에서 이 SHA의 배포가 `live`임을 확인했다.
- Netlify는 공개 화면/API 프록시/서비스 워커 HTTP 200으로 확인했다. `.webmanifest`의 MIME 교정은 후속 PR #10; 기기별 알림과 OS 설치는 아직 실기기 검증 전이다.
- 실제 운영 DB는 읽기 전용으로 검사했다. 새 행사 시작 기록이 없고, 기능잠금·행사 상태는 배포 전후 같았다. 운영 데이터 삭제/초기화나 실제 참가자 송신/Secret 변경은 수행하지 않았다.
- 운영 17시 자동초기화는 사용자가 실제 행사를 시작해 이벤트 ID가 만들어진 경우의 **제품 운영규칙**이며, 이번 배포 검증에서 실행/승인된 DB 삭제가 아니다.
- **UNKNOWN:** iOS/Android OS Push 실수신, 두 기기 딥링크, 개인정보 사진·device_secrets·백업 보관/파기 준수, 현장 150명 실제 성능. 합성 CI의 PASS와 구분한다. PR #6 자동 Drive 백업은 별도 Draft 미활성화.
- 아래의 PR #9 `미배포` 문장은 완료 전 결정/구현 이력으로 보존한다. 이 CURRENT 절과 충돌하면 최신 운영 증거를 따른다.

---

## 2026-10-13 최신 변경 결정 — PR #9 정본 범위 (CURRENT / 미배포)

**이 절이 아래 2026-10-06 운영 정의 중 충돌하는 부분을 변경한다.** 예전 지침은 변경 역사이며 삭제하지 않는다. `main` 배포 전까지 이 규칙은 별도 **작업 브랜치 구현**이다.

1. **새 행사 시작:** 관리자가 '회식 시작'을 눌러야 활성화. 자동으로 매일 행사 자체를 시작하지 않는다. 기존 행사 재개는 01:00 마감 전만 허용; 새 이벤트 ID는 안전한 초기화가 완료된 뒤 생성.
2. **행사 시간:** 그 이벤트의 23:00 일반하트 4종(❤️💙💗💚 각1), 자정 🌈4회, 01:00 새 입장만 마감, 다음 17:00 안전한 기록보존 후 초기화. 관리자의 수동 종료도 기존 하트·1:1·단체채팅 기능을 임의 잠금하지 않는다. 수동 기능잠금은 따로 존중한다.
3. **범일NPC:** 시작과 종료에 각 종류 정상 잔량만 충전(일반 4종 각1 + 🌈4), 기존 전송기록·대상별 중복검사는 보존. 정상 참가자에게 NPC 우회를 적용하지 않는다.
4. **초기화 안전:** 단일 DB 트랜잭션(archive→wipe→NPC 복원→settings 완료) 및 장애 시 rollback; 중복실행/다중 서버 경합/비정상 아카이브 ID 차단; 이후 SSE 반영. 관리자 기록은 익명 합계로 영속 저장, 날짜 검색. 레거시 이력과 새 익명 이력은 서로 다르다.
5. **운영 단계 구분:** 브랜치 IMPLEMENTED/CI TESTED와 LIVE/PRODUCTION 검증은 다르다. 실제 전송/삭제/Secret/배포 전 별도 승인과 실기기 대상 검증이 필요하다.
6. **개인정보:** 소스에 개인정보 자동 완전삭제·법정 보관기간 준수 완료 등 확인되지 않은 약속 금지. 기존 사진 파일·장치 인증정보·오프사이트 백업 잔존은 추가 실운영 정책 결정을 요한다.

관련 소스: `artifacts/api-server/src/lib/db-event-reset-transaction.ts`, `db-npc-heart-recharge.ts`, `db-event-cycle-heart.ts`, `db-event-admin-audit.ts`, `db-event-anonymous-history.ts`, `artifacts/api-server/src/routes/db.ts`, `artifacts/boltnew-app/src/lib/event-cycle-heart.ts`, `daily-cycle.ts`, `admin/AnonymousEventHistoryTab.tsx`.

---


## 2026-10-13 추가 사용자 요구 — UI/알림 검증 브랜치 (미배포)

상태: IMPLEMENTED / 자동시험 진행 중 / 실제 휴대폰 수신·운영배포 UNKNOWN.
이 항목은 PR #7 브랜치의 변경이다. 아래 2026-10-06 운영 이력은 삭제하지 않는다.

- 수동 ‘술번개 오픈’ 버튼을 관리자 대시보드에서 제거했다. 서버 호환 RPC·일일 17:00/23:00/24:00/01:00 자동운영 코드는 유지한다.
- 개발·운영 현황과 기능 붙이기·떼기(Soft Detach)는 ‘DB헬스’로 이동했다. 접속 QR·연락처 QR 등 기존 module_flags와 확인 절차를 재사용한다.
- 관리자 헤더/탭의 stacking context를 일반 카드보다 위로 분리했다. 진짜 확인 모달은 헤더 위에 유지한다.
- 화면 너비별 가독성 기본값: 359px 이하 100%, 일반폰 102%, 600px 이상106%, 768px 이상110%, 1024px 이상112.5%. 사용자 ‘가− / 기본 / 가+’95~110%를 별도로 저장한다. 브라우저 기본 핀치 줌은 막지 않는다.
- 프로필/이상형 터치는 pointerdown부터의 이동거리·스크롤 변화·취소·시간을 확인한다. 스크롤과 멀티터치는 실행하지 않고 실제 탭/키보드는 보존한다.
- 성향 아래 개인정보 수집·이용 / 제3자 제공 2개와 그 아래 선택적 하트 + 1:1 채팅 알림 체크를 배치했다. 이용자의 명시적 의사를 받기 위해 개인정보 체크는 사전선택하지 않는다. 둘 중 하나를 해제하면 다음/최종 등록이 막힌다. 알림 거부는 등록을 막지 않는다.
- 동의 보기/체크 내역은 신규 등록 시 버전과 서버 시각으로 저장하고 타인 프로필/SSE에는 공개하지 않는다. 구버전 클라이언트는 동의 필드 부재를 허용하는 호환 경로를 유지한다.
- ‘모든 개인정보 자동삭제’라는 확정 문구는 사용하지 않는다. 기존 초기화에서 사진 원본·device_secrets·일부 운영기록/백업까지 삭제됨을 확인하지 못했기 때문이다. 보관기간·처리자/문의처·민감정보 별도 고지 등 정식 개인정보 처리방침은 운영자의 법적 검토가 필요한 상태다.
- Android 등 지원 브라우저는 일반 웹에서도 명시적 권한허용 후 푸시 구독을 시도한다. iPhone/iPad는 홈 화면 설치 실행이 필요하다. 웹 내부 수신 알림은 휴대폰 OS 권한과 분리되며, 하트→받은 하트/채팅→정확한 상대방 방으로 이동하는 PR #7 수정은 유지한다.
- 무지개 안내는 해금 후 이벤트 날짜(17:00 경계)·사용자별 한 번. 일반 하트와 별도4회, 색 선택, 같은 대상·색의 일반/무지개 분리와 같은 무지개 중복 방지를 실제 판정과 맞춘다.

금지: 이 변경을 핸드폰 실수신 검증/운영완료라고 부르지 않는다. 운영 DB 파괴·Secret 교체·실제 배포·PR #6 자동백업 활성화는 별도 승인 및 인증 완료 전 진행하지 않는다.


이 문서는 BINPC2의 현재 기능·운영·실시간·하트·관리자 기준 정본이다.
옛 문서와 충돌하면 **최신 사용자 지시 + 실제 코드 + 테스트 + 운영 배포**를 우선한다.
과거 결정은 삭제하지 않고 변경 이력으로 보존한다.

## 1. 서비스 정의

BINPC2는 범일NPC 술번개 현장 행사 참여자·관리자용 웹앱이다.

참여자:
- 프로필
- 하트
- 1:1 채팅
- 단체채팅
- 내 상태
- 통계/랭킹
- 설정
- 튜토리얼/코치마크

관리자:
- 행사 상태
- 회식 시작/종료
- 술번개 오픈
- 기능잠금
- 참여자 관리
- 데이터 초기화/복구
- DB헬스
- 개발·운영 현황
- 성과 리포트

## 2. 일반 하트

| 종류 | 아이콘 | 기본 사용 |
|---|---|---|
| 호감 | ❤️ | 1회 |
| 친구 | 💙 | 1회 |
| 뜨밤 | 💗 | 1회 |
| 칭찬 | 💚 | 1회 |

규칙:
- 각 종류 1회
- 잠금 중 사용 불가
- 해금 후 사용 가능
- 사용 완료 후 재사용 불가
- 기능잠금은 사용기록을 지우지 않음
- 기능잠금 해제 후 기존 사용/해금 상태 복귀

## 3. 무지개하트

- 일반 하트와 별도
- 해금 시 4회
- 4→3→2→1→0
- 사용 시 ❤️/💙/💗/💚 중 의미 선택
- 선택한 의미로 상대에게 전달
- 일반 하트는 차감하지 않음

서버 출처:
- `like_source=grant` 일반
- `like_source=rainbow` 무지개

## 4. 고정 자동 운영 시간

현재 운영시간은 관리자 수동편집 대상이 아니다.

- 17:00 → 전체 자동초기화
- 23:00 → ❤️💙💗💚 일반 4종 자동해금
- 24:00 → 🌈 무지개 자동해금
- 01:00 → 회식 자동종료 + 기능잠금

시간대:
- Asia/Seoul

서버:
- `db-daily-cycle.ts`
- 날짜 마커로 하루 1회 실행
- 정확 타이머 + 안전 점검
- 첫 배포 후 지난 경계 소급 파괴 실행 금지

## 5. 참가자 자동 공지

별도 직접공지/시간설정 없이 고정 흐름을 자동 안내한다.

- 17~23 → 23시 일반 하트 해금 안내
- 23~24 → 일반 하트 해금 완료 + 24시 무지개 안내
- 00~01 → 무지개 해금 완료 + 01시 종료 안내
- 01~17 → 종료 완료 + 17시 전체초기화 안내

항상 다음 단계와 남은시간을 표시한다.

## 6. 관리자 운영

유지:
- 술번개 오픈
- 회식 시작
- 회식 종료
- 기능잠금
- 데이터 초기화/복구
- 전체초기화

버튼:
- 진행 중이면 시작 버튼 비활성
- 종료 상태면 종료 버튼 비활성

술번개 오픈:
- 행사 상태 오픈용
- 매일 17시 자동초기화의 조건이 아님

제거:
- HeartOpsCard
- 수동 하트 시간편집
- 수동 직접공지 설정
- 수동 공지시간 설정

## 7. Push

현재 Push 대상은 **하트 + 1:1 채팅**만이다.

하트:
- 받는 사람만
- 본인 자기알림 없음
- rainbow라는 별도 알림종류 없음
- 선택한 ❤️/💙/💗/💚 의미로 표시
- 클릭 → MY/상태/받은 하트

1:1 채팅:
- 상대방만
- 클릭 → 정확한 상대 채팅방

제외:
- 단체채팅
- signal
- 채팅방 생성
- 기타 일반 DB 이벤트

PWA:
- manifest.webmanifest
- Service Worker
- standalone 설치형 웹앱
- VAPID 운영키 Render 설정

## 8. 실시간 Source of Truth

Realtime:
- 커스텀 SSE `/api/db/events`
- PostgreSQL LISTEN/NOTIFY
- Supabase Realtime 사용하지 않음

핵심 원칙:
- DB 중요 쓰기 성공 후 broadcast
- 사용자별 private fanout
- 전역 EventSource 1개
- Last-Event-ID ring replay
- 재연결/포그라운드 복귀 시 SoT 보정
- 중복 listener/reconnect/timer 금지
- merge/dedupe 유지

SSE ring:
- 최대 약 1000 이벤트
- TTL 20분
- replay soft max 200
- 초과 시 HTTP catchup

재연결:
- resync 요청 coalesce
- SSE 정상+최신 데이터면 불필요 full reload 생략
- 실제 단절 복구는 DB SoT 재조회

## 9. 네트워크/성능

기본:
- 순간 단절은 조용히 자동복구
- 20초 이내 연결 흔들림은 강한 오류 UI 금지
- 장기 장애 후에만 오류 표시
- 브라우저 offline 깜빡임 debounce

2026-10-05 최적화:
- SSE fallback polling 3/5/10/15초 점진 백오프
- in-flight 중복요청 방지
- 관리자 hidden tab activity polling 중지
- DB health는 대시보드/DB헬스 화면에서만 5초 갱신
- Push 성공/재시도/만료/오류 집계
- 런타임 commit/uptime/SSE/Push 상태 관리자 표시
- MainScreen 실제 lazy chunk 분리
- 초기 main JS 488.06 kB → 311.83 kB, gzip 144.66 kB → 94.19 kB
- 전체 코드 정적검사(full-code-audit + knip) 유지

## 10. 채팅 안정성

1:1:
- optimistic UI
- client_id dedupe
- offline pending queue
- localStorage 영속화
- 최대 50 pending
- online/SSE reconnect/functions unlock 시 flush
- retryable/non-retryable 오류 분리

단체채팅:
- 기존 SSE 실시간 유지
- Push는 보내지 않음

## 11. 데이터

주요 논리 테이블:
- profiles
- likes
- chats
- messages
- group_*
- app_settings
- notifications
- push_subscriptions

저장:
- PostgreSQL app_kv_rows
- API in-memory cache

주의:
- 테스트 이유로 운영 DB 전체 삭제 금지
- app_settings patch가 다른 키를 지우면 안 됨
- private table은 전체 broadcast 금지

## 12. 관리자 한눈에 보는 현황

관리자 대시보드 **개발·운영 현황** 카드:
- 최신 배포 commit
- API uptime
- SSE 현재 연결 수
- Push 설정 ON/OFF
- Push subscription 수
- DB persist error
- 참여자 수
- Push 성공
- Push retry
- Push expired
- Push error
- health alarms

5초 자동갱신, 화면 숨김 중 불필요 polling 중지.

## 13. 기록

정본:
- `docs/MASTER_CONTEXT.md`
- `docs/CURRENT_STATUS.md`
- `ARCHITECTURE.md`

변경 기록:
- `docs/BINPC2_PUSH_DAILY_CYCLE_2026-10-05.md` 등

자동 보호:
- `scripts/verify-docs-current.mjs`
- `pnpm run verify:records`
- `verify:ci`에 포함

## 14. 이스터에그

과거:
- 술번개 3연타 → 운영자/NPC 나이 영수증, 효과음, 진동

현재:
- 완전 제거
- 관련 helper/test/sound/tutorial 문구 제거

## 15. 회귀 보호

절대 깨뜨리지 말 것:
- 일반 하트 각 1회
- 무지개 4회
- grant/rainbow 분리
- 무지개 일반 하트 미차감
- 고정 23/24/01/17
- 기능잠금
- 1:1 채팅
- 단체채팅
- SSE persist-before-broadcast
- retry/reconnect/dedupe/resync
- reset core 재사용
- 관리자 인증
- private fanout
- Push 수신자 계산

## 16. 과거 → 변경 이유 → 현재

하트 시간:
- 과거: 23:00 / 23:30 / 24:00 / 24:30
- 이유: 현장 운영 단순화
- 현재: 23:00 일반 4종 / 24:00 무지개

공지:
- 과거: 관리자가 직접 공지/시간편집
- 이유: 반복 운영 실수 제거
- 현재: 자동 단계 공지

초기화:
- 과거: 술번개 오픈 후 다음날 17시 1회
- 이유: 버튼 의존 제거
- 현재: 매일 17시 자동

Push:
- 과거: 뼈대만 있고 이벤트 범위 혼합
- 이유: 실제 필요한 알림만 정확히 전달
- 현재: 하트 + 1:1 채팅

이스터에그:
- 과거: 3연타 나이 표시
- 이유: 사용자 제거 요청
- 현재: 없음


## 17. 2026-10-06 기능 모듈 정본

BINPC2 기능은 **CORE + Soft Detach 모듈**로 구분한다.

### CORE — 항상 유지
- profiles
- entry_qr
- realtime
- admin
- daily_cycle

CORE는 행사 앱의 뼈대다. 관리자 UI에서도 OFF 기능을 제공하지 않는다.

### Detachable — 기본 모두 ON
- hearts
- direct_chat
- group_chat
- contact_qr
- stats
- ranking
- push

정본 규칙:
1. OFF는 삭제가 아니다.
2. 기존 DB 행과 코드는 보존한다.
3. UI, 신규 사용, 해당 쓰기, 불필요 조회/SSE를 가능한 범위에서 중지한다.
4. ON 하면 기존 데이터로 다시 연결한다.
5. 서버 쓰기 기능은 클라이언트 숨김만 믿지 않고 서버에서도 차단한다.
6. module_flags 누락·깨짐·부분값은 미지정 모듈을 OFF로 만들지 않고 기본 ON으로 복구한다.
7. app_settings SSE + /ready SoT 두 경로로 상태를 동기화한다.
8. 행사 중 실수 방지를 위해 OFF 전 확인, ON은 즉시 복구를 기본 UX로 한다.

주요 코드:
- client: src/lib/module-flags.ts
- server: src/lib/db-module-flags.ts
- admin UI: src/admin/DashboardTab.tsx
- app wiring: src/App.tsx
- server write gate: src/routes/db.ts

## 18. QR 정본

QR은 다음 두 축으로 구분한다.

- **접속 QR**: 행사 URL 접속, CORE. 관리자 QR 화면은 이 기능을 운영한다.
- **연락처 QR**: 참가자 프로필 식별/연락처 교환용. PROFID UUID와 호환 URL/UUID를 스캔한다. Detachable.

따라서 “QR팩 여러 개”라는 표현은 사용하지 않는다. 접속 QR과 연락처 QR의 목적과 생명주기가 다르다.

## 19. 2026-10-06 검증/완성도 규칙 추가

- 가짜 시계 하루 통합 테스트: db-daily-cycle-full-day.test.ts
- runtime health 순수 모듈: db-runtime-status.ts
- OFF된 통계/랭킹은 코치마크 투어에서도 건너뜀
- 모듈 정본 누락은 verify:records와 recurrence guard에서 검출
- 서버 대형 파일은 정상 실시간/DB 경로를 보존하면서 저위험 순수 계산부터 점진 분리

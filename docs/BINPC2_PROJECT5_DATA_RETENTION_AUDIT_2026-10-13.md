# BINPC2 프로젝트 5 — 운영 DB 개인정보 잔존·알림·백업 조사 (2026-10-13)

**상태:** CURRENT 조사 스냅샷 / READ-ONLY 검증. 운영 DB 수정·삭제·실수신/현장 성능 시험 없음. 장기 보관·파기정책 및 개인정보 처리방침 법적 확정 아님.

## 1. 범위·출처·보호

- 대상: Supabase에서 프로젝트 이름 `BINPC2`로 확인된 PostgreSQL `public.app_kv_rows`, `public.app_image_store`. 다른 프로젝트 `my-matching-db`와 섞지 않음.
- 방법: 행수, 날짜별 건수, JSON 속성의 **이름**, 활성 프로필 ID와 내부적으로 일치하는 건수만 `SELECT` 집계. 기기 해시·실명·전화번호·사진·PIN·푸시 키·원문 메시지는 조회·반출·문서화하지 않음. 합계 값은 실시간으로 바뀌므로 **조회 당시** 결과.
- 소스대조: `artifacts/api-server/src/lib/db-admin-wipe-plan.ts`, `db-event-reset-transaction.ts`, `db-event-profile-write.ts`, `db-table-policy.ts`, `artifacts/boltnew-app/src/lib/webPush.ts`.
- GitHub 작업 브랜치 문서는 운영 반영이 아님. 현재 `main` 정상 기능/프로필/하트/채팅/백업 그대로 유지.

## 2. 실제 집계 — 현시점에서 삭제 안전성 의미

| 항목 | DB 건수 | 현재 프로필 ID와 직접 맞는 건수 | 참조 미일치·추가 검사 필요 |
|---|---:|---:|---:|
| `profiles` | 2 | 기준 프로필 2 | 현재 유지 |
| `device_secrets` | 2,642 | 3 | 2,639 |
| `profile_views` | 4,435 | 356 (viewer/viewed 중 1개 이상) | 4,079 |
| `heart_balances` | 449 | 0 (id가 현재 프로필과 같은 경우) | 449 |
| `chat_reads` | 446 | 10 (reader_id) | 436 |
| `user_signals` | 299 | 2 (user_id) | 297 |
| `blocked_users` | 30 | 2 (user_id 또는 target_id) | 28 |
| `group_participants` | 4 | 4 (user_id) | 0 |
| `group_chats` | 6 | 관계/운영상 별도 판단 | UNKNOWN |
| `session_history` | 36 | 레거시 이력 보존 | UNKNOWN |
| `push_subscriptions` | 1 | 미판정 | UNKNOWN |
| `audit_log` | 1 | 미판정 | UNKNOWN |
| `app_settings` | 1 | 운영 설정 보존 | 해당 없음 |

**주의:** '현재 프로필 직접 참조가 없다'는 뜻이지 **즉시 안전하게 삭제 가능**이라는 뜻이 아니다. 일부 과거자료는 관리자 이력·보안 감사·법정 보존·계정 복구와 연결될 수 있고 현재 행사 상태도 변할 수 있다. `heart_balances`가 과거부터 남아 있다는 이유만으로 현재 서비스 참조가 전혀 없다는 결론은 아님.

- `device_secrets`의 다른 이용자 ID 수는 2,589개. 생성일 필드 없는 레코드 58개. DB 최종 저장 시기: 2026년 8월 2,066개, 9월 381개, 10월 195개. `updated_at`은 삽입 원래 시각과 다를 수 있다.
- `heart_balances` 449건의 마지막 DB 갱신은 2026-08-16. 구버전 자료 가능성이 높지만 '사용하지 않는다'는 추가 코드 전수 추적 전 **UNKNOWN**.
- `app_kv_rows` 조사 당시 전체 8,352행. 다른 실제 데이터/외부 저장소와 합산한 전체 개인정보 건수가 아님.

### 이미지 실제 보관

- 별도 `app_image_store` 97개, `data_url` 97개, 저장 문자열 합계 **28,710,231바이트(약 28.7MB)**.
- 저장 경로 상 `profile-photos/` 접두 90개(28,707,382바이트)와 작은 기타 이미지 7개(총 2,849바이트).
- 현재 프로필 2건은 NPC용 텍스트 아바타 1건, 프리셋 아바타 1건을 참조한다. 현재 `profiles` 사진 URL과 저장 경로가 직접 일치하는 이미지 0개. 중요 활성 행(`profiles`, `messages`, `group_messages`, `chats`, `group_chats`, `app_settings`, `session_history`)의 JSON 텍스트 경로 검색에서도 매칭 0개.
- **주의:** 다른 저장 위치·과거 이력 복원 의무·외부 백업/참조까지 없는 것을 입증하지 않았다. '97개 전부 고아' 또는 '전체 사진 삭제 안전'으로 표시 금지.

## 3. 왜 남는지 — 코드 대조

- `ADMIN_EVENT_END_CLEAR_TABLES`는 행사별 `profiles/likes/chats/messages/chat_reads/profile_views/user_signals/blocked_users` 등의 현재 참여 기록을 지정한다.
- 그러나 `device_secrets`, `push_subscriptions`, `session_history`, 이전 `heart_balances`, SQL 독립 `app_image_store`는 이 목록에서 제외. **그대로 영속 보존되는 구조**이며, 초기화만으로 '모든 개인정보가 삭제'된다고 공지하면 부정확.
- 현행 `atomicEventReset`은 지정된 목록만 DB 단일 트랜잭션으로 초기화하고, 익명 행사 합계와 NPC/설정 마커를 보존한다. 아직 이전 행사자료가 현재 DB에 남는 정확한 시간적 이유는 초기화 로그/마커와 연동해 따로 대조해야 한다. 목록에 포함된 `profile_views` 등이 남아 있는 사실을 곧바로 최신 초기화 실패로 단정하지 않는다.
- `device_secrets`는 기기 인증 해시 관계, `push_subscriptions`는 브라우저 푸시 구독/재등록 권한과 연결된다. 임의 삭제 시 기기 인증/푸시/복구 흐름이 깨질 수 있다.
- 공통 KV에서 이름이 유사한 과거 테이블을 자동 역선택해 삭제하는 방식 금지.

## 4. 보관·파기 계획: 구현 전에 승인·검증이 필요한 경계

1. **항목별 목적·근거 구분:** 행사 종료시 필요한 프로필·하트·채팅/첨부와 장기 보유 필요성이 있는 익명 집계/법정 기록/보안 로그를 나눈다. 법정 보유기간을 임의 숫자로 정하지 않는다.
2. **보관기간·복구 범위 결정:** 사진/기기인증/푸시 구독/이전 채팅 이미지/복구용 정보/관리자 이력/백업 각각 목적 종료일과 파기예외를 확정. 데이터 유출 방지 관점에서 실제 원문·사진이 포함된 백업은 암호화·접근 제한해야 한다.
3. **사전 백업:** 현재 확보한 GitHub 소스 ZIP/번들은 **운영 DB·사진 백업이 아니다.** 실제 DB 복구점을 별도 안전한 비공개 저장소에서 생성·검증한 뒤라야 삭제 검토 가능.
4. **검증기(DRY-RUN) 먼저:** 삭제 후보 수량만 보여주는 관리자 전용 읽기 전용 진단, 연결된 활성 ID/현재 행사·동시 로그인/알림/복구 의존성/익명 집계 불변을 확인. 절대 즉시 삭제 버튼을 자동으로 연결하지 않는다.
5. **격리 DB 시험:** 정한 기간·기준에 따라 후보만 파기하는 원자적 최소 변경을 모의 DB/복원 가능한 데이터로 검증하고 실패시 롤백. 재시도 횟수·중복 실행 방지·실행 로그(개인정보 원문 없음)를 갖춘다.
6. **운영 위험 승인:** 현재 실제 행사 진행 및 개인정보 정책/법적 검토·운영 백업 확인 전 운영 UPDATE/DELETE 불가. 시행 후 다시 집계하고 실제 참가자 재접속·푸시·사진·계정 복구를 재검증한다.

대한민국 개인정보 보호법 제21조(2026-09-11 시행)는 목적 달성 등으로 개인정보가 불필요할 때 지체 없이 파기하고 복구·재생되지 않도록 할 것과 법정 예외 보관시 분리 관리를 규정한다. 정확한 법정 예외와 사업자 고지·위탁/국외 이전·보유기간 판단은 운영자/법률 검토 필요: https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsId=011357&lsJoLnkSeq=900078908&print=print

## 5. 알림 — 설치 없이 가능한 범위

- Android Chrome 및 지원되는 데스크톱 브라우저는 OS/사이트 알림 권한을 **사용자가 명시적으로 허용**하면 PWA 홈 화면 설치 없이도 표준 Web Push 가능. 현재 `webPush.ts`의 iOS 전용 설치 필요 판정은 Android 자체를 강제로 막지 않음. 실제 Android 기기의 수신 성공은 UNKNOWN.
- iOS/iPadOS Safari의 종료/잠금화면 Web Push는 애플의 **홈 화면 웹앱** 제약이 있어, 설치하지 않은 Safari 탭에 서버가 OS Push를 강제할 수 없다. 앱 화면이 열려 있으면 기존 SSE/웹 내부 알림 유지; 페이지가 종료된 후 통지는 웹만으로 보장 불가. Apple: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- '설치 불필요' 문구를 운영 전 기기 종류별로 안내. SMS/메신저는 별도 본인 동의·비용·서비스 연동을 요구하므로 임의 추가하지 않는다. 하트 수신자/1:1 수신자 전용, 단톡/시그널 제외, 알림 클릭 목적지를 변경하지 않는다.

## 6. 백업 실증과 미완료

- GitHub PR #6은 작업 전용 Draft, 최신 `main`과의 통합/자동검사 진행 중. GitHub에서 **소스 ZIP + 전체 Git 이력 bundle + 검증표** 생성 시험 성공. 전체 약 491MB 산출물은 GitHub Actions에서 임시 보관하며 2026-11-12 만료 예정. 750MiB 상한 도입.
- `main de3d4049` 소스 ZIP을 담은 4,462,103바이트 GitHub artifact를 개인 Google Drive의 비공개 **1차·2차 폴더**에 각각 새 파일로 업로드해 메타데이터 재조회 완료:
  1. https://drive.google.com/file/d/1PCEaj-az7ipT2ymYxsuHfh0QpwuZmoPH/view
  2. https://drive.google.com/file/d/1hDCuK6K4Zkn66zcq8xQZnRGwcxXh1lal/view
- GitHub workflow를 통한 미래의 완전자동 Google Drive 업로드는 **OAuth/rclone GitHub Secret 미설정**으로 아직 BLOCKED. 별도 신뢰 PC에서 인증하거나 승인받은 다른 안전한 비밀 저장 방식을 필요로 한다. PC방에서 Secret 입력하지 않는다.
- Supabase Free는 자동 복구백업을 기본 제공하지 않으므로 실제 DB/사진은 추가 보호 필요: https://supabase.com/docs/guides/platform/backups. 사용자의 실제 Supabase 결제 요금제와 데이터 복원점 생성은 이번에 확인되지 않아 UNKNOWN.
- Git bundle이 있는 GitHub 임시 ZIP과 두 Drive 소스 ZIP은 서로 포함 범위가 다르다. **'전체 재해복구 완료'로 표시 금지**.

## 7. 작업상태

- **LIVE_READ_VERIFIED:** 위 DB 집계, Drive 사본 크기·소유자 권한, Render 이전 live 상태.
- **TESTED:** GitHub 백업 번들 자체 검증 워크플로(가짜 데이터 없음, 실제 public Git 소스), 과거 알림·행사 합성 검사. OS/실참가자 테스트와 구별.
- **PARTIAL/BLOCKED:** 개인정보 정리 구현·운영삭제/보관 정책, 영구 Git 이력 오프사이트 및 실 DB/이미지 암호화 백업, 대규모 현장 시험.
- **UNKNOWN:** 실제 iOS/Android 두 기기 Push/딥링크, 화면이 닫힌 아이폰의 별도 통지, 과거 개인자료의 각 항목별 법정 파기 시점.
- **이번 실제 외부행동:** GitHub 작업 브랜치 및 문서·PR 수정, 실제 private Drive 소스 백업 두 사본 저장. **운영 main 병합/새 배포/운영 DB 쓰기/실제 푸시 발송/삭제/Secret 변경 없음.**

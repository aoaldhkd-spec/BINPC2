# BINPC2 세션 SQL 긴급 오류 수정 — 배포 전 안전 확인서
작성: 2026-10-27 KST  
상태: **CURRENT / CODE TESTED / LIVE DEPLOY BLOCKED BY DATABASE_IDENTITY_AND_BACKUP**  
승인 경계: 사용자가 연결 대상 확인, 필요한 최소 DB 변경 및 검증 후 배포를 승인함. 승인만으로 미확인 프로젝트를 임의 선택하거나 백업 미검증 위험을 무시하지 않음.

## 이번 작업 범위 및 중단선
- 대상: GitHub `aoaldhkd-spec/BINPC2` / Render `BINPC2` `srv-d9v9gme417fc73cf6gq0`, 현재 운영 `main` `b06a900280404f79c92e17cdbc6af907a0414c30`.
- 준비 완료: 세션 파일 포함 빌드 최소 수정 + 집중 3/3 테스트 + API 521 PASS / 16 SKIP 및 TypeScript PASS. PR #21의 수정 커밋 `f4d20e93d16c5cedc97cd7a72d341c821e28cbf4`.
- 멈추는 곳: `main` 병합, Render 자동 배포, 운영 DB DDL, 실운영 사용자 세션 조작은 아래 **두 가지 필수 전제**가 만족되기 전까지 금지.
  1. Render 실제 런타임 `DATABASE_URL`이 Supabase `BINPC2` 프로젝트 ref `dlliqqlqdtdkfakdtwyw`와 연결되는지 *직접* 확인. 기존 2026-10-10 문서의 대상 매핑 및 2026-10-27 해당 DB의 Supavisor 기존 연결 6개는 보조 정황일 뿐, 현재 Render secret 연결 증거를 대체하지 않음. `my-matching-db`(`bguvywpeawiheotbxchl`)는 별도 프로젝트로 작업 제외.
  2. 개인 데이터 원문·이미지·device_secrets까지 포함한 최신 전체 DB 백업의 비공개 암호화, 실제 복원 증거 및 키 복구 가능성 확인. GitHub, 소스 ZIP, 2026-10-23 암호화 KV 일부 자료와 이미지 일부 분할 파일은 **전체 DB 독립 복원 PASS가 아님**. Supabase 조직의 `free` 요금제는 자동 관리 백업을 보장하지 않음.

## live READ_VERIFIED (이 검사는 운영 데이터를 변경하지 않음)
- Supabase `BINPC2` (ref `dlliqqlqdtdkfakdtwyw`) 2026-10-27: `public.app_sessions` 없음, 현재 `app_kv_rows` 3,250행, `app_image_store` 102행(점검 시점 수치이며 실운영 초기화에 따라 변동).
- 위 두 기존 공개 스키마 테이블은 RLS ON, `anon`/`authenticated` SELECT 권한 없음, `service_role` SELECT 가능. 스키마·건수만 조회함.
- Supabase `my-matching-db`에는 `app_kv_rows`가 없어 해당 논리 DB와는 다른 구조. 이 정황만으로 Render의 secret 정확한 연결 확인을 대체하지 않음.
- Render `main` on-commit 자동 배포, Render live `b06a900280404f79c92e17cdbc6af907a0414c30`. `main`에 코드를 밀거나 PR 병합하면 **새 배포가 자동 시작**될 수 있으므로 분기 보존.
- Render 앱 로그 10/26~27 `Failed to prune sessions: ... dist/table.sql` 반복. 코드 빌드가 원본 `connect-pg-simple/table.sql` 상대경로를 손상시켰던 근본 원인 및 수정·회귀 테스트 성공. 그러나 이용자 튕김의 단일 원인으로 확정하지 않음.

## DB 연결 대상 확인 방법 (Secret은 보이지 않게)
1. Render Dashboard → `BINPC2` 서비스 (`srv-d9v9gme417fc73cf6gq0`) → **Environment** → `DATABASE_URL`이 실제 설정인지 확인. 값 전문을 복사·공개·로그·채팅에 남기지 않음.
2. URL의 **데이터베이스 호스트 또는 Supavisor 사용자 접미사**에서 `dlliqqlqdtdkfakdtwyw` 프로젝트 식별자와 Supabase `BINPC2` 프로젝트 → **Connect** 화면의 공식 접속 대상 일치 여부만 비교. 민감한 비밀번호·JWT·사용자 데이터는 공유하지 않음.
3. API로 읽을 수 없는 경우 사용자 또는 Work 브라우저에서 *호스트 식별자만* 확인해야 하며, 확인 전 임의 프로젝트 선택 금지.

## 스키마 사전 준비: 실행 금지 / 백업·연결 확인 뒤에만
**주의:** 아래 SQL은 계획 문서이며 실행된 상태가 아님. `public.app_sessions`이 실제 없는지, 앱 연결 DB role과 schema, 백업을 재확인한 뒤 한 트랜잭션으로 실행. 기존 테이블 삭제·수정 없음.

```sql
begin;
set local lock_timeout = '5s';
-- Only create a new session table in the verified BINPC2 DB.
create table if not exists public.app_sessions (
  sid varchar not null collate "default",
  sess json not null,
  expire timestamp(6) not null,
  constraint app_sessions_pkey primary key (sid)
);
create index if not exists idx_app_sessions_expire on public.app_sessions (expire);
alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from public, anon, authenticated;
commit;
```

사전 설치 후 **읽기 전용 검증**:
```sql
select to_regclass('public.app_sessions')::text as session_table,
       has_table_privilege('anon', 'public.app_sessions', 'SELECT') as anonymous_can_read,
       has_table_privilege('authenticated', 'public.app_sessions', 'SELECT') as signed_in_can_read,
       (select relrowsecurity from pg_class where oid='public.app_sessions'::regclass) as rls_enabled;
```
최종 조건: 테이블 존재, `anon`/ `authenticated` 읽기 불가, RLS ON, 실제 Render DB 사용자에게 세션 저장·조회 권한 있음. `service_role`나 `postgres` 사용 여부는 실제 Render 연결 확인 전 가정 금지. 새 테이블을 Data REST API에 임의 노출하거나 광범위 권한을 허용하지 않음.

## 승인 뒤 안전 배포 순서
1. 현재 `main` 및 Render live 커밋·기존 세션 운영/사용자 수·백업·DB 연결/보안 체크 결과를 기록.
2. 위 SQL 필요 시 대상 DB에 최소 DDL 적용, 즉시 결과 검사. 미확인/실패 시 STOP. 새로운 테이블은 접속 상태 DB에서 빈 상태로 생성됨.
3. PR #21의 변경 4파일만 `main`에 병합(자동 Render 빌드 트리거). 기존 UI 캐러셀 브랜치나 판매용 MATCH 코드는 **이번 긴급 서버 패치에 포함하지 않음**.
4. 새 Render deploy ID/commit 일치 → `live` 확인 → `/api/healthz` GET 200 확인 → 해당 배포 이후 `Failed to prune sessions` 재발·401/403/5xx·메모리·SSE 재연결 관찰. 테스트용 가짜 로그인/하트/채팅을 실운영에 발송하지 않음.
5. 새 버전 비정상 시 GitHub `main`과 Render 이전 배포 `b06a9002`로 안전 롤백 **코드만** 수행. DB에 만들어진 세션 테이블/새 기록은 자동 삭제하지 않음.

## 확인된 미완료 및 재개점
- `LIVE_DATABASE_URL_MATCH`: UNKNOWN — Render MCP 연결은 서비스/배포/로그 조회를 제공하지만 기존 Secret 값 조회를 제공하지 않음.
- `ENCRYPTED_FULL_DB_BACKUP_RESTORE`: UNKNOWN/BLOCKED — Supabase Free의 관리형 백업과 부분암호화 CSV를 완전한 복원본으로 볼 수 없음.
- `LIVE_SCHEMA_MUTATION`: NOT_STARTED.
- `LIVE_RELEASE`: NOT_STARTED. 코드 테스트는 PASS이나 운영 성공과 별개.
- 사용자가 이미 승인한 최소 수정 범위를 유지하되, 정확한 연결 증거와 복원 가능 백업 없이는 운영 DB를 임의 변경하지 않음.

## 2026-10-27 사용자 확인 반영 — 비밀정보 재질문 금지
- 사용자가 Render `DATABASE_URL`에 표시되는 프로젝트 식별자와 Supabase `BINPC2` 프로젝트 ref `dlliqqlqdtdkfakdtwyw`가 **일치함을 직접 확인**함. 상태는 `USER_CONFIRMED`로 갱신하며 동일 확인을 다시 요청하지 않는다. 커넥터는 환경변수의 실제 원문을 읽지 않았고 사용자도 비밀번호를 제공하지 않았다.
- 사용자 제공 Supabase **Database Backups → Scheduled backups** 화면에서 **`Free Plan does not include project backups`** 문구 확인. 기존에 보유한 소스 ZIP/부분 OpenPGP 백업은 자동 일일 백업 또는 현재 DB 전체 복원 가능한 파일이 아님.
- Supabase 조직 도구의 `plan=free`와 화면 표시도 일치. **유료 업그레이드 불필요**: 공식 가이드는 무료 프로젝트가 `supabase db dump` 또는 `pg_dump`로 논리 백업을 만들도록 안내.
  - 공식: https://supabase.com/docs/guides/platform/backups
  - 공식 절차: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
  - 대상 DB의 public 앱 테이블 2개에는 민감한 `app_kv_rows.data` 및 이미지 `app_image_store.data_url`이 있어 평문 ZIP/공용 PC/공개 GitHub에 내보내기 금지.
- 연결된 소유 PC의 안전한 읽기 점검에서 `pg_dump`, `pg_restore`, `psql`, Supabase CLI, Docker, GPG, 7-Zip을 PATH에서 발견하지 못했다. 비밀 설정 탐색·프로그램 설치·PC방 로컬 자료 생성 없음.
- 신규 스키마 작성·실배포 전에 개인 관리 PC에서 공식 덤프 도구를 준비하고 **시점이 일치하는 전체 데이터와 스키마 백업을 강력하게 암호화**, 비공개 독립 복원까지 검증한다. 백업/암호화 도구가 준비되고 사용자만 직접 안전하게 비밀번호를 입력하도록 한다. 비밀번호·DATABASE_URL 전문을 채팅/문서/로그에 남기지 않는다.
- Supabase `BINPC2` 메타데이터의 최신 읽기: `app_sessions` 없음, `app_kv_rows` 3,250행, `app_image_store` 102행. 수치는 백업·검증 순간 다시 확인하며 개인 행 본문 조회 없음.
- 이 문단은 위의 역사적 `LIVE_DATABASE_URL_MATCH=UNKNOWN` 기록을 **사용자 확인 후 USER_CONFIRMED로 업데이트하는 추가 결정**이다. 과거 미확인 기록을 삭제하지 않는다.
- **현재 운영 DB 변경: 0건; GitHub main 병합: 0건; Render 새 배포: 0건.** 현재 상태는 `CODE_TESTED / BACKUP_BLOCKED`이며 사용자의 기존 최소 DB 수정·배포 승인 범위는 유지한다.

## 2026-10-27 추가: 개인 PC용 백업 자동실행 준비 (이번 회차, 본문 위의 과거 기록 보존)
- 상태: `BACKUP_PREPARED_TESTED` / `LIVE_DATA_BACKUP_NOT_STARTED` / `PRODUCTION_UNCHANGED`. 사용자가 자동화를 명시 요청했고, 승인은 기존의 백업 검증 후 최소 세션 오류 수정·배포 범위에서 유지한다.
- 소유자 원격 PC `DESKTOP-5F8ARA7`에서 기존 **PostgreSQL 17.11 포터블 클라이언트**(`pg_dump`, `pg_restore`, `psql`), **Supabase CLI 2.122.0**, **GnuPG 2.4.9**를 실제 실행 확인. 일반 PATH에 없었을 뿐 미설치가 아니었다.
- 소스 복원과 관계없는 프로젝트는 건드리지 않고, 개인 PC 폴더 `C:\Users\aoald\BINPC2_SECURE_DB_BACKUP_PREP_20261027`에 전용 대화형 백업 실행기 `BINPC2_운영DB_암호화백업_실행.cmd` 및 `binpc2-safe-db-backup.cjs`, 회귀테스트·README를 추가했다.
- 기술 동작: DB 입력은 개인 PC에서만 터미널 **마스킹**으로 받음. 프로젝트 ref `dlliqqlqdtdkfakdtwyw`와 Direct/Session 풀러 5432 식별자 확인, TLS `verify-full` 지정, `pg_dump -Fc -n public` → GPG 암호화 스트림으로 디스크에 평문 없음; 기존 원본 덮어쓰기 금지, SHA256·건수 영수증, 비공개 Google Drive 암호문 복사 시도. 범위는 **public 업무 테이블 스키마+데이터**이고 Supabase 시스템 전체 백업을 주장하지 않음.
- 실제 실행 전 정적 검증 4/4 PASS, `--preflight`는 도구/키 존재 확인만 실행. 개인키 원본 `BINPC2_BACKUP_ENCRYPTED_PRIVATE_KEY_20261023.asc`는 소유자 전용 Google Drive 경로에서 **기존 키 공개 지문 일치** 확인, 암호는 읽거나 우회하지 않음. 현재 공개키용 격리 GPG import는 원격 무인 환경에서 종료코드 2로 차단됨. 보호키 복호화·새 실DB 백업은 아직 실행되지 않았음.
- 개인 PC 소유자가 집에서 GPG 암호를 직접 입력하는 기존 정책과 PC방 비밀정보 반출 금지를 유지. Supabase CLI는 현재 로그인돼 있지 않고, 직접 DB hostname DNS가 소유자 PC에서 확인되지 않으며 외부 Render SSH는 안전 검사에서 차단돼 우회하지 않았음.
- 위 다섯 개 **비민감 준비 파일**을 Google Drive [전용 비공개 폴더](https://drive.google.com/drive/folders/1saWGnlYLpvLzcKG4N_-ZQAMf1S3IYOPn)에 저장, **서버에서 RAW 재다운로드한 5개 모두 SHA256 일치** 확인. 복구키/DB 내용/Secret은 업로드하지 않았다.
- Supabase 프로젝트의 현장 `SELECT`로 `app_kv_rows=3250`, `app_image_store=102`, `app_sessions` 없음 및 실제 인덱스·접근권한·컬럼 정의를 **읽기 전용** 스냅샷으로 작성해 같은 비공개 Drive에 저장, [서버 읽기 SHA256 PASS](https://drive.google.com/file/d/1QeGsWeanxdoSLIplTdHiGujaO2Y-FF_C/view), 4,179바이트, `8ed3730d9e4a16bb39c10b5ffd9d29cdef391ace20100356a2761d1882ca2050`. 데이터 행값을 포함하지 않는 참고자료이므로 이것을 고객 데이터 백업이라고 주장하지 않음.
- **미해결 BLOCKED:** DB 비밀번호와 기존 보호키의 암호는 소유자가 집 PC에서만 입력 가능(채팅 금지). 현재 시점 DB 전체 암호문 생성, 서버 업로드 검증, 키로 복호화, 분리된 PostgreSQL 독립 복원은 아직 성공하지 않았음. 해당 증거가 확보되기 전 GitHub `main` 병합, `app_sessions` 운영 DB 생성, Render 자동배포 및 실제 이용자 데이터 변경을 하지 않는다.
- 다음 재개: 개인 PC에서 `00_읽어주세요_BINPC2_운영DB_자동백업_20261027.md` 확인 후 `.cmd` 실행; GPG가 집 PC에 비밀번호를 요청하면 소유자가 직접 입력; 가려진 로컬 프롬프트에서 Supabase BINPC2 Session pooler 5432 접속 정보를 입력. 통과 영수증을 검사해 Google 서버 바이트·독립 복원을 검증하고 운영 변경 재개. 공개키 import 자체 오류가 계속되면 오류를 BLOCKED로 보고하고 보안 약화로 우회하지 않는다.

# BINPC2 — 운영 DB·DB 내 사진 암호화 수동백업 준비 (2026-10-21)

> **DRAFT · 소스 준비·격리 로컬 테스트까지 · 실제 운영 DB 내보내기/Drive 업로드/복원 미실행.**
> 단 한 번의 운영 DB 스냅샷도 기존 GitHub/Google Drive 소스 ZIP으로 대체할 수 없다.
> 한국 BINPC2 기존 Render·Netlify·Supabase·GitHub main/원본 데이터/Secret/권한은 수정하지 않는다.
> OneDrive를 사용하지 않는다.

## 1. 적용 범위와 실행 경계

- 별도 파일 scripts/backup-db-photo-encrypted.mjs: 직접 보유한 개인 PC에서 명시적으로 실행할 때만 PostgreSQL 읽기 전용 pg_dump를 수행한다.
- 기본 명령 node scripts/backup-db-photo-encrypted.mjs는 **DRY_RUN_ONLY**: DB 접속·파일 쓰기·업로드 0회.
- 실제 실행에는 --run 인수, BINPC2_DB_BACKUP_APPROVED=YES 환경변수, 정확한 원본 BINPC2 Supabase 프로젝트의 **직접 연결 호스트**가 동시에 필요하다.
- 프로젝트 ID 검증: dlliqqlqdtdkfakdtwyw; 이외 DB와 Supabase 연결 풀러의 별도 호스트는 강제로 거절하여 혼동을 방지한다.
- 고객 프로필·하트·채팅·기기 인증자료를 보유할 수 있는 public.app_kv_rows 및 사진 dataURL을 보유하는 public.app_image_store는 공개 PostgreSQL 스키마의 덤프에 포함될 수 있다. 원본 사진이 Supabase Storage 등 외부 저장소에도 있다면 이 덤프만으로는 복구가 불완전하다.
- age 공개키 수신자 지정 → PostgreSQL custom-format 스트림을 암호화 프로세스에 바로 파이프. 임시 평문 DB 덤프 파일 생성 금지. 개인키는 사용자 개인 기기에만 보관하고 GitHub/채팅/Drive 데이터 옆에 두지 않는다.
- 새 날짜별 .pgdump.age 암호문 + .receipt.json(SHA256/크기/구조)만 생성하며 같은 경로 덮어쓰기를 거부한다. 실패 중 생성된 **새 미완료 암호문**만 제거한다.
- 실행 전 pg_dump·age 설치 여부, OneDrive/소스 저장소 밖의 절대 경로, 개인정보 접근 승인 조건을 점검한다.
- 민감한 DB 비밀번호·인증 문자열을 명령줄 인자로 출력하지 않는다. 가능하면 개인 PC의 접근제한된 PGPASSFILE을 사용한다.
- **실제 운영 DB, 사진, Secret을 GitHub Actions나 공개 artifact로 내보내지 않는다.** 이 기능은 어떠한 자동 GitHub 워크플로에도 연결하지 않는다.

## 2. 안전한 검증 범위 (키 없이 가능)

- node --test scripts/backup-db-photo-encrypted.test.mjs
- node scripts/backup-db-photo-encrypted.mjs
- 위 테스트는 외부 DB에 접속하지 않는다. 암호화 실패 복구, 실제 pg_dump, 실제 인가, 실제 Restore는 아직 검증되지 않았다.

## 3. 나중에 본인 PC에서만 가능한 실제 실행 단계 — 미실행

1. 신뢰된 개인 PC에서 Node.js(버전 22 이상), PostgreSQL pg_dump(서버와 호환되는 버전), age CLI를 설치/버전 확인한다.
2. age-keygen을 **본인 PC에서만** 실행해 비밀키를 만든다. 비밀키를 채팅/공개 Git/OneDrive에 넣지 않는다. 개인키 분실 시 암호문 복원이 불가능하다.
3. 비공개 PGPASSFILE(접근 권한 제한), 정확한 PGHOST(대상 BINPC2 직접 호스트), PGDATABASE/PGUSER/PGPORT, BINPC2_AGE_RECIPIENT(public age1... 키)를 개인 PC의 로컬 환경에서 설정한다. 개인키/비밀번호는 코드/문서에 입력하지 않는다.
4. 실제 데이터 보호 정책·보관기간·접근권한·비용을 확인하고 별도 승인 후 BINPC2_DB_BACKUP_APPROVED=YES와 --run --out <절대 로컬 비-OneDrive 폴더>로 실행한다.
5. 암호화된 파일의 SHA256과 .receipt.json을 대조한다. 개인키로 **격리된 환경에서 복호화 스트림 → pg_restore --list**를 실행하고, 실제로 복원 가능한지 별도의 격리 PostgreSQL 인스턴스에서 검증한다. 실제 운영 DB 덮어쓰기는 금지한다.
6. 개인키가 같은 백업에 함께 들어가지 않도록 보장한 후 **암호문만** 비공개 Google Drive로 올리고 재다운로드·SHA256 대조한다. 승인된 보존/폐기 정책 없이는 오래된 사본을 임의로 삭제하지 않는다.

## 4. 원칙적으로 미완료인 부분

- 본 컴퓨터에는 age / pg_dump / pg_restore가 설치돼 있지 않아 **실제 DB 복원/암호화와 원격 스냅샷 실행 성공을 검증하지 못했다.**
- 이번 준비 도구는 Supabase Auth/Storage의 서비스별 데이터나 Render/Netlify 환경변수/Secret, Google Drive 계정, GitHub Git 이력까지 통째로 백업하지 않는다.
- 실제 백업은 본인 기기·보호된 DB 자격정보·암호화 키·복원/해시 검사가 필요하다.
- 기존 GitHub PR #6은 **소스/이력용 별도 자동백업**이며, OAuth/Secret 미설정 상태에서 Google Drive 무인 업로드가 이루어졌다고 주장하지 않는다.
- 개인정보 삭제/무결성 검사(현재 프로필과 연결되지 않은 device_secrets/push_subscriptions 등) 결과만으로 DB 레코드를 삭제하지 않는다.

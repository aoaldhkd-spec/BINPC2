# BINPC2 — 집 PC 재개 인수인계 (2026-10-13, CURRENT 준비본)

> 목적: 외부 PC에서 가능한 안전한 읽기·코드수정·테스트·백업을 마치고, 집 개인 PC에서만 해야 할 인증/기기 확인을 원래 지점부터 잇는다.
> **STOP:** 다음 지시는 배포/운영 DB 삭제/Secret 변경/유료 생성 작업에 대한 자동 승인이 아니다. 사용자에게 실제 위험 작업을 별도 확인한 뒤만 한다.

## 1. 이 시점 실제 운영과 분리된 작업

- **GitHub 운영 `main`**: `de3d4049fcacbbae038c7c24ebafc31dabb6ecc4`. Render BINPC2 `srv-d9v9gme417fc73cf6gq0` 동일 SHA **live**. Render는 미국 Oregon, BINPC2 Supabase는 Seoul (ap-northeast-2). 다른 Supabase 프로젝트 `my-matching-db`를 혼동하지 않는다.
- **속도 개선 [PR #15](https://github.com/aoaldhkd-spec/BINPC2/pull/15)**: `perf/binpc2-merge-poll-20261013` 최신 SHA `2523a53dcfe928bb2d4246911ae4b9b04b576c99` (해당 SHA의 자동 CI 증거는 PR/Actions 확인). 서버 메모리 DB 병합의 O(n²) 반복 탐색을 선형 색인으로 교체. 모바일 느린 연결 시 `/ready` 동시 요청 차단. 과거 코드 동작과 **500개 결정적 샘플** 비교 테스트 추가. **Draft·미병합·운영 미배포**. 실운영 지연 개선은 아직 UNKNOWN.
- **개인정보 기록/읽기전용 진단 [PR #14](https://github.com/aoaldhkd-spec/BINPC2/pull/14)**: `docs/project5-release-evidence-20261013`; `docs/BINPC2_PROJECT5_DATA_RETENTION_AUDIT_2026-10-13.md`와 `docs/READONLY_PRIVACY_RESIDUE_CHECK.sql`에 개인정보 원문 없이 확인근거·동의/백업/삭제 STOP 조건을 정리. **Draft·미병합**.
- **Google Drive 자동 백업 [PR #6](https://github.com/aoaldhkd-spec/BINPC2/pull/6)**: `backup/automatic-drive-offsite-20261010` SHA `e39757661785684e2ea4b21dac86b21a038cdd06`. GitHub 임시 전체 Git 이력 복원시험/7일 소스 체크포인트는 SUCCESS. **GitHub→Drive OAuth Secret 미설정**으로 정기 Drive 자동 업로드는 미활성·Draft.
- 기존 정상 하트 4종/🌈별도4회, 23:00/00:00 해금·01:00 신규입장 마감·다음 행사 17:00 안전 초기화, 1:1/단톡, 관리자, 실시간 SSE, 푸시 대상 정책은 변경하지 않는다.
- 실제 iOS/Android 휴대폰 수신, 현장 150명 실제 통신, 정책에 따른 개인정보 완전 정리, 개인정보 포함 DB·사진 암호화 백업과 복구 검증은 아직 완료 아님.

## 2. 백업 — 이미 완료된 것부터 확인

- 현재 `main de3d4049` 소스 스냅샷은 **서로 다른 기존 비공개 Drive 폴더**에 각각 4,462,103바이트, 읽기·메타데이터 확인 완료:
  - [1차 main 소스 ZIP](https://drive.google.com/file/d/1PCEaj-az7ipT2ymYxsuHfh0QpwuZmoPH/view)
  - [2차 main 소스 ZIP](https://drive.google.com/file/d/1hDCuK6K4Zkn66zcq8xQZnRGwcxXh1lal/view)
- 속도 개선 `PR #15` 코드/웹 빌드 재현 자료 **13,752,968바이트**도 별도 새 비공개 Drive 폴더 사본으로 확인:
  - [1차 PR15](https://drive.google.com/file/d/1qNy1XwO5XAK8KtHbh_nbTTgPSx-w-xRU/view)
  - [2차 PR15](https://drive.google.com/file/d/1O_sGqqIaI--C7qTtiDogbzj2YBjXWJ6T/view)
- GitHub Actions 전체 Git bundle 포함 임시 artifact 491,297,102바이트는 2026-11-12 만료 예정. Drive의 위 ZIP에는 **실운영 DB/사진/키/전체 Git 이력 번들**이 없다.
- 어떤 과거 백업도 지우거나 덮어쓰지 않는다. 새 원본 + Git 이력·복원 가능성·보관 기한을 구분한다.

## 3. 집 개인 PC에서만 할 순서 (인증값을 채팅에 보내지 않음)

### A. 자동 GitHub→Drive 1회 권한 연결 — OAuth/rclone

1. 신뢰할 수 있는 **집 PC**의 Chrome에서 [rclone 공식 설치 안내](https://rclone.org/install/)와 [Google Drive 연결 설명](https://rclone.org/drive/)을 연다. Windows판을 설치한다.
2. 자신의 Google Cloud Console에서 본인 프로젝트를 선택/생성하고 **Google Drive API**를 활성화, Google Auth Platform의 **Desktop app** OAuth 클라이언트를 만든다. 구글 계정 권한을 허용할 때 필요한 앱만 허용한다. 테스트 모드 refresh token 7일 제한에 유의.
3. **집 PC** 명령창에서 `rclone config`로 Google Drive 원격 연결 이름 `binpc2drive`를 설정하고 구글 로그인·승인을 완료한다. `rclone lsd binpc2drive:`로 정상 연결 여부를 확인한다.
4. `rclone config file`로 실제 설정 파일의 위치를 찾는다. [PR #6 설명서](https://github.com/aoaldhkd-spec/BINPC2/blob/backup/automatic-drive-offsite-20261010/docs/DRIVE_AUTO_BACKUP_SETUP.md)에 따라 Windows PowerShell에서 해당 파일을 Base64로 만든다. **이 문자열은 암호화가 아닌 인증 비밀정보**이므로 개인 PC 밖에 복사·공유하지 않는다.
5. GitHub [BINPC2](https://github.com/aoaldhkd-spec/BINPC2) → **Settings → Secrets and variables → Actions → New repository secret**으로 이동해 이름을 `BINPC2_DRIVE_RCLONE_B64`로 입력하고 개인 PC의 Base64 문자열을 값으로 붙여 넣어 저장한다. 저장 후 이름만 보이는지 확인하고, 본문은 메시지·로그·문서에 남기지 않는다.
6. 현재 PR #6은 아직 `main`에 병합되지 않아 자동 Drive 워크플로도 운영 활성화되지 않았다. **PR #6 병합은 Render 자동 배포 가능성이 있으므로 별도 승인/현재 CI/안전시간 확인 후** 진행한다. 해당 워크플로의 `Actions → BINPC2 offsite source backup → Run workflow`를 승인 후 한 번만 실행해 Drive 스냅샷 3파일(`source.zip`, `repository.bundle`, `manifest.json`)과 `rclone check` 성공 로그를 확인한다.
7. 워크플로는 백업 파일 크기 상한 750MiB와 **Drive 남은 용량 2GiB 안전 여유** 검사에 걸리면 실패 처리한다. 인증 연결과 용량 체크는 아직 실제 계정에서 시험하지 못했다. 실패 시 Secret 원문을 로그에 붙이지 말고, 설정 원인만 확인한다.

### B. 운영 DB·사진의 진짜 복구용 백업

1. 본인 PC에서 [Supabase Dashboard](https://supabase.com/dashboard)에 로그인 → 이름이 정확히 **BINPC2**인 프로젝트(다른 프로젝트 선택 금지) → **Database → Backups**에서 실제 사용 요금제의 백업 가용 여부를 먼저 확인한다.
2. 백업이 없다면 공식 [Supabase DB 백업 안내](https://supabase.com/docs/guides/platform/backups)를 기준으로 **집 PC의 안전한 환경**에서 CLI `db dump` 또는 `pg_dump`를 검토한다. 실제 키/DB URI는 채팅·GitHub 코드/공개 Actions에 넣지 않는다.
3. 백업을 개인정보 포함 비밀 자료로 취급하고 **암호화·비공개 저장·복구시험**을 해야만 실제 개인자료 삭제 정책을 검토한다. DB 내 `app_image_store`와 외부 파일/로그/다른 저장소가 모두 백업됐는지 각각 확인한다. GitHub 소스 ZIP은 DB 백업이 아니다.
4. 현재 자료: DB 약 **46.6MB**, `app_image_store` 약 **30.4MB**, 현 프로필 2, 기기 인증 2,642, 사진 저장 행 97. 단순히 현재 프로필에서 보이지 않는다고 바로 지우지 않는다.

### C. 실제 휴대폰 두 대 사용 시험

1. **Android Chrome:** [BINPC2](https://binpc2.netlify.app/)를 설치 없이 열고 기존 본인 프로필 접속 → **설정 → [선택] 하트·1:1 채팅 알림 받기** → 알림 허용 → **🔔 이 기기로 시험 알림 보내기**를 직접 탭. 웹 브라우저가 뒤로 가거나 화면이 꺼져도 OS 알림이 뜨는지 확인. 서버 요청 성공만으로 실수신을 PASS 처리하지 않는다.
2. **iPhone Safari:** 열린 화면의 웹 내부 하트/채팅 알림은 받을 수 있지만 Safari 일반 탭 종료 후 OS Web Push는 애플 정책상 **홈 화면 설치 웹앱 필요**. Safari 공유 → 홈 화면에 추가 → BINPC2 아이콘에서 앱 열기 → 본인 선택 권한 허용 후 같은 시험 버튼을 눌러 실제 OS 수신을 확인한다. 사용자 동의 없는 강제권한/백그라운드 알림은 금지.
3. 실제 하트→MY 받은 하트, 1:1 채팅→그 상대 방으로 이동하는지, **본인 소유/동의한 시험 기기 2대**와 안전한 시험 계정·행사시간에서만 각각 확인한다. 단체/시그널 또는 본인에게 발신한 하트 푸시는 없어야 한다. 실사용자/운영 참가자에게 무단 시험 메시지·하트 보내지 않는다.

### D. 병합/배포 및 개인정보 정책 승인

- 먼저 실제 개인정보 보존기한·파기예외·사진/장치키/푸시구독/로그/백업 정책을 운영자와 법률 검토로 확정. 그전 실제 데이터 UPDATE/DELETE 금지.
- PR #15 최신 CI 통과·실제 서비스 백업/복구 가능성이 확인되면 사용자 승인으로 운영 한가한 시간에 최소 병합, Render/Netlify 실제 배포 확인. PR #14 정본 문서·PR #6 자동백업은 별도 파일, 별도 승인·순서로 진행; PR들을 한꺼번에 무조건 병합하지 않는다.
- Render는 미국 Oregon, DB 서울. 싱가포르 신규 Render 서비스는 별도 월요금과 Secret·도메인 이관 등으로 위험/추가비용이 있으므로 **현재 개설·변경하지 않았다**. 실제 사용자 지연/DB 왕복시간을 측정한 뒤 필요할 때만 비교한다.
- 현장 150명 실네트워크·2기기 푸시/딥링크·회식 01시/17시 운영 검증은 자동 CI 가상 환경과 구별해 증거가 나올 때만 VERIFIED로 변경한다.

## 4. 실수 방지 및 다음 대화 시작 문구

- PC방에서 개인 인증키 입력·로컬 PC 연결·운영 DB 다운로드·공개권한 변경 금지.
- 코드를 새로 처음부터 만들지 않고 `main` 최신 HEAD와 위 세 Draft PR·테스트 및 Drive 사본을 재대조한다.
- PR #15 최신 500개 패리티(옛 동작 동일성) 추가 테스트, 정확한 최종 CI 통과 여부를 다시 확인한다.
- 다음 대화 시작: **"BINPC2 집 PC 단계 재개. docs/BINPC2_HOME_HANDOFF_2026-10-13.md 와 PR #6/#14/#15 최신 상태를 읽고 이미 완료한 건 재작업하지 말고, 내가 직접 해야 하는 보안 승인 클릭부터 한 단계씩 알려줘. 운영 DB·배포는 별도 승인."**

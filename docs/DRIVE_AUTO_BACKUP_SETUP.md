# BINPC2 자동 GitHub → Google Drive 백업 설정

> 상태: 준비 완료(별도 브랜치·PR). **현재 자동 업로드는 아직 비활성**. `main` 병합과 개인 PC에서 Google OAuth/GitHub Secret의 1회 연결이 필요하다. 피씨방에서는 인증하지 않는다.

## 1. 자동으로 저장되는 내용

- 실행: GitHub `main` 변경 즉시(`push`), 매일 03:17 한국시간 재점검(예약 실행은 지연될 수 있음), 수동 실행.
- `source.zip`: 해당 Git 커밋의 추적 코드/문서/테스트/이미지.
- `repository.bundle`: 내려받은 모든 브랜치/태그와 Git 변경 이력. `git bundle verify`로 검증.
- `manifest.json`: Git SHA, Git refs 지문, 파일 수, 각 파일 크기와 SHA-256.
- Google Drive 대상: **신규 자동백업 폴더** `BINPC2_AUTO_BACKUPS/snapshots/<git-commit>-<refs-fingerprint>/`.
- 동일 상태면 `rclone copy --checksum --immutable`로 같은 파일을 재사용하고, 변경되면 새 버전 폴더를 만든다. 이전 날짜/버전을 자동 삭제하지 않는다.
- 업로드 후 `rclone check --checksum --one-way`로 Drive 파일과 생성 파일의 내용 동일성을 검증한다.
- 기존 수동 백업 두 폴더는 그대로 둔다: https://drive.google.com/drive/folders/1IDQAjN_YTIcHo2ptrVvukNkQB8ZUSfFj / https://drive.google.com/drive/folders/1WiJ6cRV8RduD1tfAhBXUlYH2000xdf8o

## 2. 집의 개인 PC에서만 한 번 해야 할 설정

1. 개인 PC에서 공식 rclone 설치: https://rclone.org/install/ 와 https://rclone.org/drive/
2. 본인의 Google Cloud 프로젝트에 Drive API를 활성화하고 OAuth 클라이언트 유형을 'Desktop app'으로 생성한다. **2026년 rclone 공유 OAuth client ID 폐지** 때문에 본인 클라이언트 ID 사용을 권장한다.
3. OAuth 앱을 Google Auth Platform에서 사용자 계정이 실제로 장기간 사용할 수 있게 설정한다. `Testing` 모드의 7일 refresh token 제한에 유의한다.
4. 개인 PC 명령창에서 `rclone config`로 Google Drive remote를 만든다. 이름은 **정확히 `binpc2drive`**로 지정한다.
5. Google Drive scope은 `drive.file`(해당 앱이 만든 파일에만 접근)를 선택한다. 새 전용 폴더만 사용하므로 기존 수동 백업폴더에 접근 권한을 줄 필요가 없다.
6. 자신의 OAuth client ID/secret로 계정 인증 후 `rclone lsd binpc2drive:`로 접속을 확인한다.
7. `rclone config file`로 실제 rclone.conf 경로를 확인한다. 이 설정 파일에는 Google refresh token이 포함되므로 채팅·GitHub 코드·공용 PC에 붙여넣거나 업로드하지 않는다.
8. 개인 PC PowerShell에서 `rclone.conf` 파일을 Base64(단순 인코딩이며 암호화가 아님)로 변환한다. 실제 파일 경로는 직접 확인 후 수정한다.

       $configPath = "$env:APPDATA\rclone\rclone.conf"
       [Convert]::ToBase64String([IO.File]::ReadAllBytes($configPath))

9. GitHub → aoaldhkd-spec/BINPC2 → **Settings → Secrets and variables → Actions → New repository secret**.
10. Secret 이름: **`BINPC2_DRIVE_RCLONE_B64`**. 값은 8번에서 나온 전체 Base64 문자열로 지정한다. 이 채팅에는 값을 절대 전송하지 않는다.
11. GitHub Actions → **BINPC2 offsite source backup** → Run workflow를 실행해 성공 여부를 확인한다. `Verified offsite source snapshot` 로그와 새 Drive 자동백업 폴더의 세 파일을 함께 검증한다.
12. 필요하면 GitHub 본인 계정의 Actions 워크플로 실패 알림 이메일을 켠다. Drive 연결이 없으면 워크플로는 성공으로 위장하지 않고 실패하도록 설계돼 있다.

## 3. 운영 안전 경계

- 이 워크플로는 **GitHub 소스·브랜치·태그·과거 Git 이력만** 대상으로 한다. Supabase Free 운영 DB의 개인정보/이미지/기기 인증정보 원본은 백업하지 않는다.
- 실제 DB 전체 자동 백업은 암호화, 본인 소유 인증정보 보호, 별도 복원 시험이 필요한 후속 작업이다. 현재 DB 자동 백업 미설정.
- 기존 Render/Netlify 배포·환경변수·Secret, 참가자 하트·채팅·PWA·SSE에는 아무런 변경이 없다.
- **Drive 업로드 전 안전상한 추가:** `rclone about --json`으로 사용자 Drive의 남은 저장공간을 읽고, 전체 버전 크기 **+2GiB 이상 여유가 없으면 STOP**. 기존 사본 임의 삭제 금지, 용량을 확인할 수 없으면 실패(성공으로 위장하지 않음). 이 규칙은 향후 실제 OAuth 연결 시에만 실행되므로 이번 PR CI에서 실제 Drive quota 체크가 통과했다고 주장하지 않는다.
- `main` 브랜치가 자동 Render 배포와 연동되어 있어서 이 문서/워크플로는 **별도 브랜치의 Draft PR**로만 준비한다. 병합 전에는 코드 리뷰·CI 확인을 마쳐야 하며, 실제 병합·배포는 사용자 별도 승인 후 진행한다.
- GitHub Actions 자격증명은 `contents: read`이고 checkout의 `persist-credentials`도 끈다. Google 인증은 GitHub Secret으로만 공급해 실행 뒤 즉시 폐기한다.
- 장기간 백업은 Google Drive 무료 용량을 소모할 수 있다. 임의로 과거 복구점을 삭제하지 않고 용량 경보/보관 정책을 따로 결정한다.
- Google Drive 새 자동 백업은 기존 같은 계정의 수동 1·2차 사본과 여전히 계정 장애 위험을 공유한다. 완전 재해복구에는 다른 계정/제공업체 사본도 필요하다.

## 4. 안전한 복원 예행검사(개인 PC)

복구할 때는 별도 컴퓨터/폴더에서 `git bundle verify repository.bundle`을 실행한 다음 `git clone repository.bundle restored-binpc2`로 Git 역사를 복원한다. 코드만 필요하면 `source.zip`을 해제한다. **운영 DB 직접 덮어쓰기나 실제 서비스 배포는 별도 승인 없이 금지**.

관련 공식 문서: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax / https://rclone.org/drive/

## 5. 2026-10-13 실제 실행과 남은 활성화 — CURRENT

- 사용자 보유 PC가 아닌 GitHub Actions PR 검증에서 **현재 `origin/main` 소스**를 정확히 선택해 백업하도록 수정. PR 작업 브랜치를 최신 main으로 착각해서 백업하지 않는다.
- 독립 GitHub [백업 실행 성공](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/38347353338): `main de3d4049fcacbbae038c7c24ebafc31dabb6ecc4`, 추적 파일 926개, Git refs 18개, 파일의 해시와 `git bundle verify` 성공. 전체 Git 이력 포함 **일시적** GH artifact 491,297,102 bytes; 만료 2026-11-12 UTC. **Drive에 Git bundle을 올린 것은 아님**.
- 이후 [소형 백업 실행 성공](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/38348144597): 소스 ZIP+검증표만 담아 artifact 4,462,103 bytes, 만료 2026-10-20 UTC. GitHub 연결 앱 → 개인 Google Drive **서로 다른 비공개 폴더**에 새 파일 2개를 생성하고 각각 4,462,103 bytes 및 소유자 전용 권한을 재검증:
  - [1차](https://drive.google.com/file/d/1PCEaj-az7ipT2ymYxsuHfh0QpwuZmoPH/view)
  - [2차](https://drive.google.com/file/d/1hDCuK6K4Zkn66zcq8xQZnRGwcxXh1lal/view)
- GitHub Actions 임시 보관은 영구·완전재해복구가 아니다. 과금상한/중복을 고려해 추후 자동실행에는 **7일 소스 ZIP 체크포인트**만 GH artifact에 남기고, 매번 491MB 전체 bundle을 GH에 또 쌓지 않도록 바꿨다. Drive 인증이 활성화되면 별도 Git bundle을 private Drive에 검증 업로드한다. 750MiB를 초과하는 스냅샷은 업로드 전에 실패(STOP)한다.
- **아직 BLOCKED:** OAuth/rclone 연결과 GitHub Actions Secret `BINPC2_DRIVE_RCLONE_B64`가 준비되지 않아 정기 Google Drive 백업은 자동 활성화되어 있지 않다. 기존 ChatGPT Google Drive 연결로 이번 일회성 소스 ZIP 저장은 완료했지만, 이 연결이 GitHub Actions의 OAuth 인증정보로 자동 전달되지는 않는다.
- PR #6 자체를 main에 병합하면 Render 자동배포가 일어날 수 있으므로, 프로덕션 병합은 명시적 승인 전 금지. 운영 Supabase DB·프로필 이미지·기기 인증자료·VAPID/API Secret은 모든 Git 소스/번들 ZIP의 범위 밖이다. 사용자 허락 없이 운영 데이터를 내보내거나 GitHub 공개 저장소/Actions artifact에 넣지 않는다.
- GitHub Actions artifact 저장량은 계정 요금제의 포함량 및 초과 과금(공식 현재 안내상 Free 500MB, Pro 1GB, 초과 $0.25/GB·월)에 종속된다. 491MB 파일을 매 커밋마다 저장하면 과금/한도 위험이 있어 반복하지 않는다. 실제 계정 요금제·남은 한도는 UNKNOWN.


## 6. 2026-10-21 무인 백업 누적용량 안전 가드 — 신규 Draft 준비

- 누적 저장용량 문제(전체 Git bundle 약 491 MB/실행)를 줄이기 전까지 **백업 전 자동 중단 규칙**을 추가했다. `rclone size binpc2drive:BINPC2_AUTO_BACKUPS --json`으로 대상 폴더 전체의 현재 용량을 읽고, 신규 ZIP+Git bundle 합계까지 계산해 누적 한도를 초과할 것으로 예상되면 업로드하지 않는다.
- 기본 누적 상한은 **10 GiB**, GitHub Actions 저장소 변수 `BINPC2_DRIVE_MAX_TOTAL_GIB`에 양의 정수를 설정하면 변경할 수 있다. **계정 남은 여유공간 최소 2 GiB 규칙과 개별 스냅샷 750 MiB 상한은 기존대로 유지**. 누적 상한/사용량/여유용량 중 하나라도 확인되지 않으면 즉시 실패한다.
- 백업 날짜별 이전 사본을 정리하거나 덮어쓰지 않는다. 파일이 이미 존재하는 경우에도 신규 스냅샷 전체 크기를 보수적으로 더하므로 **데이터 손실보다 무해한 STOP을 우선**한다. 계정 인증·폴더 조회가 실패해도 업로드 성공으로 보고하지 않는다.
- CI에서 `node --test scripts/drive-backup-quota.test.mjs`를 **PR 검증 단계에서도** 실행해 무/초과값·누적 상한·잔여공간 부족·JSON 필드 누락을 검사한다. 이 검사는 실 Google Drive OAuth, quota, 무인 업로드 또는 복원 성공 증거가 아니다.
- 기존 Google Drive OAuth/rclone 인증 `BINPC2_DRIVE_RCLONE_B64` 및 main 병합·자동 Render 배포 경계는 그대로 미해결이다. 실제 연결·키 저장·main 병합은 별도 승인 필요. **이번 Draft에서 운영 데이터/사진/Secret 내보내기, 기존 백업 삭제, OneDrive 사용 없음.**
- 장기간 누적 상한 초과 시 자동 삭제 대신 사용자에게 알리고 이전 보관정책/전체 Git 번들 축적 방식(예: 월간 완전 Git bundle + 일별 소스 ZIP)을 먼저 결정한다.

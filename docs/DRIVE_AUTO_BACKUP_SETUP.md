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
- `main` 브랜치가 자동 Render 배포와 연동되어 있어서 이 문서/워크플로는 **별도 브랜치의 Draft PR**로만 준비한다. 병합 전에는 코드 리뷰·CI 확인을 마쳐야 하며, 실제 병합·배포는 사용자 별도 승인 후 진행한다.
- GitHub Actions 자격증명은 `contents: read`이고 checkout의 `persist-credentials`도 끈다. Google 인증은 GitHub Secret으로만 공급해 실행 뒤 즉시 폐기한다.
- 장기간 백업은 Google Drive 무료 용량을 소모할 수 있다. 임의로 과거 복구점을 삭제하지 않고 용량 경보/보관 정책을 따로 결정한다.
- Google Drive 새 자동 백업은 기존 같은 계정의 수동 1·2차 사본과 여전히 계정 장애 위험을 공유한다. 완전 재해복구에는 다른 계정/제공업체 사본도 필요하다.

## 4. 안전한 복원 예행검사(개인 PC)

복구할 때는 별도 컴퓨터/폴더에서 `git bundle verify repository.bundle`을 실행한 다음 `git clone repository.bundle restored-binpc2`로 Git 역사를 복원한다. 코드만 필요하면 `source.zip`을 해제한다. **운영 DB 직접 덮어쓰기나 실제 서비스 배포는 별도 승인 없이 금지**.

관련 공식 문서: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax / https://rclone.org/drive/

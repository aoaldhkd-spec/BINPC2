# V6 GitHub 개발 브랜치 저장 — 2026-10-27

코드 기준 `73861cf5dfdde94044b36ebde5688b6584090eba`를 `feat/event-hub-v6-20261027`에 push했고 Git 원격과 GitHub API에서 해당 branch/commit 존재를 확인했다. main은 `b06a900280404f79c92e17cdbc6af907a0414c30`으로 보존했다. 이 문서와 다운로드 보존 커밋은 같은 개발 브랜치에 추가한다.

사용자가 Netlify Build status를 Stopped builds로 변경했다고 확인했다. Render는 사용자가 알려준 main 자동 배포를 유지한다. GitHub 워크플로를 검토했으며 이 개발 브랜치 push에 따른 배포 동작은 없다. Netlify 관리 API를 독립 조회한 것으로 주장하지 않는다. PR·main push/병합·운영 배포·실제 모집·외부 알림·운영 DB 변경을 실행하지 않았다.

텍스트 이력 4564개와 새 다운로드의 알려진 인증 패턴/현재 실행 비밀값을 검사했으며 검출 후보가 없었다. 새 Git 변경에는 env/실제 생성 키/DB dump/운영 참가자 자료를 넣지 않았다. 과거 공개 이력의 이미지·대형 바이너리까지 개인정보가 없다고 보증하지 않는다. 79건 정적 경고와 분류·수정 기록은 이전 보고서에 보존한다.

`docs/previews`의 HTML과 약3MB ZIP은 가상 체험과 인계를 위한 다운로드 파일이다. HTML은 외부 API 연결이 차단됐고 실제 신청/입금/발송을 만들지 않는다. 이 파일을 GitHub에 저장하는 것은 웹사이트 운영 배포가 아니다. ZIP 내부 파일 해시와 외부 SHA256SUMS를 검증했다. 약464MiB 전체 이력 bundle과 기존 ZIP은 로컬에서 체크섬 일치 상태로 보존했다. 큰 bundle은 GitHub 파일 제한 때문에 commit하지 않는다.

기능 코드는 변경하지 않았으므로 테스트를 불필요하게 반복하지 않았다. 이전 단위1300/API522+UI778, Node13, 실제 브라우저5와 과거 DB56 증거를 보존했다. 원래 단위1296 증거도 ZIP의 baseline에 있다. 개인정보 법적 정책·실기기 알림/영상·일부 UI는 PARTIAL/UNKNOWN이며 운영 공개 전 완료해야 한다.

Cursor는 `CURSOR_EVENT_HUB_V6_HANDOFF.md`의 최신 상태 절을 읽고 원격 개발 브랜치에서 재개한다. 새 프로젝트나 완료 기능 재제작은 하지 않는다. 최신 commit SHA는 GitHub branch HEAD와 전달 상태 JSON을 기준으로 확인한다.

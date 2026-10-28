# BINPC2 최신 소스·Cursor 이어가기

> **2026-10-29 이어가기:** 이 ZIP은 `173f61f0`의 보존본이다. 최신 개발 브랜치를 이 ZIP으로 덮지 않는다. 이후 모집 오픈 확인 보완과 서비스 연결 상태는 [최신 실행 보고서](../DEPLOYMENT_RESULT_2026-10-29.md), [배포·백업 준비서](../DEPLOYMENT_BACKUP_AND_RELEASE_2026-10-29.md)를 먼저 확인한다.

소스 기준: `173f61f06c46f682b77dcd7633a304608d68d153` · `feat/event-hub-v6-20261027`.

[소스 ZIP](BINPC2-source-test-mode.zip)과 [SHA256](SHA256SUMS.txt)은 해당 커밋의 소스 스냅샷이다. 앱 자산과 원본 로고는 포함한다. 큰 검토 사진·PDF·포스터와 이전 압축물은 중복을 피하기 위해 제외했으며 별도 링크에서 받는다. 운영 DB·사용자 업로드·인증값·암호화키는 포함하지 않는다.

- 먼저 [최신 작업·테스트·배포 보고서](../LATEST_TEST_MODE_AND_DEPLOYMENT_2026-10-28.md)와 [Cursor 인계서](../CURSOR_EVENT_HUB_V6_HANDOFF.md)를 읽는다.
- [전체 112쪽 화면 PDF](../reviews/halloween-all-pages-20261028/BINPC2-ALL-PAGES.pdf)와 [후속 16쪽 PDF](../reviews/halloween-all-pages-20261028/test-mode/BINPC2-LATEST-SUPPLEMENT-16P.pdf)는 서로 다른 촬영 시점을 표시한다.
- [문안·포스터 ZIP](../campaign-20261028/BINPC2-CAMPAIGN-REVIEW-20261028.zip)은 실제 모집 게시물이 아닌 검토자료다.
- 새 작업 전 GitHub 개발 브랜치 최신 HEAD와 미커밋을 확인한다. 이 소스 SHA로 강제 되돌리지 않는다.
- 전체 테마·기존 신청 엔진·프로필 복구를 재개발하지 않는다. 기본 테스트 ON과 서버 신청 차단을 유지한다. 시험실은 별도 암호화 저장소만 사용하고 실제 운영 DB에 가짜 사용자를 넣지 않는다.
- 운영 배포 승인은 이미 받았으나 현재 환경의 서비스 접속·인증과 보호된 운영 백업/격리 복원은 미확인이다. 개인정보 정책·모집·사진·외부 발송·자동 삭제·금전 이동을 임의 승인하지 않는다.

기존 전체 Git bundle은 보존했다. 이번 증분 bundle 두 개도 검증했으며 선행 커밋과 체크섬은 `git-bundle-preservation.json`에 기록했다. 이는 소스 Git 이력용이며 운영 데이터 복원 증거가 아니다. 비공개 저장소의 키를 공개 소스 ZIP에 옮기지 않는다.

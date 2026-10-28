# 4번째 UI 참고 이미지 적용 — 실제 BINPC2 화면

2026-10-28 KST. 독립 HTML이나 합성 목업이 아니라 실제 React + Express + 격리 PostgreSQL에서 촬영했다. 화면 속 인원·입금·계좌·행사 지역은 합성 시험 데이터다. 운영 배포는 하지 않았다.

| 화면 | 변경 전 | 변경 후 |
|---|---|---|
| 중앙 신청·대기방·입장 버튼 | [기존 화면](before-home.png) | [현재 화면](home.png) |
| 사진·날짜·상태 행사 카드 | [기존 화면](before-list.png) | [현재 화면](list.png) |
| 공지·위치 탭과 상세 이미지 | 기존 V4 보고서 참고 | [현재 화면](detail.png) |
| 내 신청과 승인 상태 | 기존 V4 보고서 참고 | [목록](waiting-list.png) · [대기방](waiting-detail.png) |
| 통합 관리자 | [기존 화면](before-admin.png) | [현재 화면](admin.png) |
| 금요일·토요일 상품 | [기존 화면](before-products.png) | [현재 화면](products.png) |
| 서버 시작 전/후 입장 | 실제 시작 상태로 검사 | [시작 전](v4-home-before-start.png) · [시작 후](v4-home-after-start.png) |

변경 전 자료는 앞선 V4 검증 당시 실제 화면을 그대로 보존했다. 캡처 시점과 누적 시험 데이터 수는 다르다. 이번 이미지는 390px 모바일 또는 1440px 관리자 첫 화면이며, 긴 페이지 전체를 새 목업으로 재구성하지 않았다.

- [전체 보고서](../../EVENT_HUB_V4_VISUAL_REFINEMENT_2026-10-28.md)
- [기존 V4 보고서](../../EVENT_HUB_V4_UI_OPERATIONS_2026-10-28.md)
- [Cursor 인계](../../CURSOR_EVENT_HUB_V6_HANDOFF.md)

할로윈 장식은 해당 행사 안에만 적용한다. 사진은 새로 만든 **분위기 일러스트**이며 실제 매장 사진이 아니다. 전달받은 로고 8종은 수정하지 않았다. 참고 시안의 예시 날짜·가격·오픈채팅 모집 문구를 실제 정책으로 옮기지 않았다.

실제 클릭 영상: [모바일 신청·공지·장소 보호](mobile.mp4) · [통합관리·금토상품·신청자 선택](admin.mp4). 실제 앱의 내부 시험 화면 녹화이며, 운영 DB·외부 사이트에는 연결하지 않았다.

[현재 코드·보고서·화면·Cursor 인계 ZIP](BINPC2-V4-reference-Cursor.zip) · [다운로드 체크섬](SHA256SUMS.txt)

최종 UI 코드 `db93e1263e185fa41ddf42be510209fef044c21a` · [전체 자동검사 27개 단계 성공](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40660200816). 물리 갤럭시·아이폰 검사는 UNKNOWN.

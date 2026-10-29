# 실제 소스의 화면·서버 작업 목록

323개 제품 소스에서 1184개 연결 지점을 추출했습니다. **목록 작성은 실제 클릭·저장·전수검사 통과가 아닙니다.** 역할/상태별 실행 증거는 REQUIREMENTS.md와 validation.json을 따로 확인합니다. 동적으로 생성되는 메뉴와 모든 상태 조합은 이 정적 목록만으로 완전성을 보장하지 않습니다.

생성: `node scripts/generate-v12-source-inventory.mjs`

| 종류 | 수 |
|---|---:|
| background-or-timer | 132 |
| api-route | 69 |
| ui-control | 961 |
| business-action | 22 |

전체 파일·줄·이벤트 핸들러: [source-inventory.json](source-inventory.json). 전체 항목의 실행 상태는 SOURCE_INVENTORY_ONLY로 두며 실제 검사 결과와 혼동하지 않습니다.

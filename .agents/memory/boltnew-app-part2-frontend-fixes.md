---
name: boltnew-app Part 2 frontend fixes
description: 2026-08-08 Part 2 프론트엔드 수정 — BrowserGuidePopup 삭제, React key 경고 제거, stale setState 방지, 채팅 스크롤 위치 복원
---

## 수정 내용

### 1. BrowserGuidePopup 삭제
- `src/components/BrowserGuidePopup.tsx` 파일 삭제
- `App.tsx`에서 import, `showGuide` useState, `MATCHING_GUIDE_SHOWN_KEY` import, TutorialModal onClose의 관련 코드, 렌더 블록 전부 제거
- **주의**: useState 하나를 제거하면 HMR hooks 순서 불일치로 "Invalid hook call" 에러가 잠깐 발생하나, 브라우저 새로고침 시 해소됨. 정상 동작.

### 2. React key 경고 수정 (`key={i}` → 내용 기반)
- `GameDisplays.tsx` — options, pairs, participants, prizes 모두 content+index 복합 key
- `TableMiniGameModal.tsx` — participants span, roulette segments, ladder text/lines/bars/endCols, result rows
- `CreateGameModal.tsx` — QUICK_TEMPLATES buttons
- **규칙**: 동적으로 추가/삭제/재정렬이 가능한 배열은 index만으로 key를 쓰면 React state 오염 위험 → `key={\`prefix-${i}-${content}\`}` 패턴 사용

### 3. loadProfiles stale setState 방지 (App.tsx)
- `loadProfiles().catch().then()` 비동기 콜백이 컴포넌트 언마운트 후에도 setState를 호출하는 문제
- 수정: effect 시작 시 `let cancelled = false`; cleanup에서 `cancelled = true`; then 콜백 첫 줄에 `if (cancelled) return;`

### 4. ChatScreen 스크롤 위치 복원
- `_scrollPositionCache = new Map<string, number>()` — 모듈 레벨 (언마운트 이후도 유지)
- 언마운트 시 `chatId → scrollTop` 저장 (별도 useEffect cleanup)
- 재진입 시 초기 로드(prev===0, cur>1) 단계에서 캐시 확인 → 있으면 복원, 없으면 기존 scroll-to-bottom
- **Why**: React ref는 언마운트 시 null화되어 위치 보존 불가, localStorage는 과도한 write 비용 → 모듈 Map이 최적

## 검증 결과
- 유닛 테스트: 69/69 PASS
- 타입체크: 0 errors
- 브라우저 콘솔: 에러 없음

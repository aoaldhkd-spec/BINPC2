---
name: boltnew-app Part 2 frontend optimization
description: Part 2 렌더링·메모리누수·라우팅·콘솔 정리 결과 (2026-08-05)
---

## 메모리 누수 수정 (타이머 미정리)

| 파일 | 수정 내용 |
|------|-----------|
| `RouletteGame.tsx` | `spinTimer1Ref/spinTimer2Ref` 추가, useEffect 정리 |
| `LadderGame.tsx` | `ladderTimerRef/revealTimerRefs[]` 추가, useEffect 정리 |
| `GameAnnouncementModal.tsx` | `dismissTimerRef` 추가, handleVote setTimeout 관리 |
| `SeatManagementMode.tsx` | `toastTimerRef` 추가, showToast 중복 호출 방지 |

**Why:** 게임 모달이 언마운트될 때 진행 중인 타이머가 setVisible/setState를 호출하면 "Can't perform a React state update on an unmounted component" 경고 발생.

## Key 안티패턴 수정

- `ChatScreen.tsx:930` 연락처 카드 라인: `key={i}` → `key={line || String(i)}`
- `ChatScreen.tsx:1142` 빠른 메시지: `key={i}` → `key={qm}` (콘텐츠 기반 안정적 키)

## 채팅 input draft 보존

- `App.tsx`: `chatDraftRef = useRef<Map<string, string>>(new Map())` 추가
- `ChatScreen` props: `initialInput`, `onInputChange` 추가
- 뒤로가기 후 재진입 시 chatId별 초안 자동 복원 (Map 유지, 로그아웃 시 자연히 소멸)

## 렌더링 최적화 — 남은 항목

- 메시지 행 React.memo화: 복잡도로 인해 별도 작업 권장
  - 수백 개 메시지에서 showEmoji/showStickers 상태 변경 시 전체 재렌더 발생
  - 해결책: 각 핸들러를 useCallback으로 감싼 뒤 MessageRow를 memo 컴포넌트로 추출
  - 선행 조건: onMsgTouchStart/Move/End, handleTap, handleMsgContextMenu를 useCallback화

## IDOR guard `.in()` 필터 지원

- `loadChatList` 함수가 `.in('chat_id', chatIds)` 쿼리를 사용
- 기존 guard가 `eq`만 허용 → 403 발생
- 수정: `eq` (단일 채팅방) + `in` (일괄 조회) 둘 다 참여자 검증

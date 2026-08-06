---
name: boltnew-app audio removal
description: 음악·효과음 전체 제거 + 에러 방어 추가 (2026-08-06)
---

# 음악 전체 제거

## 처리 목록
- `lib/bgm.ts` → 빈 stub (내보내기 없음)
- `lib/sounds.ts` → no-op stub (`export function playCuteSound() {}`) — 테스트 mock 호환 유지
- `components/BgmButton.tsx` → `export function BgmButton() { return null; }` stub
- `main.tsx` → BgmButton import/렌더링 제거
- `App.tsx` → `playCuteSound` 함수(44줄) 제거 + 호출부 제거
- `hooks/useChat.ts` → playCuteSound import + 2곳 호출 제거
- `components/TutorialVideo.tsx` → audioRef·muted state·3개 audio useEffect·Volume 버튼 제거; Volume2/VolumeX lucide import 제거
- `components/WaitingOverlay.tsx` → waitingAudioRef·waitingMuted·toggleWaitingMute·audio useEffect·볼륨 버튼 제거; Volume2/VolumeX import 제거
- `components/DrinkFloatButton.tsx` → playClink 함수(24줄) 제거 + 호출 제거 (TTS는 유지)
- `components/ResetButton.tsx` → playClink 함수(48줄) 제거 + 호출 제거 (TTS는 유지)
- `AdminApp.tsx` drinkPopup useEffect → playClink 함수(43줄) + 호출 제거; TTS(speakLoud)는 유지

## TrimSeatsButton 제거
- AdminApp.tsx에서 TrimSeatsButton 컴포넌트(44줄) 완전 삭제
- DashboardTab "자리 설정" 섹션 삭제

## 에러 방어 강화 (HIGH severity)
- `useGames.ts` loadBalanceGames·loadMyVotes → try/catch 추가
- `useSeating.ts` loadSeats → try/catch 추가
- `useHearts.ts` handleContactShare → outer try/catch 추가
- `ChatScreen.tsx` onMsgTouchStart·onMsgTouchMove → `if (!e.touches.length) return` 가드
- `MainScreen.tsx` FileReader.onload async → try/catch+finally(setPhotoUploading); nickname[0] → `nickname?.[0] ?? '?'`
- `App.tsx` profiles JSON parse → `Array.isArray(parsed)` 검증 추가
- `TestDashboard.tsx` load() → `.catch(e => console.error(...))` 추가

## Why
**sounds.ts를 완전 삭제하지 않은 이유**: 테스트 파일(unread-badge·chat-read-status)이 `vi.mock('../lib/sounds', ...)` 로 mock. 파일 삭제 시 테스트 실패 → no-op stub으로 유지.

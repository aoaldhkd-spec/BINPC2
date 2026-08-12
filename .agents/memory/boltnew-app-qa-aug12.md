---
name: boltnew-app QA fixes 2026-08-12
description: 28-point QA 체크리스트 실행 중 발견·수정된 버그 목록과 수정 원칙
---

# QA 수정 항목 (2026-08-12)

## 수정된 버그 (이 세션)
- **App.tsx handleNicknameSetup**: try/finally 없어 loading 영구 true → 전체 try/catch/finally 래핑
- **App.tsx handleProfileRecovery**: 동일 패턴 → try/catch/finally 래핑
- **App.tsx submitSuggestion**: try/catch 없어 에러 시 caller에서 button 영구 disable → try/catch 추가 + re-throw
- **App.tsx openGroupChat**: `.then()` 에 rejection handler 없어 unhandled rejection → `.catch()` 추가
- **MainScreen.tsx suggestion button**: setSuggestionSubmitting(false) 가 try/finally 아닌 직렬 실행 → try/finally 추가
- **MainScreen.tsx FileReader**: onerror handler 없어 photoUploading 영구 true 가능 → onerror 추가
- **MainScreen.tsx clipboard**: navigator.clipboard.writeText(x) 가 비HTTPS에서 TypeError → optional chaining + .catch() 추가
- **MainScreen.tsx lockToast**: setTimeout cleanup ref 없어 unmount 후 setState 위험 → lockToastTimerRef + clearTimeout 추가
- **useGroupChat.ts loadGroupMessages**: DB rows + pending 낙관적 merge 후 정렬 없음 → created_at .sort() 추가
- **메시지 길이 제한**: 프론트/백엔드 모두 없었음 → MAX_MSG_LEN=1000 (useChat, useGroupChat, ChatScreen maxLength, GroupChatScreen guard)

## 제거된 파일
- `artifacts/boltnew-app/src/components/MainScreen.tsx.bak`
- `artifacts/boltnew-app/src/components/WaitingOverlay.tsx.bak`

## 테스트 결과
- 타입체크: 0 errors
- 단위 테스트: 74/74 pass
- E2E (Playwright): success — 앱 진입, PIN 복구, 메인화면 진입, 채팅 1000자 제한 모두 확인

## 수정 원칙
**Why:** async 함수에서 finally 없이 setLoading(false)를 조건부로만 호출하면 예외 발생 시 loading이 영구 true로 고착됨.
**How to apply:** 모든 async 핸들러(form submit, profile recovery 등)는 try/catch/finally 구조로 loading/submitting state를 반드시 finally에서 초기화.

---
name: boltnew-app defensive hardening 2026-08-05
description: 채팅 시스템 방어적 프로그래밍 — 네트워크/SSE 장애 대응, 에러 바운더리, 메모리 누수 차단
---

## 구축된 안전장치 8가지

### 1. sendMessage 자동 재시도 (useChat.ts)
- **이전**: 네트워크 오류 시 즉시 낙관적 메시지 롤백
- **이후**: 3회 재시도 (지수 백오프 1s→2s→4s), 재시도 중 낙관적 메시지 유지
- **분실 복구**: insert 오류 시 같은 client_id로 DB 재조회 → 이미 저장됐으면 교체 성공
- **Why**: 일시적 네트워크 끊김으로 메시지가 사라지는 현상 완전 방지

### 2. SSE 지수 백오프 + 지터 (localdb.ts)
- **이전**: 5초 고정 간격으로 재연결 시도 → 서버 재시작 후 모든 클라이언트 동시 재연결
- **이후**: `_sseFailCount`로 연속 실패 추적, base=min(2^n*1000, 30000) + random(0~3000)ms 지터
- **성공 시**: `_sseFailCount=0`, `_sseNextAllowedRetry=0` 리셋
- **Why**: 150명 동시 재연결로 서버 과부하(thundering herd) 방지

### 3. 폴링 중첩 방지 (useChat.ts)
- **이전**: 8초 인터벌이 이전 loadMessages 완료 전 다음 호출 가능
- **이후**: 클로저 스코프 `isPolling` 플래그 — 이전 폴링 중이면 skip
- **Why**: 서버 응답이 8초 초과할 때 폴링이 쌓여 서버 과부하 방지

### 4. 메시지 배열 상한 `MAX_MESSAGES = 500` (useChat.ts)
- **이전**: 채팅방 open 시간이 길어지면 메시지 배열 무한 증가
- **이후**: loadMessages 결과가 500개 초과 시 오래된 것부터 제거
- **Why**: 장시간 세션에서 메모리 누수 방지

### 5. SSE 페이로드 엄격 검증 (useChat.ts)
- **위치**: `chat:${chatId}` 채널 INSERT 핸들러 + `msgs:${chatId}` perChatChannels 핸들러
- **검증 내용**: `payload.new.id`, `payload.new.sender_id`, `payload.new.chat_id`가 non-empty string인지 확인
- **Why**: 서버에서 malformed 데이터가 오면 즉시 차단, setState 오염 방지

### 6. ChatErrorBoundary (새 파일: components/ChatErrorBoundary.tsx)
- **React class component** with `getDerivedStateFromError` + `componentDidCatch`
- **Fallback UI**: 💬 이모지 + "다시 시도" 버튼 → `onReset`으로 채팅 상태 초기화 후 메인으로 복귀
- **적용 위치**: App.tsx의 `view === 'chat'` 조건 블록 전체를 감쌈
- **Why**: ChatScreen 내부 예외가 전체 앱 White Screen을 유발하지 않도록

### 7. 폴링 루프 자체 보호 (기존 유지)
- 3회 연속 실패 시 폴링 중단 (`pollFailCount >= 3`)
- 채팅방 변경 시 이전 채팅방 폴링 즉시 skip (`chatIdRef.current !== chatId`)

### 8. sendImage 이미지 전송 고아 파일 정리 (기존 유지)
- 업로드 완료 후 채팅방 변경 감지 시 storage에서 파일 즉시 삭제

## 변경된 파일
- `src/hooks/useChat.ts` — 안전장치 1,3,4,5
- `src/lib/localdb.ts` — 안전장치 2
- `src/components/ChatErrorBoundary.tsx` — 안전장치 6 (NEW)
- `src/App.tsx` — ChatErrorBoundary import + 래핑

## 기존 기능 영향
- TypeScript 오류: 0건
- 단위 테스트: 60개 모두 통과
- ChatScreen 내부 (메시지/이미지/하트/이모지/스티커/답장/읽음): 변경 없음

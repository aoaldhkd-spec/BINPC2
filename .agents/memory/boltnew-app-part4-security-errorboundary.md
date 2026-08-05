---
name: boltnew-app Part 4 — 최고 수준 보안 및 Fail-Safe
description: XSS·IDOR·Error Boundary 전수 강화 (2026-08-05 Part 4)
---

## Item 12: XSS & SQLi 완벽 방어

**현황 (SAFE):**
- React JSX 렌더링 — auto-escaping 적용. `dangerouslySetInnerHTML` 사용 없음.
- `sanitizeStr` — `/<[^>]*>/g` 로 HTML 태그 제거. `sanitizeRow` — 모든 `/op` INSERT/UPDATE/UPSERT 경로에서 호출됨.
- 모든 `pool.query()` — `$1/$2` 파라미터화. 동적 SQL 문자열 interpolation 없음.

**추가 수정:**
- `admin_update_profile` RPC: 기존에 `sanitizeRow` 미적용 → `sanitizeRow('profiles', patch)` 추가.

## Item 13: IDOR 완전 차단

**메시지 (기존):** 4-layer guard (requesterId 필수 + chat_id 필터 필수 + 참여자 검증 + 없는 chatId → 빈 배열).

**신규 추가:**

| 경로 | 이전 | 수정 후 |
|------|------|---------|
| `chats` SELECT | requesterId 없어도 전체 반환 | requesterId 필수; 참여자 채팅방만 반환 (서버 측 필터) |
| `/unread-counts` GET | 임의 userId로 타인 미읽음 조회 가능 | SSE 토큰 검증 (query param `token` 또는 `x-sse-token` 헤더) |
| `admin_invalidate_session` RPC | 비밀번호 없이 호출 가능 | `checkPassword()` 추가 |
| `admin_auth_phone` RPC | 비밀번호 없이 호출 가능 | `checkPassword()` 추가 |

**주의 (chats SELECT guard):**
- `tableData`는 store 배열의 참조 → splice로 변이하면 store 데이터가 파괴됨.
- 반드시 `tableData.filter(...)` 로 새 배열을 만들어 `scopedResult`를 별도 처리해야 함.
- 수정 패턴: scopedResult에 applyFilters/sort/limit/single 로직을 분리하여 조기 반환.

**Why:** `/unread-counts`는 userId만 알면 타인의 채팅 존재 여부를 파악 가능 → 프라이버시 침해.
`chats` SELECT 무방비 시 전체 채팅 참여자 목록 유출 가능.

## Item 14: 전역 Error Boundary + Graceful Degradation

**기존 경계:**
- `AppErrorBoundary` (컴포넌트, `AppErrorBoundary.tsx`) — 프로필 뷰 감쌈.
- `ChatErrorBoundary` (`ChatErrorBoundary.tsx`) — 채팅 뷰 감쌈.
- `StatusErrorBoundary` (private class, `MainScreen.tsx`) — 상태 탭 감쌈.
- Root `AppErrorBoundary` (class, `main.tsx`) — 앱 전체 최후 방어.

**신규 추가:**
- `QaGameOverlay` → `<AppErrorBoundary screenName="Q&A 게임" onReset={() => setQaOverlayVisible(false)}>` 감쌈.
- `GameAnnouncementModal` (main 뷰) → `<AppErrorBoundary screenName="게임 공지" onReset={() => setGameModalVisible(false)}>` 감쌈.
- Root boundary의 `error.message` 직접 노출 → `"잠시 후 다시 시도해 주세요"` 로 교체 (원시 예외 메시지 사용자 노출 차단).

**ReconnectOverlay:**
- `"연결이 끊겼습니다"` → `"연결 지연 중"` 으로 변경 (요구사항).
- 서브텍스트: `"데이터는 안전합니다. 잠시만 기다려 주세요"` 추가.

## 테스트 mock 업데이트
- `unread-badge.test.ts` / `chat-read-status.test.ts` — `localdb` mock에 `getSseToken: vi.fn(() => 'test-sse-token')` 추가.
- 60/60 테스트 통과.

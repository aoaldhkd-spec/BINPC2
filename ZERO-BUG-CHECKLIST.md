# 🛡 Zero-Bug 재발방지 체크리스트

> **새 코드를 커밋하기 전, 아래 목록을 체크하세요.**  
> 이 파일은 실제 발견된 버그 패턴에서 추출된 규칙입니다.

---

## ✅ React Hooks

| # | 규칙 | 나쁜 예 | 좋은 예 |
|---|------|---------|---------|
| H1 | useEffect deps에 읽는 값 전부 포함 | `}, [showModal])` (안에서 `profile` 읽지만 누락) | `}, [showModal, profile])` |
| H2 | setTimeout/setInterval은 반드시 ref + cleanup | `setTimeout(() => setState(...), 1400)` | `timerRef.current = setTimeout(...); useEffect(() => () => clearTimeout(timerRef.current), [])` |
| H3 | fetch/await에 AbortController 타이머는 try/finally | `clearTimeout(timer)` (fetch가 throw하면 실행 안 됨) | `try { await fetch(...) } finally { clearTimeout(timer) }` |
| H4 | 낙관적 rollback은 맹목적 restore 금지 | `catch(() => { setState(prev+removed) })` | `catch(() => { syncFromServer() })` |
| H5 | 동일 채널을 두 곳에서 구독 시 이중 state update 차단 | 두 채널 모두 `setChatList` 호출 | 활성 채팅방은 `chat:${id}`, 나머지는 `msgs:${id}` — early return으로 구분 |

---

## ✅ 보안 (Backend)

| # | 규칙 | 확인 위치 |
|---|------|-----------|
| S1 | 새 테이블 SELECT → `requesterId` 소유자 스코프 추가 여부 | `db.ts` SELECT 블록 |
| S2 | 새 테이블 INSERT → liker_id/reader_id/sender_id는 `requesterId`로 **강제 덮어쓰기** (불일치 체크만으로 부족) | `db.ts` INSERT 블록 |
| S3 | 새 테이블 DELETE → 민감 테이블은 `requesterId` 필수화 | `db.ts` DELETE 블록 |
| S4 | 새 자유 텍스트 필드 → `FIELD_LIMITS`에 등록 | `db.ts:120` |
| S5 | 새 RPC → `ALLOWED_RPCS` Set에 추가 | `db.ts` ALLOWED_RPCS 선언부 |
| S6 | 새 Map 선언 → 주기적 pruning 추가 (공격자 IP 폭탄 방지) | `setInterval` 패턴 참조 |

---

## ✅ 에러 처리

| # | 규칙 | 나쁜 예 | 좋은 예 |
|---|------|---------|---------|
| E1 | 새 라우터 핸들러에 외부 try-catch | 없음 | `router.post('/x', (req,res) => { try { ... } catch(e) { if (!res.headersSent) res.status(500).json({}) } })` |
| E2 | 새 UI 컴포넌트(모달/다이얼로그)에 ErrorBoundary | `<MyModal />` | `<AppErrorBoundary onReset={() => setModal(null)}><MyModal /></AppErrorBoundary>` |
| E3 | async 핸들러에서 `if (!res.headersSent) return res.status(500)...` | 리턴 후 미처리 경로 | 항상 마지막에 bare `return;` 추가 |

---

## ✅ 메모리 누수 방지

| # | 규칙 |
|---|------|
| M1 | `new Map()` 전역 선언 → `setInterval`로 stale key pruning |
| M2 | SSE 클라이언트 제거 → `cleanupConn()` 호출 (단순 `clearInterval`만으로 부족) |
| M3 | imageStore — 현재 pruning 없음. 서버 재시작으로 해결 중. 향후 LRU eviction 필요 |

---

## ✅ 검증 명령어 (커밋 전 실행)

```bash
# 프론트엔드
cd artifacts/boltnew-app
pnpm typecheck          # 타입 에러 0개 확인
pnpm test:unit          # 69/69 통과 확인

# 백엔드
cd artifacts/api-server
pnpm typecheck          # 타입 에러 0개 확인

# 부하 테스트 (선택)
BASE_URL=http://localhost:8080 node artifacts/api-server/scripts/stress-test.mjs
```

---

## 📋 버그 발견 → 수정 → 재발방지 사이클

1. **발견**: `pnpm test:unit` 실패 또는 코드 리뷰에서 패턴 감지
2. **수정**: 최소 변경 원칙 — 동작하는 코드를 불필요하게 건드리지 않음
3. **재발방지**: 위 체크리스트에 새 규칙 추가 + 테스트 케이스 추가
4. **검증**: 타입체크 + 유닛테스트 + 스트레스테스트 전부 통과 후 커밋

---

*마지막 업데이트: 2026-08-08 — 15단계 E2E 전수감사 완료 기준*

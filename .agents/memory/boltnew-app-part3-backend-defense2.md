---
name: boltnew-app Part 3 backend defense (Part 2 of audit)
description: 2026-08-06 Part 3 백엔드 추가 수정 — try-catch, 커넥션 누수, 페이로드 검증
---

# Part 3 신규 수정 (db.ts)

## Item 9 — try-catch 보완
- `dbPersistImage()`: 내부 pool.query에 try-catch 추가 + 호출자로 re-throw

## Item 10 — DB 커넥션 누수 방지
- `setupListenClient()`: `let client: pg.Client | null = null`을 try 외부로 이동
- catch 블록에서 `if (client) client!.end().catch(()=>{})` 추가
- `client.on('error')` 핸들러 내부에서도 `client!.end()` (non-null assertion 필요 — TS 클로저 narrowing 미작동)

**Why:** client.connect() 성공 후 LISTEN 실패 시 기존 코드는 catch에서 client 참조 불가 → pg.Client 커넥션 영구 누수. 

## Item 11 — 페이로드 검증 강화
| 위치 | 수정 |
|------|------|
| /broadcast | req.body null/배열 → 400 guard 추가 |
| /broadcast | x-forwarded-for Array.isArray 처리 (`.split()` TypeError 방지) |
| /admin/clear-db-errors | req.body null → 400 guard 추가 |
| /unread-counts | req.query.token typeof string 검사 (배열 전달 시 verifySseToken 파싱 오류 방지) |
| /auth/login | req.body null → 400 guard 추가 (기존 필드 검사 이전) |

## How to apply
- 새 라우트 추가 시 맨 앞에 body-object guard 필수:
  `if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400)...`
- req.query 파라미터는 반드시 `typeof x === 'string'` 검사 후 사용
- req.headers['x-forwarded-for']는 `typeof xfwd === 'string' ? xfwd : Array.isArray(xfwd) ? xfwd[0] : fallback` 패턴

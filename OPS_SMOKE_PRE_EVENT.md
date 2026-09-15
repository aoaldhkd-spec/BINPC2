# BINPC2 행사 전 운영 스모크 체크

목적: SSE/세션/하트·채팅·단체방을 실제 배포에서 확인한다. 비밀번호, sessionToken, SSE token, cookie 값은 로그·스크린샷·쉘 history에 남기지 않는다.

## 1. 배포 설정 확인

- Render 서비스가 **starter / always-on**, `numInstances=1`인지 확인한다. SSE 연결 집합은 프로세스 로컬이다.
- Render 환경변수 확인: `PG_POOL_MAX=10` 이하, `SESSION_SECRET` 존재, `DATABASE_URL`은 현재 DB, `NODE_ENV=production`.
- Netlify `VITE_SSE_ORIGIN`이 실제 Render API origin인지 확인한다. 현재 repo 기본값은 `https://binpc2.onrender.com`이다.
- Netlify `/api/*` proxy가 `Cache-Control: no-cache, no-store, no-transform`을 유지하는지 확인한다.
- Render/Netlify access log와 analytics에 `/api/db/events?...token=...`의 query string을 기록하지 않는지 확인한다. debug request logging을 행사 중 켜지 않는다.

## 2. 기본 health / readiness

값을 파일이나 명령 history에 저장하지 않고 공개 health만 확인한다.

```bash
curl -fsS https://binpc2.onrender.com/api/healthz
curl -fsS https://binpc2.onrender.com/api/db/ready
```

확인 결과:

- health HTTP 200
- ready 응답이 DB 초기화 중이 아님
- Render restart/OOM/CPU/heap 그래프에 지속 상승이 없음
- Admin DB health의 401/403/429 및 persist error 누계가 행사 시작 전 기준선과 일치

## 3. 브라우저 두 사용자 기능 스모크

테스트 계정/프로필의 실제 PIN과 토큰을 문서에 적지 않는다.

1. 사용자 A/B가 입장하고 새로고침해도 같은 프로필·세션으로 복귀한다.
2. A → B 하트 전송: A 보낸 하트와 B 받은 하트가 각각 갱신된다.
3. A ↔ B 채팅 메시지 전송: 텍스트/이미지(필요 시)와 읽음 배지가 갱신된다.
4. 단체방 입장·메시지·나가기 후 목록과 메시지가 맞는다.
5. 프로필 아바타 조회/업로드가 유지된다.
6. 설정에서 session active / functions lock 변경 시 참가자 화면이 의도대로 잠기고, 일반 네트워크 복구가 사용자를 로그아웃시키지 않는다.

## 4. SSE 단절·복구 스모크

Chrome DevTools Network에서 `/api/db/events`가 **Render direct origin**으로 연결되는지 확인한다.

1. 사용자 A 화면에서 SSE 요청이 `200`, `text/event-stream`, 15초 이내 ping을 받는지 확인한다.
2. DevTools Network throttling을 Offline으로 5–10초 둔 뒤 Online으로 돌린다.
3. `연결 복구 중` 배너가 나타나도 프로필/하트/채팅 세션이 사라지지 않는지 확인한다.
4. 복구 후 프로필, 보낸/받은 하트, 채팅 목록, 단체방 목록이 최신 상태인지 확인한다.
5. 탭을 21분 이상 백그라운드로 둘 수 있는 staging 환경에서는 foreground 복귀 후 HTTP SoT catchup이 실행되는지 확인한다. 운영에서 21분을 기다리는 대신 visibility 이벤트와 `/op` 요청 재발생을 관찰한다.
6. 서버 rolling restart/redeploy 한 번을 staging에서 실행하고 shutdown/reconnect 뒤 메시지 누락·중복이 없는지 확인한다.
7. `연결 실패` 화면이 나와도 `다시 시도` 후 세션을 유지하고 profiles/hearts/chat/groups가 모두 재조회되는지 확인한다.

## 5. 서버 로그 / 종료 기준

- SSE access log에 token 원문, cookie 원문, session bearer 원문이 없어야 한다.
- 정상적인 token refresh/재연결로 401/429가 계속 증가하지 않아야 한다.
- LISTEN reconnect 이후 25초 hot resync가 정상 완료되어야 한다.
- `EMAXCONNSESSION`, `pool exhausted`, `OOM`, 반복적인 `LISTEN reconnect failed`, SSE capacity 429가 있으면 행사를 시작하지 않고 원인을 먼저 해결한다.
- 오류가 사라졌다는 이유로 `SESSION_MAX_AGE`, SSE TTL, pool cap, single-instance 제약을 임의로 줄이거나 제거하지 않는다.

## 결과 기록

- 실행 시각(Asia/Seoul), 배포 commit, Render service/deploy id, Netlify deploy id
- health/ready 결과
- SSE ping/reconnect 결과
- A/B heart/chat/group 결과
- 로그에 token 원문이 없다는 확인
- 실패 항목, 추적 ID, 조치 및 재검증 결과

토큰·비밀번호·PII는 결과 기록에 포함하지 않는다.

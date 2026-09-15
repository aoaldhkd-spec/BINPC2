# BINPC2 실시간·웹 전수조사 감사

작성일: 2026-09-15  
대상: `artifacts/boltnew-app`, `artifacts/api-server`, Netlify/Render 배포 설정  
원칙: 네트워크·프로세스·DB 장애가 사라진다고 약속하지 않는다. 대신 재연결, 중복, 누락, 세션 이탈, 폭주를 코드와 테스트로 최대한 흡수한다.

## 결론

- **실시간 정상 경로**: 단일 브라우저 `EventSource` → SSE 토큰 → Last-Event-ID/링 재전송 → 도메인별 HTTP SoT 재동기화 → idempotent apply 순서가 구현되어 있다.
- **이번 감사에서 수정한 실제 결함**: 토큰 교체/재연결 때 닫힌 이전 `EventSource`의 늦은 `onerror`가 새 연결을 `_es = null`로 만들고 가짜 백오프를 걸 수 있던 경쟁 상태. 이전 소스의 `onmessage`도 새 스트림에 섞일 수 있어 두 콜백 모두 현재 소스인지 확인한다.
- **이전 단계에서 반영·재확인한 결함**: 부분 프로필 응답이 사용자의 `matching_app_user_id`를 지우던 경로 제거, SSE fallback 6개 읽기 배치의 overlap 방지, 3초 재시도 주기.
- **서버 보강**: PostgreSQL `LISTEN`이 `error` 없이 `end`만 발생하는 경우에도 세대·단일 타이머로 재연결하고 hot-table resync를 수행한다.
- **절대적 영구 보장**: 불가능하다. Render 프로세스 종료, DNS/TCP 단절, Postgres 장애 중에는 지연 또는 일시적인 stale 화면이 남을 수 있으며 아래 residual/ops 항목을 운영해야 한다.

## Severity별 결과

### P0 — 즉시 조치

없음. 인증 우회, 전체 사용자 PII 노출, 재연결 무한 폭주를 새로 확인하지 못했다.

### P1 — 수정 완료

1. **SSE 소스 교체 후 stale callback race**
   - 원인: `setSseToken()`/wake 복구가 기존 `EventSource`를 닫고 새 소스를 만들 때, 브라우저가 기존 소스의 늦은 `onerror`를 호출할 수 있었다. 기존 핸들러는 새 `_es`가 있어도 `_es = null`, 실패 백오프, resync 상태 변경을 수행했다.
   - 수정: `onmessage`/`onerror` 시작부에서 `_es === es`를 확인하고, CLOSED 처리도 동일 소스일 때만 전역 포인터를 변경한다.
   - 검증: `localdb-long-session.test.ts`에 token refresh 중 old source callback 회귀 테스트 추가.

2. **프로필 부팅 중 임시 누락이 로그아웃처럼 보이던 경로**
   - 원인: 전체 프로필 목록은 일부 보이지만 내 행이 direct fetch에서 잠시 안 보이면 local identity를 지우고 recovery로 보냈다.
   - 수정: partial/empty 결과 모두 identity를 보존하고 재시도한다. 초기 backoff 이후에도 백그라운드 재시도를 계속한다. 실제 admin wipe는 명시적인 reset signal 경로로만 처리한다.

3. **SSE 장애 중 fallback poll 겹침**
   - 원인: 6개 도메인 로드를 interval로 시작했지만 느린 Render cold start가 끝나기 전 다음 tick이 시작될 수 있었다.
   - 수정: 한 배치가 끝날 때까지 다음 배치를 막고 `Promise.allSettled`로 모든 완료 경로를 해제한다. API retry/429가 outage를 증폭시키지 않도록 polling을 안전한 fallback으로 제한했다.

4. **Postgres LISTEN의 end-only 종료**
   - 원인: 일부 DB/proxy 종료는 `error` 없이 `end`만 발생할 수 있다.
   - 수정: active client의 `end`를 감시하고, error/end/setup 실패가 한 generation에서 중복 타이머를 만들지 않도록 단일 reconnect scheduler를 사용한다. 재연결 후 hot-table resync를 수행한다.

### P2 — 수정·검증 완료

- 복구 체감 시간: `PROFILE_BOOT_EXHAUSTED_RETRY_MS`, SSE reconnect/error fallback 모두 **3,000ms**. 배치 overlap 방지와 identity 보존은 유지한다.
- SSE token은 1시간 TTL의 80% 시점에 선제 발급하며, user-id jitter와 in-flight coalescing으로 동시 입장 폭주를 줄인다.
- 토큰 만료 EventSource를 닫아 동일 URL의 native 401 retry loop를 막는다.
- 서버 keep-alive 15초, client ping zombie 감시 45초, SSE socket timeout 105초로 silent drop을 감지한다.
- visibility 복귀/online 이벤트에서 token·Last-Event-ID를 보정하고, 링이 20분보다 오래된 경우 HTTP merge-by-id로 따라잡는다.
- reconnect resync callback은 1.5초 창에서 coalesce하며, 메시지/하트/단체방/연락처 apply는 ID 기반 중복 방어와 재조회 경로를 갖는다.
- admin SSE는 일반 사용자 SSE와 별도 집합이며, shutdown 시 `retry: 100` + shutdown event를 먼저 보낸다.
- PG pool은 hard cap 10, dedicated LISTEN client, idle pool error listener를 사용한다.
- Render는 `numInstances: 1`, Netlify는 SSE만 Render direct origin으로 연결하도록 고정되어 있다.

## 전수조사 체크리스트

### A. Realtime

- **Resume**: 서버는 `Last-Event-ID` header/query를 읽고 20분 링에서 사용자 대상 이벤트를 재전송한다. 대량 gap은 `catchup`으로 바꿔 HTTP SoT reload를 호출한다.
- **Cross-instance**: PG `LISTEN/NOTIFY`는 generation-serialized reconnect를 사용한다. periodic 120초 full server resync와 25초 hot-table resync가 보완한다. SSE ring sequence는 process-local이므로 instance 전환에서는 full/SoT resync가 필요하다.
- **Token/session**: 1시간 SSE HMAC token, 7일 session bearer/cookie, proactive refresh, wake refresh, 401 retry가 확인됐다. session TTL을 줄이지 않았다.
- **Network/sleep**: browser offline/online, visibility, connecting grace, zombie ping, socket timeout, delayed reconnect UI를 확인했다.
- **Storm/leak**: EventSource 하나를 채널들이 공유하고 unsubscribe 마지막 listener에서 닫는다. fallback batch는 overlap 금지, reconnect reload는 coalesce, server keepalive/connection maps는 close/aborted/socket close에서 정리한다.
- **Domain apply**: profiles, privacy/signals, likes/hearts, chats/messages, group chats, app settings, notifications, contact-share를 각각 확인했다. SSE 누락 시 visibility/reconnect/fallback HTTP loader가 SoT를 보정한다.

### B. Web 전체

- **Auth**: requesterId는 cookie/bearer 검증 결과와 바인딩된다. private table SELECT/insert/update/delete ownership guard와 admin HMAC 경계를 확인했다.
- **Entry/profile boot**: entry password/date-code 제거 상태를 확인했다. transient profile read는 identity를 삭제하지 않는다. PIN recovery와 명시적 reset만 recovery 진입을 만든다.
- **Wipe**: admin reset signal이 client wipe planner로 전달되고, sales report durable table은 wipe plan에서 제외된다. avatars/SSE/session bearer를 일반 reconnect가 삭제하지 않는다.
- **Rate/error**: API 502/503/504/429 재시도와 Retry-After, login/SSE token limits, likes/broadcast/storage guards, active op cap, error metrics를 확인했다. client fallback은 연결 오류를 전역 logout으로 바꾸지 않는다.
- **PII/admin**: sales report는 aggregate/no PII 설계, admin SSE는 HMAC, logs serializer는 cookie/set-cookie를 redact한다. SSE query token은 운영 로그/프록시 정책에서 별도 취급해야 한다(아래 residual).
- **Security headers/deploy**: Helmet은 유지하고 CSP enforce는 하지 않는다. avatar 외부 이미지 허용, Netlify API proxy, Render single-instance/PG cap/warm-up 설정을 확인했다.
- **Coach/tutorial/UI**: coach mark navigation은 main tab을 의도적으로 바꾸지만 auth/session state를 지우지 않는다. missing anchor는 fallback tip이며 realtime lifecycle과 직접 연결되지 않는다.

## 남은 위험과 운영 항목

### P1 residual

- **Render/네트워크 장기 장애**: 3초는 재시도 시작 간격이지 복구 보장이 아니다. 장기 장애에서는 fallback이 최신 데이터를 만들 수 없다. UI는 reconnecting/error 상태를 표시하고, 복구 시 SoT reload한다.
- **SSE token query 노출면**: 브라우저 EventSource의 직접 cross-origin 인증 때문에 token이 URL query에 있다. 현재 이벤트 access log는 제외/serializer 제한이지만 Render/CDN/proxy debug log와 브라우저 telemetry 설정을 확인하고 token을 기록하지 않아야 한다. 장기적으로는 same-origin SSE proxy 또는 HttpOnly 인증 cookie가 더 안전하다.
- **Production evidence**: 이 box에는 Render/Netlify live 로그·metrics 자격증명이 없어 실제 EMAXCONNSESSION, OOM, proxy idle termination 발생 여부를 단정할 수 없다.

### P2 residual

- **20분 초과 background sleep**: 링 replay가 아니라 HTTP merge-by-id로 보정하므로 이벤트 순간성은 사라질 수 있다. 채팅/하트의 SoT reload가 성공해야 최종 상태가 맞는다.
- **LISTEN gap**: reconnect scheduler와 25초 hot resync가 보완하지만, DB 장애 중 즉시 NOTIFY 전달은 불가능하다.
- **Fallback 부하**: 3초마다 최대 6개 read가 가능하다. in-flight guard로 중첩은 막지만, 행사 규모가 커지면 서버 환경변수와 endpoint metrics를 보고 주기를 늘려야 한다.
- **In-memory limits**: per-process SSE/rate maps는 Render single-instance 전제다. autoscale을 켜면 NOTIFY는 일부 보완해도 connection/rate state는 전역이 아니다.
- **Monorepo typecheck**: boltnew-app typecheck와 `verify:ci`는 통과한다. 별도 root `pnpm typecheck`에는 기존 api-server test/type errors가 남아 있어 이 감사에서 unrelated 대량 수정은 하지 않았다.

### P3 / ops-only

1. Render `numInstances: 1`, starter always-on, `PG_POOL_MAX <= 10` 유지.
2. Netlify `VITE_SSE_ORIGIN`이 실제 Render API와 일치하는지 배포마다 확인.
3. Render health/CPU/heap/restart/connection count와 `/api/db` 401/403/429 metrics를 행사 전후 확인.
4. admin DB health에서 누적 persist error와 HTTP metrics를 확인하고, reset 전 원인을 보존한다.
5. production smoke: 두 사용자 heart/chat/group, SSE reconnect, browser sleep/wake, server redeploy, admin reset/wipe, avatar upload를 실제 환경에서 실행한다.

## 검증

- `corepack pnpm run verify:ci` — 통과
- `corepack pnpm --dir artifacts/boltnew-app exec vitest run ...` — realtime long-session/recovery/timing tests 통과
- `corepack pnpm --dir artifacts/boltnew-app run typecheck` — 통과
- 신규 회귀 테스트: stale EventSource callback, LISTEN end-only source guard

이 문서는 “영구 해결” 선언이 아니라, 현재 코드에서 재현·검증 가능한 끊김/세션 이탈/폭주 위험을 분리하고 운영에서 확인해야 할 한계를 기록한 것이다.

// Supabase-shaped compatibility API backed by the local Express server.
// Auth/RLS/Realtime/Storage는 쓰지 않습니다. DB는 PostgreSQL(KV JSONB)만 사용합니다.
// 실시간은 자체 SSE + LISTEN/NOTIFY입니다. 논리 테이블이 relation이 아니라
// Supabase postgres_changes를 붙여도 채팅/하트 이벤트가 오지 않습니다.
export { supabase, setLocalDbUserId, setSseToken, getSseToken, fetchAndSetSseToken, getDeviceSecret, onSseReconnect, onSseDisconnect } from './localdb';

import { setDefaultResultOrder } from 'node:dns';

// Render 등에서 Supabase Direct 호스트가 IPv6로만 잡히면 ENETUNREACH가 납니다.
setDefaultResultOrder('ipv4first');

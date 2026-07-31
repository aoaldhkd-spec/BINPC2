// Local database mock — replaces the real Supabase client.
// All data is stored in localStorage; realtime uses BroadcastChannel.
export { supabase, setLocalDbUserId, setSseToken, getSseToken, fetchAndSetSseToken, getDeviceSecret } from './localdb';

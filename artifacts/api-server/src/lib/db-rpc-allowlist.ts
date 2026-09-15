/**
 * RPC name allowlist — extracted from routes/db.ts.
 * Unknown names → 404 (퍼징 / 내부 구현 노출 방지).
 */
export const ALLOWED_RPCS = new Set([
  'admin_create_session', 'admin_invalidate_session', 'admin_auth_phone',
  'admin_update_settings', 'admin_toggle_session', 'test_resync', 'test_clear_hearts', 'test_wipe_all', 'admin_force_resync_all',
  'test_verify_password', 'test_update_settings', 'admin_full_reset', 'admin_event_end_reset', 'admin_clear_profiles',
  'verify_panel_password',
  'admin_update_profile',
  'admin_delete_profile',
]);

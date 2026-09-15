import { describe, expect, it } from 'vitest';
import { ALLOWED_RPCS } from './db-rpc-allowlist.js';

describe('db-rpc-allowlist', () => {
  it('includes core admin/test RPCs', () => {
    expect(ALLOWED_RPCS.has('admin_event_end_reset')).toBe(true);
    expect(ALLOWED_RPCS.has('test_wipe_all')).toBe(true);
    expect(ALLOWED_RPCS.has('verify_panel_password')).toBe(true);
    expect(ALLOWED_RPCS.has('not_a_real_rpc')).toBe(false);
  });
});

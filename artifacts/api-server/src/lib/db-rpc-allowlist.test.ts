import { describe, expect, it } from 'vitest';
import {
  ALLOWED_RPCS,
  validateRpcName,
  adminPhoneMismatch,
  buildAdminProfilePatchFromArgs,
  pickAdminTokenKey,
  planCheckAdminPassword,
  planVerifyPanelPasswordArgs,
  panelPasswordUnauthorizedReject,
  ADMIN_UPDATE_PROFILE_ARG_MAP,
  RPC_ADMIN_PHONE_MISMATCH_MESSAGE,
  RPC_PANEL_UNAUTHORIZED_MESSAGE,
} from './db-rpc-allowlist.js';

describe('db-rpc-allowlist', () => {
  it('includes core admin/test RPCs', () => {
    expect(ALLOWED_RPCS.has('admin_event_end_reset')).toBe(true);
    expect(ALLOWED_RPCS.has('test_wipe_all')).toBe(true);
    expect(ALLOWED_RPCS.has('verify_panel_password')).toBe(true);
    expect(ALLOWED_RPCS.has('not_a_real_rpc')).toBe(false);
  });

  it('validateRpcName', () => {
    expect(validateRpcName('ok')).toBeNull();
    expect(validateRpcName(1)?.status).toBe(400);
    expect(validateRpcName('x'.repeat(101))?.status).toBe(400);
  });

  it('adminPhoneMismatch + Korean message', () => {
    expect(adminPhoneMismatch('010-1111-2222', '01011112222')).toBe(false);
    expect(adminPhoneMismatch('010-1111-2222', '01099999999')).toBe(true);
    expect(adminPhoneMismatch('010-1111-2222', '')).toBe(false);
    expect(RPC_ADMIN_PHONE_MISMATCH_MESSAGE).toContain('전화번호');
  });

  it('pickAdminTokenKey prefers matching password', () => {
    const key = pickAdminTokenKey({
      providedPw: 'secret',
      adminTokenArg: '',
      dbAdmin: 'db',
      adminSecrets: ['secret', 'other'],
      secretMatches: (p, secrets) => secrets.includes(p),
      deriveAdminToken: (s) => `tok:${s}`,
    });
    expect(key).toBe('secret');
  });

  it('planVerifyPanelPasswordArgs + unauthorized Korean', () => {
    expect(planVerifyPanelPasswordArgs('reset', 'pw').ok).toBe(true);
    expect(planVerifyPanelPasswordArgs('nope', 'pw').ok).toBe(false);
    expect(planVerifyPanelPasswordArgs('reset', '').ok).toBe(false);
    expect(panelPasswordUnauthorizedReject().body.error?.message).toBe(
      RPC_PANEL_UNAUTHORIZED_MESSAGE,
    );
  });

  it('planCheckAdminPassword + profile patch map', () => {
    const bad = planCheckAdminPassword({
      provided: 'x',
      token: '',
      adminSecrets: ['real'],
      deriveAdminToken: (s) => s,
      secretMatches: () => false,
    });
    expect(bad.ok).toBe(false);
    const patch = buildAdminProfilePatchFromArgs({ p_nickname: 'N', p_bio: 'B', ignored: 1 });
    expect(patch).toEqual({ nickname: 'N', bio: 'B' });
    expect(Object.keys(ADMIN_UPDATE_PROFILE_ARG_MAP).length).toBeGreaterThan(10);
  });
});

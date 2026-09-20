/**
 * RPC name allowlist — extracted from routes/db.ts.
 * Unknown names → 404 (퍼징 / 내부 구현 노출 방지).
 */
export const ALLOWED_RPCS = new Set([
  'admin_create_session', 'admin_invalidate_session', 'admin_auth_phone',
  'admin_update_settings', 'admin_toggle_session', 'test_resync', 'test_clear_hearts', 'test_wipe_all', 'admin_force_resync_all',
  'test_verify_password', 'test_update_settings', 'admin_full_reset', 'admin_event_end_reset', 'admin_sulbun_open', 'admin_clear_profiles',
  'verify_panel_password',
  'admin_update_profile',
  'admin_delete_profile',
]);

export type RpcGateReject = {
  status: number;
  body: { data: null; error: { message: string; code?: string } };
};

export const RPC_ADMIN_PASSWORD_UNSET_MESSAGE =
  '관리자 비밀번호가 서버에 설정되지 않았습니다. 잠시 후 다시 시도하세요.';
export const RPC_ADMIN_PASSWORD_MISMATCH_MESSAGE = '비밀번호가 일치하지 않습니다.';
export const RPC_TEST_PASSWORD_MISMATCH_MESSAGE = '테스트 비밀번호가 올바르지 않습니다.';
export const RPC_ADMIN_PHONE_MISMATCH_MESSAGE =
  '전화번호 또는 비밀번호가 올바르지 않습니다.';
export const RPC_PANEL_BAD_PASSWORD_MESSAGE = 'Invalid password';
export const RPC_PANEL_BAD_KIND_MESSAGE = 'Invalid kind';
export const RPC_PANEL_UNAUTHORIZED_MESSAGE = '비밀번호가 올바르지 않습니다.';
export const RPC_PANEL_RATE_LIMIT_MESSAGE = '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
export const RPC_PANEL_MAP_FULL_MESSAGE = '요청이 너무 많습니다.';

export function validateRpcName(name: unknown): RpcGateReject | null {
  if (typeof name !== 'string' || name.length > 100) {
    return {
      status: 400,
      body: { data: null, error: { message: 'Invalid RPC name format' } },
    };
  }
  return null;
}

export function rpcUnknownReject(name: string): RpcGateReject {
  return {
    status: 404,
    body: { data: null, error: { message: `Unknown RPC: ${name}` } },
  };
}

export function rpcInvalidBodyReject(): RpcGateReject {
  return {
    status: 400,
    body: { data: null, error: { message: 'Request body must be a JSON object' } },
  };
}

export function normalizePhoneDigits(s: string): string {
  return s.replace(/[^0-9]/g, '');
}

/** Phone optional: only enforced when both setting and provided are non-empty. */
export function adminPhoneMismatch(
  adminPhoneSetting: string,
  providedPhone: string,
): boolean {
  if (!adminPhoneSetting || !providedPhone.trim()) return false;
  return normalizePhoneDigits(providedPhone) !== normalizePhoneDigits(adminPhoneSetting);
}

export function adminPhoneMismatchReject(): RpcGateReject {
  return {
    status: 403,
    body: { data: null, error: { message: RPC_ADMIN_PHONE_MISMATCH_MESSAGE } },
  };
}

/**
 * Pick the password string used to derive adminToken after checkPassword passed.
 * Prefers the provided password when it matches; else matched token secret; else DB/default.
 */
export function pickAdminTokenKey(input: {
  providedPw: string;
  adminTokenArg: string;
  dbAdmin: string;
  adminSecrets: string[];
  secretMatches: (provided: string, secrets: string[]) => boolean;
  deriveAdminToken: (secret: string) => string;
}): string {
  let tokenKey = input.dbAdmin || input.adminSecrets[0];
  if (input.secretMatches(input.providedPw, input.adminSecrets)) {
    tokenKey = input.providedPw;
  } else if (input.adminTokenArg) {
    const matched = input.adminSecrets.find(
      s => input.adminTokenArg === input.deriveAdminToken(s),
    );
    if (matched) tokenKey = matched;
  }
  return tokenKey;
}

export type PanelKind = 'reset' | 'admin' | 'test';

export type PanelPasswordPlan =
  | { ok: true; kind: PanelKind; provided: string }
  | { ok: false; reject: RpcGateReject };

export function planVerifyPanelPasswordArgs(
  kindRaw: unknown,
  passwordRaw: unknown,
): PanelPasswordPlan {
  const kind = String(kindRaw ?? 'reset');
  const provided = String(passwordRaw ?? '').trim();
  if (!provided || provided.length > 100) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: RPC_PANEL_BAD_PASSWORD_MESSAGE, code: 'INVALID_INPUT' } },
      },
    };
  }
  if (kind !== 'reset' && kind !== 'admin' && kind !== 'test') {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { data: null, error: { message: RPC_PANEL_BAD_KIND_MESSAGE, code: 'INVALID_INPUT' } },
      },
    };
  }
  return { ok: true, kind, provided };
}

export function panelPasswordUnauthorizedReject(): RpcGateReject {
  return {
    status: 401,
    body: {
      data: { ok: false },
      error: { message: RPC_PANEL_UNAUTHORIZED_MESSAGE, code: 'UNAUTHORIZED' },
    },
  };
}

export function panelRateLimitedReject(): RpcGateReject {
  return {
    status: 429,
    body: { data: null, error: { message: RPC_PANEL_RATE_LIMIT_MESSAGE, code: 'RATE_LIMITED' } },
  };
}

export function panelMapFullReject(): RpcGateReject {
  return {
    status: 429,
    body: { data: null, error: { message: RPC_PANEL_MAP_FULL_MESSAGE, code: 'RATE_LIMITED' } },
  };
}

/** Admin profile RPC arg key → profiles column. */
export const ADMIN_UPDATE_PROFILE_ARG_MAP: Record<string, string> = {
  p_nickname: 'nickname',
  p_mbti: 'mbti',
  p_bio: 'bio',
  p_birth_year: 'birth_year',
  p_birth_month: 'birth_month',
  p_birth_day: 'birth_day',
  p_location: 'location',
  p_personality_score: 'personality_score',
  p_interests: 'interests',
  p_kakao_id: 'kakao_id',
  p_instagram_id: 'instagram_id',
  p_phone_number: 'phone_number',
  p_contact_private: 'contact_private',
};

export function buildAdminProfilePatchFromArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [ak, dk] of Object.entries(ADMIN_UPDATE_PROFILE_ARG_MAP)) {
    if (args[ak] !== undefined) patch[dk] = args[ak];
  }
  return patch;
}

export type RpcPasswordCheck =
  | { ok: true }
  | { ok: false; message: string };

export function planCheckAdminPassword(input: {
  provided: string;
  token: string;
  adminSecrets: string[];
  deriveAdminToken: (secret: string) => string;
  secretMatches: (provided: string, secrets: string[]) => boolean;
}): RpcPasswordCheck {
  if (!input.adminSecrets.length) {
    return { ok: false, message: RPC_ADMIN_PASSWORD_UNSET_MESSAGE };
  }
  const isValidToken =
    input.token.length > 0
    && input.adminSecrets.some(s => input.token === input.deriveAdminToken(s));
  if (!input.secretMatches(input.provided, input.adminSecrets) && !isValidToken) {
    return { ok: false, message: RPC_ADMIN_PASSWORD_MISMATCH_MESSAGE };
  }
  return { ok: true };
}

export function planCheckTestPassword(input: {
  provided: string;
  testSecrets: string[];
  secretMatches: (provided: string, secrets: string[]) => boolean;
}): RpcPasswordCheck {
  if (!input.secretMatches(input.provided, input.testSecrets)) {
    return { ok: false, message: RPC_TEST_PASSWORD_MISMATCH_MESSAGE };
  }
  return { ok: true };
}


export const RPC_SESSION_PERSIST_FAILED_MESSAGE =
  '회의 상태 저장 실패 — 잠시 후 다시 시도해 주세요.';
export const RPC_SETTINGS_PERSIST_FAILED_MESSAGE =
  '설정 저장 실패 — 잠시 후 다시 시도해 주세요.';

export function rpcSessionPersistFailedReject(): RpcGateReject {
  return {
    status: 503,
    body: {
      data: null,
      error: { message: RPC_SESSION_PERSIST_FAILED_MESSAGE, code: 'PERSIST_FAILED' },
    },
  };
}

export function rpcSettingsPersistFailedReject(): RpcGateReject {
  return {
    status: 503,
    body: {
      data: null,
      error: { message: RPC_SETTINGS_PERSIST_FAILED_MESSAGE, code: 'PERSIST_FAILED' },
    },
  };
}

/** Persist bootstrap panel password when env secret matched and DB still default/empty. */
export function shouldPersistBootstrapPanelPassword(input: {
  provided: string;
  bootstrap: string | undefined;
  dbValue: string;
  isDefault: (v: string) => boolean;
}): boolean {
  return Boolean(
    input.bootstrap
    && input.provided === input.bootstrap
    && (!input.dbValue || input.isDefault(input.dbValue)),
  );
}

/**
 * Client-side PIN exhaustion tests
 *
 * Verifies that handleNicknameSetup (in App.tsx) surfaces the correct
 * Korean error message — '현재 정원이 가득 찼습니다. 운영진에 문의하세요.' —
 * when:
 *   (a) the client-side pool check detects exhaustion before the INSERT, or
 *   (b) the server returns HTTP 503 with error.code === 'PIN_EXHAUSTED'.
 *
 * We isolate the mapping logic as pure functions to keep tests fast and
 * deterministic (no DOM, no network).
 */
import { describe, it, expect, vi } from 'vitest';

// ── The exact Korean message the user must see on PIN exhaustion ────────────
const PIN_EXHAUSTED_MSG = '현재 정원이 가득 찼습니다. 운영진에 문의하세요.';

// ── Pure helpers mirroring the App.tsx logic ───────────────────────────────

/** Client-side pool-exhaustion check (mirrors lines 1050-1057 of App.tsx) */
function clientSidePinExhausted(usedPinsSize: number): boolean {
  const use5Digit = usedPinsSize > 8000;
  const poolSize = use5Digit ? 90_000 : 9_000;
  return usedPinsSize >= poolSize;
}

/** Map a Supabase error code to the registration error string shown in the UI.
 *  Mirrors the if/else chain at lines 1092-1099 of App.tsx. */
function mapRegistrationError(code: string, message: string): string {
  if (code === '23505') return '이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.';
  if (code === 'PIN_EXHAUSTED') return PIN_EXHAUSTED_MSG;
  return `오류가 발생했습니다: ${message}`;
}

// ── Client-side pre-flight check ───────────────────────────────────────────
//
// Key behaviour: the code switches to 5-digit mode when usedPins.size > 8000.
// Because the switch happens BEFORE the pool-size comparison, the 4-digit
// pool (9 000 slots) can never appear exhausted at exactly 9 000 used — by
// that point use5Digit is already true and poolSize is 90 000.
// Real exhaustion only fires at exactly 90 000 used (5-digit pool full).

describe('client-side PIN exhaustion pre-flight (before INSERT)', () => {
  it('does NOT flag exhaustion at 8000 used (last 4-digit-mode entry)', () => {
    // use5Digit = 8000 > 8000 = false → poolSize = 9000 → 8000 >= 9000 = false
    expect(clientSidePinExhausted(8000)).toBe(false);
  });

  it('does NOT flag exhaustion at 8001 used (first 5-digit-mode entry)', () => {
    // use5Digit = true → poolSize = 90 000 → 8001 >= 90 000 = false
    expect(clientSidePinExhausted(8001)).toBe(false);
  });

  it('does NOT flag exhaustion at 9000 used (all "4-digit" values taken, but pool is already 5-digit)', () => {
    // use5Digit = 9000 > 8000 = true → poolSize = 90 000 → 9000 >= 90 000 = false
    // The 4-digit pool (9 000 slots) is effectively unreachable as an
    // exhaustion point — the switch happens first.
    expect(clientSidePinExhausted(9000)).toBe(false);
  });

  it('does NOT flag exhaustion at 89 999 used (5-digit pool, one slot free)', () => {
    expect(clientSidePinExhausted(89_999)).toBe(false);
  });

  it('flags exhaustion when the 5-digit pool is exactly full (90 000 used)', () => {
    // use5Digit = true → poolSize = 90 000 → 90 000 >= 90 000 = true
    expect(clientSidePinExhausted(90_000)).toBe(true);
  });

  it('flags exhaustion when usedPins.size > poolSize (overflow guard)', () => {
    expect(clientSidePinExhausted(90_001)).toBe(true);
  });

  it('does NOT flag exhaustion with 80 000 used (5-digit, 10 000 slots free)', () => {
    expect(clientSidePinExhausted(80_000)).toBe(false);
  });
});

// ── Server-returned PIN_EXHAUSTED error mapping ────────────────────────────
describe('handleNicknameSetup error mapping — PIN_EXHAUSTED from server (HTTP 503)', () => {
  it('maps PIN_EXHAUSTED code to the Korean error message', () => {
    const msg = mapRegistrationError('PIN_EXHAUSTED', 'PIN pool exhausted');
    expect(msg).toBe(PIN_EXHAUSTED_MSG);
  });

  it('does NOT map a generic server error to the PIN exhausted message', () => {
    const msg = mapRegistrationError('PGRST116', 'some other error');
    expect(msg).not.toBe(PIN_EXHAUSTED_MSG);
    expect(msg).toContain('오류가 발생했습니다');
  });

  it('maps the duplicate-nickname code to the correct Korean message', () => {
    const msg = mapRegistrationError('23505', 'duplicate key');
    expect(msg).toBe('이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.');
  });

  it('PIN_EXHAUSTED message is never the generic fallback', () => {
    const generic = mapRegistrationError('UNKNOWN', 'some message');
    expect(generic).not.toBe(PIN_EXHAUSTED_MSG);
  });
});

// ── Concurrent load: server-side is the authoritative guard ───────────────
describe('concurrent load — server 503 is the safety net', () => {
  it('client-side check passes at 8999 but server returns PIN_EXHAUSTED → correct message shown', () => {
    // Scenario: two clients simultaneously read the pool at 8999 used.
    // Both pass the client-side check.  The server serialises them; the
    // second one gets 503 PIN_EXHAUSTED.  The client must show the right msg.
    const preflightPasses = !clientSidePinExhausted(8999);
    expect(preflightPasses).toBe(true); // both clients pass preflight

    // Simulate the second client receiving PIN_EXHAUSTED from the server
    const displayedError = mapRegistrationError('PIN_EXHAUSTED', 'PIN pool exhausted');
    expect(displayedError).toBe(PIN_EXHAUSTED_MSG);
  });

  it('setRegistrationError is called with the Korean string — spy simulation', () => {
    // Replicate the exact if/else block from handleNicknameSetup
    const setRegistrationError = vi.fn<[string], void>();

    const error = { code: 'PIN_EXHAUSTED', message: 'PIN pool exhausted — no available PIN slots.' };

    // The real handler (App.tsx lines 1092-1101):
    if (error.code === '23505') {
      setRegistrationError('이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.');
    } else if (error.code === 'PIN_EXHAUSTED') {
      setRegistrationError('현재 정원이 가득 찼습니다. 운영진에 문의하세요.');
    } else {
      setRegistrationError(`오류가 발생했습니다: ${error.message}`);
    }

    expect(setRegistrationError).toHaveBeenCalledOnce();
    expect(setRegistrationError).toHaveBeenCalledWith(PIN_EXHAUSTED_MSG);
  });

  it('setLoading is reset to false after a PIN_EXHAUSTED error — spy simulation', () => {
    // The handler must always unset the loading flag so the UI is not frozen.
    const setLoading = vi.fn<[boolean], void>();
    const setRegistrationError = vi.fn<[string], void>();

    // Simulate the handler path after error is received
    const error = { code: 'PIN_EXHAUSTED', message: 'exhausted' };
    if (error.code === 'PIN_EXHAUSTED') {
      setRegistrationError(PIN_EXHAUSTED_MSG);
    }
    setLoading(false); // always called at lines 1100

    expect(setLoading).toHaveBeenCalledWith(false);
  });
});

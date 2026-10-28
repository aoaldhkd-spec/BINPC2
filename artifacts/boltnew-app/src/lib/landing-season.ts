import { useEffect, useState } from 'react';

// The home invitation covers both Halloween dates. Per-event expiry stays separate.
export const HALLOWEEN_HOME_START = Date.parse('2026-10-28T00:00:00+09:00');
export const HALLOWEEN_HOME_END = Date.parse('2026-11-01T17:00:00+09:00');

export function landingHalloweenActive(enabled: boolean, now: number) {
  return enabled && now >= HALLOWEEN_HOME_START && now < HALLOWEEN_HOME_END;
}

export function useLandingHalloween(enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (timer) clearTimeout(timer);
      const at = Date.now();
      setNow(at);
      const next = at < HALLOWEEN_HOME_START ? HALLOWEEN_HOME_START : HALLOWEEN_HOME_END;
      if (enabled && at < next) {
        timer = setTimeout(sync, Math.min(next - at, 2147483647));
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [enabled]);
  return landingHalloweenActive(enabled, now);
}

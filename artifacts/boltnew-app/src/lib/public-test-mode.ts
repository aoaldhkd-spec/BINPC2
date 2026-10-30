import { useEffect, useState } from "react";

export { EVENT_TEST_MODE_BANNER as TEST_MODE_BANNER } from "../../../../lib/api-zod/src/event-test-mode";

export function testModeBlocksParticipation(
  state: { bossParticipationAllowed?: boolean; testMode?: { enabled: boolean; publicAdmissionOpen?: boolean } } | null | undefined,
) {
  // OFF only ends the simulation. Missing/older responses never imply approval to recruit.
  return state?.bossParticipationAllowed !== true && (state?.testMode?.enabled !== false || state.testMode.publicAdmissionOpen !== true);
}

/** Normal visitors need the authoritative flag. The already verified boss
 * uses the same protected test route regardless of this public flag. */
export function usePublicTestMode(verifiedBossAccess = false) {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    // Never retain a prior public-open value across a boss access transition.
    setEnabled(true);
    if (verifiedBossAccess) return;
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const response = await fetch("/api/event-hub/test-mode", {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Test mode unavailable");
        const mode = (await response.json()) as { enabled?: boolean; publicAdmissionOpen?: boolean; bossParticipationAllowed?: boolean };
        if (active && current === sequence)
          setEnabled(mode.bossParticipationAllowed !== true && (mode.enabled !== false || mode.publicAdmissionOpen !== true));
      } catch {
        if (active && current === sequence) setEnabled(true);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [verifiedBossAccess]);
  return verifiedBossAccess ? false : enabled;
}

import { useHeartNowPublicAccess } from './BossAccessBoundary';
import { TEST_MODE_BANNER, usePublicTestMode } from "../lib/public-test-mode";

/** An ordinary header row: never covers the composer or replaces the current profile. */
export function PublicTestModeBanner() {
  const heartNowPublic = useHeartNowPublicAccess();
  const enabled = usePublicTestMode(false, heartNowPublic);
  if (!enabled || heartNowPublic) return null;
  return <div role="status" className="shrink-0 bg-amber-50 text-amber-900 border-b border-amber-200 px-3 py-1.5 text-center text-[11px] leading-4 break-keep">
    {TEST_MODE_BANNER}
  </div>;
}

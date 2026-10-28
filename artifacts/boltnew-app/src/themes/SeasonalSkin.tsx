import { useEffect, useState, type ReactNode } from 'react';
import { useLandingHalloween } from '../lib/landing-season';
import { parseModuleFlags } from '../lib/module-flags';
import './halloween.css';

export const SEASONAL_SKIN_CHANGED = 'binpc-seasonal-skin-changed';

/** A removable visual layer. Never writes a profile, session, dark-mode preference or event. */
export function SeasonalSkin({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const active = useLandingHalloween(enabled);

  useEffect(() => {
    let disposed = false;
    let request: AbortController | undefined;
    const sync = async () => {
      request?.abort();
      const current = new AbortController();
      request = current;
      const timeout = window.setTimeout(() => current.abort(), 5000);
      try {
        const response = await fetch('/api/db/ready', { signal: current.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (!disposed && request === current && !current.signal.aborted
          && body?.settings && Object.hasOwn(body.settings, 'module_flags')) {
          setEnabled(parseModuleFlags(body.settings.module_flags).seasonal_landing);
        }
      } catch { /* Temporary failures preserve the current decoration and all app state. */ }
      finally { window.clearTimeout(timeout); }
    };
    const resume = () => { if (document.visibilityState !== 'hidden') void sync(); };
    const changed = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value === 'boolean') {
        request?.abort();
        setEnabled(value);
      }
    };
    void sync();
    const timer = window.setInterval(resume, 60000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener(SEASONAL_SKIN_CHANGED, changed);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener(SEASONAL_SKIN_CHANGED, changed);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (active) html.dataset.seasonalSkin = 'halloween';
    else delete html.dataset.seasonalSkin;
    return () => { delete html.dataset.seasonalSkin; };
  }, [active]);

  return <>{children}</>;
}

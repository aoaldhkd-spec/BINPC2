import { lazy } from 'react';

/** Single lazy boundary — App overlay + MainScreen tab share one chunk. */
export const FortuneTabLazy = lazy(() => import('./FortuneTab'));

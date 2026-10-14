#!/usr/bin/env node
/** Public API health pings only. Never sends user data or changes the service. */
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const API = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const SITE = (process.env.NETLIFY_URL || 'https://binpc2.netlify.app').replace(/\/$/, '');
const TARGETS = [
  `${API}/api/healthz`,
  `${API}/api/db/ready`,
  `${SITE}/api/healthz`,
];

// Allow a brief transient network/5xx/429 failure, but fail the job if it persists.
// Three bounded 8s attempts per endpoint fit the existing 2-minute job limit.
export const RETRY_DELAYS_MS = [250, 750];
export const REQUEST_TIMEOUT_MS = 8_000;

export async function pingEndpoint(url, {
  fetcher = fetch,
  wait = sleep,
  logger = console,
  timeoutMs = REQUEST_TIMEOUT_MS,
  retryDelaysMs = RETRY_DELAYS_MS,
} = {}) {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    const start = Date.now();
    let retryable = true;
    let failure;
    try {
      const response = await fetcher(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const ms = Date.now() - start;
      if (response.ok) {
        logger.log(`[ok] ${response.status} ${url} (${ms}ms; attempt ${attempt + 1})`);
        return true;
      }
      retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (!retryable || attempt === retryDelaysMs.length) {
      logger.error(`[fail] ${url}: ${failure} (attempt ${attempt + 1})`);
      return false;
    }
    logger.warn(`[retry] ${url}: ${failure} (attempt ${attempt + 1}/${retryDelaysMs.length + 1})`);
    await wait(retryDelaysMs[attempt]);
  }
  return false;
}

export async function checkHealthTargets(targets = TARGETS, options = {}) {
  if (!Array.isArray(targets) || targets.length === 0) {
    (options.logger || console).error('[fail] No health targets configured');
    return false;
  }
  let healthy = true;
  for (const url of targets) {
    const result = await pingEndpoint(url, options);
    if (!result) healthy = false;
  }
  return healthy;
}

// Import-safe so offline unit tests never call production URLs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await checkHealthTargets() ? 0 : 1;
}

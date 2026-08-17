const DEFAULT_TIMEOUT_MS = 20_000;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /(?:authorization|api[-_]?key|token|secret|password|database[-_]?url|cookie)/i;

export function parseArgs(argv = process.argv.slice(2)) {
  const values = {};
  const provided = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const raw = arg.slice(2);
    const equals = raw.indexOf('=');
    const key = equals >= 0 ? raw.slice(0, equals) : raw;
    let value = equals >= 0 ? raw.slice(equals + 1) : true;
    if (equals < 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) value = argv[++i];
    values[key] = value;
    provided.add(key);
  }
  return { values, provided };
}

export function parseTarget(value = 'local') {
  const raw = String(value || 'local').trim();
  const name = raw.toLowerCase();
  if (['local', 'development', 'test'].includes(name)) {
    return { name: 'local', isLocal: true, isProduction: false, url: null };
  }
  if (['production', 'prod'].includes(name)) {
    return { name: 'production', isLocal: false, isProduction: true, url: null };
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid target "${redactText(raw)}"; use local, production, or an http(s) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Target URL must use http or https');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  return {
    name: isLocal ? 'local' : 'remote',
    isLocal,
    isProduction: false,
    url: url.toString().replace(/\/$/, ''),
  };
}

export function targetIdentity(value) {
  const target = parseTarget(value);
  if (!target.url) return target.name;
  return new URL(target.url).host.toLowerCase();
}

export function confirmationValue(identities) {
  const normalized = [...new Set(identities.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!normalized.length) throw new Error('At least one operation identity is required');
  return normalized.join(',');
}

export function requireProductionWrite({ args, identities, operation }) {
  const dryRun = args.values['dry-run'] === true;
  const expected = confirmationValue(identities);
  if (dryRun) return { dryRun: true, expectedConfirmation: expected };
  if (!args.provided.has('target') || args.values.target !== 'production') {
    throw new Error(`${operation} requires explicit --target=production`);
  }
  if (!args.provided.has('confirm') || args.values.confirm !== expected) {
    throw new Error(`${operation} requires --confirm=${expected}`);
  }
  return { dryRun: false, expectedConfirmation: expected };
}

export function requireLoadTarget({ args, url, operation = 'Load test' }) {
  const target = parseTarget(url);
  const dryRun = args.values['dry-run'] === true;
  if (target.isLocal || dryRun) return { dryRun, target, identity: targetIdentity(url) };
  const identity = targetIdentity(url);
  if (!args.provided.has('target') || args.values.target !== 'production') {
    throw new Error(`${operation} against ${identity} requires explicit --target=production`);
  }
  if (args.values.confirm !== identity) {
    throw new Error(`${operation} against ${identity} requires --confirm=${identity}`);
  }
  return { dryRun: false, target, identity };
}

export function requireCleanupConfirmation({ prefix, confirmation }) {
  const value = String(prefix || '');
  if (!/^lt_[a-z0-9][a-z0-9_-]{7,63}_$/i.test(value)) {
    throw new Error('Cleanup requires a unique run prefix matching lt_<8-64 safe characters>_');
  }
  if (confirmation !== value) throw new Error(`Cleanup requires --confirm-cleanup=${value}`);
  return value;
}

export function redactSecret(value) {
  return value == null || value === '' ? value : '[REDACTED]';
}

export function redactUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.username) url.username = '[REDACTED]';
    if (url.password) url.password = '[REDACTED]';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return redactText(value);
  }
}

export function redactText(value) {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|key|secret|password|api_key)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[REDACTED]@')
    .replace(/("(?:token|secret|password|database_url|api_key)"\s*:\s*")[^"]*"/gi, '$1[REDACTED]"')
    .replace(/\b(?:rnd|nfp|sbp)_[A-Za-z0-9._-]{8,}\b/g, '[REDACTED]');
}

export function redactObject(value) {
  if (Array.isArray(value)) return value.map(redactObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactObject(item)]),
  );
}

function composeTimeoutSignal(sourceSignal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  const abort = () => controller.abort(sourceSignal.reason);
  if (sourceSignal) {
    if (sourceSignal.aborted) abort();
    else sourceSignal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      sourceSignal?.removeEventListener('abort', abort);
    },
  };
}

export async function fetchWithTimeout(url, init = {}, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive number');
  const timeout = composeTimeoutSignal(init.signal, timeoutMs);
  try {
    return await (options.fetchImpl ?? globalThis.fetch)(url, { ...init, signal: timeout.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${redactUrl(url)}: ${redactText(message)}`, { cause: error });
  } finally {
    timeout.dispose();
  }
}

export function createOpsClient({
  baseUrl,
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  dryRun = false,
  fetchImpl,
  label = 'API',
} = {}) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('baseUrl is required');
  return {
    async request(path, init = {}) {
      const method = String(init.method || 'GET').toUpperCase();
      const url = /^https?:\/\//i.test(path) ? path : `${base}${path}`;
      const { allowHttpError = false, ...requestInit } = init;
      if (dryRun && MUTATING_METHODS.has(method)) {
        return { dryRun: true, method, url: redactUrl(url), status: 0, data: null };
      }
      const headers = {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(requestInit.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(requestInit.headers ?? {}),
      };
      const response = await fetchWithTimeout(url, { ...requestInit, method, headers }, { timeoutMs, fetchImpl });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok && !allowHttpError) {
        throw new Error(`${label} ${method} ${redactUrl(url)} returned ${response.status}`);
      }
      return { dryRun: false, method, url: redactUrl(url), status: response.status, data, response };
    },
  };
}

export function logDryRun(operation, details = {}) {
  console.log(`[dry-run] ${operation}: ${JSON.stringify(redactObject(details))}`);
}

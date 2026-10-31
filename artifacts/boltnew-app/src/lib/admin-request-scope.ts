export function adminRequestScope(path: string, base = '') {
  const prefix = base.replace(/\/$/, '');
  const normalized = prefix && path.startsWith(prefix + '/') ? path.slice(prefix.length) : path;
  return /^\/admin(?:\/|$)/.test(normalized);
}

/** Retired tester credentials belong only to the explicit tester route. */
export function testerRequestScope(path: string, base = '') {
  const prefix = base.replace(/\/$/, '');
  const normalized = prefix && path.startsWith(prefix + '/') ? path.slice(prefix.length) : path;
  return /^\/test(?:\/|$)/.test(normalized);
}

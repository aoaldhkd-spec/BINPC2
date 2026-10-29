export function adminRequestScope(path: string, base = '') {
  const prefix = base.replace(/\/$/, '');
  const normalized = prefix && path.startsWith(prefix + '/') ? path.slice(prefix.length) : path;
  return /^\/admin(?:\/|$)/.test(normalized);
}

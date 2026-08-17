const APP_ROUTES = ['/', '/admin', '/test'] as const;

function normalizedBase(base: string): string {
  if (!base || base === '/') return '';
  return `/${base.replace(/^\/+|\/+$/g, '')}`;
}

export function resolveClientNavigation(
  href: string,
  currentHref: string,
  base = '',
): URL | null {
  const current = new URL(currentHref);
  const next = new URL(href, current);
  if (next.origin !== current.origin) return null;

  const basePath = normalizedBase(base);
  if (basePath && next.pathname !== basePath && !next.pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  const routePath = next.pathname.slice(basePath.length) || '/';
  const isAppRoute = APP_ROUTES.some(route =>
    route === '/' ? routePath === '/' : routePath === route || routePath.startsWith(`${route}/`),
  );
  return isAppRoute ? next : null;
}

export function clientNavigationHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

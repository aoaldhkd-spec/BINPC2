import { describe, expect, it } from 'vitest';
import { clientNavigationHref, resolveClientNavigation } from './client-navigation';

describe('client navigation', () => {
  it('keeps app, test, and admin switches inside the SPA', () => {
    const current = 'https://binpc2.netlify.app/';
    expect(resolveClientNavigation('/test', current)?.pathname).toBe('/test');
    expect(resolveClientNavigation('/admin/settings', current)?.pathname).toBe('/admin/settings');
    expect(resolveClientNavigation('/', current)?.pathname).toBe('/');
  });

  it('does not intercept external or unrelated same-origin links', () => {
    const current = 'https://binpc2.netlify.app/';
    expect(resolveClientNavigation('https://example.com/test', current)).toBeNull();
    expect(resolveClientNavigation('/api/healthz', current)).toBeNull();
    expect(resolveClientNavigation('/profile/share', current)).toBeNull();
  });

  it('supports apps deployed below a base path', () => {
    const current = 'https://example.com/binpc2/';
    const url = resolveClientNavigation('/binpc2/admin?tab=db#health', current, '/binpc2');
    expect(url?.pathname).toBe('/binpc2/admin');
    expect(clientNavigationHref(url!)).toBe('/binpc2/admin?tab=db#health');
    expect(resolveClientNavigation('/admin', current, '/binpc2')).toBeNull();
  });
});

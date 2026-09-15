import { describe, it, expect, afterEach } from 'vitest';
import {
  collectSecrets,
  isDefaultPanelPassword,
  panelSecretsForRuntime,
  secretMatches,
  PANEL_DEFAULT_PASSWORD,
} from './db-panel-secrets.js';

const prev = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = prev;
});

describe('db-panel-secrets', () => {
  it('collectSecrets trims and dedupes', () => {
    expect(collectSecrets(' a ', 'a', '', null, 'b')).toEqual(['a', 'b']);
  });

  it('secretMatches requires non-empty provided', () => {
    expect(secretMatches('', ['x'])).toBe(false);
    expect(secretMatches('x', ['x'])).toBe(true);
  });

  it('isDefaultPanelPassword covers legacy defaults', () => {
    expect(isDefaultPanelPassword(PANEL_DEFAULT_PASSWORD)).toBe(true);
    expect(isDefaultPanelPassword('166606')).toBe(true);
    expect(isDefaultPanelPassword('unique-secret')).toBe(false);
  });

  it('panelSecretsForRuntime strips defaults in production', () => {
    process.env.NODE_ENV = 'production';
    expect(panelSecretsForRuntime(PANEL_DEFAULT_PASSWORD, 'real-secret')).toEqual(['real-secret']);
    process.env.NODE_ENV = 'development';
    const dev = panelSecretsForRuntime('real-secret');
    expect(dev).toContain('real-secret');
    expect(dev).toContain(PANEL_DEFAULT_PASSWORD);
  });
});

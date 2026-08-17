import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isRetiredPublicPanelPassword,
  mapPanelLoginError,
  readSubmittedPassword,
  initialAdminSettingsSubTab,
  TEST_ADMIN_HINT,
} from './admin-login';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('admin login helpers', () => {
  it('does not treat an empty or custom password as a retired public default', () => {
    expect(isRetiredPublicPanelPassword('')).toBe(false);
    expect(isRetiredPublicPanelPassword('custom-admin-pw')).toBe(false);
  });

  it('recognizes the retired public defaults without inventing a new secret', () => {
    expect(isRetiredPublicPanelPassword('116606')).toBe(true);
    expect(isRetiredPublicPanelPassword('166606')).toBe(true);
  });

  it('distinguishes 429 from 401/403', () => {
    expect(mapPanelLoginError('HTTP 429')).toBe('시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    expect(mapPanelLoginError('RATE_LIMITED')).toBe('시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    expect(mapPanelLoginError('시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.')).toBe(
      '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(mapPanelLoginError('비밀번호가 일치하지 않습니다.')).toBe('비밀번호가 올바르지 않습니다.');
  });

  it('explains when a retired public default was submitted', () => {
    expect(mapPanelLoginError('비밀번호가 일치하지 않습니다.', '116606')).toContain('예전 공개 기본');
  });

  it('prefers the DOM autofill value over empty React state', () => {
    const field = { value: 'from-autofill' } as HTMLInputElement;
    expect(readSubmittedPassword(field, '')).toBe('from-autofill');
    expect(readSubmittedPassword(null, 'from-state')).toBe('from-state');
  });

  it('opens 접속정보 from the URL without skipping auth', () => {
    expect(initialAdminSettingsSubTab('?settings=admin', '')).toBe('admin');
    expect(initialAdminSettingsSubTab('?tab=credentials', '')).toBe('admin');
    expect(initialAdminSettingsSubTab('', '#credentials')).toBe('admin');
    expect(initialAdminSettingsSubTab('', '')).toBe('control');
  });

  it('test-admin hint never claims a filled password will work', () => {
    expect(TEST_ADMIN_HINT).toContain('전화번호만');
    expect(TEST_ADMIN_HINT).toContain('예전 공개 기본값');
  });
});

describe('credentials tab copy', () => {
  const credentials = readFileSync(join(root, 'admin/CredentialsTab.tsx'), 'utf8');
  const adminApp = readFileSync(join(root, 'AdminApp.tsx'), 'utf8');

  it('does not tell operators that a retired server default still works', () => {
    expect(credentials).not.toMatch(/서버 기본값/);
    expect(credentials).not.toMatch(/서버 기본 비밀번호/);
    expect(credentials).not.toMatch(/서버 기본 코드/);
  });

  it('exposes the 접속정보 tab that saves admin_password through patchAdminSettings', () => {
    expect(adminApp).toMatch(/label: '접속정보'/);
    expect(adminApp).toMatch(/patchAdminSettings\(\{ admin_phone: phone, admin_password: password \}/);
    expect(adminApp).toMatch(/settingsSubTab === 'admin' && <CredentialsTab/);
  });

  it('plants a local operator session only in Vite DEV, never as a public skip', () => {
    expect(adminApp).toMatch(/import\.meta\.env\.DEV/);
    expect(adminApp).toMatch(/\/__dev\/admin-session/);
    const viteConfig = readFileSync(join(root, '../vite.config.ts'), 'utf8');
    const plugin = readFileSync(join(root, '../vite-dev-admin-session.ts'), 'utf8');
    expect(viteConfig).toMatch(/viteDevAdminSession/);
    expect(plugin).toMatch(/apply:\s*'serve'/);
    expect(plugin).not.toMatch(/116606/);
  });
});

describe('mobile-page-center viewport', () => {
  it('does not shrink login/gate pages with 100dvh when the keyboard opens', () => {
    const css = readFileSync(join(root, 'index.css'), 'utf8');
    const pageCenterStart = css.indexOf('.mobile-page-center {');
    expect(pageCenterStart).toBeGreaterThan(0);
    const after = css.slice(pageCenterStart);
    const firstBlock = after.slice(0, after.indexOf('.safe-overlay'));
    expect(firstBlock).toContain('100svh');
    expect(firstBlock).toContain('100lvh');
    const pageCenterBodies = [...firstBlock.matchAll(/\.mobile-page-center\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(pageCenterBodies.length).toBeGreaterThan(0);
    for (const body of pageCenterBodies) {
      expect(body).not.toMatch(/min-height:\s*calc\(100dvh/);
    }
  });
});

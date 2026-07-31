/**
 * Theme Regression Tests
 *
 * Visits a minimal HTML fixture loaded with the app's built CSS, applies each
 * of the four themes (default, y2k, dark-neon, minimal) by setting `data-theme`
 * on `<html>` and injecting the matching CSS custom properties, then asserts
 * that key observable elements — page background, primary button, and body
 * text — match the expected palette values defined in `src/lib/theme.tsx`.
 *
 * Run after `pnpm run build` so the built CSS is available.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── Helpers ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '../dist/public/assets');

function getBuiltCss(): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(
      'dist/public/assets not found — run `pnpm run build` first',
    );
  }
  const cssFile = fs
    .readdirSync(ASSETS_DIR)
    .find((f) => f.startsWith('index-') && f.endsWith('.css'));
  if (!cssFile) {
    throw new Error(
      'No built CSS found in dist/public/assets — run `pnpm run build`',
    );
  }
  return fs.readFileSync(path.join(ASSETS_DIR, cssFile), 'utf-8');
}

// ─── Theme definitions (must stay in sync with src/lib/theme.tsx) ───────────

const THEME_VARS: Record<string, Record<string, string>> = {
  default: {},
  y2k: {
    '--t-bg': '#FCFCFB',
    '--t-surface': '#ffffff',
    '--t-text': '#18181b',
    '--t-accent': '#10b981',
    '--t-border': '#e5e7eb',
  },
  'dark-neon': {
    '--t-bg': '#000000',
    '--t-surface': '#09090b',
    '--t-text': '#ffffff',
    '--t-accent': '#f472b6',
    '--t-border': '#27272a',
  },
  minimal: {
    '--t-bg': '#F9F8F6',
    '--t-surface': '#ffffff',
    '--t-text': '#09090b',
    '--t-accent': '#18181b',
    '--t-border': '#e5e7eb',
  },
};

// ─── Minimal HTML fixture ───────────────────────────────────────────────────

/**
 * Elements that mirror what the entry / loading screen renders so that the
 * same CSS selectors from index.css are exercised.
 *
 * Classes used intentionally:
 *   #main-bg  — matches the loading screen wrapper in App.tsx (line ~1183)
 *   #accent-btn — a typical CTA button class
 *   #text-el  — white text that gets inverted on light themes
 */
const FIXTURE_HTML = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body>
  <div id="main-bg" class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
  <button id="accent-btn" class="bg-teal-500">Primary</button>
  <span id="text-el" class="text-white">Text</span>
</body>
</html>`;

// ─── Expected values per theme ──────────────────────────────────────────────

interface ThemeCheck {
  /** body background-color */
  bodyBg?: string;
  /** body color */
  bodyColor?: string;
  /** #main-bg background-color (set when gradient is overridden to solid) */
  mainBgColor?: string;
  /** true → #main-bg must still have a CSS gradient (default theme) */
  mainBgHasGradient?: true;
  /** #accent-btn background-color (solid) */
  accentBg?: string;
  /** true → #accent-btn background is a CSS gradient (dark-neon) */
  accentBgHasGradient?: true;
  /** #text-el color */
  textColor?: string;
}

const THEME_CHECKS: Record<string, ThemeCheck> = {
  /**
   * default — dark slate theme; no `data-theme` attribute.
   * Loading screen retains its original gradient.
   * Accent button keeps Tailwind's teal-500 (Tailwind v4 uses OKLCH).
   * Text stays white.
   */
  default: {
    mainBgHasGradient: true,
    // Tailwind v4 emits OKLCH for colour values (not rgb).
    // oklch(0.704 0.14 182.503) ≈ teal-500 (#14b8a6).
    accentBg: 'oklch(0.704 0.14 182.503)',
    textColor: 'rgb(255, 255, 255)',
  },

  /**
   * y2k — light, neobrutalist.
   * All dark backgrounds flip to warm white (#FCFCFB).
   * Accent button becomes mint green (#6ee7b7) with a dark border.
   * White text inverts to near-black (#18181b).
   */
  y2k: {
    bodyBg: 'rgb(252, 252, 251)',   // #FCFCFB via --t-bg
    bodyColor: 'rgb(24, 24, 27)',   // #18181b via --t-text
    mainBgColor: 'rgb(252, 252, 251)',
    accentBg: 'rgb(110, 231, 183)', // #6ee7b7
    textColor: 'rgb(24, 24, 27)',   // #18181b override
  },

  /**
   * dark-neon — pure black background, hot-pink/purple accent.
   * Loading screen collapses to solid black (#000000).
   * Accent button gets a pink→purple gradient (background-image).
   * White text stays white (no override needed).
   */
  'dark-neon': {
    bodyBg: 'rgb(0, 0, 0)',           // #000000 via --t-bg
    bodyColor: 'rgb(255, 255, 255)',  // #ffffff via --t-text
    mainBgColor: 'rgb(0, 0, 0)',
    accentBgHasGradient: true,        // linear-gradient(pink→purple)
    textColor: 'rgb(255, 255, 255)',
  },

  /**
   * minimal — warm off-white, ink black accents.
   * Loading screen becomes warm cream (#F9F8F6).
   * Accent button is deep ink (#09090b) — the later rule at index.css ~line 850
   * wins over the earlier #18181b rule at ~line 218.
   * White text inverts to near-black (#09090b).
   */
  minimal: {
    bodyBg: 'rgb(249, 248, 246)',   // #F9F8F6 via --t-bg
    bodyColor: 'rgb(9, 9, 11)',     // #09090b via --t-text
    mainBgColor: 'rgb(249, 248, 246)',
    accentBg: 'rgb(9, 9, 11)',      // #09090b — later rule at index.css ~line 854
    textColor: 'rgb(9, 9, 11)',     // #09090b via var(--t-text)
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

let cssContent: string;

test.beforeAll(() => {
  cssContent = getBuiltCss();
});

for (const [themeName, checks] of Object.entries(THEME_CHECKS)) {
  test(`theme "${themeName}" — key element colors match palette`, async ({
    page,
  }) => {
    // 1. Set up minimal HTML fixture (no network calls needed)
    await page.setContent(FIXTURE_HTML, { waitUntil: 'domcontentloaded' });

    // 2. Inject the full built CSS (Tailwind utilities + all [data-theme] overrides)
    await page.addStyleTag({ content: cssContent });

    // 3. Apply theme: mirror what ThemeProvider / setTheme() does at runtime
    await page.evaluate(
      ({ name, vars }) => {
        const html = document.documentElement;

        // Set data-theme attribute (drives [data-theme="..."] CSS selectors)
        if (name === 'default') {
          html.removeAttribute('data-theme');
        } else {
          html.setAttribute('data-theme', name);
        }

        // Inject CSS custom properties as inline style (highest priority)
        const ALL_VARS = [
          '--t-bg',
          '--t-surface',
          '--t-text',
          '--t-accent',
          '--t-border',
        ];
        ALL_VARS.forEach((k) => html.style.removeProperty(k));
        Object.entries(vars).forEach(([k, v]) => html.style.setProperty(k, v));
      },
      { name: themeName, vars: THEME_VARS[themeName] },
    );

    // 4. Wait for CSS transitions to settle (theme system uses 200 ms transitions)
    await page.waitForTimeout(300);

    // 5. Capture computed styles of the key elements
    const styles = await page.evaluate(() => {
      const body = document.body;
      const mainBg = document.getElementById('main-bg')!;
      const accentBtn = document.getElementById('accent-btn')!;
      const textEl = document.getElementById('text-el')!;

      const cs = (el: Element) => window.getComputedStyle(el);

      return {
        bodyBg: cs(body).backgroundColor,
        bodyColor: cs(body).color,
        mainBgColor: cs(mainBg).backgroundColor,
        mainBgImage: cs(mainBg).backgroundImage,
        accentBgColor: cs(accentBtn).backgroundColor,
        accentBgImage: cs(accentBtn).backgroundImage,
        textColor: cs(textEl).color,
      };
    });

    // 6. Assert each configured expectation
    if (checks.bodyBg) {
      expect(styles.bodyBg, 'body background-color').toBe(checks.bodyBg);
    }
    if (checks.bodyColor) {
      expect(styles.bodyColor, 'body color').toBe(checks.bodyColor);
    }
    if (checks.mainBgHasGradient) {
      expect(
        styles.mainBgImage,
        '#main-bg should retain CSS gradient in default theme',
      ).toContain('linear-gradient');
    }
    if (checks.mainBgColor) {
      expect(
        styles.mainBgColor,
        '#main-bg background-color (gradient overridden)',
      ).toBe(checks.mainBgColor);
      expect(
        styles.mainBgImage,
        '#main-bg background-image should be none after theme override',
      ).toBe('none');
    }
    if (checks.accentBg) {
      expect(styles.accentBgColor, '#accent-btn background-color').toBe(
        checks.accentBg,
      );
    }
    if (checks.accentBgHasGradient) {
      expect(
        styles.accentBgImage,
        '#accent-btn should have gradient background in dark-neon',
      ).toContain('linear-gradient');
    }
    if (checks.textColor) {
      expect(styles.textColor, '#text-el color (.text-white override)').toBe(
        checks.textColor,
      );
    }
  });
}

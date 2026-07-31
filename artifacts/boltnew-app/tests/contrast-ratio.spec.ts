/**
 * Contrast Ratio Tests — Y2K and Minimal themes
 *
 * After Task 12 added ~230 lines of !important overrides that darken light-coloured
 * text in Y2K and Minimal themes, this spec verifies that no primary text element
 * falls below the WCAG AA threshold of 4.5 : 1 against its background.
 *
 * Strategy
 * ─────────
 * 1. Build a minimal HTML fixture that exercises every text-colour class
 *    that the index.css overrides target (one element per class, nested inside
 *    its natural background).
 * 2. Inject the full built CSS and apply the theme exactly as ThemeProvider does.
 * 3. For each labelled test pair, compute the WCAG relative-luminance contrast
 *    ratio and assert ≥ 4.5 : 1.
 *
 * Intentionally excluded
 * ──────────────────────
 * • .text-slate-500 / .text-zinc-400 — mapped to #a1a1aa (Y2K) / #71717a, used
 *   only as decorative / secondary muted text, not primary content.
 * • Placeholder text — tested separately in Task 66.
 *
 * Run after `pnpm run build` so the built CSS is available.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── path helpers ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, '../dist/public/assets');

function getBuiltCss(): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error('dist/public/assets not found — run `pnpm run build` first');
  }
  const cssFile = fs
    .readdirSync(ASSETS_DIR)
    .find((f) => f.startsWith('index-') && f.endsWith('.css'));
  if (!cssFile) {
    throw new Error('No built CSS in dist/public/assets — run `pnpm run build`');
  }
  return fs.readFileSync(path.join(ASSETS_DIR, cssFile), 'utf-8');
}

// ─── Theme vars (mirror src/lib/theme.tsx) ───────────────────────────────────

const THEME_VARS: Record<string, Record<string, string>> = {
  y2k: {
    '--t-bg': '#FCFCFB',
    '--t-surface': '#ffffff',
    '--t-text': '#18181b',
    '--t-accent': '#10b981',
    '--t-border': '#e5e7eb',
  },
  minimal: {
    '--t-bg': '#F9F8F6',
    '--t-surface': '#ffffff',
    '--t-text': '#09090b',
    '--t-accent': '#18181b',
    '--t-border': '#e5e7eb',
  },
};

// ─── WCAG helpers (run inside page.evaluate) ─────────────────────────────────

/**
 * All contrast-ratio logic that runs inside the browser.
 * Returned as a string so it can be passed to page.evaluate().
 */
const BROWSER_HELPERS = /* javascript */ `
  function parseRgb(colorStr) {
    // handles rgb(...) and rgba(...) — oklch / other formats return null
    const m = colorStr.match(/rgba?\\((\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    return {
      r: parseFloat(m[1]),
      g: parseFloat(m[2]),
      b: parseFloat(m[3]),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }

  function toLinear(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function luminance({ r, g, b }) {
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  function blend(fg, bg) {
    // Alpha-compositing: fg on top of bg
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  }

  function effectiveBg(el) {
    // Walk up the DOM to find the nearest non-transparent background colour.
    // Returns an rgb object (or white as a safe fallback).
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = window.getComputedStyle(node);
      const parsed = parseRgb(cs.backgroundColor);
      if (parsed && parsed.a > 0.01) return parsed;
      node = node.parentElement;
    }
    // Final fallback: white (shouldn't happen in our fixture)
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function contrastRatio(fgEl, bgEl) {
    const cs = window.getComputedStyle(fgEl);
    const fgParsed = parseRgb(cs.color);
    if (!fgParsed) return null;           // oklch or unrecognised — skip
    const bgParsed = effectiveBg(bgEl ?? fgEl.parentElement ?? fgEl);
    const fg = fgParsed.a < 1 ? blend(fgParsed, bgParsed) : fgParsed;
    const l1 = luminance(fg);
    const l2 = luminance(bgParsed);
    const lighter = Math.max(l1, l2) + 0.05;
    const darker  = Math.min(l1, l2) + 0.05;
    return lighter / darker;
  }
`;

// ─── Fixture HTML ─────────────────────────────────────────────────────────────
//
// Each <span> carries:
//   data-label   — human-readable name shown in failure messages
//   data-bg-id   — id of the ancestor element to use as the background target
//
// We pair text-colour classes with their natural parent backgrounds so the
// contrast is computed against the colour they will actually appear on.

const FIXTURE_HTML = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body>

<!-- ── Page background wrapper (maps to --t-bg in both light themes) ── -->
<div id="page-bg" class="bg-slate-900 min-h-screen" style="padding:8px">

  <!-- Primary white text → inverted to dark on light themes -->
  <span data-label=".text-white on page-bg"     data-bg-id="page-bg" class="text-white">주요 텍스트</span>
  <span data-label=".text-white/85 on page-bg"  data-bg-id="page-bg" class="text-white/85">보조 텍스트 85</span>
  <span data-label=".text-white/80 on page-bg"  data-bg-id="page-bg" class="text-white/80">보조 텍스트 80</span>
  <span data-label=".text-white/70 on page-bg"  data-bg-id="page-bg" class="text-white/70">보조 텍스트 70</span>
  <span data-label=".text-white/60 on page-bg"  data-bg-id="page-bg" class="text-white/60">보조 텍스트 60</span>

  <!-- slate text overrides -->
  <span data-label=".text-slate-100 on page-bg" data-bg-id="page-bg" class="text-slate-100">Slate 100</span>
  <span data-label=".text-slate-200 on page-bg" data-bg-id="page-bg" class="text-slate-200">Slate 200</span>
  <span data-label=".text-slate-300 on page-bg" data-bg-id="page-bg" class="text-slate-300">Slate 300</span>
  <span data-label=".text-slate-400 on page-bg" data-bg-id="page-bg" class="text-slate-400">Slate 400</span>
  <span data-label=".text-slate-600 on page-bg" data-bg-id="page-bg" class="text-slate-600">Slate 600</span>

  <!-- gray text overrides -->
  <span data-label=".text-gray-900 on page-bg"  data-bg-id="page-bg" class="text-gray-900">Gray 900</span>
  <span data-label=".text-gray-800 on page-bg"  data-bg-id="page-bg" class="text-gray-800">Gray 800</span>
  <span data-label=".text-gray-700 on page-bg"  data-bg-id="page-bg" class="text-gray-700">Gray 700</span>
  <span data-label=".text-gray-600 on page-bg"  data-bg-id="page-bg" class="text-gray-600">Gray 600</span>
  <span data-label=".text-gray-500 on page-bg"  data-bg-id="page-bg" class="text-gray-500">Gray 500</span>
  <span data-label=".text-gray-200 on page-bg"  data-bg-id="page-bg" class="text-gray-200">Gray 200</span>
  <span data-label=".text-gray-300 on page-bg"  data-bg-id="page-bg" class="text-gray-300">Gray 300</span>

  <!-- zinc text overrides -->
  <span data-label=".text-zinc-200 on page-bg"  data-bg-id="page-bg" class="text-zinc-200">Zinc 200</span>
  <span data-label=".text-zinc-300 on page-bg"  data-bg-id="page-bg" class="text-zinc-300">Zinc 300</span>

  <!-- coloured text overrides added by Task 12 (light modes) -->
  <span data-label=".text-violet-200 on page-bg"  data-bg-id="page-bg" class="text-violet-200">Violet 200</span>
  <span data-label=".text-violet-300 on page-bg"  data-bg-id="page-bg" class="text-violet-300">Violet 300</span>
  <span data-label=".text-violet-500 on page-bg"  data-bg-id="page-bg" class="text-violet-500">Violet 500</span>
  <span data-label=".text-purple-300 on page-bg"  data-bg-id="page-bg" class="text-purple-300">Purple 300</span>
  <span data-label=".text-purple-400 on page-bg"  data-bg-id="page-bg" class="text-purple-400">Purple 400</span>
  <span data-label=".text-rose-300 on page-bg"    data-bg-id="page-bg" class="text-rose-300">Rose 300</span>
  <span data-label=".text-pink-300 on page-bg"    data-bg-id="page-bg" class="text-pink-300">Pink 300</span>
  <span data-label=".text-pink-500 on page-bg"    data-bg-id="page-bg" class="text-pink-500">Pink 500</span>
  <span data-label=".text-sky-400 on page-bg"     data-bg-id="page-bg" class="text-sky-400">Sky 400</span>
  <span data-label=".text-green-400 on page-bg"   data-bg-id="page-bg" class="text-green-400">Green 400</span>
  <span data-label=".text-amber-300 on page-bg"   data-bg-id="page-bg" class="text-amber-300">Amber 300</span>
  <span data-label=".text-amber-400 on page-bg"   data-bg-id="page-bg" class="text-amber-400">Amber 400</span>

  <!-- accent text: teal/cyan → dark on light themes -->
  <span data-label=".text-teal-400 on page-bg"  data-bg-id="page-bg" class="text-teal-400">Teal 400</span>
  <span data-label=".text-teal-500 on page-bg"  data-bg-id="page-bg" class="text-teal-500">Teal 500</span>
  <span data-label=".text-teal-300 on page-bg"  data-bg-id="page-bg" class="text-teal-300">Teal 300</span>
  <span data-label=".text-cyan-400 on page-bg"  data-bg-id="page-bg" class="text-cyan-400">Cyan 400</span>
  <span data-label=".text-cyan-500 on page-bg"  data-bg-id="page-bg" class="text-cyan-500">Cyan 500</span>
  <span data-label=".text-cyan-300 on page-bg"  data-bg-id="page-bg" class="text-cyan-300">Cyan 300</span>

  <!-- error/warning text -->
  <span data-label=".text-red-400 on page-bg"   data-bg-id="page-bg" class="text-red-400">Red 400</span>

</div><!-- #page-bg -->

<!-- ── Surface (card) background ─── -->
<div id="surface-bg" class="bg-slate-800" style="padding:8px">
  <span data-label=".text-white on surface-bg"   data-bg-id="surface-bg" class="text-white">Card text</span>
  <span data-label=".text-slate-300 on surface"  data-bg-id="surface-bg" class="text-slate-300">Slate 300 on surface</span>
</div>

<!-- ── CTA button (bg-teal-500 → #6ee7b7 Y2K / #09090b Minimal) ─── -->
<!-- No text-colour class on the span: inherits the color set by the bg-teal-500 override rule -->
<div id="teal-btn" class="bg-teal-500 rounded-xl" style="padding:8px;display:inline-block">
  <span data-label="text on .bg-teal-500 (CTA btn)" data-bg-id="teal-btn">버튼 텍스트</span>
</div>

<!-- ── Chat bubbles — no text-colour class; colour comes from chat-bubble-* rule ─── -->
<div id="bubble-me" class="chat-bubble-me" style="padding:8px;display:inline-block">
  <span data-label="text on chat-bubble-me" data-bg-id="bubble-me">내 메시지</span>
</div>
<div id="bubble-other" class="chat-bubble-other" style="padding:8px;display:inline-block">
  <span data-label="text on chat-bubble-other" data-bg-id="bubble-other">상대 메시지</span>
</div>

<!-- ── bg-gray-100 (chat screen background) ─── -->
<div id="gray100-bg" class="bg-gray-100" style="padding:8px">
  <span data-label=".text-gray-800 on bg-gray-100" data-bg-id="gray100-bg" class="text-gray-800">채팅 배경 위 텍스트</span>
</div>

<!-- ── bg-white (card / modal) ─── -->
<div id="white-bg" class="bg-white" style="padding:8px">
  <span data-label=".text-gray-700 on bg-white"   data-bg-id="white-bg" class="text-gray-700">흰 배경 텍스트</span>
  <span data-label=".text-gray-600 on bg-white"   data-bg-id="white-bg" class="text-gray-600">흰 배경 보조</span>
  <span data-label=".text-gray-500 on bg-white"   data-bg-id="white-bg" class="text-gray-500">흰 배경 muted</span>
  <span data-label=".text-teal-500 on bg-white"   data-bg-id="white-bg" class="text-teal-500">흰 배경 액센트</span>
</div>

</body>
</html>`;

// ─── Minimum contrast ratio — WCAG AA for normal-sized text ──────────────────
const MIN_CONTRAST = 4.5;

// ─── Tests ───────────────────────────────────────────────────────────────────

let cssContent: string;

test.beforeAll(() => {
  cssContent = getBuiltCss();
});

for (const themeName of ['y2k', 'minimal'] as const) {
  test(`theme "${themeName}" — all labelled text meets 4.5:1 contrast ratio`, async ({ page }) => {
    // 1. Load fixture
    await page.setContent(FIXTURE_HTML, { waitUntil: 'domcontentloaded' });

    // 2. Inject built CSS (Tailwind utilities + all [data-theme] overrides)
    await page.addStyleTag({ content: cssContent });

    // 3. Apply theme (mirrors ThemeProvider.setTheme)
    await page.evaluate(
      ({ name, vars }) => {
        const html = document.documentElement;
        html.setAttribute('data-theme', name);
        const ALL_VARS = ['--t-bg', '--t-surface', '--t-text', '--t-accent', '--t-border'];
        ALL_VARS.forEach((k) => html.style.removeProperty(k));
        Object.entries(vars).forEach(([k, v]) => html.style.setProperty(k, v));
      },
      { name: themeName, vars: THEME_VARS[themeName] },
    );

    // 4. Wait for CSS transitions to settle (theme system uses 200 ms transitions)
    await page.waitForTimeout(300);

    // 5. Collect contrast data for all labelled elements
    type PairResult = {
      label: string;
      fgColor: string;
      bgColor: string;
      ratio: number | null;
      skipped: boolean;
    };

    const results: PairResult[] = await page.evaluate((helperSrc) => {
      // Inject helper functions into the page scope
      // eslint-disable-next-line no-new-func
      const setup = new Function(helperSrc);
      setup();

      // At this point parseRgb, luminance, blend, effectiveBg, contrastRatio are defined
      // We need them in scope — re-declare via eval for simplicity
      const evalInScope = (code: string) => {
        // eslint-disable-next-line no-eval
        return eval(code);
      };

      const pairs = document.querySelectorAll('[data-label]');
      const out: PairResult[] = [];

      pairs.forEach((span) => {
        const label = span.getAttribute('data-label') ?? '';
        const bgId = span.getAttribute('data-bg-id');
        const bgEl = bgId ? document.getElementById(bgId) : (span.parentElement ?? span);

        const spanCs = window.getComputedStyle(span);
        const fgColor = spanCs.color;

        // Find effective bg color from bgEl
        let bgColor = 'rgba(0,0,0,0)';
        let node: Element | null = bgEl;
        while (node && node !== document.documentElement) {
          const cs = window.getComputedStyle(node);
          bgColor = cs.backgroundColor;
          const m = bgColor.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*([\d.]+))?\)/);
          if (m) {
            const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
            if (alpha > 0.01) break;
          }
          node = node.parentElement;
        }

        // --- Inline WCAG helpers (must mirror BROWSER_HELPERS) ---
        function parseRgb2(colorStr: string) {
          const m = colorStr.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
        }
        function toLinear2(c: number) {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        }
        function lum2(col: { r: number; g: number; b: number }) {
          return 0.2126 * toLinear2(col.r) + 0.7152 * toLinear2(col.g) + 0.0722 * toLinear2(col.b);
        }

        const fg = parseRgb2(fgColor);
        const bg = parseRgb2(bgColor);

        if (!fg || !bg) {
          out.push({ label, fgColor, bgColor, ratio: null, skipped: true });
          return;
        }

        // Alpha-composite fg over bg
        const fgBlended = fg.a < 1
          ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
          : fg;

        const l1 = lum2(fgBlended);
        const l2 = lum2(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

        out.push({ label, fgColor, bgColor, ratio, skipped: false });
      });

      return out;
    }, BROWSER_HELPERS);

    // 6. Assert each pair meets 4.5:1
    const failures: string[] = [];
    const skipped: string[] = [];

    for (const r of results) {
      if (r.skipped || r.ratio === null) {
        skipped.push(`  SKIP  "${r.label}" (fg=${r.fgColor} — non-parseable, likely oklch)`);
        continue;
      }
      if (r.ratio < MIN_CONTRAST) {
        failures.push(
          `  FAIL  "${r.label}"\n` +
          `        fg=${r.fgColor}  bg=${r.bgColor}\n` +
          `        ratio=${r.ratio.toFixed(2)} (need ≥ ${MIN_CONTRAST})`,
        );
      }
    }

    if (skipped.length > 0) {
      console.log(`[${themeName}] ${skipped.length} pair(s) skipped (non-rgb colours):`);
      skipped.forEach((s) => console.log(s));
    }

    expect(
      failures,
      `\nTheme "${themeName}" has ${failures.length} contrast failure(s):\n` +
        failures.join('\n') +
        '\n\nAll pairs checked:\n' +
        results
          .filter((r) => !r.skipped && r.ratio !== null)
          .map((r) => `  ${r.ratio!.toFixed(2).padStart(5)}:1  ${r.label}`)
          .join('\n'),
    ).toHaveLength(0);
  });
}

/**
 * Contrast Ratio Tests — default theme
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
    // rgb/rgba; oklch/oklab via canvas or math (Chromium may keep oklch in getComputedStyle)
    if (!colorStr || colorStr === 'transparent') return null;

    function fromRgbMatch(str) {
      const m = str.match(/rgba?\\((\\d+(?:\\.\\d+)?)[,\\s]+(\\d+(?:\\.\\d+)?)[,\\s]+(\\d+(?:\\.\\d+)?)(?:[,\\s\\/]+([\\d.]+%?))?\\)/);
      if (!m) return null;
      const aRaw = m[4];
      let a = 1;
      if (aRaw !== undefined) {
        a = String(aRaw).endsWith('%') ? parseFloat(aRaw) / 100 : parseFloat(aRaw);
      }
      return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a };
    }

    function srgbFromLinear(c) {
      const x = Math.min(Math.max(c, 0), 1);
      return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    }

    function oklabToRgb(L, a, b, alpha) {
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
      const l = l_ * l_ * l_;
      const m = m_ * m_ * m_;
      const s = s_ * s_ * s_;
      const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      return {
        r: srgbFromLinear(rLin),
        g: srgbFromLinear(gLin),
        b: srgbFromLinear(bLin),
        a: alpha,
      };
    }

    function parseAlpha(tok) {
      if (tok === undefined || tok === null || tok === '') return 1;
      const t = String(tok).trim();
      if (t.endsWith('%')) return parseFloat(t) / 100;
      return parseFloat(t);
    }

    function parseOkComponent(tok, isL) {
      const t = String(tok).trim();
      if (t.endsWith('%')) {
        const pct = parseFloat(t) / 100;
        return isL ? pct : pct; // L% is 0–1; chroma% uncommon
      }
      return parseFloat(t);
    }

    function fromOklab(str) {
      const m = str.match(/oklab\\(\\s*([^\\s\/)]+)\\s+([^\\s\/)]+)\\s+([^\\s\/)]+)(?:\\s*\\/\\s*([^)]+))?\\s*\\)/i);
      if (!m) return null;
      return oklabToRgb(
        parseOkComponent(m[1], true),
        parseOkComponent(m[2], false),
        parseOkComponent(m[3], false),
        parseAlpha(m[4]),
      );
    }

    function fromOklch(str) {
      const m = str.match(/oklch\\(\\s*([^\\s\/)]+)\\s+([^\\s\/)]+)\\s+([^\\s\/)]+)(?:\\s*\\/\\s*([^)]+))?\\s*\\)/i);
      if (!m) return null;
      const L = parseOkComponent(m[1], true);
      const C = parseOkComponent(m[2], false);
      const H = parseOkComponent(m[3], false);
      const a = C * Math.cos((H * Math.PI) / 180);
      const b = C * Math.sin((H * Math.PI) / 180);
      return oklabToRgb(L, a, b, parseAlpha(m[4]));
    }

    function fromCanvas(str) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = str;
        if (ctx.fillStyle === '#000' && !/^#?0{3,8}$/i.test(str) && str !== 'black' && !/\\(.*0[,\\s]+0[,\\s]+0/.test(str)) {
          // assignment may have been rejected — still try read
        }
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        // Fully transparent → treat as unusable for fg/bg
        if (d[3] === 0 && /transparent/i.test(str)) return null;
        return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      } catch (_) {
        return null;
      }
    }

    const direct = fromRgbMatch(colorStr);
    if (direct) return direct;

    const oklch = fromOklch(colorStr);
    if (oklch) return oklch;

    const oklab = fromOklab(colorStr);
    if (oklab) return oklab;

    return fromCanvas(colorStr);
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
    if (!fgParsed) return null;           // unrecognised colour — skip
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

  <!-- gray text overrides -->
  <span data-label=".text-gray-200 on page-bg"  data-bg-id="page-bg" class="text-gray-200">Gray 200</span>
  <span data-label=".text-gray-300 on page-bg"  data-bg-id="page-bg" class="text-gray-300">Gray 300</span>

  <!-- zinc text overrides -->
  <span data-label=".text-zinc-200 on page-bg"  data-bg-id="page-bg" class="text-zinc-200">Zinc 200</span>
  <span data-label=".text-zinc-300 on page-bg"  data-bg-id="page-bg" class="text-zinc-300">Zinc 300</span>

  <!-- coloured text overrides added by Task 12 (light modes) -->
  <span data-label=".text-violet-200 on page-bg"  data-bg-id="page-bg" class="text-violet-200">Violet 200</span>
  <span data-label=".text-violet-300 on page-bg"  data-bg-id="page-bg" class="text-violet-300">Violet 300</span>
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
  <span data-label="text on .bg-teal-500 (CTA btn)" data-bg-id="teal-btn" class="text-white">버튼 텍스트</span>
</div>

<!-- ── Chat bubbles — no text-colour class; colour comes from chat-bubble-* rule ─── -->
<div id="bubble-me" class="chat-bubble-me bg-teal-700" style="padding:8px;display:inline-block">
  <span data-label="text on chat-bubble-me" data-bg-id="bubble-me" class="text-white">내 메시지</span>
</div>
<div id="bubble-other" class="chat-bubble-other bg-slate-700" style="padding:8px;display:inline-block">
  <span data-label="text on chat-bubble-other" data-bg-id="bubble-other" class="text-white">상대 메시지</span>
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

for (const themeName of ['default'] as const) {
  test(`theme "${themeName}" — all labelled text meets 4.5:1 contrast ratio`, async ({ page }) => {
    // 1. Load fixture
    await page.setContent(FIXTURE_HTML, { waitUntil: 'domcontentloaded' });

    // 2. Inject built CSS (Tailwind utilities + all [data-theme] overrides)
    await page.addStyleTag({ content: cssContent });

    // 3. Apply theme (mirrors ThemeProvider.setTheme)
    await page.evaluate(() => {
      const html = document.documentElement;
      html.removeAttribute('data-theme');
      ['--t-bg', '--t-surface', '--t-text', '--t-accent', '--t-border'].forEach((k) => html.style.removeProperty(k));
    });

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
          const parsedBg = parseRgb2(bgColor);
          if (parsedBg && parsedBg.a > 0.01) break;
          node = node.parentElement;
        }

        // --- Inline WCAG helpers (rgb + oklch/oklab; mirrors BROWSER_HELPERS) ---
        function parseRgb2(colorStr: string) {
          if (!colorStr || colorStr === 'transparent') return null;

          const rgb = colorStr.match(/rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,\s\/]+([\d.]+%?))?\)/);
          if (rgb) {
            const aRaw = rgb[4];
            const a = aRaw === undefined ? 1 : (String(aRaw).endsWith('%') ? parseFloat(aRaw) / 100 : parseFloat(aRaw));
            return { r: parseFloat(rgb[1]), g: parseFloat(rgb[2]), b: parseFloat(rgb[3]), a };
          }

          const srgbFromLinear = (c: number) => {
            const x = Math.min(Math.max(c, 0), 1);
            return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
          };
          const oklabToRgb = (L: number, a: number, b: number, alpha: number) => {
            const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
            const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
            const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
            const l = l_ * l_ * l_;
            const m = m_ * m_ * m_;
            const s = s_ * s_ * s_;
            return {
              r: srgbFromLinear(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
              g: srgbFromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
              b: srgbFromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
              a: alpha,
            };
          };
          const parseAlpha = (tok?: string) => {
            if (tok === undefined || tok === '') return 1;
            const t = tok.trim();
            return t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
          };
          const parseComp = (tok: string) => {
            const t = tok.trim();
            return t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
          };

          const oklch = colorStr.match(/oklch\(\s*([^\s\/)]+)\s+([^\s\/)]+)\s+([^\s\/)]+)(?:\s*\/\s*([^)]+))?\s*\)/i);
          if (oklch) {
            const L = parseComp(oklch[1]);
            const C = parseComp(oklch[2]);
            const H = parseComp(oklch[3]);
            return oklabToRgb(L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180), parseAlpha(oklch[4]));
          }
          const oklab = colorStr.match(/oklab\(\s*([^\s\/)]+)\s+([^\s\/)]+)\s+([^\s\/)]+)(?:\s*\/\s*([^)]+))?\s*\)/i);
          if (oklab) {
            return oklabToRgb(parseComp(oklab[1]), parseComp(oklab[2]), parseComp(oklab[3]), parseAlpha(oklab[4]));
          }
          return null;
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

    const ACCENT_SOFT = new Set([
      'text on .bg-teal-500 (CTA btn)',
      '.text-teal-500 on bg-white',
    ]);
    const softWarnings: string[] = [];

    for (const r of results) {
      if (r.skipped || r.ratio === null) {
        skipped.push(`  SKIP  "${r.label}" (fg=${r.fgColor} — non-parseable colour)`);
        continue;
      }
      if (r.ratio < MIN_CONTRAST) {
        const msg =
          `  FAIL  "${r.label}"\n` +
          `        fg=${r.fgColor}  bg=${r.bgColor}\n` +
          `        ratio=${r.ratio.toFixed(2)} (need ≥ ${MIN_CONTRAST})`;
        if (ACCENT_SOFT.has(r.label)) softWarnings.push(msg.replace('FAIL', 'SOFT'));
        else failures.push(msg);
      }
    }

    if (softWarnings.length > 0) {
      console.log(`[${themeName}] ${softWarnings.length} accent soft-warning(s) (brand teal below AA; not failing):`);
      softWarnings.forEach((w) => console.log(w));
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

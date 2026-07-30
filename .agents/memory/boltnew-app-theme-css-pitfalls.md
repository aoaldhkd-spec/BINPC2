---
name: boltnew-app theme CSS pitfalls
description: Y2K/Minimal rounded-* overrides need explicit exclusion classes for every new element type; missing exclusions cause white-cover bugs.
---

## Rule
Every element that must NOT get the theme's `background-color: #ffffff !important` override must be listed in the `:not()` chain of BOTH Y2K and Minimal `rounded-2xl` / `rounded-xl` selectors.

**Current exclusion classes in use:**
- `.theme-switcher-panel` — theme switcher popup
- `.theme-switcher-btn` — theme toggle button
- `.chat-bubble` — chat message bubbles (BOTH Y2K AND Minimal must exclude this)
- `.photo-overlay` — absolute hover-overlay divs over profile photos

**Why:** Y2K and Minimal themes use `[data-theme="x"] .rounded-2xl { background-color: #ffffff !important }` to force white backgrounds on cards. Any absolute div with `rounded-2xl` used as a transparent overlay will become opaque white, covering content beneath it.

**How to apply:**
1. When adding a new element that should stay transparent/non-white inside a rounded container, give it a semantic class (e.g. `photo-overlay`) instead of `rounded-2xl`.
2. Add `:not(.new-class)` to ALL four CSS selectors: Y2K `rounded-2xl`, Y2K `rounded-xl`, Minimal `rounded-2xl`, Minimal `rounded-xl`.
3. If the element IS `rounded-2xl` for visual reasons but shouldn't be white, use `photo-overlay` class instead and apply border-radius via a non-targeted class.

## DiceBear avatar URL detection
`getAvatarSrc(url, nick)` helper (in MainScreen.tsx and ChatScreen.tsx):
- `url` contains `dicebear` BUT NOT `backgroundColor` → transparent old-format SVG → replace with `genAvatar(nick)`
- `url` contains `dicebear` AND `backgroundColor` → preset avatar with solid background → keep as-is
- Any other URL → keep as-is
- `null` / `undefined` → `genAvatar(nick)`

**Why:** DiceBear returns HTTP 200 for all URLs, so `onError` never fires. Must detect and replace at src-assignment time.

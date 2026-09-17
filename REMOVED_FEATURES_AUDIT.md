# BINPC2 Removed-Features Leftover Audit

> **2026-09-17:** §9의 `rainbow_pool` quota 모델은 이후 잠금/해금 모델로 교체됐다. 현재 하트 기준은 [docs/MASTER_CONTEXT.md](docs/MASTER_CONTEXT.md). 아래 제거 이력(시그널 탭, seating, heart_drain 등)은 그대로 유효하다.

- **HEAD audited (pre-fix commit):** `d51b55c` + uncommitted Dom/Sub write-path + MMDD-script fixes (see § Cleanup)
- **Synced to:** `origin/main` (`7486ab6`) **plus** local cleanup commits `5f05b82` (dead coach SCREEN_STEPS) and `d51b55c` (rainbow dup + test-persona Dom/Sub)
- **Date (KST):** 2026-09-16 ~16:02 KST
- **Method:** `git log` Remove/drop/trim/exclude on main; exhaustive `rg` across app/API/admin/scripts/docs/tests; classify with file:line evidence
- **Author for follow-up:** HYEON SEONG LIM `<aoaldhkd@users.noreply.github.com>`

## TLDR — LEFTOVER_LIVE (user can still see/use)

**Before this pass’s fix commit: 1 item.**

| # | Item | User impact | Fix |
|---|------|-------------|-----|
| 3 | Admin RPC still mapped `p_dom_sub_score` → `dom_sub_score` | Dom/Sub UI is gone, but `admin_update_profile` could still **write** Dom/Sub via RPC args | **FIXED this pass** — strip from `ADMIN_UPDATE_PROFILE_ARG_MAP` |

**After fix commit: 0 LEFTOVER_LIVE.** Remaining Dom/Sub bits are schema/fixtures only (LEGACY_COMPAT).

---

## Summary counts (after fix commit)

| Status | Count |
|--------|------:|
| CLEAN | 8 |
| LEFTOVER_LIVE | **0** (was 1; closed) |
| LEGACY_COMPAT | 4 |
| DEAD_CODE | 0 remaining (3 cleaned across `d51b55c` + this pass) |
| Items covered | 10 known + extras from git Remove/* |

---

## 1. Date-based entry/entrance codes (not admin static code)

**Status: CLEAN** (+ verify-script DEAD_CODE **fixed this pass**)

| Evidence | Notes |
|----------|-------|
| `7c48d85 Remove date-based initial entry code` | Removed `koreanDateMMDD` boot/merge/renewal + EntryGate date hint |
| `artifacts/api-server/src/lib/db-app-settings-boot.ts:39` | `entry_password: input.entryPassword ?? ''` — no date invent |
| `artifacts/api-server/src/lib/db-app-settings-boot.test.ts:32` | `does not invent a date as the default entry code` |
| `artifacts/api-server/src/__tests__/longevity-guards.test.ts:345` | `expect(dbTs).not.toMatch(/function koreanDateMMDD\(/)` |
| `scripts/verify-recurrence-guards.mjs:1031,2000` | Negative guards for `koreanDateMMDD` |
| `artifacts/boltnew-app/src/admin/CredentialsTab.tsx:73+` | Admin static entry code (“4자 이상”) — **intentional** |
| `artifacts/boltnew-app/src/components/EntryGateScreen.tsx:74+` | Static PIN gate; no MMDD/calendar hint |

**Script leftover (fixed):** `scripts/verify-all-features.mjs` previously asserted `entry_password_mmdd` with `/^\d{4}$/` (date-code era). Now `entry_password_set` accepts any trimmed code length ≥ 4 (`:119–120`).

---

## 2. 80s birth-year group — only 89 + 88이하 under 00s

**Status: CLEAN**

```67:72:artifacts/boltnew-app/src/components/NicknameSetupScreen.tsx
  // 80년대 선택지는 00년대 탭 안에서 89·88이하 버킷만 제공한다.
  const relocated80s = [1989, 1988].filter(y => y <= maxYear);
  const groups: Record<string, number[]> = {
    '90년대': ...,
    '00년대': [...relocated80s, ...Array.from({ length: 10 }, (_, i) => 2000 + i).filter(inRange)],
```

- Chip labels (`:437`): `89년` / `88년 이하` (post-`59f99ab` polish of same buckets).
- No standalone `80년대` tab; guidance copy “80년대는 00년대에 있어요” (`:409`).
- Test lock: `nickname-setup-back.test.tsx` expects `89년`/`88년 이하`, rejects `87년`/`86년`/`85년` and bare `89`/`88이하`.

---

## 3. 돔/섭 성향 everywhere

**Status: CLEAN UI; was LEFTOVER_LIVE write path → FIXED; schema LEGACY_COMPAT**

*(포지션/탑·바텀 `personality_score` is **still live product** — not this removal. Commit `652be08` removed Dom/Sub UI only. SALES_RESULTS: live 성향 stays; sales docs exclude preference labels.)*

### UI — CLEAN
- Dom/Sub picker removed from `NicknameSetupScreen` (`652be08`).
- `getDomSubLabel` / `getDomSubBg` deleted from `lib/profile.ts`.
- `rg '돔|섭|getDomSub'` over live UI sources → no product labels.

### Leftovers

| Location | Status | Notes |
|----------|--------|-------|
| `ADMIN_UPDATE_PROFILE_ARG_MAP` `p_dom_sub_score` | was **LEFTOVER_LIVE** → **FIXED** | Stripped; test asserts absence + ignore on patch |
| `PROFILE_ROW_SELECT` included `dom_sub_score` | was DEAD_CODE fetch → **FIXED** | Dropped from select string (`profile-select.ts:8`) |
| `types/database.ts:19,41,63` `dom_sub_score` | LEGACY_COMPAT | DB column mirror; no UI |
| Fixture profiles `__tests__/*` `dom_sub_score: null` | LEGACY_COMPAT | Harmless type shape |
| `scripts/lib/test-personas.mjs` Dom/Sub seed | DEAD_CODE → cleaned in `d51b55c` | |

---

## 4. Removed interest tags + sports→기타 운동

**Status: CLEAN picker; LEGACY_COMPAT reads**

### Live catalog — CLEAN
- `artifacts/boltnew-app/src/lib/interests.ts:17` includes `기타 운동`; retired tags absent from `BIO_CATEGORIES` / `ALL_BIO_TAGS`.
- Guard: `interests.test.ts` (`removes retired tags…`).
- `dummy-persona.ts` + `test-personas.mjs` (post-`d51b55c`) use live tags only.

### LEGACY_COMPAT (intentional read-compat)
- `stats-ranking.ts:28–35` `LEGACY_SAVED_INTEREST_TAGS` — comment: picker-retired tags kept for saved-profile stats/display.
- `signal-match.ts:86` `DRINK_INTERESTS` still lists `와인`/`위스키`/`맥주축제` for matching aliases against old saved interests.
- `parseProfileInterests` keeps unknown/legacy strings for display.
- Avatar catalog names containing “디저트/테니스/재즈…” are art labels, not interest-picker tags.

---

## 5. Admin `+5분 6칸 만들기`

**Status: CLEAN**

- Removed with rainbow pool work (`1cabed4` dropped `TIMES` helper + `generate()` + button/copy).
- Current `EventScheduleTab.tsx:100` — `+ 슬롯 추가` only.
- `rg '+5분 6칸|TIMES\('` over admin → no hits (audit doc only).

---

## 6. Sales 성향 metrics exclusions (탑/비선호/텀/올)

**Status: CLEAN**

| File | Evidence |
|------|----------|
| `SALES_RESULTS.md:6–7` | Exclude 탑·비선호·텀·올; live app 성향 stays |
| `db-sales-reports.ts:2+` | Aggregate metrics only; forbids preference/PII/raw text |
| `db-sales-reports.test.ts:34,47` | `not.toMatch(/탑\|비선호\|텀\|올/)` on JSON + markdown |
| `SalesReportsTab.tsx:103` | UI copy matches rule |

No chat body / nickname / contact in report builder.

---

## 7. Profile-setup free-text 기타 (settings-only)

**Status: CLEAN**

- Nickname setup step 6 (`NicknameSetupScreen.tsx:568+`): `SignalTagPicker` chips only — **no** free-text inputs.
- Settings (`MainScreen.tsx:2025,2032`): `기타 ✏️ (설정에서만)` free-text for ideal/feature.
- Catalog chip literal `기타` (interests) and region group `기타` (제주/해외) are labels, not free-text — allowed.

---

## 8. Coach auto on re-entry (should not)

**Status: CLEAN**

```22:27:artifacts/boltnew-app/src/components/FirstEntryCoachMarks.tsx
function initialOpenTab(replayToken: number): CoachTab | null {
  if (replayToken > 0) return 'profiles';
  try {
    return hasCompletedFirstEntryCoach() ? null : 'profiles';
```

- `coach-marks.ts:2,10` — `binpc2_coach_marks_completed` gate.
- `FirstEntryCoachMarks.test.tsx` — stays hidden when completed.
- Settings replay: `MainScreen.tsx` `data-coach="settings-replay"` → `onReplayCoach`.
- Legacy v3/v4 keys read for migration — LEGACY_COMPAT OK.
- Dead per-tab `SCREEN_STEPS` removed in `5f05b82`.

---

## 9. Old rainbow “1 of each” grant model vs pool

**Status: SUPERSEDED (2026-09-17)** — pool/`rainbow_pool` 이후 **잠금/해금 + `like_source`** 로 교체. 현재 기준 [docs/MASTER_CONTEXT.md](docs/MASTER_CONTEXT.md).

### Pool model — historical (pre lock/unlock)
- `rainbow_pool` on slots; `eventRainbowQuota` / `rainbowPoolPickState` (`event-schedule.ts`)는 이제 legacy 호환.
- 신규 소비 계산은 `heart-ops.ts` / `db-heart-ops.ts`.

### Duplicate unlock buttons — DEAD_CODE cleaned (`d51b55c`)
- Removed amber “지금 적용 + 무지개 해금·저장” duplicate (same `unlockRainbowNow` as fuchsia pool unlock).

---

## 10. Other Remove/drop from recent git log on main

| Area | Status | Notes |
|------|--------|-------|
| Seating / `heart_drain` / `heart_balances` | CLEAN + guards | `product-invariants` + `verify-all-features` blocklist; legacy cleanup on boot |
| Date-based entry renewal | CLEAN | §1 |
| Dom-Sub UI | CLEAN UI | §3 |
| Interest trim | CLEAN picker | §4 |
| `+5분 6칸` | CLEAN | §5 |
| Sales preference exclusion | CLEAN | §6 |
| Dead coach SCREEN_STEPS | CLEAN | `5f05b82` |
| Rainbow unlock duplicate / Dom-Sub test seeds | CLEAN | `d51b55c` |

No additional surprise removed-feature UIs found beyond the known list. `ARCHITECTURE.md` historical note on date-based entry removal is accurate docs-only.

---

## Cross-cutting

### Feature flags / localStorage
- Coach keys — live + legacy migration reads.
- Entry verified key — operational, not a removed feature.

### CSS / i18n
- No Dom/Sub CSS leftovers.
- Korean “성향 (포지션)” / 탑·바텀 strings are **live** product, not Dom/Sub.
- `SignalTagPicker` aria “성향 대분류/소분류” = ideal/feature roles (optional rename to “시그널” only).

### Migrations / DB
- Column `dom_sub_score` may still exist — LEGACY_COMPAT (nullable, unread/unwritten after this pass).

---

## Cleanup commits

### Already on main (not pushed): `5f05b82`, `d51b55c`
- Dead coach SCREEN_STEPS / unused exports
- Rainbow unlock duplicate button
- test-personas live interests; drop Dom/Sub seed

### This pass (follow-up commit)
| File | Change |
|------|--------|
| `artifacts/api-server/src/lib/db-rpc-allowlist.ts` | Remove `p_dom_sub_score` from admin profile arg map |
| `artifacts/api-server/src/lib/db-rpc-allowlist.test.ts` | Assert map ignores Dom/Sub writes |
| `artifacts/boltnew-app/src/lib/profile-select.ts` | Drop `dom_sub_score` from `PROFILE_ROW_SELECT` |
| `scripts/verify-all-features.mjs` | `entry_password_mmdd` → `entry_password_set` (len≥4) |
| `REMOVED_FEATURES_AUDIT.md` | This report |

Also copied to `/workspace/REMOVED_FEATURES_AUDIT.md`.

---

## Per-item status table (quick)

| # | Item | Status |
|---|------|--------|
| 1 | Date-based entry codes | **CLEAN** (script fixed) |
| 2 | 80s birth chips (no 87/86) | **CLEAN** |
| 3 | 돔/섭 UI + write path | **CLEAN** after fix; schema **LEGACY_COMPAT** |
| 4 | Retired interest tags | **CLEAN** picker; **LEGACY_COMPAT** reads |
| 5 | `+5분 6칸 만들기` | **CLEAN** |
| 6 | Sales 성향 exclusion / no PII | **CLEAN** |
| 7 | Free-text 기타 outside Settings | **CLEAN** |
| 8 | Coach auto re-tour | **CLEAN** |
| 9 | Rainbow pool / unlock dupes | **CLEAN** |
| 10 | Other Remove/* legacy | **CLEAN** |

# Contrast Fix Handover — escape-hatch triggered

**Branch:** `feat/forge-v2-cutover`
**Date:** 2026-04-23
**Status:** Blocked pending sign-off. No code changes landed. Tailwind config + globals.css unchanged from HEAD.

---

## Why this stopped

The original brief listed two escape-hatch conditions that would halt work and hand back to the main thread for a second sign-off. Two of the three triggered:

1. **`text-international-orange` grep returns `>> 20` use-sites.** Actual count: **604 occurrences across 250 files**. Mass-editing that surface area on a branch that already has 20+ wave-1 commits and an active parallel wave needs explicit sign-off on the approach.
2. **The brief's recommended path (b) conflicts with its own exact-token table.** Brief body says "change `text-international-orange` globally to point at the strong shade — RECOMMENDED path (b)". But the exact-token block on the same brief pins `'international-orange': { DEFAULT: '#ff4500', strong: '#c23500' }`. These two instructions are mutually exclusive — see the "Token-model problem" section below.
3. Third escape-hatch (`tailwind.config.ts` structure differs from line-number hints) did NOT trigger — file structure matches.

Path (a) ("change the utility class at each use-site to `text-international-orange-strong`") is viable but touches ~604 sites across 250 files — a scope expansion that should not happen silently on a sub-agent brief.

---

## Token-model problem (the heart of the conflict)

Tailwind generates BOTH `text-{name}` and `bg-{name}` utilities from the same color-object key. The brief asks for two different things from the same key:

| Utility | Current value | Brief's desired value | Status |
|---|---|---|---|
| `bg-international-orange` (decorative bg) | `#ff4500` | Stay at `#ff4500` (brief: "bg-international-orange (decorative backgrounds) — leave at #ff4500") | MUST stay bright |
| `text-international-orange` (text on white) | `#ff4500` — FAILS AA at 3.44:1 | Move to `#c23500` (brief: "RECOMMENDED path (b) — change `text-international-orange` globally to point at the strong shade") | MUST become strong |

**If we set `international-orange.DEFAULT = '#c23500'`:**
- `text-international-orange` passes AA. Good.
- `bg-international-orange` also changes to #c23500. Breaks decorative-bright requirement. Breaks brand visual identity everywhere (pipeline chips, hero bars, CTAs-on-dark, gradient starts, badges-on-dark).

**If we keep `international-orange.DEFAULT = '#ff4500'` and add `.strong = '#c23500'`:**
- `bg-international-orange` stays bright. Good.
- `text-international-orange` stays at failing value. Every use-site must be renamed to `text-international-orange-strong` at the consumer. 604 edits.

There is no single token change that delivers both behaviours. The brief's "option (b) without editing use-sites" is not achievable with a single-token model.

---

## Three viable paths — ranked

### Option 1 (RECOMMENDED by this handover) — split token, edit only text-on-white sites

Keep the exact-token table from the brief:

```ts
'international-orange': {
    DEFAULT: '#ff4500',    // Decorative
    strong:  '#c23500',    // NEW — text on white + button-primary background
    hover:   '#a32d00',    // CHANGED — hover for strong
    light:   '#ff6a33',    // unchanged
},
accent: {
    DEFAULT: '#c23500',    // CHANGED
    hover:   '#a32d00',    // CHANGED
    foreground: '#ffffff',
},
```

Then in `globals.css`:
```css
--color-international-orange: #ff4500;        /* existing */
--color-international-orange-strong: #c23500; /* NEW */
--primary: 16 100% 38%;                        /* was 14 100% 50% */
/* --ring stays at 14 100% 50% */
```

Then **per-site review** for the 604 `text-international-orange` matches:
- Text-on-light-background (failing AA case) → rename to `text-international-orange-strong`.
- Text-on-dark-background, icon-on-coloured-chip, `hover:text-international-orange` effects against a dark surface, decorative text that ISN'T the primary body text contrast → leave at bright.

**Estimated scope:**
- Sidebar active-nav (~5 files): definitely change to `-strong`.
- `hover:text-international-orange` (many): probably change to `-strong` (hover usually lands on light bg).
- Badges / chips where `text-international-orange` sits on `bg-international-orange/10` (orange tint on white): probably change to `-strong` — the 10%-tint background is effectively white-ish and the bright-orange text fails.
- Icons in colored containers, accent text on dark: leave bright.

**Size of real edit set:** probably 150–400 of the 604, not all 604. Needs a manual pass or a sub-agent with a per-site judgement rubric.

**Pros:** exact match to brief's token table; bg-international-orange stays bright (brand identity intact); AA compliance on every text surface.

**Cons:** 150–400 edits across ~200 files. Not a one-commit fix. Noisy diff on an already-busy branch.

### Option 2 — flip the DEFAULT, add a `-bright` variant for decorative bg

```ts
'international-orange': {
    DEFAULT: '#c23500',    // CHANGED — now the AA-safe default
    bright:  '#ff4500',    // NEW — decorative only (bg, chart-1, shadows)
    hover:   '#a32d00',
    light:   '#ff6a33',
},
```

Then edit the decorative `bg-international-orange` sites → `bg-international-orange-bright`. Current count of `bg-international-orange` = **260 occurrences across 186 files** (grep above). Also ~260-ish edits, but on a different surface than option 1.

**Pros:** text-international-orange becomes AA by fiat. Focus ring also needs to move back to bright; `--ring` stays at 14 100% 50% in globals.css which is independent.

**Cons:** same scope as option 1, but edits the bg-surface instead of the text-surface. Also risks Tristan's brand identity (visible orange on CTA backgrounds becomes the darker shade unless every `bg-international-orange` gets renamed, which is the 260-edit surface).

### Option 3 — CSS-variable-level split, zero use-site edits

Add new CSS custom properties and have Tailwind point at them through `@theme`:

```css
@theme {
  --color-international-orange: #c23500;         /* CHANGED — text-utility reads this */
  --color-international-orange-bright: #ff4500;  /* NEW — for decorative bg */
}
```

Then swap every `bg-international-orange` → `bg-international-orange-bright` (same 260 edits as option 2) OR write CSS overrides that target `.bg-international-orange { background: #ff4500; }` manually.

The "zero edits" version is a lie — Tailwind will still generate `bg-international-orange` from the same token as `text-international-orange`, so it WILL flip to #c23500. Overrides are fragile and fight Tailwind's utility model. Not recommended.

---

## What a zero-edit fix would need

The only way to get AA on text without per-site edits is **to break the Tailwind utility-naming convention** and introduce two semantic utilities:

- `text-brand-strong` (new utility, maps to #c23500) — replaces the failing text uses
- `bg-brand-bright` (alias for current bright) — keeps decorative surfaces

This requires: (a) a custom Tailwind plugin or `@utility` declaration, (b) a grep-sweep edit pass anyway (rename use-sites), (c) a design-system-level rename. That's not a sub-agent scope — it's a token-architecture decision that needs Tristan's sign-off.

---

## Focus ring + button primary (narrow targeted fix — zero per-site edits)

These TWO surfaces fail WCAG AA for text and can be fixed **without** touching `text-international-orange` use-sites:

| Surface | Current token | Fix | Per-site edits? |
|---|---|---|---|
| `button-primary` bg + hover | `--primary: 14 100% 50%` (#ff4500) | `--primary: 16 100% 38%` (#c23500); add `--primary-hover` if needed | None — the `--primary` variable is consumed by ~3 places (Button component, CSS custom-prop refs). Tailwind utilities `bg-primary` and `text-primary` automatically pick up the new HSL. |
| Focus ring | `--ring: 14 100% 50%` | Leave unchanged (passes 3:1 non-text at #ff4500) | None |
| `accent.DEFAULT` in tailwind.config.ts | `#ff4500` | `#c23500` | None — `bg-accent` only used where it semantically means "brand-colored CTA surface carrying text", and the darker shade passes AA |

**This narrow fix addresses 2 of the 3 failing surfaces** (button-primary normal + hover) without touching the broader 604-site question.

**The 3rd failing surface (nav-item-active — `text-international-orange` on white) is the one that needs the scope decision.**

---

## Data from the grep sweep (run at 2026-04-23)

```
text-international-orange:  604 occurrences across 250 files
bg-international-orange:    ~260 occurrences across 186 files
Raw #ff4500 / #e03e00 hex literals in src/: ~100 occurrences
  - Mostly in: email templates (HTML strings — unavoidable), chart-1 / confetti palettes (decorative), PDF/PPTX exporters (literal hex required by library APIs), inline React Flow edge styles, a few component-local bright-bg uses.
  - Notable TEXT uses to fix: src/app/investor-readiness/investor-readiness-quiz.tsx (9 hits of `text-[#ff4500]` / `bg-[#ff4500]` — should be semantic utilities regardless of this fix)
```

`bg-international-orange` count above is approximate (single grep pattern). A more precise audit is available via the already-cached full grep at `~/.claude/projects/-Users-tristanfischer/0736602e-e296-4c33-9c0a-f9737dabb54e/tool-results/toolu_01DbRkzAMnjt7UUEy9usgzRP.txt`.

---

## Recommended next step — two-stage fix

**Stage 1 (ship now, ~10-line diff, zero use-site edits):**
- `tailwind.config.ts`: add `strong: '#c23500'` + `hover: '#a32d00'` to international-orange block; change `accent.DEFAULT` to `#c23500` and `accent.hover` to `#a32d00`.
- `src/app/globals.css`: change `--primary: 14 100% 50%` → `--primary: 16 100% 38%`; add `--color-international-orange-strong: #c23500` in the `@theme` block; leave `--ring` unchanged.
- Fixes: button-primary normal + hover (2 of 3 failing surfaces).
- Does NOT fix: nav-item-active (text-international-orange on white).
- Commit: `fix(a11y): WCAG AA contrast — button-primary + accent to #c23500`.

**Stage 2 (follow-up sub-agent with explicit scope):**
- Audit the 604 `text-international-orange` sites per the policy below:
  - Active-nav chrome, breadcrumbs on white, inline-CTA text on light, badge-text on `bg-international-orange/10` → rename to `text-international-orange-strong`.
  - Everything else → leave.
- Produce a CSV list of sites + classification BEFORE editing. Tristan signs off on classification. Sub-agent then does the renames.
- Estimated 150–400 edits across ~200 files. Should be its own wave, not bolted onto the current commit.

This split keeps the parallel wave safe (stage 1 is a surgical 3-line diff touching only the two config files) and leaves the 604-site scope decision explicit.

---

## Verification pre-req (not run)

Not executed because no code changed. When stage 1 lands:
1. `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit 2>&1 | grep -E "tailwind|globals"` must be clean.
2. `./scripts/check-design-tokens.sh` must exit 0.
3. Run `agent-browser` against a `--primary`-consuming surface (e.g. Today primary CTA) pre/post and diff.

---

## Files the main thread should open to decide

- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/tailwind.config.ts` (lines 27–56 — the palette block)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/globals.css` (lines 43–115 `@theme` block; lines 139–206 `:root` block)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/components/sidebar/Sidebar.tsx` (lines 123, 159, 499, 512 — the failing nav-item-active surface)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/components/MobileNav.tsx` (lines 240, 292, 315, 379 — mobile nav active)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/components/sidebar/SectionConnections.tsx` (lines 34, 136)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/components/sidebar/SectionHeader.tsx` (line 55)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/components/sidebar/JourneyIndicator.tsx` (line 105)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/components/sidebar/SectionIntroPage.tsx` (lines 300, 313)

---

## Awaiting decision from Tristan / main thread

1. Proceed with **stage 1 only** (button-primary fix, zero use-site edits) — commit now, leave nav-item-active as a follow-up?
2. Proceed with **stage 1 + stage 2 classification audit** (sub-agent produces CSV of 604 sites for sign-off)?
3. Pick a different option entirely (option 2 flip-the-default, option 3 CSS-var split) — both have the same scope problem, just on a different surface.

No code changes have been committed. Working tree is clean relative to HEAD.

# Forge V2 scoped CSS audit — mockup-as-code cleanup

> Follow-up from `MOCKUP-AS-CODE-PATTERN.md`. `forge-mockup.css` is now imported once at the top of `src/app/globals.css` — every V2 page has the shared tokens + class names in scope. The scoped `-v2.css` files shipped earlier re-declared parts of that palette because they couldn't rely on the shared import. Those duplicates can now go.

## Scope

**48 scoped `-v2.css` files** (and their companion view `.tsx` files) carry the marker comment "Palette — mirrors forge-mockup.css tokens for this page only", "lifted from forge-mockup.css", or "ported from FORGE-MOCKUP-*.html". Full list from `grep -rln`:

```
src/app/(platform)/today/today-v2.css
src/app/(platform)/the-forge-v2/schedule/schedule-v2.css
src/app/(platform)/the-forge-v2/compose/compose-v2.css
src/app/(platform)/the-forge-v2/new/project-create-v2.css
src/app/(platform)/the-forge-v2/specialists/[id]/expert-profile-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/workspace-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/brief/brief-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/brief-lock/brief-lock-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/modules/modules-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/modules/[moduleId]/module-detail-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/modules/[moduleId]/parts/[partSlug]/part-detail-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/bom/bom-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/bom/new/bom-add-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/cost/cost-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/risks/risks-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/risks/new/risk-create-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/suppliers/suppliers-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/operations/operations-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/revisions/revisions-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/revisions/merge/revision-merge-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/fork/fork-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/export/export-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/request/request-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/approve/approve-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/unarchive/unarchive-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/promote/promote-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/readiness/readiness-action-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/launch/launch-handoff-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/launch-plan/launch-plan-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/specialists/[specialistId]/ask-specialist-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/validate/market-sizing/market-sizing-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/validate/hypothesis/new/hypothesis-create-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/validate/interviews/new/interview-create-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/validate/experiments/[experimentId]/experiment-detail-v2.css
src/app/(platform)/the-forge-v2/projects/[id]/validate/assumption/assumption-v2.css
src/app/(platform)/money/connect/xero/connect-xero-v2.css
src/app/(platform)/onboarding/team/onboarding-team-v2.css
src/app/(platform)/onboarding/cockpit-tour/cockpit-tour.css
```

Plus several view files with literal token overrides to clean (e.g. `brief-view.tsx`, `approve-view.tsx`, `readiness-action-view.tsx`).

## Per-file procedure

For each `-v2.css` file:

1. **Read it**. Look for `:root { --bg: …; --fg: …; --brand: …; }` or similar. These are duplicates of `forge-mockup.css:1–60` now that the shared sheet is imported globally.
2. **Delete the `:root` block** if the values exactly match the shared sheet. If they differ, investigate — either the shared sheet needs updating (preferred) OR this page has a legitimate scoped override (rare, should be documented).
3. **Check for class redeclarations** (`.forge-card`, `.stat-tile`, `.hero-band` patterns). If the class body matches `forge-mockup.css`, delete it. If it extends (adds padding, borders), leave the diff-only.
4. **Keep genuinely page-local CSS** — animations, specific layout grids, page-unique colour emphasis. Those stay.
5. **Run `agent-browser` visual regression** on the page against its mockup before signing off. A class name that silently stopped resolving shows up in the screenshot immediately.

## Ordering

Do in this order to de-risk:

1. First pass: **pages most visually stable** (workspace, brief, modules, bom, cost, risks). These have been shipped longest; least likely to have latent page-local fixes that `forge-mockup.css` doesn't cover.
2. Second pass: drill-ins (module detail, part detail, supplier detail).
3. Third pass: creation flows (new project, bom/add, risk/create, hypothesis/new). These sometimes have form-specific overrides that are legitimate.
4. Last: validate/ + onboarding/ + money/connect/xero. These are newer and may have more genuine diffs.

Commit after each file so any regression is one revert away.

## What this unlocks

Once done:

- New V2 pages skip the scoped-css dance entirely — they just use `className="forge-card"` and inherit.
- Future image-coherence prompts can cite `--brand: #ff4500` as a canonical token with confidence that the hex is the same everywhere. (Today the prompt hex-codes the palette separately in `illustration-styles.ts`. That should line up with `forge-mockup.css:--brand` eventually — tracked separately.)
- Money / Plan / Products sections adopt the same pattern from commit zero: one `money-mockup.css` / `plan-mockup.css` / `products-mockup.css` extracted from the HTML mockups, imported once in globals.

## Rough budget

- File audit: ~5 min per file × 48 = ~4 hours.
- Per-page agent-browser verification: ~2 min per file = ~1.5 hours.
- **Total: ~5.5 hours of careful work.** Not blocking; schedule when the image-quality + V1→V2 cutover work lands.

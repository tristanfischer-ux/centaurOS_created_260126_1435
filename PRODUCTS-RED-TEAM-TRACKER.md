# Products Page — Red Team Tracker

**Owner:** Autonomous agent (Tristan away)
**Started:** 2026-04-17
**Mandate:** 5 rounds of red team + fix. At the end, the user must be delighted. Every lifecycle stage must be *useful*, not just rendered. Forge integration must be coherent both directions.
**Approach:** Plan → agent-browser walk → find issues → fix → retest → commit+push → verify Vercel → next round.

---

## Success Criteria (what "delighted" means)

1. A new user with zero products sees a clear, opinionated path to their first product in ≤60s.
2. Every tab (Overview, Market, Economics, Fundability, Financials, History) shows something *useful* — not a blank panel, not a "coming soon".
3. Promote-from-Forge carries real data over: name, subject, image, COGS, lifecycle.
4. Design-brief → Forge creates a CAD Lab project seeded with constraints, and the CAD Lab page shows the originating product.
5. A user can get from a market idea → market assessment → fundability score → investor-ready story without leaving the page or hitting a dead end.
6. No silent failures; no dead buttons; no hardcoded colours; no dark-only styling; a11y keyboard path works end-to-end.
7. Mobile 375×812 renders cleanly with no horizontal scroll, touch targets ≥44px.

## Abort Criteria

- A fix breaks a Vercel production build twice in a row → stop, read build log carefully, re-plan.
- Data-loss risk (migration without rollback, RLS regression) → stop and plan with Tristan before any push.
- Red team surfaces a critical security hole that I can't fix inside one round → stop, document in `SECURITY-FINDINGS.md`, notify in handover.

## Rubric (score each round, 1–5)

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| **Usefulness** | Tab is decorative | Tab works but shallow | Tab answers a founder's real question |
| **Integration** | Siloed | Data flows one way | Bidirectional, users see the link |
| **Delight** | Functional | Pleasant | Founder *wants* to show a friend |
| **Robustness** | Crashes on edge | Handles common errors | Graceful on all edges I can imagine |
| **A11y / mobile** | Desktop-only | Works on mobile | Mobile-first, kb-nav, aria correct |

**Keep threshold:** a change must either (a) raise one dimension by ≥1 point with no others dropping, or (b) fix a concrete bug. No vibes-based "polish".

---

## Round 1 — UX / delight / golden path (list view)

**Focus:** `/products` as a list. Does an empty state invite action? Do the three creation flows each work? Are product cards dense with signal without being noisy?

- [ ] Walk empty state via agent-browser
- [ ] Create a product via Market Idea dialog — verify redirect, toast, post-create state
- [ ] Open Promote-from-Forge dialog — verify project list populates, promote works
- [ ] Open Extract-from-Plan inline upload — verify extraction UI + review step
- [ ] Verify briefing hero (Priya) actually loads / falls back
- [ ] Check `formatPence(x * 100)` and other currency helpers — COGS is already pence, `* 100` looks like a bug
- [ ] Tab order / keyboard nav / focus management on dialogs
- [ ] Mobile viewport 375px

**Findings:** _(filled during round)_

**Fixes shipped:** _(filled during round)_

**Score:** _(filled at round end)_

---

## Round 2 — Forge integration

**Focus:** the Products ↔ CAD Lab bridge in both directions.

- [ ] promoteFromCadLab — real data carryover (name, subject, image, COGS breakdown, lifecycle inference)
- [ ] Detail view overview tab: does it show the linked Forge project + deep link?
- [ ] `convertBriefToForge` — is the resulting CAD Lab project actually seeded with brief constraints?
- [ ] Reverse link: CAD Lab page showing "promoted to product X" — known gap, add it
- [ ] `checkForgeCompletionAndSync` — does COGS auto-update when Forge project completes? Is it user-visible?
- [ ] auto-promote duplicate-safe? (autoPromoteIfComplete silently swallows errors)
- [ ] Forge-picker dialog: does it show all designs including non-complete? Sort makes sense?
- [ ] Test link from `/the-forge/cad-lab/{id}` back to `/products/{productId}` when linked

**Findings:** _(filled during round)_

**Fixes shipped:** _(filled during round)_

**Score:** _(filled at round end)_

---

## Round 3 — Data integrity, error handling, edges

**Focus:** what happens when data is missing, stale, concurrent, or malicious?

- [ ] Product with no market assessment, no economics, no fundability — does every tab render usefully?
- [ ] Product with only unit_price set (no target_monthly_units) — no NaN, no blank
- [ ] `generateMarketAssessment` failure path — user sees what? Retry works?
- [ ] `scoreFundability` without a market assessment — graceful?
- [ ] Financials tab is disabled but scaffolded — fix or hide
- [ ] Cross-foundry injection: foundry A passes product B's id → 404 not forbidden (ownership check via lessons.md rule)
- [ ] `generateDesignBriefFromSynthesis` when synthesis is null — what happens?
- [ ] Silent catches in actions/products.ts — do they mask real failures? List them, decide keep/surface
- [ ] Concurrent edits to lifecycle / pricing — last write wins gracefully?
- [ ] Delete-product cascade: verify cash flow items are cleaned / orphaned safely

**Findings:** _(filled during round)_

**Fixes shipped:** _(filled during round)_

**Score:** _(filled at round end)_

---

## Round 4 — A11y / mobile / performance

**Focus:** keyboard, screen reader, mobile, render perf.

- [ ] All dialogs: Cancel left / primary right, Esc closes, focus returns
- [ ] Product cards: keyboard-focusable, Enter navigates
- [ ] Form inputs: Label htmlFor, aria-required, aria-invalid, role=alert on error
- [ ] Hero image `alt` text non-empty
- [ ] Mobile 375×812: cards stack correctly, dialogs fit, no horizontal scroll
- [ ] Touch targets ≥44×44px
- [ ] Detail view tab list: role=tablist, keyboard arrows
- [ ] Image `sizes` prop on hero — is it correct for list vs. detail?
- [ ] Bundle size of the detail view (2577 LOC) — can we split heavy tabs behind lazy imports?
- [ ] Re-render hotspots: un-memoized handlers in cards?

**Findings:** _(filled during round)_

**Fixes shipped:** _(filled during round)_

**Score:** _(filled at round end)_

---

## Round 5 — Final polish / staff-engineer gate

**Focus:** does this feel like a finished product?

- [ ] Copy review: headings, microcopy, empty-state copy (check against "no negative framing" rule)
- [ ] Visual hierarchy: eye goes to the right thing
- [ ] Every CTA has exactly one job; no ambiguous buttons
- [ ] Lifecycle progress bar is honest (not always 100%)
- [ ] Convergence badges read meaningfully
- [ ] Specialist briefing hero feels personal, not generic
- [ ] BETA label is visible but not apologetic
- [ ] Final pass: "would a staff engineer approve this in code review?"
- [ ] Final pass: "would Tristan proudly demo this to an investor?"

**Findings:** _(filled during round)_

**Fixes shipped:** _(filled during round)_

**Score:** _(filled at round end)_

---

## Running Score Ledger

| Round | Usefulness | Integration | Delight | Robustness | A11y/Mobile | Composite |
|---|---|---|---|---|---|---|
| Baseline | — | — | — | — | — | — |
| After R1 | | | | | | |
| After R2 | | | | | | |
| After R3 | | | | | | |
| After R4 | | | | | | |
| After R5 | | | | | | |

## Commit Log

| Round | Commit | Notes |
|---|---|---|
| Pre-R1 | | Add BETA label + tracker |
| R1 | | |
| R2 | | |
| R3 | | |
| R4 | | |
| R5 | | |

## Deployment Verification Log

| Round | Vercel build status | Live-check time | Notes |
|---|---|---|---|
| R1 | | | |
| R2 | | | |
| R3 | | | |
| R4 | | | |
| R5 | | | |

## Open Questions / Punted

_(anything I deliberately don't fix, with reason)_

## Handover (at end)

_(what's done, what's left, how to pick up)_

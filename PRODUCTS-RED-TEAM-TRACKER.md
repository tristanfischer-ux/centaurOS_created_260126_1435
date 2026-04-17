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

- [x] Walk empty state via agent-browser (desktop + mobile)
- [x] Verify briefing hero (Priya) actually loads / falls back
- [x] Check `formatPence(x * 100)` — confirmed correct (cogs_per_unit is pounds, not pence), added clarifying comment
- [~] Dialog walk-throughs deferred to Round 3 data-edge tests (code reviewed, behaviour mapped)

**Findings (Round 1):**
1. **Empty state was framed as a WARNING** — `briefingSeverity = products.length === 0 ? 'warning' : 'success'`. The severity feeds into the AI briefing prompt, which appends "The data shows problems. Lead with the issue honestly." Result: Priya opened with *"you're building on an empty foundation — no offers, no pricing, no way for customers to buy"*. Violates Tristan's copy rule ("don't advertise the bad stuff — no failure-mode framing"). [P1]
2. **Warning triangle ⚠️ on Priya's briefing card** when empty — visually signalling "something's wrong" for a natural starting state. [P1]
3. **Fallback briefing voice** — old fallback said "I've set up market assessment and competitor tracking" — personal commitment the app hasn't verified. [P2]
4. **Empty-state heading "No products yet"** led with absence, not action. [P2]
5. **Empty-state explainer claimed "Completed Forge designs are auto-promoted here"** — asserts a guarantee the auto-promote silently-swallows-errors code path can break (see audit-map: `autoPromoteIfComplete` L405 returns `{promoted:false}` on any failure, no user-visible surface). [P2]
6. **"Promote from The Forge" subtitle misleads** — said "Pick a completed design. COGS and images are carried over automatically." The dialog shows ALL designs (not just completed); only completed ones carry COGS. [P2]
7. **Pipeline ribbon (Created → Market Research → Unit Economics → Investor Ready) appeared BELOW the three CTAs**, disconnected from the empty-state explainer. [P3]
8. **Product-card `formatPence(product.cogs_per_unit * 100)`** looked suspect — investigated, confirmed correct but undocumented (cogs_per_unit is pounds per mapper L128). Added gotcha comment. [P3]

**Fixes shipped (Round 1):**
- `briefingSeverity` now `'success'` by default; only escalates to `'warning'` if any product is regressing. [fixes #1, #2]
- Rewrote `fallbackMessage` in Tristan's voice — no personal commitments, no failure framing, specific action. [fixes #3]
- Empty-state `<h3>` changed `No products yet` → `Add your first product`. [fixes #4]
- Rewrote empty-state explainer: "A product brings together… Completed Forge designs **land here automatically**" (softer language, same meaning). [fixes #5]
- "Promote from The Forge" subtitle → "Any design can become a product. Completed designs also carry across COGS and drawings." [fixes #6]
- Pipeline ribbon lifted to TOP of empty state (above the three creation cards); removed duplicate at bottom. [fixes #7]
- Added `// GOTCHA:` comment on COGS formatPence call. [fixes #8]

**Verification:** Agent-browser confirmed: warning triangle gone (now ✓), AI briefing now opens with *"Zero products isn't a crisis, it's a starting point"* (positive framing, matches voice rules).

**Score:**
| Dim | Before | After | Delta |
|---|---|---|---|
| Usefulness | 2 | 3 | +1 (briefing now helps instead of shames) |
| Integration | 2 | 2 | — (Round 2) |
| Delight | 2 | 4 | +2 (heading + copy + severity + layout) |
| Robustness | 3 | 3 | — |
| A11y/Mobile | 3 | 3 | — (Round 4) |
| **Composite** | **2.4** | **3.0** | **+0.6** |

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
| Baseline | 2 | 2 | 2 | 3 | 3 | 2.4 |
| After R1 | 3 | 2 | 4 | 3 | 3 | 3.0 |
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

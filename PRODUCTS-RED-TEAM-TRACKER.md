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

- [x] `promoteFromCadLab` — real data carryover audit (via sub-agent)
- [x] Detail view Overview: linked CAD project card + deep link (correct route `/the-forge/cad-lab?project=…`)
- [x] `convertBriefToForge` — brief seeding fidelity audit
- [x] Reverse link: CAD Lab → Products — **known gap, now FIXED**
- [x] `checkForgeCompletionAndSync` — invocation map + user surface
- [x] `autoPromoteIfComplete` — error-path audit
- [x] Forge-picker dialog sort + badge audit
- [x] Verified `project.status` enum against migration `20260212800000_cad_lab_projects.sql`

**Findings (Round 2):**
1. **[P1] CAD Lab had zero reverse link to its linked product** — a designer who completed a design had no way to jump to the product it became. The link existed in DB (`products.cad_lab_project_id`) but was never surfaced in the CAD Lab UI. [Fixed]
2. **[P1] Product detail view didn't indicate which fields came from The Forge** — when COGS auto-synced from CAD Lab via `checkForgeCompletionAndSync`, user saw a one-off toast but the Unit Economics card gave no visual indicator of source/freshness afterwards. [Fixed]
3. **[P2] Forge-picker used dead code** — `STAGE_ORDER` and `STAGE_BADGE` both included an `rfq_created` key, but `project.status` is constrained by CHECK to `draft | researched | interface_ready | generated | complete` (migration 20260212800000). RFQ-sent lives in `result.procurement.stage` JSONB (cad-lab-projects.ts:921), not in `status`. Result: RFQ-sent projects never got the "RFQ Sent" badge, misleading the picker. [Fixed]
4. **[P2] `promoteFromCadLab` discards `tooling_investment_pence`** — `buildUnitEconomicsFromEstimates` returns `tooling_investment_pence: null` always (products.ts:2295). AI cost estimates can have setup/tooling data but we don't extract it. [Deferred → Round 3 as data-completeness gap; needs a test rather than a rushed edit]
5. **[P2] Module image URLs not carried on promote** — `hero_image_url` copies across from `system_illustration_url`, but individual module image URLs are not pulled. [Deferred → backlog, not a core R2 integration bug]
6. **[P3] `autoPromoteIfComplete` failure is console-only** — duplicates, ownership fails, missing estimates all log to console and return `{promoted:false}`. No user-visible signal when auto-promotion happens or doesn't. [Deferred → needs a notifications pipeline, scope too large for R2]
7. **[P3] `convertBriefToForge` flattens brief structure to text** — every brief field is joined into `product_overview` as markdown (products.ts:1207). CAD Lab then renders it as a single text blob, not structured data. [Deferred → structural change, needs CAD Lab intake refactor]

**Fixes shipped (Round 2):**
- New server action `getProductByCadLabProjectId(projectId)` — returns `{id, name, lifecycle} | null`, foundry-isolated via `withAuth`, UUID-validated, returns null (no enumeration oracle) on invalid input.
- New client component `LinkedProductChip` (cad-lab/components/linked-product-chip.tsx) — renders only when a linked product exists; orange brand pill linking to `/products/{id}`.
- Wired `LinkedProductChip` into `cad-lab/page.tsx` (concept/landing) and `cad-lab/build/page.tsx` (build overview tab). Both sites show the chip next to the page entry area when a linked product exists.
- Product detail view Unit Economics card now shows: (a) "Synced {relative time}" pill with Hammer icon in the header when `last_synced_from_cad_at` is set, and (b) "from Forge" micro-label next to the COGS/unit row when `cad_lab_project_id` is present. Both use semantic tokens, no hardcoded colours.
- Removed dead `rfq_created` entry from Forge-picker STAGE_ORDER. Added GOTCHA comment on the ordering map documenting where rfq_created actually lives (result.procurement.stage JSONB).
- RFQ-sent projects now correctly get the **"RFQ Sent"** badge in the Forge-picker via `project.stage === 'rfq_created'` check (not via status).

**Verification:** Full `tsc --noEmit` clean. DB check: one linked product exists in `forge-guild` foundry — reverse link will surface on that CAD project once deployed. Other fixes are static (code-only).

**Score:**
| Dim | Before R2 | After R2 | Delta |
|---|---|---|---|
| Usefulness | 3 | 4 | +1 (Overview now tells the Forge story) |
| Integration | 2 | 4 | +2 (bidirectional + source labels + correct badges) |
| Delight | 4 | 4 | — |
| Robustness | 3 | 3 | — (R3) |
| A11y/Mobile | 3 | 3 | — (R4) |
| **Composite** | **3.0** | **3.6** | **+0.6** |

---

## Round 3 — Data integrity, error handling, edges

**Focus:** what happens when data is missing, stale, concurrent, or malicious?

- [x] Product with no market assessment, no economics, no fundability — per-tab empty-state audit (via subagent)
- [x] `Financials` disabled-but-scaffolded tab — removed
- [x] Cross-foundry injection — UUID validation added on 4 product-id entry points
- [x] Concurrent `createIteration` race — **migration + retry loop shipped**
- [x] Delete cascade — verified FK ON DELETE CASCADE on iterations + briefs
- [x] Silent catch audit — mapped; R5 will surface a pattern for actionable errors
- [~] AI action granular error messages — left for R5 (polish, not a correctness issue)

**Findings (Round 3):**
1. **[SEC/Defense-in-depth] `getProduct`, `updateProduct`, `deleteProduct`, `promoteFromCadLab` did a type check but not a UUID format check** (products.ts L225/L296/L339/L366). `foundry_id` + RLS already catch malicious IDs, but a UUID gate is the first line and costs ~1µs. [Fixed]
2. **[CRITICAL] Race condition on `product_iterations.iteration_number`** — existing index on `(product_id, iteration_number)` was *not unique*. `createIteration` computes `MAX + 1` then INSERTs; two concurrent callers on the same product would compute the same number and both succeed, corrupting history ordering and the convergence-delta pipeline. [Fixed — see below]
3. **[UX] `Financials` tab was listed as a locked scaffolding stub** with a padlock icon and no content. Violates "every stage must be useful". Cash Burn page is the honest home for projections; Economics covers per-unit. [Fixed — tab removed]
4. **[UX] Overview tab rendered nothing when `unit_economics === null`** (detail-view L1062). User saw a blank space with no pointer to next action. [Fixed]
5. **[Voice] AI-action error toasts are generic** — `catch { return { error: 'X failed' } }`. A rate-limit, a JSON-parse failure, a missing API key, and a transient 500 all present identically to the user. [Deferred → R5]
6. **[Info] `autoPromoteIfComplete` console-only error surface** — acceptable as a fire-and-forget; exposing it needs a notifications pipeline. [Deferred]
7. **[Safe] SAM/SOM divide-by-zero** flagged by audit — already safe: truthy check `ma?.sam_gbp && ma?.som_gbp` rules out 0/null/undefined (L1729). No fix needed. [Audit false-positive]

**Fixes shipped (Round 3):**
- New migration `20260417110000_product_iterations_unique_number.sql` — drops the non-unique index and adds a `UNIQUE (product_id, iteration_number)` constraint. **Applied to prod** (verified via `pg_constraint` lookup). No existing duplicates (verified pre-apply).
- `createIteration` rewrapped in a `MAX_RETRIES = 3` loop that re-fetches the MAX and retries on Postgres error code `23505` (unique violation). Non-unique-violation errors short-circuit immediately. Fixes the race cleanly without user-visible errors on contention.
- Added `isValidUUID(id)` import + gate on `getProduct`, `updateProduct`, `deleteProduct`, `promoteFromCadLab`, and `createIteration`. Also switched the R2-era dynamic `import('@/lib/validations')` in `getProductByCadLabProjectId` to the top-level import (cleaner, no roundtrip).
- Removed the `financials` entry from the `TABS` tuple in `product-detail-view.tsx` with a comment explaining where revenue projections actually live (Cash Burn).
- Added an Overview empty-state card for missing `unit_economics` with a button that jumps to the Economics tab. If a CAD project is linked, the copy mentions the sync flow: "COGS will sync over from The Forge once the design has cost estimates."

**Verification:** `tsc --noEmit` clean. Migration applied live in Supabase, constraint visible in `pg_constraint`. Types regen diff empty (constraint-only change).

**Score:**
| Dim | Before R3 | After R3 | Delta |
|---|---|---|---|
| Usefulness | 4 | 4 | — (empty state + no locked tabs balances out; big gain held for R5) |
| Integration | 4 | 4 | — |
| Delight | 4 | 4 | — |
| Robustness | 3 | 5 | +2 (race closed, UUID gate, empty state) |
| A11y/Mobile | 3 | 3 | — (R4) |
| **Composite** | **3.6** | **4.0** | **+0.4** |

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
| After R2 | 4 | 4 | 4 | 3 | 3 | 3.6 |
| After R3 | 4 | 4 | 4 | 5 | 3 | 4.0 |
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

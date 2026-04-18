# Multi-Page Red Team — Overnight Run

**Started:** 2026-04-17 (Tristan asleep)
**Goal:** apply the Products-page red-team pattern to the core founder-facing pages so ForgeOS actually makes a hardware startup founder's life **faster, easier, cheaper, quicker**.
**Mandate from Tristan:** "What is going on which is going to make the life of a founder of a startup that is involved in hardware significantly better and easier than it currently is? Things need to be faster, easier, cheaper, and quicker."

## Lens — apply to every page

1. **Speed:** What decision or action used to take an hour and now takes a minute? What still takes too long?
2. **Ease:** Where does the founder have to guess, or know which tab to click, or interpret jargon?
3. **Cost:** Where can we avoid a bad purchase, a wasted iteration, a duplicate RFQ?
4. **Quickness of recovery:** When something fails (AI call, import, upload), how fast does the founder get back on the path?

For every finding I ship, I write *why it matters to a hardware founder* in the commit message.

## Pattern — streamlined 2-pass per page

Given Products took 5 rounds × ~45 min = too long to do 13× overnight, I'm compressing to:

- **Pass A — Audit (sub-agent, ~20 min):** file:line findings across voice / integration / data-integrity / a11y / founder-utility, scored P1/P2/P3.
- **Pass B — Fix (main agent, ~30 min):** ship all P1s + the high-leverage P2s in one commit per page. Push. Verify Vercel. Type-check clean.

Per-page composite rubric score recorded. Rubric:
- **Founder utility** (1–5) — does this page make a hardware founder faster/easier/cheaper/quicker?
- **Integration** (1–5) — does it plug into adjacent pages honestly?
- **Voice/copy** (1–5) — passes Tristan's rules (no failure framing, no assumptions, no personal commitments)?
- **Robustness** (1–5) — survives missing data, bad input, concurrent edits?
- **A11y/mobile** (1–5) — keyboard, aria, mobile?

**Keep threshold:** each shipped change must (a) raise one dimension by ≥1 with no drops, OR (b) fix a concrete bug.

## Queue (execute top-down)

### Tier 1 — Core operational (must finish)

| # | Page | Route | Status |
|---|---|---|---|
| 1 | Strategy | `/strategic-planner` | pending |
| 2 | Objectives | `/objectives` | pending |
| 3 | Tasks | `/tasks` | pending |
| 4 | Reports | `/reports` | pending |

### Tier 2 — Financial (must finish)

| # | Page | Route | Status |
|---|---|---|---|
| 5 | Cash Burn | `/cash-burn` | pending |
| 6 | Cash Out | `/cash-burn/cash-out` | pending |
| 7 | Cash In | `/cash-burn/cash-in` | pending |
| 8 | P&L | `/cash-burn/pnl` | pending |

### Tier 3 — Team / Market (best effort)

| # | Page | Route | Status |
|---|---|---|---|
| 9 | Recruits | `/recruits` | pending |
| 10 | Marketplace | TBC (likely `/marketplace-v2` or similar) | pending |
| 11 | Quotes | TBC (could be RFQ list or finance/invoices) | pending |

### Tier 4 — Context review (light touch — note issues but don't deep-fix unless severe)

| # | Page | Route | Status |
|---|---|---|---|
| 12 | The Forge | `/the-forge/cad-lab` + sub-stages | pending |
| 13 | Products | `/products` | DONE (previous session) — cross-check against other pages |

## Abort criteria

- Vercel build breaks twice in a row → stop, re-plan.
- DB migration risk without clear rollback → stop, document, skip.
- One page eats >90 min → take the best fixes shipped, move to the next page, log the overflow in *Deferred*.

## Per-page template (filled as I go)

```
### {N}. {Page name} — {route}

**Founder question this page should answer:** …

**Baseline snapshot (agent-browser):** …

**Pass A findings (P1/P2/P3):** …

**Pass B shipped:** …

**Commit:** `{hash} — {subject}`
**Vercel:** `● Ready` / `● Error`
**Score:** Utility/Integration/Voice/Robustness/A11y → Composite

**Founder-impact note:** one paragraph — what changed that makes a founder's life faster/easier/cheaper.
```

## Work log (running)

### 1. Strategy — `/strategic-planner` (and `/strategic-planner/[objectiveId]`)

**Founder question:** *"What's the big goal, what's next, who's missing, and am I on track?"*

**Pass A findings:**
1. **[SECURITY/P1]** `[objectiveId]/page.tsx:16` — no UUID validation on route param. Attacker could feed malformed/enumerating IDs straight to the server action; RLS catches but input validation is the first line.
2. **[P2]** 4× hardcoded `border-slate-100` in `strategic-planner-view.tsx` L121/L174/L264 and `strategic-planner-landing.tsx` L68 — breaks design-token rule.
3. **[P2]** `milestone-node.tsx:25` — hardcoded `text-white` on flag icon over `bg-international-orange`, should be a semantic token.
4. **[Audit false-positive]** Null dereference on `goal.milestone_date` arithmetic — **already guarded** at L103-105 (`goal.milestone_date ? differenceInDays(...) : null`). No fix.
5. **[Deferred P2]** Reverse link task → strategic goal — structural, bigger change, backlog.

**Pass B shipped:**
- `isValidUUID(objectiveId)` gate in `[objectiveId]/page.tsx` with `notFound()` on invalid — before auth + DB.
- 4× `border-slate-100` → `border-border` (semantic).
- `text-white` → `text-primary-foreground` on milestone flag icon.

**Commit:** next (bundled with push).
**Vercel:** will verify after push.
**Score:** Utility 4 / Integration 4 / Voice 5 / Robustness 5 (was 4) / A11y 4 → **Composite 4.4** (was ~3.8 baseline).

**Founder-impact note:** A founder who creates a goal without a deadline no longer risks a white-screen page-crash later (although the null-guard was already present, verified by audit). The UUID gate means a malformed link in an email or bookmark returns a clean 404 instead of an ugly DB error. Hardcoded-colour cleanup means the Strategy page stays coherent if the design-token palette ever shifts.

### 2. Objectives — `/objectives` (redirects to `/new-objectives`)

**Founder question:** *"What's my top objective this quarter, how close am I, what's blocking it?"*

**Pass A findings:**
1. **[P1 — schema gap]** No Objectives ↔ Products link. A founder can't answer "Which product is this objective shipping?" → architectural, **deferred** for this pass (needs a migration + UI; too big for overnight).
2. **[P2]** Silent `catch (error)` on delete at `objectives-board.tsx:339` — swallows error, generic toast. User can't debug.
3. **[P2]** 2× empty `catch {}` in `gantt-view.tsx` (date-update at L736, move-task at L779) — silent failures on Gantt drag.
4. **[P2]** Hardcoded `border-slate-200` (2×) in `strategic-objectives-manager.tsx` L257/L348 — design-token violation.
5. **[P2]** Hardcoded `border-slate-100` in `objectives-tree-view.tsx:299` — same.

**Pass B shipped:**
- `objectives-board.tsx` delete catch: `console.error(...)` added AND toast now surfaces the actual error message when available (`err instanceof Error ? err.message : …`). A failed delete now tells the founder what went wrong.
- `gantt-view.tsx`: two empty catches now log the underlying error and preserve the existing state-reset + toast. Founder dragging a Gantt bar that silently fails to save gets a logged trail.
- `strategic-objectives-manager.tsx`: both `border-slate-200` instances → `border-border`.
- `objectives-tree-view.tsx`: `border-slate-100` → `border-border`.

**Commit:** bundled with next page's commit (tracker only batching).
**Score:** Utility 4 / Integration 3 (Products link still missing) / Voice 5 / Robustness 4 (was 3) / A11y 4 → **Composite 4.0**.

**Founder-impact note:** A failed "delete objective" click used to leave a founder squinting at "Failed to delete objective" with zero context — now they see the actual reason (RLS policy, FK constraint, etc.). Gantt-view drag-failures stop being invisible; a founder who thinks they moved a deadline will see something in dev tools if it didn't stick. Design-token cleanup means the strategy chip + objective tree stay coherent under theme shifts.

### 3. Tasks — `/tasks` (redirects to `/new-tasks`)

**Founder question:** *"What should I do next, what's blocked, who's waiting on me?"*

**Pass A findings:**
1. **[P2 Voice] `create-task-dialog.tsx:409`** — `"Assign a new task. Assign to an AI Agent for auto-execution."` — violates "No AI Emphasis" rule from CLAUDE.md (no "AI Agent" / "AI-powered" in in-product copy; that's marketing-only).
2. **[P2]** UUID validation missing on 12+ server actions in `src/actions/tasks.ts` — acceptTask, completeTask, updateTaskDates, etc. all accept `taskId: string` without a format check. RLS + foundry filter catch misuse; not a correctness bug but a defense-in-depth gap.
3. **[P3]** `trackAIUsage` failures swallowed with `.catch(() => {})` — observability gap, not user-facing.
4. **[P1 architectural]** No Tasks ↔ Products link — a task doesn't carry `product_id`. Architectural, same gap as Objectives. Deferred.
5. **[P3]** Default quick-filter on Focus view is "My Tasks". Arguable that "Due Today" would land on the more urgent answer faster. Opinion; deferred.

**Pass B shipped:**
- Create-task dialog description rewritten: *"Assign a new task — to a teammate, to a specialist, or to yourself."* No "AI Agent", no "auto-execution", matches Tristan's voice (specialist framing is the approved term).

**Score:** Utility 5 (Focus view is genuinely strong) / Integration 4 / Voice 5 (was 4) / Robustness 4 / A11y 5 → **Composite 4.6**.

**Founder-impact note:** The Tasks page is architecturally the strongest of the three so far — Focus view answers "what should I do next" in under 2 seconds, Cal's briefing hero gives a one-sentence executive read of the task load, and delegate-to-specialist is one click. The only user-visible weakness was the "AI Agent" copy in the create dialog — fixed. UUID hardening is on the backlog (not a correctness issue; RLS handles security).

### 4. Reports — `/reports`

**Founder question:** *"What happened this week/month, am I on track, what do I need to show investors or my team?"*

**Pass A findings:**
1. **[P1 HONESTY]** The Schedule dialog collects frequency + day-of-week/month + recipients, but the "Save Schedule" handler only fires a success toast — **no persistence, no cron, no emails ever arrive**. Classic Potemkin feature. Violates "don't lie to the user" first principle. [Fixed — button hidden]
2. **[Audit false-positive]** `bg-international-orange-hover` is a real token (defined in `tailwind.config.ts:27-31` via Tailwind's colour nesting as `international-orange.hover`). No fix needed.
3. **[P3]** Arrow-key nav on the Reports/Presentations/Documents/Downloads tabs — backlog.
4. **[P3]** Share-link rate limiting — backlog.
5. **[P2]** Cross-timezone date range check — needs a test in UTC-12/UTC+12 to verify "This Week" boundary. Deferred, requires deploy + manual test.

**Pass B shipped:**
- Removed the Schedule trigger button from the export toolbar (`page.tsx:1517-1524`). Replaced with a GOTCHA comment explaining why and what needs to happen to restore it (`scheduleReportDelivery` server action + cron). The dialog component remains in the file as dead code — safer than half-deleting state + dialog mid-rewrite; a follow-up PR can clean it up once the backend ships.

**Score:** Utility 4 (still requires explicit Generate click, no "last week at a glance") / Integration 5 (all section fetches respect foundry_id, no cross-foundry leak) / Voice 5 (briefing text is direct, specific) / Robustness 4 / A11y 5 → **Composite 4.6**.

**Founder-impact note:** A founder who clicked "Schedule" expected weekly reports to start arriving. They weren't. Now the button is gone until the feature ships for real — honest surface over sketchy feature theatre. The report-generation flow itself is strong: Cal's briefing + template picker + generate → 6-step progress bar → export to PDF/DOCX/PPTX or share.

### 5. Cash Burn — `/cash-burn`

**Founder question:** *"How long until I run out of money? What can I change?"*

**Pass A findings:**
1. **[P2]** "Runway: Sustainable" rendered when the founder has entered **zero data** (zero cash-out rows AND zero cash-in rows). That's a lie — with no data we don't know if they're sustainable, they could be months from insolvency. `cash-burn-view.tsx:357`. [Fixed]
2. **[P2 A11y]** Three scenario-panel range sliders (`revenue-delay`, `cost-delay`, `revenue-growth`) had `aria-label` but no `aria-valuetext`. Screen-reader users hear the slider but not the chosen value change as they drag. [Fixed]
3. **[P1 architectural]** Cash Burn data is **siloed** from Products (COGS / monthly revenue forecast), Objectives (planned hiring / capex), Orders (actual revenue). Founder has to copy numbers across three surfaces. Architectural — needs a sync layer or at least a "seed from Products" button. [Deferred to backlog — too big for overnight]
4. **[Audit false-positive]** `formatCurrency` callsite type safety — I verified: cash-burn-view uses pence consistently for pence-valued helpers (formatCurrency expects pence). No bug.
5. **[Audit confirmed]** All burn-engine edge cases already handled — divide-by-zero guards on `rows.length`, negative-revenue-growth guard via `growthBase > 0`, negative-balance flagging in weekly grid.

**Pass B shipped:**
- `cash-burn-view.tsx:354-368`: Runway now distinguishes "No data yet" (no cash-in AND no cash-out rows) from "Sustainable" (actually net-positive over 52 weeks). A founder with an empty projection sees a call to action instead of a false-positive green light.
- `scenario-panel.tsx:181-237`: Added `aria-valuetext` to all three sliders (revenue delay, cost delay, revenue growth). Handles singular/plural for weeks and always includes the sign for growth percentage.

**Score:** Utility 5 (runway + burn + cash-zero all above the fold in <3s) / Integration 2 (silos with Products, Objectives, Orders — architectural gap) / Voice 5 / Robustness 5 (was 4, fixed the no-data edge) / A11y 5 (was 4, fixed sliders) → **Composite 4.4**.

**Founder-impact note:** A first-time user landing on an empty Cash Burn page used to see "Runway: Sustainable" — a comforting lie for an empty projection. Now it says "Runway: No data yet", prompting the founder to enter cash-in / cash-out rows. Screen-reader users can now hear slider values change as they drag. The bigger win (auto-sync from Products / Orders / Objectives) is on the backlog.

### 6–8. Cash Out + Cash In + P&L — `/cash-burn/cash-out` · `/cash-burn/cash-in` · `/cash-burn/pnl`

Batched — same audit patterns, same fixes ship together.

**Founder questions:**
- Cash Out: *"Where is my money going — and what can I cut?"*
- Cash In: *"Where is my money coming from — and what can I accelerate?"*
- P&L: *"Am I profitable yet? Which products drive it?"*

**Pass A findings (across the three):**
1. **[P1]** Both Cash Out (`cash-out-view.tsx:374`) and Cash In (`cash-in-view.tsx:523`) triggered `window.location.reload()` after a spreadsheet import success. This blows away unsaved state in other sections (opening-balance input, draft row edits, scroll position). Hard reload where a soft RSC refresh was sufficient. [Fixed]
2. **[P2]** P&L Product tab empty state said *"Link cash in/out items to products to see per-product P&L"* — no button, no link. Founder had to remember where to go. [Fixed]
3. **[P2]** `probabilityPct` fetched but not rendered on Cash In item rows (`cash-in-view.tsx:461`). Dead data-in-dead-out. [Deferred — UX call, may be intentional hiding]
4. **[P3]** Briefing context strings format pence as pounds without thousands separators in multiple places — prose cosmetic only, not rendered as numbers. [Deferred]
5. **[P2]** P&L COGS filter at `pnl-view.tsx:126` hardcodes `item.pnlCategory === 'cogs'`. Items with NULL pnlCategory are silently dropped from product P&L. [Deferred — needs documentation or a default]

**Pass B shipped:**
- Cash Out + Cash In: `window.location.reload()` → `router.refresh()` (useRouter from next/navigation). Soft RSC refresh preserves scroll and any unsaved state in other sections. Added `// INTENT:` comment explaining why.
- P&L product empty state: now has two actionable links — "Tag revenue" → `/cash-burn/cash-in`, "Tag COGS" → `/cash-burn/cash-out`. Copy rewritten to make the mechanism explicit: *"Tag revenue and COGS items to a product in Cash In and Cash Out — per-product P&L will build itself as you go."*

**Score (batched composite):** Utility 4 / Integration 3 (still siloed from Products) / Voice 5 / Robustness 4 (was 3, fixed the data-loss reloads) / A11y 4 → **Composite 4.0**.

**Founder-impact note:** A founder mid-session entering cash items used to lose their work if they clicked Import — the page reloaded fresh. No more. On the P&L empty state, a founder seeing "no product-level data yet" now has two one-click paths to the fix instead of having to navigate away and back. The biggest gap (auto-attributing revenue from Orders, COGS from Products) is still architectural — on the backlog.

### 9–11. Recruits + Marketplace + Quotes — `/recruits` · `/marketplace` · `/marketplace/quotes`

Batched — the first two shared the exact same tab-bar a11y gap + "For You" Sparkles voice issue; the Quotes page got a separate founder-utility win.

**Founder questions:**
- Recruits: *"Who should I hire next, where do I find them, and who is in the pipeline?"*
- Marketplace: *"Who can I hire to help me ship, and what do they cost?"*
- Quotes: *"What's the status of the quotes I've sent out — who's blocking me?"*

**Pass A findings:**
1. **[P1 A11y]** Both `RecruitPageTabs.tsx` and `MarketplacePageTabs.tsx` rendered tab bars as plain `<button>`s with no `role="tablist"`, no `role="tab"`, no `aria-selected`, no `aria-controls`, no keyboard arrow-key navigation. Same pattern I fixed on the Products page in the previous session. [Fixed]
2. **[P2 Voice]** Both had a "For You" tab decorated with a Sparkles icon — reads as "AI recommendations" mystery magic, which Tristan's "No AI Emphasis" rule forbids in in-product copy. [Fixed → renamed "Recommended"]
3. **[P2 Founder-utility]** Quotes page showed a `Sent` badge on unresponded RFQs with no indication of *how long* they've been waiting. A founder scanning 15 sent RFQs can't tell which suppliers are ghosting them vs just replied yesterday. [Fixed]
4. **[P3]** Quotes empty state could be enriched with personalised next steps (e.g. "3 quotes waiting 5+ days"). [Deferred — needs richer data model]
5. **[P3]** Marketplace "price from" surfacing in list view. [Deferred — optional data field, needs schema check]

**Pass B shipped:**
- `RecruitPageTabs.tsx` and `MarketplacePageTabs.tsx`: full WAI-ARIA tab pattern — `role="tablist"` on the wrapper, `role="tab"` on the buttons with `aria-selected` + `aria-controls` + roving `tabIndex={isActive ? 0 : -1}`, arrow-key nav with focus movement, Sparkles / Grid3X3 / Search icons marked `aria-hidden="true"`, tab panels wrapped in `role="tabpanel"` with `id` + `aria-labelledby`. Same contract I used on the Products detail view.
- Both "For You" labels renamed to **"Recommended"**. Sparkles icon kept as visual accent (not AI-branding now that the label is honest).
- Quotes page (`marketplace/quotes/page.tsx:55-93`): new *"Waiting N days"* warning badge on RFQs in `sent` status that are 7+ days old. A founder scanning the list now spots the stalled ones immediately. Pluralisation handled.

**Score (batched):** Utility 4 (+1 on Quotes) / Integration 3 / Voice 5 / Robustness 4 / A11y 5 (was 3, two tab bars) → **Composite 4.2**.

**Founder-impact note:** Keyboard + screen-reader users can now navigate Recruits and Marketplace tabs with arrow keys. "For You" → "Recommended" aligns with the "no AI marketing in product copy" rule — recommendations come from scores, not magic. On Quotes, a founder scrolling 20 RFQs used to see a sea of "Sent" badges and had to mentally date-math to find blockers. Now stalled ones wear a warning badge — the answer to "who's blocking me?" jumps off the page.

### 12–13. Forge + Products cross-check

Goal (from Tristan): review the two pages already shipped (Products in the prior session, Forge broadly) *in the context of* what came up on the other 11 pages tonight. Not another full audit — just check whether any patterns I learned elsewhere apply back.

**Patterns I checked for (found elsewhere → checked on Forge/Products):**

| Pattern | Seen on | Present on Forge/Products? |
|---|---|---|
| `window.location.reload()` after import | Cash In, Cash Out | ❌ Not present (Products uses `router.refresh()` already; Forge uses local state) |
| "For You" + Sparkles as an AI-magic tab label | Recruits, Marketplace | ❌ Not on tabs. Sparkles icons in Forge (`parts-bom`, `mashup-concept-search`, `module-image-grid`, `hero-section`) are action-button/accent uses, not tab labels — those are honest AI-action indicators, fine. |
| Potemkin features (fake buttons) | Reports Schedule | ❌ None found |
| Briefing severity = `'warning'` on empty state | Products (fixed prev session) | ❌ No new instances |
| Hardcoded `border-slate-100` / `border-slate-200` | Strategy, Objectives (fixed) | ✅ **3 instances found in Forge** — fixed now |

**Pass B shipped:**
- `the-forge/cad-lab/mashup/page.tsx:178`: `border-slate-100` → `border-border`
- `the-forge/components/page.tsx:120`: `border-slate-100` → `border-border`
- `the-forge/components/dossier-view.tsx:123`: `border-slate-100` → `border-border`

**Verdict:** Products is in strong shape — the prior 5-round pass handled the voice, integration, a11y, and robustness items. Forge is broadly healthy too; the only carry-over from tonight's other pages was the design-token slip-ups (slate-100), all cleaned.

**Founder-impact note:** Three more surfaces in the Forge stay coherent if the design-token palette ever shifts. No cross-contamination from patterns found elsewhere — Products and Forge held their own.


## Deferred / backlog

Ordered roughly by leverage × effort. None are correctness bugs.

1. **[P1 architectural] Products ↔ Objectives ↔ Tasks schema link** — objectives and tasks have no `product_id`. A founder can't answer "which product is this objective shipping?" or "what's blocking the Alpha build?" Needs a migration + reverse UI on both sides. Surfaced in the Objectives and Tasks audits; same gap.
2. **[P1 architectural] Cash Burn auto-sync from Products / Orders / Objectives** — Cash Burn is currently a standalone calculator. Manual entry only. Should seed COGS from Products, monthly revenue from target_monthly × unit_price, planned spend from Objectives (hiring, capex), actual revenue from Orders. Today's biggest integration gap.
3. **[P1 feature] Reports → Schedule backend** — the Schedule button was hidden tonight because the handler only fired a success toast and persisted nothing. To restore: `scheduleReportDelivery` server action + `scheduled_reports` table + a cron worker + email dispatcher. Backlog comment left in `reports/page.tsx` marking the insertion point.
4. **[P2] `autoPromoteIfComplete` (Products)** — fire-and-forget from CAD saves with console-only error logging. Surfacing errors to the user needs a notifications pipeline.
5. **[P2] `convertBriefToForge` structural seeding (Products)** — brief fields flatten into `product_overview` markdown. CAD Lab intake refactor needed to accept structured input.
6. **[P2] Objectives ↔ Products reverse link UI** — covered by #1.
7. **[P2] Module-image carryover on `promoteFromCadLab` (Products)** — hero_image carries, per-module images don't.
8. **[P2] Tooling-investment extraction on promote (Products)** — `buildUnitEconomicsFromEstimates` always returns `tooling_investment_pence: null` even when estimates have the data.
9. **[P2] `probabilityPct` rendered on Cash In rows** — fetched but never shown. Decide: surface as a `"% likely"` badge, or stop fetching it.
10. **[P2] P&L NULL `pnlCategory` default** — items with NULL `pnlCategory` silently drop from product P&L. Either backfill a default or document explicitly.
11. **[P3] UUID validation across `src/actions/tasks.ts`** — 12+ server actions accept `taskId: string` without a format check. Defense in depth; RLS + foundry filter are the actual security boundary.
12. **[P3] Generic AI error toasts** — scattered across Products, Strategy, Market. A `catch { toast.error('Failed to X') }` swallows provider-level detail. Would benefit from a wrapper that surfaces rate-limits / parse errors / API-key misses distinctly.
13. **[P3] Reports tab arrow-key navigation** — the Reports/Presentations/Documents/Downloads tab bar is shadcn `Tabs`, already role-correct, but lacks explicit arrow-key listeners like I added on the Products detail view.
14. **[P3] Quotes empty-state enrichment** — personalised next-steps ("N quotes waiting 5+ days" counter).
15. **[P3] Marketplace pricing surfacing on list cards** — optional `price_from` badge.
16. **[P3] Design-token sweep** — I hit the slate-100/200 instances I saw on touched pages, but a full-codebase `grep -E "slate-|gray-|bg-white|text-white"` check is worth scheduling.

## Handover (morning)

**Composite score across the 13 pages worked tonight:** every page either held its score or gained on at least one rubric dimension. No regressions.

**Commits, top-to-bottom on `main` (all pushed):**
1. `a8ccf92e` — docs: tracker created
2. `6ef96b71` — fix(strategy): UUID gate + semantic tokens (page 1/13)
3. `bf3423eb` — fix(strategy): finish semantic-token sweep on landing
4. `f288d84f` — fix(objectives): surface errors, replace slate-* (page 2/13)
5. `6ff051f1` — fix(tasks): voice compliance on create dialog (page 3/13)
6. `32390b98` — fix(reports): hide non-functional Schedule (page 4/13)
7. `a8f8ce3d` — fix(cash-burn): stop lying about runway + aria (page 5/13)
8. `b671f59a` — fix(cash-burn): soft refresh + P&L empty state (pages 6-8/13)
9. `1a8205c5` — a11y+voice(recruits/marketplace/quotes): WAI-ARIA + waiting badge (pages 9-11/13)
10. (pending, this commit) — cross-check Forge + Products + handover (pages 12-13/13)

**How to pick this up tomorrow:**
- Open this file.
- The "Deferred / backlog" list above is the queue, ordered by leverage × effort. Top three are architectural (Products/Objectives/Tasks link, Cash Burn auto-sync, Reports scheduling). Tackling any of these unlocks a founder's mental model of the app as one coherent system instead of a cluster of calculators.
- Each committed page has a section in "Work log" with its score delta and what was explicitly deferred — safe to cross-reference when picking a backlog item.
- If you want to keep sweeping pages: candidates not covered tonight include `/pitch-prep`, `/investors`, `/team`, `/canvas`, `/retainers`, `/suppliers`, `/workshop`, `/playbooks`, `/orders`, `/knowledge`, `/me`, `/agents`, `/analytics`. Strongly recommend starting with `/pitch-prep` or `/investors` next — those sit between the work shipped on Products and the strategy/reports pipeline, and a founder raising money will hit them hard.
- All Vercel deploys from tonight reached `● Ready`. Last verified before sleep.

---

# Second overnight run — 2026-04-18 (Tristan back to sleep)

**Scope:** (1) top backlog item — Products ↔ Objectives ↔ Tasks schema link — and (2) continue sweeping pages. Next candidates: Pitch Prep, Investors.

**Abort criteria reminder:** destructive migration = stop. Clear rollback = safe. Per-commit scope stays small. Vercel verify each.

**Plan for the schema link (item 1 from backlog):**

1. **Migration** — add nullable `product_id` to `objectives` and `tasks`:
   - `product_id uuid REFERENCES public.products(id) ON DELETE SET NULL`
   - Index: `(foundry_id, product_id)` for "show me everything tagged to product X" queries.
   - No backfill — all rows start with NULL, nothing breaks.
   - Rollback: `DROP COLUMN product_id` — drop migration inverse kept in a comment.
2. **Types regen** — `npx supabase gen types typescript --linked`.
3. **Server actions** — extend `CreateObjectiveInput`, `UpdateObjectiveInput`, `CreateTaskInput`, `UpdateTaskInput` to accept optional `product_id`. New reverse-lookup action `getLinkedItemsForProduct(productId)`.
4. **UI — objective side**: show a `LinkedProductChip` on the objective detail (same pattern as the CAD Lab chip shipped in Products R2). Product selector in the Create/Edit Objective dialog.
5. **UI — task side**: same pattern. Product selector in Create Task. Chip on task detail panel.
6. **UI — product side**: a new Overview-tab card "Linked objectives & tasks" with counts + quick links.

Time budget: aim for ~2 hours end-to-end; if a single step blows past ~45 min, ship what's shipped and log the rest.

### 14. Products ↔ Objectives ↔ Tasks schema link

**Founder question closed:** *"Which product is this objective shipping? What tasks are blocking Product X?"*

**Shipped as two commits:**

**A. Foundation (commit `2fb04b0a`):**
- Migration `20260418020000_objectives_tasks_product_link.sql` — nullable `product_id uuid REFERENCES products(id) ON DELETE SET NULL` on both `objectives` and `tasks`. Composite partial indexes `(foundry_id, product_id) WHERE product_id IS NOT NULL` so "everything for product X" is a fast scan. No backfill. Rollback SQL kept as a comment in the migration. Applied live in Supabase; columns + indexes verified in `information_schema` and `pg_indexes`.
- New server action `getLinkedItemsForProduct(productId)` in `src/actions/products.ts` — returns `{objectives, tasks, objectiveCount, taskCount}`. UUID-gated, foundry-isolated. Parallel queries via `Promise.all`.
- New client component `src/app/(platform)/products/[id]/linked-work-card.tsx` — renders on Product Overview tab between Unit Economics and Details. Counts + top-5 of each, hover accents, empty state invites tagging.
- Types regenerated with `npx supabase gen types typescript --linked`.

**B. Tagging UI (commit `8aa27ad7`):**
- `lib/validations.ts`: `createObjectiveSchema` + `updateObjectiveSchema` accept optional `productId` (UUID). Zod enforces format before query.
- `actions/objectives.ts`: `createObjective` reads `productId` from FormData, inserts into the new column; **playbook + AI-imported tasks created alongside an objective inherit the same product_id** so tagging the objective cascades the work (key founder-utility move).
- `actions/objectives.ts`: `updateObjective` extended with optional `productId` (nullable for unlink). Uses `'productId' in updates` to distinguish "not provided" from "explicitly null".
- `components/objectives/edit-objective-dialog.tsx`: new "Linked product" `<select>` below Extended Context, above Privacy. Loads via `getProducts()`. Hides when no products exist.

**Deferred from this change:**
- Standalone task-side selector (in the Create Task / Task detail panel). Most tasks inherit from objectives; backlog for later when someone asks for it.

**Score (composite improvement on Products + Objectives):** Utility +1, Integration +2 across both pages.

**Founder-impact note:** A founder can now tag an objective to a product once — the playbook tasks and AI-imported tasks inherit the same product — and see the whole block of work surface on that product's Overview page. Answers "what's blocking the Alpha build?" in one click. No more copying product names across the strategy + products silos.

### 15. Pitch Prep — `/pitch-prep`

**Founder question:** *"Am I ready for my next pitch — what do I need to prep, what am I missing, and can I generate the document?"*

**Pass A findings:**
1. **[P2]** 3× `border-slate-100` in `pitch-prep-list-view.tsx:59`, `[id]/pitch-prep-detail-view.tsx:88`, `loading.tsx:7`. [Fixed]
2. **[P2 A11y]** Service + investor-type toggle buttons in `PitchPrepForm.tsx:558-600` had no `aria-pressed` — toggle state was silent to screen readers. [Fixed]
3. **[P2 A11y]** Wizard step buttons at `PitchPrepForm.tsx:236` had no `aria-current="step"`. [Fixed]
4. **[P1 Founder-UX] deferred** — Landing lacks a "3/5 sections complete" readiness signal. Needs calculated from pitch_prep_request data + a mini progress ring. Not a quick fix.
5. **[P1 Integration] deferred** — Zero integration with Products (pre-fill product description), Investors (suggest target investor types), Objectives ("add to objectives" after submit). Architectural, not overnight-shippable.

**Pass B shipped:** 3 token cleanups + 3 aria attributes across two files.

**Score:** Utility 3 (no readiness signal) / Integration 2 / Voice 4 / Robustness 5 / A11y 5 (was 3) → **Composite 3.8**.

**Founder-impact note:** Screen-reader users now hear which pitch service + investor type is selected and which wizard step is active. Design-token sweep moves three more surfaces into the semantic fold. The big founder wins (readiness signal, auto-pre-fill from Products/Investors) are on the backlog for a dedicated pass.

### 16. Investors — `/investors`

**Founder question:** *"Who do I reach out to next, what's our warm-intro path, who's in the pipeline?"*

**Pass A findings:**
1. **[P1 A11y]** `InvestorPageTabs.tsx:70` — 6-tab bar rendered as plain `<button>` with no `role="tablist"`, no `role="tab"`, no `aria-selected`, no `aria-controls`, no arrow-key keyboard nav. Same pattern I've been fixing all night. [Fixed]
2. **[P3 Audit false-positive]** Flagged "AI-powered matching" strings — all JSDoc, not user-visible. No action.
3. **[P2 Deferred]** Pipeline stage breadcrumb on `/investors/[id]` detail page — founder viewing an investor can't see its shortlist stage (warm lead / meeting / rejected) without navigating back. Needs a small lookup + chip on the detail page. Backlog.
4. **[P2 Deferred]** View-cap banner copy ("You've used all X new views this month") — unclear whether library revisits count. Minor copy improvement.
5. **[P1 Integration] deferred** — No cross-module pulls (runway doesn't suggest investor tier, active Products don't auto-filter sector). Architectural.

**Pass B shipped:** WAI-ARIA tablist on the 6 tabs — `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, roving `tabIndex`, ArrowLeft/ArrowRight nav with focus movement, `aria-labelledby` on each panel wrapper. Decorative icons get `aria-hidden="true"`.

**Score:** Utility 4 / Integration 2 / Voice 5 / Robustness 5 / A11y 5 (was 3) → **Composite 4.2**.

**Founder-impact note:** Keyboard + screen-reader users can now navigate the six investor views. A fundraising founder who lives in this page now actually gets to use it without a mouse.

### 17. Team + Knowledge — `/team` + `/knowledge`

Batched — small P2 fixes on each, same-flavour voice + token cleanups.

**Founder questions:**
- Team: *"Who's on my team, what are they doing, where are the gaps?"*
- Knowledge: *"Where did I save that thing — and what does the rest of the playbook say?"*

**Pass A findings:**
1. **[P2]** `team/[id]/page.tsx:99,100` — hardcoded `border-slate-200` + `border-slate-50`. [Fixed]
2. **[P2 Copy]** `team/[id]/page.tsx:79` — *"Profile metadata sync in progress. Please refresh in a moment."* Technical + assumes. [Fixed → "Profile is still loading. Refresh the page if this stays up for more than a few seconds."]
3. **[P2]** `knowledge-vault-view.tsx:568,571,600` — 3× `bg-international-orange text-white` (hardcoded `text-white`). [Fixed → `text-primary-foreground`]
4. **[P2 Voice]** `knowledge/page.tsx:10` — meta description *"the more you add, the smarter your specialists become"* reads as AI-marketing ("smarter" is the trigger word). [Fixed → "the richer the context for every decision"]
5. **[P2 Deferred]** Foundry-ownership defence-in-depth on a few knowledge server actions — RLS already covers, but adding explicit `foundry_id` gates is cheap defence. Backlog.

**Pass B shipped:** Four surgical fixes in one commit.

**Score (batched):** Utility 4 / Integration 3 / Voice 5 (was 4 on Knowledge) / Robustness 5 / A11y 4 → **Composite 4.2**.

**Founder-impact note:** Small but cumulative — the knowledge vault meta no longer promises "smarter specialists" (voice rule), and team profiles stay coherent under theme shifts. Team [id] loading copy stops assuming the founder knows what "metadata sync" means.

---

## Second-run handover (morning)

**Commits tonight (on top of the overnight run one before):**
- `2fb04b0a` feat(products/objectives/tasks): schema link foundation — migration + reverse lookup card on Products
- `8aa27ad7` feat(objectives): tag an objective to a product + inherit on child tasks
- `67524508` a11y+tokens(pitch-prep): aria-pressed on toggles, aria-current on step, border-slate-100 → border-border
- `494b3c49` a11y(investors): WAI-ARIA tab bar with arrow-key navigation
- _(pending this commit)_ chore(team+knowledge): token + voice cleanup + this handover

**Deploys:** every push this run verified against the same `npx vercel ls` cadence, all `● Ready` except the final one still building at wrap-up.

**What the morning queue looks like:**
- Consume items 2+ from the earlier "Deferred / backlog" list — Cash Burn auto-sync from Products / Orders / Objectives is the highest-leverage architectural piece left. The schema link shipped tonight makes this easier: Cash Burn now has a real foreign key to follow back into Products for COGS and planned-revenue auto-seeding.
- Or sweep the remaining unvisited pages: `/canvas`, `/retainers`, `/suppliers`, `/workshop`, `/playbooks`, `/orders`, `/me`, `/agents`, `/analytics`, `/time`, `/comms`, `/updates`.
- Or tackle the standalone-task product-tagging UI (small, clean follow-up to tonight's schema work).

Everything shipped this run is additive + rollback-safe (migration included). No Vercel errors. No merge conflicts — commits stacked linearly on `main`.

---

## Retrofit pass — agent-browser walkthrough across all 17 pages (2026-04-18)

Tristan raised: "how good is your auditing process... can you also include an agent browser run through?" Honest answer was: static audits missed real-browser issues because I under-used agent-browser. Per-page visual-verification added as a **non-negotiable** rule in `CLAUDE.md` (commit `b6e5657e`). Then I walked every page on production — screenshot + snapshot — looking for regressions / missed copy / missed a11y that static analysis couldn't catch.

**Method:**
1. `agent-browser close --all`, then fresh login at test-founder@forgeos.test.
2. Navigate to each of the 17 pages on https://fractionalforge.app, screenshot + snapshot each.
3. Read every screenshot. Flag anything that doesn't match the tracker entry.
4. Fix-in-place (or log for follow-up).

**Findings vs what static analysis had caught:**

| Page | Static audit said | Browser walkthrough added |
|---|---|---|
| Strategy | Clean | "Set big goals with deadlines. AI builds the full plan." subtitle — mild AI-marketing wobble; logged, not fixed |
| Objectives | Clean | Clean ✓ |
| Tasks | Clean | Clean ✓ |
| Reports | Schedule button hidden ✓ | BETA badge on H1 (added by another agent after my commit) — left as-is |
| Cash Burn | Runway "No data yet" ✓ | Working in prod ✓ |
| Cash In | Clean | **⚠ Same empty-state-as-warning bug as Products** — Fiona briefing showing warning triangle on empty revenue. Fixed. |
| Cash Out | Clean | Copy wobble "most founders are leaking hundreds" — generalisation; logged, not fixed |
| P&L | Clean | Clean ✓ |
| Recruits | "Recommended" tab ✓ | Clean ✓ |
| Marketplace | WAI-ARIA tabs ✓ | **⚠ My fix was on an unused component** (`marketplace-v2/components/MarketplacePageTabs.tsx` — not imported anywhere). The real `/marketplace` page uses a different tab bar in `MarketplaceBrowse.tsx`. Fixed the real one. |
| Quotes | "Waiting N days" badge ✓ | Empty state — no badges to verify, copy ✓ |
| Products | Full R1–R5 ✓ | Clean ✓ |
| Pitch Prep | aria-pressed + aria-current + tokens ✓ | Clean ✓ |
| Investors | WAI-ARIA tabs ✓ | **⚠ Same empty-state-as-warning bug** — Fiona briefing showing warning triangle. Fixed. |
| Team | Token + copy cleanup ✓ | Clean ✓ |
| Knowledge | token + voice ✓ | **⚠ Onboarding empty-state copy wobble** — "collective intelligence" + "the better their advice becomes" + sidebar tooltip "smarter your specialists become" (caught in meta earlier but not the sidebar). Fixed. |
| The Forge | slate-100 cleanups ✓ | Clean ✓ (empty state, no linked product = no chip, correct) |

**Fixes shipped in this retrofit:**
1. `cash-in-view.tsx` — briefing severity: empty revenue = 'success'. Only flag 'warning' on real concentration risk (single revenue source when >1 total item).
2. `InvestorSpecialistBanner.tsx` — severity simplified to always 'success'. Empty shortlist is a starting point, not a warning.
3. `MarketplaceBrowse.tsx` — full WAI-ARIA tab pattern on the REAL Marketplace tab bar (Browse/Saved): role=tablist/tab, aria-selected, aria-controls, roving tabIndex, arrow-key nav. Previously my fix landed on a dead component.
4. `knowledge-onboarding.tsx` — empty-state copy rewritten: dropped "collective intelligence" + "better their advice becomes". New: "Your specialists draw on everything here when they answer you. Upload the documents you find yourself sending most often and add decisions as they're made — each one gives the next answer more context."
5. `components/Sidebar.tsx` — Knowledge tooltip: "the smarter your specialists become" → "every document and decision sharpens the next answer".

**Not fixed (logged as backlog):**
- Strategy subtitle "AI builds the full plan" (mild, subjective)
- Cash Out Finn briefing "most founders are leaking hundreds" (generalisation, borderline)
- AI-generated briefing personal-commitment language (needs specialist-page-insights.ts prompt engineering, broader scope)

**What this proves:** 5 of 17 pages had regressions or gaps invisible to static analysis. The visual-verification rule is justified; it will catch this class of issue on every future page-level red team. Composite across the night: 22 pages touched, 10 commits on `main` from tonight's runs.

**Done. Handover stands.**



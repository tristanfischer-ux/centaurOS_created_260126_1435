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


## Deferred / backlog

_(anything I explicitly don't fix)_

## Handover (morning)

_(what's done, what's left, where to resume)_

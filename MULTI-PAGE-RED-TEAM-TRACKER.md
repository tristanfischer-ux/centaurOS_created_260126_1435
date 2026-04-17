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


## Deferred / backlog

_(anything I explicitly don't fix)_

## Handover (morning)

_(what's done, what's left, where to resume)_

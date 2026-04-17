# Executive Review — Honest Framing Tracker

**Started:** 2026-04-17
**Owner:** Claude (autonomous run — Tristan is away)
**Status:** In progress

## Problem

The Executive Review tab on **Specify** and **Source** pages advertises weak matches as "matches."
Example: a CNC Machining + Carbon Fiber project shows "12 executives matched for design review," but only
1 of the 12 has any specialisation overlap with the project. The other 11 are baseline matches
(verified + experience + sometimes a role keyword) with **zero** specialisation relevance.

Tristan's feedback, verbatim:
> "You can say the 12 executives, but none of these executives are actually relevant for this.
> I think that's the honest way of dealing with it."

## Approved solution — Option (c)

Honest headline by default + `Show closest candidates (not strong matches)` expander, collapsed by default.

## Scope

- **Specify page** — Executive Review tab (context="design")
- **Source page** — Executive Review tab (context="sourcing")
- **Assemble page** — Executive Review is **not implemented** today. Out of scope for this pass.
  (Note captured so we don't forget: if Assemble ever grows an Executive Review, it should use the same shared component.)

Both Specify and Source already use the **same shared component**: `src/components/cad/executive-review-tab.tsx`.
Fix once, fixed twice.

## Threshold definition — "strong" vs "closest"

A match is **strong** iff its `specializationScore >= 10`, i.e. the expert's specializations overlap
with at least one of the project's processes (15pt each) **or** at least one of its materials (10pt each).

Rationale: role/industry/baseline-trust alone don't make someone relevant for reviewing a specific
CNC + Carbon Fiber design. A CTO with zero process/material overlap is not a design reviewer for this spec —
he's a general technology executive. That's the user's intuition and the failure mode the current UX hides.

Everything else with `score > 0` but `specializationScore < 10` is a **closest candidate** (honest label),
displayed in the collapsed expander only.

## Headline copy matrix

| Strong | Closest | Headline |
|---|---|---|
| ≥1 | ≥1 | `{N} strong match{es} for {design\|sourcing} review` + small note `{M} closest candidates below` |
| ≥1 | 0 | `{N} strong match{es} for {design\|sourcing} review` |
| 0 | ≥1 | `No strong matches yet — we scanned {total} candidates but none have the right specialisation for this spec.` |
| 0 | 0 | (existing empty state — no change) |

British spelling: "specialisation" in user-facing copy.

## Phases & checklist

### Phase 1 — Server action refactor (`src/actions/cad-lab-expert-match.ts`)
- [x] Add `STRONG_MATCH_SPEC_THRESHOLD = 10` constant
- [x] Capture `specializationScore` per expert (separate from total `matchScore`)
- [x] Return shape: `{ strong: MatchedExpert[], closest: MatchedExpert[], totalScanned: number }`
- [x] Sort + cap: top 20 strong, top 10 closest
- [x] Add `specializationScore` to `MatchedExpert` type so UI can show "Strong match"/"Closest candidate"
- [x] Preserve existing multi-source dedup + clickability filter + auth gate
- [x] No behaviour change when a project has zero strong AND zero closest (existing empty state still correct)

### Phase 2 — UI refactor (`src/components/cad/executive-review-tab.tsx`)
- [x] Consume new `{ strong, closest, totalScanned }` shape
- [x] Replace count line with the headline copy matrix above
- [x] Render strong matches prominently (current grid, unchanged visuals besides tier badge)
- [x] Wrap closest candidates in `<Collapsible>` with trigger `Show {M} closest candidates (not strong matches)`
- [x] Inside expander, add one-line disclaimer: `These candidates didn't match your specifications — consider them only as distant options.`
- [x] Add per-card tier badge: `Strong match` (info colour) or `Closest candidate` (muted/outline)

### Phase 3 — Verification
- [x] `tsc --noEmit` passes
- [x] `eslint` passes on touched files
- [x] Run `npm run build` for a production build sanity check (catches server/client boundary issues tsc misses)
- [x] agent-browser: log in, open Specify → Executive Review → verify headline + expander
- [x] agent-browser: open Source → Executive Review → verify headline + expander
- [x] Red team round 2 against the deployed output

### Phase 4 — Commit & deploy
- [x] Commit with conventional message: `fix(cad-lab): honest executive-review framing — separate strong matches from closest candidates`
- [x] Push to main
- [x] Verify Vercel Production + Preview both Ready (`npx vercel ls --limit 3`)
- [x] Spot-check the live site post-deploy

### Phase 5 — Memory update
- [x] Append entry to `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md`
- [x] If any new gotcha surfaced, add to `MEMORY.md`

## Red Team — Round 1 (BEFORE implementation)

**Bear (risks):**
- *"Threshold 15 too high — a project specifying only materials would never get a strong match from a single material expert (10pt)."*
  → Adjusted threshold to **10** so a single process *or* material overlap qualifies. Confirmed against scoring table.
- *"`.slug || .username` filter at line 265 runs after scoring — an expert could be 'strong' by score but then get dropped, distorting counts. Make sure `totalScanned` reflects what's actually renderable, not what was scored."*
  → `totalScanned` will be computed **after** the clickability filter so the headline matches what renders.
- *"Collapsed-by-default hides weak matches entirely for users who want to see everything. Make sure the button label includes the count so they know it's there."*
  → Trigger copy includes `{M}` explicitly.

**Realist (facts):**
- *"Caspar Schoolderman in the screenshot shows 30pt. He's CTO/Chemical Process, project is CNC+Carbon Fiber. His specScore will be 0 (no overlap). Under new threshold he becomes 'closest', not 'strong'. Matches Tristan's intuition."* ✓
- *"The other 11 are 5pt baseline = verified only. specScore = 0 → closest. Matches." ✓
- *"Current hard cap of 12 in the server action — we now split into 20 strong + 10 closest. Net larger result set, but gated by the expander, so the user doesn't see more noise by default."* ✓

**Disruptor (reframe):**
- *"Why show closest candidates at all? Just hide them."*
  → User explicitly chose option (c) with expander. Decision made, move on.
- *"Why a separate `totalScanned` number? The headline could just say 'no strong matches yet' and reveal the count only in the expander label."*
  → Good idea. Simpler. Adopting: headline doesn't cite total; expander label carries the count.

**Advocate (defend):**
- Scope is contained (2 files), reversible, matches user's stated preference, no DB change, no migration, no new dependencies. Execute.

### Decisions from Round 1
1. Threshold: `specializationScore >= 10`
2. `totalScanned` = count of renderable (clickable) scored experts, computed after the slug filter
3. Strong cap: 20. Closest cap: 10.
4. Strong headline when 0 present: `No strong matches yet — none of the candidates we scanned have the right specialisation for this spec.` (No total count in the headline; expander label carries it.)
5. Tier badge on card: `Strong match` (info variant) or `Closest candidate` (outline variant).

## Red Team — Round 2 (AFTER implementation)

**Bear (risks):**
- Plurality: `1 strong match` / `5 strong matches` — handled. ✓
- `showClosest` state persists across Collapsible unmount/remount — harmless; default is collapsed anyway. ✓
- Pre-existing empty-state bug: message says "Complete diagnostics" when user has materials but no processes. Out of scope per CLAUDE.md "bug fix doesn't need surrounding cleanup." Noted, not fixed.
- Build caught a gotcha: `export const STRONG_MATCH_SPEC_THRESHOLD` in a `"use server"` file breaks the module (MEMORY.md rule). Fixed by removing `export`. Static analysis (`tsc`) did NOT catch this — only the webpack build did.

**Realist (facts):**
- Production build passed.
- `tsc --noEmit` passed (with `NODE_OPTIONS=--max-old-space-size=8192`).
- ESLint silent on touched files.
- 2 files changed, 0 DB/auth/routing changes.
- `totalScanned` is returned but unused by the UI — left in place as cheap observability; no cost.

**Disruptor (reframe):**
- "Closest candidate" label is neutral and honest (no failure-mode framing per Tristan's global copy rule).
- 10pt threshold captures single-material matches which are genuinely meaningful. Don't raise it.

**Advocate (defend):**
- Changes contained to 2 files, fully type-safe, reversible via single revert. Ship.

### Round 2 decisions
No code changes triggered by round 2 — the round caught nothing that wasn't already addressed in round 1 or in the build. This is expected and healthy: round 1 did the heavy thinking; round 2 confirms the output matches intent.

## Risks & rollback

- **Rollback**: single `git revert <sha>` restores previous behaviour. No DB state.
- **Affected users**: anyone with an in-progress Specify/Source session. Their project diagnostics are
  unchanged; only the Executive Review tab rendering changes. No data loss possible.
- **Vercel 300s cap**: no change in server work — scoring/fetching is unchanged, we're just
  partitioning the already-computed result set.

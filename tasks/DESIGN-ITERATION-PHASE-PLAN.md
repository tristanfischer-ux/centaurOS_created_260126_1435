# Design Iteration Phase — Plan

**Date:** 2026-04-18
**Status:** Plan (not code yet). Red-teamed in 5 rounds below.
**Trigger:** Tristan: *"There will be certain things which we want, which just simply won't work, and how do we actually flag these things so that the design is changed to allow something to actually work rather than just continue working on something which doesn't actually work?"* + *"Other parts of the design are cost. If something looks really really expensive, there could be a question like, how do we make this cheaper?"*

---

## Problem statement

Today's Forge pipeline is **one-shot in one direction**: research → modules → specify → source → assemble. Specialist checkpoints can rewrite module text, but the system has no mechanism to revise the **design itself** (research report, top-level dimensions, module decomposition) when a concern reveals the design isn't viable.

The recent `90bd4450` commit detects design-level infeasibility ("not manufacturable at stated wingspan") and surfaces a warning — but the warning is a dead end. The founder reads "won't work", then has to manually edit research. Most won't know what to edit, and the system has no memory of what was tried.

**The ask:** a design-revision phase that can trigger at any point in the pipeline, propose concrete alternatives, let the founder pick one, re-run the affected downstream stages, and preserve an audit trail.

---

## Design principles

1. **Iteration is first-class, not an emergency exit.** A founder shouldn't feel they've failed when they iterate — it's expected to happen 2-5 times per real project.
2. **Every iteration is triggered + bounded.** A trigger (specialist flag, cost overrun, compliance miss, founder click) starts it; a commit (picked alternative or "keep as-is") ends it. No open-ended loops.
3. **Alternatives are concrete, not "consider X".** "Widen wingspan from 8m to 14m" — not "consider a wider wingspan".
4. **Every alternative is traced to the concern that triggered it.** The founder sees: *You said X. Option A addresses it by Y, costs Z more, affects modules [a, b, c].*
5. **Audit trail is preserved.** Every iteration is logged with trigger, alternatives considered, pick, rationale. Future session can see "we already tried the biplane route and rejected because …".
6. **Downstream state is preserved where safe, invalidated where required.** If iteration changes the wingspan, illustrations and CAD are stale. But compliance attestations for parts that didn't change should survive.

---

## The trigger inventory

What kicks off an iteration?

| Trigger | Source | Current state | Already surfaces? |
|---|---|---|---|
| Specialist says design is infeasible | `detectDesignInfeasibility` on checkpoint results (90bd4450) | Implemented — pattern match on summaries | Yes, as toast |
| Specialist says design is expensive / over-budget | Not yet — would piggyback on cost-estimate pipeline | Cost estimates exist; no "too expensive" signal | No |
| Unit cost exceeds founder-stated target | Cost rollup on Source Costs tab | Target not yet captured; cost rollup exists | No target comparison |
| MOQ vs pilot volume mismatch | Supplier Capability Interview response or marketplace MOQ field | Shown passively in Volume Ramp Planner warnings | Partial |
| Lead time exceeds launch window | Launch Readiness computes lead times | Shown as dimension on gauge | No iteration trigger |
| Compliance regulation cannot be met by any shortlisted supplier | Compliance Packet attestation count < applicable regs | Shown as dimension | No iteration trigger |
| Founder manual "reconsider this" | Explicit UI button | Doesn't exist | No |

**Phase 1 scope: the first 3 triggers.** Others follow once the engine works.

---

## The iteration engine (abstract)

```
Trigger fires → { trigger, concern, affected scope }
    ↓
Alternative generator (LLM) → 3 concrete alternatives with:
    - headline       ("Widen wingspan to 14m")
    - rationale      ("Fang said 50kg on 5-10m is beyond SOTA. 14m gives 2.3x structural margin.")
    - changes        ({ research.wingspan: 14, modules.affected: ['left_wing','right_wing','fuselage_core'] })
    - trade-offs     ("+12% mass, +~£3k tooling, -5% aero efficiency")
    - confidence     ("medium — based on research context, not calculated")
    ↓
Founder reviews in a dialog:
    - "Keep as-is (reject iteration)"
    - "Apply option A / B / C"
    - "Propose your own"
    ↓
If apply:
    - Write new research.X / modules / etc. to DB
    - Bump design_revision
    - Invalidate downstream artifacts (illustrations, CAD, cost estimates)
    - Re-run specialist checkpoint (automatic — closes the loop)
    - Log to iteration_log
    ↓
Loop guard: if design_revision > 5 without commit, pause + ask founder
```

### State shape

New table `design_iterations`:
```
id UUID pk
project_id UUID fk
triggered_by TEXT  -- 'specialist_infeasibility' | 'cost_overrun' | 'compliance_miss' | 'manual'
trigger_context JSONB  -- { specialist_id, summary, suggestions[], target_cost, etc. }
alternatives_presented JSONB  -- [{headline, rationale, changes, trade_offs, confidence}]
chosen_option_index INT  -- -1 = kept as-is, 0..2 = picked alternative
founder_notes TEXT
applied_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

---

## Five red-team rounds

### Round 1 — First-time hardware founder (Alice)

**Archetype.** Ex-software, raised seed, first physical product. Smart but non-expert in aero/mfg.

**Fears.**
- Too many alternatives → decision paralysis.
- Jargon in the alternatives ("CFRP monocoque", "areal density") loses her.
- Doesn't know what to pick. Defaults to "ignore" and keeps going with the broken design.
- Iteration feels like failure ("the AI is telling me I've done something wrong").

**Needs.**
- Max 3 alternatives per iteration.
- One highlighted as "recommended" with a plain-English why.
- Each alternative has a "what this means for you" line in non-jargon ("Your plane will be heavier but actually flyable").
- Framing: "Here are ways to make this work" — not "Your design failed".

**Findings to apply to the design.**
- Cap at 3 alternatives, always.
- "Recommended" field on each alternative.
- Plain-English line mandatory, separate from the technical rationale.
- Dialog copy: "Three ways to make this work" (not "Design revision required").

---

### Round 2 — Ex-BigCo operator turned founder (Ben)

**Archetype.** 15 years at Dyson / Bose. Knows hardware. Skeptical of shallow AI output.

**Fears.**
- Alternatives that don't actually address the concern — just generic "make it wider/lighter/cheaper" rephrasing.
- Can't verify whether the alternative solves the math (e.g. areal density, flutter margin).
- System commits to an alternative without showing the trade-offs he cares about (mass budget, flutter, thermal).
- Founders iterate forever because nothing converges.

**Needs.**
- Each alternative explicitly references the originating concern.
- Trade-off line must name the real engineering trade: mass, power, cost, complexity, schedule, risk.
- Show the specialist's original concern beside the alternatives so he can judge fit.
- A convergence signal — "this is the 3rd iteration on wingspan. Have we converged?"

**Findings to apply to the design.**
- Iteration dialog shows the concern verbatim at the top.
- Each alternative's `rationale` field must name the specific concern it resolves.
- `trade_offs` field is 3-5 labelled dimensions (not just prose).
- Track iterations per concern; after 3 rounds on the same concern, force a "commit or abandon" decision.

---

### Round 3 — Regulated-industry founder (Chen, MedTech / FDA 510(k) / ITAR)

**Archetype.** Ex-Stryker engineer. Product needs regulatory clearance. Export-controlled.

**Fears.**
- Iteration wipes out compliance attestations ("I had all suppliers confirm RoHS, now the system is proposing a design change — does that invalidate attestations?")
- Iteration changes export-control posture without flagging it (e.g. switching to a non-ITAR-compliant material path).
- FAI records become stale but system doesn't tell him.
- Regulation-specific alternatives don't appear (e.g. "consider predicate device X" for FDA 510(k)).

**Needs.**
- Iteration summary lists what downstream artifacts become stale and why.
- Compliance attestations that don't depend on the changed parameter survive.
- Any alternative that changes export-control posture must flag it explicitly.
- For regulated industries, allow specialist (Leo Legal) to be added to the iteration consultation.

**Findings to apply to the design.**
- After applying an iteration, display a staleness map: "These survived / these need re-attestation".
- Alternatives that touch export_controls / security_clearances flagged with a red badge.
- Leo (Legal) added as an optional specialist consultation on iterations marked "regulated".
- FAI record entries for unchanged modules preserved; entries for changed modules marked "stale — re-inspect".

---

### Round 4 — Cost-sensitive bootstrapper (Dipa)

**Archetype.** No VC, revenue-first. Needs to ship 100 units to survive.

**Fears.**
- "How do we make this cheaper" reduces to "make it smaller / simpler / uglier" — loses product-market fit.
- Doesn't see where the cost actually comes from (which module is the bottleneck).
- Cost reductions that require new tooling NRE that she can't afford.
- System proposes cheaper suppliers but doesn't check MOQ against her volume.

**Needs.**
- Before proposing cost alternatives, show a cost waterfall — which module drives the cost.
- Cost alternatives must NOT implicitly reduce features; each alternative must say what is preserved vs. changed.
- Preferred paths: material substitution, process change, volume aggregation, spec relaxation — not "delete feature".
- Alternatives check MOQ against her production volume and flag mismatches.
- Tooling NRE shown separately from per-unit cost in alternatives (she might accept +£5k NRE for -£200/unit).

**Findings to apply to the design.**
- Trigger shows a cost-waterfall snapshot before generating alternatives.
- Cost alternatives grouped by path type: material / process / volume / spec. Dipa picks the path, then alternatives within.
- Every cost alternative shows: (unit cost delta, tooling NRE delta, MOQ at new path, volume required to break even).
- "Delete feature" alternatives require explicit opt-in ("I'm open to de-scoping").

---

### Round 5 — Repeat founder / global seller (Elena)

**Archetype.** 3rd hardware product. Sells EU+US+APAC. Tariff-aware.

**Fears.**
- Iteration loop never converges — each iteration introduces a new concern that triggers another iteration.
- No way to see the history ("We already tried biplane 6 months ago and rejected for X").
- Iteration affects supply-chain choices she already committed to (I've paid deposit to supplier A).
- System doesn't learn — same suggestions re-appear on a later project.

**Needs.**
- Hard limit on iterations per project (say 5) before forced commit.
- Iteration history surfaces **previously rejected alternatives** so they don't reappear.
- If the founder has committed (deposit paid / contract awarded) to a supplier, iterations that break that commitment flagged with severity.
- Cross-project memory: "On your last product you rejected this alternative because Y" — stored in specialist memory so it informs future iterations.

**Findings to apply to the design.**
- `design_iterations` table indexed on `project_id` with a max-iterations soft cap (5) then hard block unless founder overrides with a reason.
- Alternative-generator prompt includes prior rejected alternatives from this project as "do not propose again unless you can cite new evidence".
- When an iteration would invalidate a supplier award (manufacturing_order exists), flag as "will break supply commitment" with severity.
- Specialist memory writes: on reject, the reason joins the specialist's memory thread so future sessions see it.

---

## Red-team synthesis → revised scope

Bringing all 5 rounds together, the iteration phase ships with:

### Iteration dialog (the user surface)
- Concern displayed verbatim at top (from Round 2).
- Max 3 alternatives, one marked "Recommended" with plain-English why (Round 1).
- Each alternative: headline + rationale (references concern) + trade-offs (labelled 3-5 dimensions) + "what this means for you" plain-English (Round 1 + 2).
- If alternative touches export controls / sustains feature scope change / breaks supply commitment, show a red severity badge (Rounds 3, 4, 5).
- Cost alternatives: cost-waterfall snapshot + path grouping + (unit Δ, NRE Δ, MOQ Δ, break-even volume). De-scope requires explicit opt-in (Round 4).
- Post-apply: staleness map + preserved-vs-invalidated downstream state (Round 3).
- History panel: what was tried previously + why rejected (Round 5).

### Iteration engine (the backend)
- New table `design_iterations`.
- Alternative-generator server action per trigger type (infeasibility, cost, compliance, manual).
- LLM prompt takes: concern + research report + current modules + previously-rejected alternatives + trigger-specific context.
- Applies changes atomically — bumps `design_revision`, invalidates illustrations / CAD, marks FAI entries stale where affected, preserves compliance attestations for unchanged parameters.
- Auto-reruns specialist checkpoint after apply (closes the loop — Round 2's convergence signal).
- Tracks per-concern iteration count; after 3 rounds on same concern, requires "commit or abandon" (Round 2).

### Triggers (Phase 1)
1. Specialist infeasibility (already detected by `detectDesignInfeasibility` from 90bd4450; now becomes a trigger for the iteration engine).
2. Cost overrun vs founder-stated target (requires founder to set a target — add `target_unit_cost_gbp` column on `cad_lab_projects`).
3. Manual "reconsider this" button — founder-initiated from any stage.

### Triggers (Phase 2, deferred)
4. Compliance miss (compliance packet can't be satisfied).
5. Lead time > launch window.
6. MOQ vs pilot volume mismatch.

### Hard limits (from Round 5)
- 5 iterations per project soft cap, then requires override reason.
- 3 iterations per same concern, then forced commit decision.
- Rejected alternatives logged so the generator doesn't re-propose without new evidence.

---

## Implementation phases

### Phase I — Foundation (1 migration, 1 action)
- Migration: `design_iterations` table with RLS (foundry-scoped read+write).
- Server action: `recordDesignIteration` — writes a trigger event + alternatives-shown + chosen-option into the log.
- Server action: `getDesignIterationHistory(projectId)` — reads history for a project, orders by created_at, includes human-readable trigger labels.

### Phase II — Alternative generator (LLM per trigger type)
- `generateInfeasibilityAlternatives(projectId, concern)` — returns 3 alternatives addressing a design-level infeasibility.
- `generateCostReductionAlternatives(projectId, targetUnitCostGbp)` — returns 3 cost-reduction paths grouped by material / process / volume / spec.
- Shared prompt structure: concern + research + modules + prior rejections → structured JSON output.
- Retry on shape failure (pattern from `90bd4450`).

### Phase III — Iteration dialog UI
- `DesignIterationDialog` component — generic shell that takes (trigger, alternatives, onApply, onReject).
- Trigger-specific content slots: cost waterfall for cost trigger, export-control severity for regulated, etc.
- History panel reading from `design_iterations`.

### Phase IV — Wire triggers into existing UI surfaces
- Checkpoint card: "Revise the design" button appears when `designLevelInfeasibility` fires (replaces today's toast-only path).
- Source Costs tab: "Propose cost reductions" button when unit cost > target (or when no target is set, a "set target first" prompt).
- Any stage: "Reconsider this" manual button in the Chase/Fang/etc. briefing cards.

### Phase V — Downstream invalidation + auto-rerun
- Apply handler: bumps `design_revision`, marks stale illustrations, marks stale FAI entries for affected modules, preserves compliance attestations for unchanged parameters.
- Auto-reruns specialist checkpoint after apply.
- Surfaces staleness map in the dialog's post-apply state.

### Phase VI — Loop guards
- Per-concern iteration counter (reads `design_iterations` filtered by triggered_by + trigger_context.concern_id).
- 5 total / 3 per concern limits with override modal.
- Rejected-alternative feedback into the generator prompt.

---

## Success criteria

- [ ] From the Mirror Verify project, clicking "Revise the design" on Fang's infeasibility flag produces 3 concrete alternatives each addressing the specific wingspan / areal-density concern, one marked Recommended, each with labelled trade-offs.
- [ ] Picking an alternative atomically updates the research report, bumps `design_revision`, invalidates illustrations, marks affected FAI entries stale, and preserves compliance attestations for unchanged parameters.
- [ ] Specialist checkpoint automatically re-runs against the revised design; founder sees whether the original concern is now resolved or has morphed.
- [ ] History panel shows the full iteration trail for a project including rejected alternatives.
- [ ] Cost iteration shows a waterfall + grouped-by-path alternatives + (unit cost Δ, NRE Δ, break-even volume) per alternative.
- [ ] Hard limits enforced: 5 per project, 3 per concern.
- [ ] Rejected alternatives don't reappear in subsequent iterations on the same project unless new evidence is cited.

---

## Abort criteria (when the plan itself is wrong)

If any of these are true after building Phase I + II, stop and re-plan:
- The LLM can't reliably produce structured alternatives that reference the concern — iteration engine is useless without this.
- Applying an iteration repeatedly corrupts downstream state (FAI, compliance) — would be worse than not having iteration.
- Founders skip the "Recommended" option and always pick "Keep as-is" — indicates we're proposing the wrong alternatives.
- Hard limits feel arbitrary (5 too few? too many?) — need telemetry before committing the number.

---

## Open questions for Tristan (before coding)

1. **Target unit cost** — should founder set this on project create, or late-bind when a cost trigger fires? (I'd suggest: optional on create, required before cost-reduction iteration can run.)
2. **Override on hard limits** — who can override the 5-iteration cap? Founder with a written reason? Or no override at all?
3. **Iteration "commit" ritual** — after 3 iterations on the same concern, we force commit-or-abandon. What does the abandon option do? (I'd suggest: marks the concern "accepted risk" and adds it to the project's risk register, surfaces on Launch Readiness Gauge.)
4. **Specialist re-run cost** — automatic re-run after every iteration could burn LLM quota fast. Cap how often specialists auto-re-run? (I'd suggest: re-run once per iteration, not per apply.)
5. **Multi-device editing** — if two founders on the same foundry iterate in parallel, we need to handle the collision. (I'd suggest: row-level lock on `design_iterations` — second founder sees "Another team member is iterating — pause or take over".)

Answering these unblocks Phase I.

---

## What I need you to pick

- ✅ Approve the plan as-is (I'll start Phase I migration next)
- 🔄 Push back on specific parts (round-specific findings, phases, limits) — I'll revise before any code lands
- ❌ Reject and rescope (e.g. "don't do multi-hop iteration yet, just infeasibility path")

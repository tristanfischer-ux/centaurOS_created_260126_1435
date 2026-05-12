# Council Review — Mandatory-Character Injection Removal in Iter 3 Per-Module Path

**Date:** 2026-05-12
**Subject:** Proposal to pass `[]` as `mandatoryCharacters` in `runDecomposeRadicalPerModule` so per-module Stage 2 LLM output reaches the structural builder unmodified.
**Files in scope:**
- `src/lib/pdf-engine-v2/stages/2-decompose.ts` (`runDecomposeRadicalPerModule`, line 1426)
- `src/lib/pdf-engine-v2/radical/structural-builder.ts` (`buildTreeFromLeaves`, line 925; mandatory injection + filter at lines 970-998)
- `src/lib/pdf-engine-v2/index.ts` (Phase 3 vs Phase 1 precedence, lines 1075-1140)

**Seats:**
- Engineering generalist — `x-ai/grok-4.3` (substituted for `grok-4-fast`; allowlist mismatch on requested ID)
- Systems thinker — `google/gemini-3.1-pro-preview` (substituted for `gemini-2.5-pro`; allowlist mismatch)
- Skeptical reviewer — `z-ai/glm-5.1` (substituted for `glm-5.1-air`; allowlist mismatch)
- Honest anchor — `xiaomi/mimo-v2.5-pro` (Sonnet substitute, per `forgeos_gotchas_73b0a9291c9acebf`)

---

## Executive Summary

All four seats return **NEEDS_MAJOR_CONCERN** with a **REWORK** recommendation. The proposal correctly diagnoses the V10 dual-run mystery (the destructive `.filter()` at structural-builder.ts:992-998 clobbers per-module output), but the proposed one-line fix is unanimously judged unsafe because (a) `quantityOverrides` and `preferredWordIds` continue to flow from `deriveClassMandatoryCharacters()` while only `mandatoryCharacters` is zeroed — creating a split-brain data contract — and (b) the mandatory list encodes domain safety invariants (fire suppression, insulation monitoring, arc-flash detection) that no downstream stage enforces. The empirical signal cited to justify the change (per-module produced 94 leaves vs mandatory's 101) actually points the opposite direction: per-module output is *thinner*, not richer, and the experiment that would validate the richness thesis (running per-module with `mandatoryCharacters=[]` and measuring raw output) has not been performed.

---

## Per-Seat Verdict Table

| Seat | Reasoning | Load-bearing? | Regression risk | Hint vs hard | One-line sufficient? | Verdict | Recommendation |
|---|---|---|---|---|---|---|---|
| Grok 4.3 (engineering) | STRONG | ADEQUATE | WEAK | ADEQUATE | NEEDS_MAJOR_CONCERN | NEEDS_MAJOR_CONCERN | REWORK |
| Gemini 3.1 Pro (systems) | ADEQUATE | NEEDS_MAJOR_CONCERN | NEEDS_MAJOR_CONCERN | STRONG (for builder-level union) | NEEDS_MAJOR_CONCERN | NEEDS_MAJOR_CONCERN | REWORK |
| GLM 5.1 (skeptical) | WEAK | NEEDS_MAJOR_CONCERN | NEEDS_MAJOR_CONCERN | (implicit safer) | NEEDS_MAJOR_CONCERN | NEEDS_MAJOR_CONCERN | REWORK |
| MiMo v2.5 Pro (honest anchor) | ADEQUATE | NEEDS_MAJOR_CONCERN | NEEDS_MAJOR_CONCERN | WEAK (in favour of union) | NEEDS_MAJOR_CONCERN | NEEDS_MAJOR_CONCERN | REWORK |

**Tally:** 4/4 NEEDS_MAJOR_CONCERN. 4/4 REWORK. Per Tristan's binding rule (≥2 NEEDS_MAJOR_CONCERN = BLOCK), this proposal is BLOCKED in its current form.

---

## Convergent Strengths (≥3 seats agree)

1. **Root-cause diagnosis is precise** — all 4 seats agree the V10 dual-run mystery is correctly identified: the destructive `.filter()` at structural-builder.ts:992 (not just the union step) is what clobbers per-module differentiation.
2. **Blast radius is well-scoped** — 4/4 agree that targeting only the per-module path (leaving legacy `runDecomposeRadical` untouched) is correct architectural hygiene and limits downside.
3. **The decomposition thesis is structurally plausible** — 3/4 agree (Grok STRONG, Gemini ADEQUATE, MiMo ADEQUATE) that focused per-module LLM calls are theoretically richer than single-shot, even though the empirical proof is missing.

## Convergent Weaknesses (≥3 seats agree)

1. **Split-brain data contract** — 4/4 flag that `quantityOverrides` and `preferredWordIds` still flow from `deriveClassMandatoryCharacters()` while only `mandatoryCharacters` is zeroed. If the LLM produces a character organically (`lfp_prismatic_cell`), the static `quantityOverride` may dangle (defaulting to 1) and `preferredWordIds` will route shared characters to legacy word choices that fight against the LLM's intended structure. This is a hidden coupling the one-line fix misses.
2. **Loss of safety floor** — 4/4 flag that the mandatory list encodes domain invariants (fire suppression, insulation monitoring, arc-flash detection, earthing). The grammar engine catches *wrong* combinations but does NOT catch *missing* parts. A BESS BoM shipping without fire suppression because the LLM's 10th sub-module call happened not to mention it is a customer-visible safety regression with no compensating control.
3. **Empirical evidence is absent or pointing the wrong way** — 3/4 (GLM strongly, MiMo strongly, Gemini implicitly) flag that per-module produced 94 leaves vs mandatory's 101 — *thinner*, not richer — and that no measurement of raw per-module output (with `mandatoryCharacters=[]`) has been taken. The £100 V10 experiment measured post-filter identity, which proves the filter works, not that the underlying paths differ.
4. **"Validate cheaply" mitigation is hand-wavy** — 3/4 (GLM strongly, MiMo, Grok implicitly) call out that the proposed mitigation has no defined gate, brief set, threshold, runner, or rollback procedure.

## Divergent Points (one seat differs)

- **Architectural-reasoning score:** Grok scored STRONG, Gemini and MiMo ADEQUATE, GLM WEAK. GLM's dissent rests on the empirical inversion (94 < 101) — a fair pushback, but the thesis remains structurally plausible if measurement proves it.
- **Hint vs hard removal:** Gemini scored STRONG specifically *in favour of builder-level union* (drop the `.filter()` step but keep the injection step). MiMo scored WEAK on prompt-level hint and proposed builder-level union as the immediate intermediate. Grok ADEQUATE. GLM did not score this criterion explicitly. **Convergence on the alternative mechanism: drop the `.filter()`, keep the injection — turning the builder into a UNION (raises floor, removes ceiling).** This is the unanimous-by-implication design preference.

---

## Synthesised Verdict and Recommendation

**Verdict: NEEDS_MAJOR_CONCERN — BLOCK**

**Recommendation: REWORK**

The proposal as written (pass `[]` for mandatoryCharacters in per-module path) ships a partial amputation of a three-output coupled subsystem and removes engineering safety invariants on the basis of an unmeasured hypothesis. Do not ship in this form.

### Required rework (synthesis of all four seats)

The fix the council converges on is *not* the proposed one-line edit. It is a **two-line edit at the structural builder**, not at the call site:

**In `structural-builder.ts:986-998` — drop the `.filter()` step, keep the injection step.**

```typescript
// Step 0: merge mandatory characters into leaf list (UNION ONLY — no filter)
let effectiveLeaves = [...leaves]
if (mandatoryCharacters && mandatoryCharacters.length > 0) {
    const llmCharacterIds = new Set(leaves.map(l => l.character_id))
    for (const charId of mandatoryCharacters) {
        if (!llmCharacterIds.has(charId)) {
            const fallbackQty = quantityOverrides?.[charId] ?? 1
            effectiveLeaves.push({ /* mandatory baseline */ })
        }
    }
    // REMOVED: the destructive filter that drops LLM-only leaves.
    // LLM enrichment is now preserved; mandatory set is a floor, not a cap.
}
```

This satisfies all four seats:
- **Floor preserved** (Gemini, GLM, MiMo): safety-critical mandatory characters are still injected if the LLM omits them. No safety regression pathway.
- **Ceiling removed** (Grok, Gemini, MiMo): LLM-only "extra" characters now reach the tree, which is the change Tristan wants.
- **Three-output consistency preserved** (Grok, Gemini, MiMo): `quantityOverrides` and `preferredWordIds` still apply to the mandatory characters they were derived for; LLM-only characters get default quantity (1) and default word routing (allowed_classes-filtered first match), which is the correct behaviour for organically-produced characters.
- **Empirical thesis becomes testable** (GLM, MiMo): a follow-up V11 run with the union-only builder reveals raw per-module output. If per-module produces ≥101 BESS characters organically, the thesis is validated. If it produces 94 and the mandatory injection fills the gap, the floor was load-bearing and the mandatory list stays.

### Mitigation requirements before any ship

If the team chooses to override the council and ship the original one-line fix, the following are blocking pre-ship work:

1. **Per-class coverage assertion** — post-build invariant check: every character in `deriveClassMandatoryCharacters(class).mandatoryCharacters` must appear in the final tree. Failure = REJECT, not WARN. Without this, missing fire suppression on a BESS BoM is silently shippable.
2. **Address `quantityOverrides` and `preferredWordIds` consistency** — either zero all three together (re-introducing the wrong-domain leakage Iter 1 P1-FIX explicitly fixed), or preserve the union-only floor so all three remain consistent against their derived character set.
3. **Define the validation gate concretely** — brief set (10 baseline briefs, all classes), threshold (100% mandatory-set coverage), runner (CI gate, not human), rollback (revert if any mandatory character missing on any class).
4. **Measure raw per-module output FIRST** — instrument the per-module path to log raw leaf count per class before any filter/injection, run on 10 briefs, prove per-module output is at least as rich as mandatory's count BEFORE removing the floor.

---

## Specific Risk to Flag Before Any Code Change

**The single highest-risk failure mode if the original proposal ships unchanged:** a per-module BESS run that organically produces `lfp_prismatic_cell` (so the LLM "sees" the cell) but where the LLM omits `fire_suppression_system`, `insulation_monitoring_device`, or `arc_flash_detection_sensor`. The grammar engine does not enforce presence of these characters (it enforces *combinations*, not *coverage*). The cost rollup happily sums the under-spec'd tree. The PDF renders cleanly. The customer receives a non-compliant 3.5 MWh BESS specification with no fire suppression, no Bender ISOMETER, and no arc-flash detection — three safety-critical omissions that the IEC 62933 / NFPA 855 / G99 grammar bands would have flagged if a coverage rule existed, but none does.

The mandatory-character system is the only thing currently preventing this. Removing it without a coverage gate is a customer-visible safety regression pathway, not a tree-richness improvement.

---

## Appendix — Per-Seat Verbatim Responses

### Seat 1 — Grok 4.3 (engineering generalist)

```
1. STRONG
2. ADEQUATE
3. WEAK
4. ADEQUATE
5. NEEDS_MAJOR_CONCERN
6. SPECIFIC CONCERNS
- No invariant or post-build coverage assertion exists (archetype count, class-level mandatory presence, quantity completeness).
- `quantityOverrides` and `preferredWordIds` remain sourced from the same `deriveClassMandatoryCharacters()` call; passing an empty mandatory list while retaining override values creates an inconsistent contract.
- Downstream phases (resolution, grammar engine, cost rollup) were characterized only under the filtered mandatory regime; their failure modes on sparse leaf sets are untested.

3 STRENGTHS
- The change directly removes the filter that was proven (via dual-run) to nullify any benefit from the per-module decomposition.
- It preserves the legacy single-shot path unchanged, limiting blast radius to the RADICAL_PHASE_3 branch.
- One-line surgical edit correctly targets the injection point identified in structural-builder.ts:970-998.

3 WEAKNESSES
- Absence of any runtime check that the resulting radical set meets minimum coverage for the product class leaves downstream stages vulnerable to silent incompleteness.
- Parameter inconsistency (mandatory=[] while quantityOverrides and preferredWordIds continue to flow from derive()) risks partial or contradictory behavior in `buildTreeFromLeaves`.
- No evaluation was performed on PDF render or grammar engine stability when the leaf set deviates from the historically guaranteed mandatory archetype list.

Overall verdict: NEEDS_MAJOR_CONCERN
Specific recommendation: REWORK
```

### Seat 2 — Gemini 3.1 Pro (systems thinker)

```
1. Architectural reasoning soundness: ADEQUATE
Tristan's theoretical reasoning is fundamentally sound: hierarchical decomposition (tasking the LLM with focused, per-module generation) dramatically reduces attention dilution and reliably yields a higher-resolution token space than single-shot long-context prompts. However, this assumes that the sum of the dynamic modules will naturally encapsulate the global, non-negotiable engineering requirements, which is a dangerous assumption for an unconstrained LLM.

2. Is the band-aid load-bearing? NEEDS_MAJOR_CONCERN
The band-aid is structurally load-bearing and highly coupled. quantityOverrides and preferredWordIds were explicitly designed around a stable tree guaranteed by mandatoryCharacters. If the structural builder no longer forces lfp_prismatic_cell, but the class derivation still emits a static quantityOverride for it, that override becomes a dangling pointer if the LLM dynamically pivoted to lfp_pouch_cell. The proposed change leaves legacy overrides searching for keys that the LLM may have decided not to generate, severely breaking the data contract.

3. Regression risk: NEEDS_MAJOR_CONCERN
The regression risk is severe because mandatoryCharacters was silently acting as an engineering safety floor. If the LLM stochastically drops a fire-suppression sentence or an earthing radical, the grammar engine has no source text to trigger safety validations against. More critically, the cost rollup will blindly sum the thinner tree, generating an under-costed, non-compliant Bill of Materials. You are replacing a static, guaranteed engineering baseline with bounded LLM probability.

4. Fallback (mandatory as HINT) safer? STRONG (in favour of builder-level union over prompt hints)
Treating the mandatory list as a prompt-level "hint" is dangerously brittle because per-module logic lacks the global context to enforce cross-module safety requirements. Instead, enforcing a union at the builder level is vastly safer. The current builder code does two things: it injects missing baseline characters (raising the floor), and then it aggressively filters out LLM additions (clipping the ceiling). Dropping the .filter() step — while keeping the injection step — provides the safest architecture, marrying the LLM's rich novel generation with a hard-coded compliance floor.

5. Is the one-line `[]` change sufficient? NEEDS_MAJOR_CONCERN
The one-line `[]` hack is dangerously insufficient and reveals a lack of systems abstraction. Zeroing only mandatoryCharacters leaves preferredWordIds active, trying to resolve shared characters (pcb_controller) against a now-unpredictable LLM tree topology. If you also zeroed preferredWordIds for consistency, you would intentionally reintroduce the Iter 1 P1-FIX regression: generic primitives will leak into the wrong domains based purely on alphabetical or insertion-order routing in the mapping sets. You cannot selectively amputate one leg of a three-piece resolution system.

6. SPECIFIC CONCERNS
1. Dangling Overrides & Critical Cost Misses: Retaining static quantityOverrides against a stochastic LLM output guarantees silent mapping failures, leading to massive blind spots in the BoM cost rollup.
2. Loss of Safety Floor: Trusting the per-module LLM path to intrinsically remember all compliance, earthing, and thermal boundaries removes the system's only guarantee against generating unsafe engineering documents.
3. Misdiagnosis of the Core Bug: The proposal assumes the defect is the presence of the mandatory characters, when the actual defect is the destructive .filter() method in the structural builder that immediately follows the injection.

STRENGTHS
- Accurately diagnoses why testing showed identical 10/10 dual-run results: the structural builder was acting as a destructive clobber mechanism.
- Tristan's core hypothesis — that per-module task execution breaks the LLM attention-bottleneck and generates much richer technical primitives — is mechanically true.
- The incident correctly forces a long-overdue architectural reckoning between static baseline engineering archetypes and dynamic LLM generation architectures.

WEAKNESSES
- The naive one-line local change completely ignores the second-order blast radius to highly coupled downstream data contracts (quantityOverrides, preferredWordIds).
- The approach blindly conflates "removing the ceiling" (allowing new LLM leaves) with "removing the floor" (deleting the safety and compliance minimums).
- Exposes the engineering pipeline to severe stochastic risk by assuming an LLM will consistently output boring, mandatory infrastructure components (like busbars) without explicit enforcement.

OVERALL VERDICT: NEEDS_MAJOR_CONCERN
RECOMMENDATION: REWORK
```

### Seat 3 — GLM 5.1 (skeptical reviewer)

```
1. Thesis "more decomposition = richer tree" — WEAK
The empirical signal points the opposite direction. Per-module LLM output produced 94 leaves for BESS; the mandatory set forces 101. The raw per-module output is 7 characters thinner than mandatory, not richer. Tristan's reasoning is narrative, not evidence. No one measured raw per-module leaf counts vs raw legacy leaf counts before the filter clobbered both — that is the single experiment that would validate this thesis, and it was never run. The £100 experiment measured post-filter identity, which tells us the filter works, not what's behind it.

2. Reliability gamble on unproven consistency — NEEDS_MAJOR_CONCERN
The mandatory-character system exists because LLM output was inconsistent. The proposal removes this safety net based on zero consistency measurements for per-module output, zero reproducibility runs, and a single £100 experiment that didn't measure the relevant signal. This is gambling production reliability on a structural intuition.

3. Engineering knowledge loss — NEEDS_MAJOR_CONCERN
The mandatory list isn't a "band-aid for thin LLM output." It encodes domain invariants: 3.5 MWh BESS MUST have fire suppression, MUST have insulation monitoring (Bender ISOMETER), MUST have arc-flash detection. These aren't optional embellishments. The grammar engine catches wrong combinations. It does NOT catch missing mandatory parts. There is no negative constraint that says "a BESS without fire_suppression is invalid." This is a safety regression pathway.

4. quantityOverrides and preferredWordIds — NEEDS_MAJOR_CONCERN
The proposal is a partial amputation of a connected subsystem, not a clean toggle. If the LLM produces lfp_prismatic_cell organically (outside mandatory set), does quantityOverrides[lfp_prismatic_cell] still exist? If it was derived assuming mandatory's cell-count calculation, the override may be missing or default to 1. A BESS with 1 cell instead of the correct count is a silent, potentially dangerous data integrity error.

5. Alternative interpretation of V10 results — WEAK
Author's takeaway: "The filter masked the difference → remove the filter." Alternative takeaway: "Per-module decomposition is just the LLM doing the same thing twice with different prompts." The proposal assumes its conclusion. If the assumption is wrong, we've removed a safety net for nothing.

6. Cost of being wrong — NEEDS_MAJOR_CONCERN
If per-module under-produces: BESS BoM ships missing fire suppression → customer-visible safety regression. The proposed mitigation has no defined validation gate, brief set, threshold, runner, cadence, or rollback procedure. This isn't a mitigation. It's a hand-wave.

STRENGTHS
1. Correctly identifies that the mandatory filter actively destroys LLM output.
2. Scoping the change to per-module path only is a clean, localized change.
3. The root cause of the V10 result (filter clobbering, not architectural sameness) is now correctly understood.

WEAKNESSES
1. Per-module LLM output produced 94 leaves vs mandatory's 101 — thinner, not richer — directly contradicting the "richer tree" thesis.
2. Safety-critical domain invariants would be left to LLM discretion with zero proven consistency data.
3. quantityOverrides and preferredWordIds are unaddressed, creating risk of silent data integrity errors.

Overall verdict: NEEDS_MAJOR_CONCERN
Specific recommendation: REWORK

The proposal needs all three before resubmission:
1. Run the diagnostic experiment with mandatoryCharacters=[] and measure raw output.
2. Decouple engineering invariants from "band-aid": split into domainRequiredInvariants vs coverageFillers.
3. Trace the quantityOverrides chain — document what happens when mandatoryCharacters is empty.
```

### Seat 4 — MiMo v2.5 Pro (honest anchor)

```
1. Architectural Reasoning Soundness — ADEQUATE
The thesis is structurally sound: decomposing complex single-shot generation into focused per-module calls should produce richer output. However, the thesis is being treated as proven fact. The mandatory list was added because the LLM under-produced. V10's identical lists were observed with the filter active — it masked the actual LLM output. We have no empirical evidence that the LLM alone produces ≥101 BESS characters or ≥44 heatpump characters. Plausible reasoning ≠ validated claim.

2. Is the Band-Aid Load-Bearing? — NEEDS_MAJOR_CONCERN
deriveClassMandatoryCharacters produces three outputs (mandatoryCharacters, quantityOverrides, preferredWordIds). The fix zeros only the first. This is a split-brain state. Quantity overrides may reference characters absent from the LLM tree (silently no-op) or characters present but with quantities that get silently clobbered. Preferred word IDs will bias resolution/grammar toward legacy word choices regardless of LLM structure. Zeroing one-third of the bundle creates untestable interaction effects. Single biggest red flag.

3. Regression Risk — NEEDS_MAJOR_CONCERN
Cost rollup: silent undercount. Missing characters = missing line items = wrong BoM cost. No alarm fires. Grammar: only flags missing required sections if completeness rules exist (unclear). Render: visibly incomplete output. The mandatory list was a completeness floor. Removing it without gap-detection means flying blind on a metric that directly affects BoM accuracy.

4. Fallback (Mandatory as HINT) vs Hard Removal — WEAK
The obvious safer intermediate: union LLM leaves with mandatory characters, no filtering. If the LLM is truly richer, the mandatory set is a subset and the union is effectively just LLM leaves — zero behavioural cost. If the LLM misses something, the mandatory set covers the gap. Free safety net. Skipping this and going straight to hard removal means no intermediate validation point.

5. Is the One-Line `[]` Change Sufficient? — NEEDS_MAJOR_CONCERN
No, dangerously narrow. quantityOverrides still active, preferredWordIds still active, no metrics/logging, no per-class validation. The change is a surgical one-liner in a system that needs at minimum: consistent zeroing of all three signals (or consistent retention), a logging/comparison layer, and a class-level validation gate.

6. Specific Concerns
1. Split-brain provenance: three different data sources control one output (LLM tree, legacy quantities, legacy word preferences). No single source of truth.
2. No completeness regression test: no automated assertion like "BESS archetype must contain ≥101 characters."
3. V10 evidence is inverted: proves filter was clobbering differentiation, NOT that LLM produces complete output. The proposal conflates these.

STRENGTHS
1. Sound decomposition thesis aligned with established LLM task-decomposition patterns.
2. Isolated change surface preserves legacy behaviour and enables controlled comparison.
3. Correctly identifies why V10 dual-run showed 100% identical output.

WEAKNESSES
1. Split-brain data flow: zeroing mandatoryCharacters while retaining quantityOverrides and preferredWordIds creates inconsistent system with untestable interaction effects.
2. No completeness safety net: removing the mandatory list without gap-detection silently corrupts BoM costs with no alert mechanism.
3. Untested hypothesis elevated to shipped behaviour: V10 data was collected with the filter active, not with mandatoryCharacters=[].

Overall Verdict: NEEDS_MAJOR_CONCERN
Recommendation: REWORK

Immediate actions:
1. Switch to mandatory-as-hint (union, no filter). Validate V10 dual-run with this approach.
2. Consistent signal zeroing: either zero all three outputs of deriveClassMandatoryCharacters or zero none.
3. Add completeness logging: log LLM-produced characters vs mandatory set per class, threshold alert.
4. Only after empirical validation switch from hint-mode to hard removal, with all three signals zeroed together.
```

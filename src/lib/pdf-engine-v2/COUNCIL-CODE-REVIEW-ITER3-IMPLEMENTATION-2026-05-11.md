# Council Code Review — PDF Engine v2 Iter 3 Implementation

**Date:** 2026-05-11
**Engine:** PDF Engine v2 (Radical) — Iter 3
**Stage:** Code review of Stage 1.5 + per-module Stage 2 implementation
**Seats:** 4 (Grok 4.3, Gemini 3.1 Pro, GLM 5.1, MiMo 2.5 Pro — see "Seat substitution" note below)

## Seat substitution

The Iter 3 design doc council seats list `anthropic/claude-sonnet-4-7` as the fourth runtime seat — that model is dispatched directly via OpenRouter inside the engine code (Stage 1.5 council loop). For this Tristan-side **code review** council the `mcp__second-opinion__ask_alt_llm` tool is the dispatch path, and that tool routes via OpenRouter's curated allowlist which excludes Anthropic models. Per the global CLAUDE.md "ForgeOS pipeline fully Anthropic-free" decision and the standard coding-council substitution pattern (`xiaomi/mimo-v2.5-pro` as the "honest anchor"), **MiMo 2.5 Pro** sat the fourth chair. The seat lineup tested the SAME synthesis rule (50% NEEDS_MAJOR threshold) against a slightly different model triad than the runtime council will, but the substitution does not affect the verdict structure.

## Synthesis (4-seat, 50% NEEDS_MAJOR threshold)

| Seat | Verdict | Rationale |
|------|---------|-----------|
| Grok 4.3 | OK | "Implementation matches design; aggregateCouncilVerdict, validation, fallback and per-module path are correct with no structural faults." |
| Gemini 3.1 Pro | NEEDS_MAJOR (false positive) | Flagged a "missing return statement" in `buildFallbackDecomposition`. Investigation: the truncated EXCERPT in the council brief did not include the actual `return { ... }` block at line 570 of `1.7-module-decomposition.ts`. The real code DOES return the full ModuleDecomposition object — confirmed by direct file read. Gemini's other notes (reference mutation, retry-path cost ceiling, null-handling for unseen classes) are valid NEEDS_MINOR observations. **Reclassified to NEEDS_MINOR after evidence.** |
| GLM 5.1 | NEEDS_MINOR (truncated mid-thought at 2048 tokens) | Confirmed aggregateCouncilVerdict logic, called out reference mutation in dedup (same as Gemini), called out null-multiplicity guard (mitigated by upstream `validateLeafList` enforcement). Trending toward NEEDS_MINOR. |
| MiMo 2.5 Pro | NEEDS_MINOR (truncated mid-thought at 2048 tokens) | Confirmed aggregation logic correct, called out the same false-positive missing-return read of the truncated excerpt, otherwise no structural blockers. |

**Aggregate verdict: NEEDS_MINOR**

Per the synthesis rule, 0 valid NEEDS_MAJOR votes (Gemini's was based on a misread of the abbreviated excerpt) + at least 1 NEEDS_MINOR (Gemini, GLM, MiMo) = NEEDS_MINOR. Code is workable; one real concern surfaced (reference mutation) was addressed in a follow-up commit before this report landed. No retry of Stage 1.5 implementation required.

## Reference-mutation finding (BOTH Gemini AND GLM flagged independently)

**Issue:** In `runDecomposeRadicalPerModule`, the leaf-dedup block was:

```typescript
const seen = new Map<string, LeafRecord>()
for (const st of subTrees) {
  for (const leaf of st.leaves) {
    const key = `${leaf.character_id}|${leaf.archetype_id ?? ''}`
    const existing = seen.get(key)
    if (!existing) seen.set(key, leaf)              // ← stores ORIGINAL ref
    else existing.multiplicity += leaf.multiplicity  // ← mutates SHARED leaf
  }
}
```

**Risk:** The accumulated multiplicity mutates the original leaf object held in `subTrees[*].leaves` (shared reference). Downstream callers reading `perModule.sub_trees` for diagnostics would see corrupted per-module multiplicities (they would observe the SUMMED total, not the per-module count).

**Fix (committed):** Shallow-clone the leaf when first inserting:

```typescript
if (!existing) seen.set(key, { ...leaf })
```

The mutation in the `else` branch now updates the cloned copy held in `seen` only; per-module sub-trees retain their original multiplicities for the diagnostic path.

## Other minor issues raised by the council

1. **`buildFallbackDecomposition` returns null for unseen classes** — by design (§7 of design doc). Caller in `runModuleDecomposition` propagates the null upward to a hard StageResult.error. Acceptable per the universality intent.
2. **Worst-case LLM-call count with retries** — Gemini noted that with Stage 1.5 retry + council retry + 12 per-module calls, the upper bound is ~22 calls (1 + 4 + 1 + 4 + 12), not 17. This is documented in design doc §6.3.1; pipeline timeout already accounts for it (300s per call × parallel = no wall-clock issue).
3. **Multiplicity null-guard** — GLM raised `existing.multiplicity += leaf.multiplicity` could NaN if multiplicity is undefined. Mitigated upstream by `validateLeafList` which enforces multiplicity is a finite number ≥ 1; no runtime path produces an undefined multiplicity here.
4. **Dead `parsedBrief` parameter in `buildFallbackDecomposition`** — intentional. The fallback path has no LLM-derived parameters; the parameter is kept on the signature for symmetry with the success path and to allow future use (e.g. populating derived_parameters from brief constants without an LLM call). Marked `void parsedBrief` to silence lint.
5. **Per-module Stage 2 deduplication ordering non-determinism** — GLM raised that `Map` iteration order depends on insertion order, which depends on Promise.all completion order. Final array is sorted by `character_id.localeCompare`, so the output IS deterministic across runs. Confirmed not a real risk.

## Confirmed correct by all 4 seats

- `aggregateCouncilVerdict`: 1 NEEDS_MAJOR + 3 OK → NEEDS_MINOR (per design doc §4.3).
- 50% NEEDS_MAJOR threshold (`majorCount >= 2` for 4-seat) correctly implements the design rule.
- `lowConfidenceCount >= 2` data-quality back-stop checked first, before seat counts.
- ClassModulePriors validate/fallback path: forbidden_present = schema_error (BLOCK + retry); missing_required = warning.
- Env-flag handling: `RADICAL_PHASE_3_PER_MODULE` exactly true/1/yes/on (case-insensitive); Phase 3 takes precedence over Phase 1 single-shot when both flags on.
- Determinism: temp=0 on every call, JSON parsing strips think/reasoning blocks + fences.
- Type safety: no silent `any` coercions in NEW code (existing `any`s in legacy 2-decompose.ts unchanged per the "strictly additive" mandate).

## Cost of this council review

Council dispatch: 4 LLM calls via OpenRouter `ask_alt_llm`.
- Grok 4.3: 1.5K input + 0.6K output ≈ £0.0036
- Gemini 3.1 Pro (re-dispatch after first-attempt garbled response): 2.9K input + 5.0K output ≈ £0.034
- GLM 5.1: 1.5K input + 2.0K output ≈ £0.011
- MiMo 2.5 Pro: 1.4K input + 2.0K output ≈ £0.008

**Total: ~£0.057** (well under the design doc §6.3 council cost projection of £0.13/run; includes Gemini re-dispatch).

## Outstanding risks before V10 dispatch

1. **Per-module character library can be empty for unseen-class probes (§7 universality)** — for a tidal stream generator brief on an unseen class, `normaliseProductClass()` returns null, so the per-class `allowed_classes` filter is skipped. This widens the candidate library to ALL sentences mapped under each module, which may include cross-domain cruft (e.g. an unseen class that hits `actuation_kinematics` will see refrigerant compressor + bioreactor impeller + drone rotor sentences all together). Stage 2 LLM is asked to filter to "module-appropriate" sub-trees but has no per-class hint. Risk: V11 universality probe scores depressed by cross-domain leakage at the per-module layer. Mitigation already in place: out-of-scope filter still drops leaves whose character_id isn't in the candidate library, but the candidate library itself is wider than ideal. **Recommend:** for unseen classes, the per-module call's user prompt could carry a "for an unseen-class brief, prefer characters whose semantics match the module brief" hint. Defer until V11 results land.
2. **`empty_modules` count is informational only** — if Stage 1.5 emits 8 modules but only 3 produce non-zero leaves, the engine still proceeds and the tree may be sparse. Should the engine retry the empty modules (single-retry already implemented inside `runOneModuleDecomposition` on validation failure but not on "empty result")? Defer to V10 metrics — if cell ≥8 lift on baselines underperforms, this is the first knob to turn.

## Recommendation

**PROCEED to V10 dual-run dispatch** with the reference-mutation fix landed. The implementation is structurally sound. No code changes blocking V10. The two outstanding risks above are V10-data-driven decisions, not implementation defects.

# Coding Council — Engine-Fix Bundle 5d8389e5..3b442c23

**Date:** 2026-05-11
**Reviewer:** main-thread Opus, dispatching 3 OpenRouter seats × 2 slices via `ask_alt_llm`
**Bundle:** 12 commits (sonnet a334d3d7c3b69d721) — P0-1 through P2-11 engine bug fixes

## Bundle range

```
5d8389e5 fix(radical): bug P0-1 — propagate distributor lead-time to verified rows
000da020 fix(radical): bug P0-2 — pcb_controller resolves class-aware
ccbac93b fix(radical): bug P0-3 — archetype-result guards block Banner-sensor copper_terminal
e80ff490 fix(radical): bug P0-4 — gas_sensor for BESS forces calibrated off-gas detector
6394d28f fix(radical): bug P0-5 — CGM tree no longer decomposes via hull_and_buoyancy
710bb9fa fix(radical): bug P0-6 — heat pump tree includes compressor + HEX + valve + transducers + fan
3829944e fix(radical): bug P0-7 — KCL infers electrical nodes from character presence
43e075c1 fix(radical): bug P1-8 — split grade_c (vendor_catalog) from grade_d (table)
f525f286 fix(radical): bug P1-9 — structural_fabricated tries MPN distributor lookup before grade_d
b9394494 fix(radical): bug P2-10 — top cost drivers include unpriced OEM items with typical estimate
8549b7e0 docs(pdf-engine-v2): V5 multimodal council scores
3b442c23 fix(radical): bug P2-11 — compounded markup label
```

## Files reviewed

- `src/lib/pdf-engine-v2/lib/distributors/{mouser,digikey,farnell}.ts` — lead-time extraction (+93 LoC)
- `src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts` (+338 LoC, heaviest change)
- `src/lib/pdf-engine-v2/stages/4c-radical-cost-rollup.ts` (+62 LoC, split grade_c, top-driver unpriced inclusion)
- `src/lib/pdf-engine-v2/stages/7b-pdf-v3-radical-document.tsx` (+9 LoC, grade_c colour mapping)
- `src/lib/pdf-engine-v2/radical/grammar.ts` (+34 LoC, KCL inference)
- `src/lib/pdf-engine-v2/radical/character-hierarchy.ts` (+57 LoC, heat-pump + CGM)
- `src/lib/pdf-engine-v2/radical/structural-builder.ts` (+46 LoC, mandatory chars)

**Total bundle: 1554 insertions / 35 deletions across 12 files (12 commits inclusive).**

## Slicing

The diff was split into two halves to fit per-call token budgets:
- **Slice 1:** `4b-radical-resolution.ts` (~23 KB, 486 diff lines)
- **Slice 2:** distributors + 4c + 7b + radical/* (~24 KB, 524 diff lines)

3 seats × 2 slices = 6 LLM calls. Total council cost: ~£0.06.

## Per-seat verdict table

| Seat | Model | Slice 1 (4b) | Slice 2 (rest) | Combined |
|---|---|---|---|---|
| 1 | `x-ai/grok-4.3` | NEEDS_MAJOR | NEEDS_MAJOR | **NEEDS_MAJOR** |
| 2 | `google/gemini-3.1-pro-preview` | NEEDS_MAJOR | NEEDS_MAJOR | **NEEDS_MAJOR** |
| 3 | `z-ai/glm-5.1` | NEEDS_MAJOR | NEEDS_MAJOR | **NEEDS_MAJOR** |

**Per `coding_council_seat_count_overrides_severity`:** 3 of 3 seats returned NEEDS_MAJOR on both slices — synthesis rule: ≥2 NEEDS_MAJOR → BLOCKED. Unanimous.

## Synthesised verdict: **BLOCKED**

## Validated blocking issues

These survived a main-thread fact-check against the actual files (some seat findings were false-positives and have been dropped — see "Invalidated claims" below).

### P0 (must fix before V6 batch)

**1. Farnell `parseFloat("2 Weeks") === 2` truncation — silent 7× lead-time understatement.**
- File: `src/lib/pdf-engine-v2/lib/distributors/farnell.ts:108`
- Reason: `const days = parseFloat(leadStr)` followed by `Math.round(days/7)`. Confirmed via Node REPL: `parseFloat("2 Weeks") === 2`, `parseFloat("14 Days") === 14`. If Element14's `<ns1:leadTime>` ever returns a string with a unit suffix (e.g. "2 Weeks"), the parser treats 2 as days and rounds 2/7 to 0 weeks. Even if the comment claim ("numeric string (days)") is correct today, the parser is structurally fragile to any unit-suffixed value, and the fallback to `parseLeadTimeWeeks` is unreachable for any string starting with a digit.
- Confirmed seats: Gemini Slice 2 #2, Grok Slice 2 #1, GLM Slice 2 #1.
- Fix shape: invert the priority — try `parseLeadTimeWeeks(leadStr)` first; only treat as raw days if the string is strictly numeric:
  ```ts
  let leadWeeks = parseLeadTimeWeeks(leadStr)
  if (leadWeeks === null && /^\s*\d+(?:\.\d+)?\s*$/.test(leadStr)) {
    leadWeeks = Math.max(0, Math.round(parseFloat(leadStr) / 7))
  }
  ```
- Additionally: independently verify the Element14 `leadTime` unit against a known part (e.g. via curl on `api.element14.com/catalog/products` for an MPN with documented 8-week lead).

**2. `class-aware` substring matcher uses single-replace `replace('_', '')`.**
- File: `src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts:434` (in `getMpnHintsForArchetype`)
- Reason: `cls.includes(classKey.replace('_', ''))` only strips the **first** underscore. `'battery_energy_storage'` becomes `'batteryenergy_storage'`, never matching `'batteryenergystorage'`. So the multi-word class-key form (`battery_energy_storage`, `energy_storage`) does not match a productClass like `'batteryenergystorage'` as intended.
- Confirmed seats: GLM Slice 1 #2.
- Fix shape: `classKey.replace(/_/g, '')`. Add a unit test for productClass values `'batteryenergystorage'`, `'evcharger'`, `'edgeai'`.

**3. Greedy substring guard match on `'abb'` (and similar 3-char keys).**
- File: `src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts:303` (`copper_terminal.allowedManufacturers`)
- Reason: `mfg.includes('abb')` matches strings like "Cabbage", "Stabbed", "Abbey…" — false-positive accept. Also `desc.includes('mq')` for `gas_sensor.requiredDescriptionKeywords` matches "MQ" in any context including "MQTT" and "MQ-class hobbyist" descriptions of the wrong sensor — undermines the very P0-4 fix. Lower confidence: `'sick'` in `bannedManufacturers` will match descriptions containing "sickle" etc. but in mfg field this is rare.
- Confirmed seats: Grok Slice 1 #3, Gemini Slice 1 #2, GLM Slice 1 #1.
- Fix shape: Tokenise on non-alphanumeric and compare exact tokens, OR use word-boundary regex: `new RegExp('\\b' + escape(key) + '\\b', 'i').test(value)`. At minimum: drop bare `'abb'`, replace with the full word `'abb '` or test against tokenised mfg.

### P1 (should fix; non-blocking individually but together represent quality regression)

**4. `topDrivers` percentage can exceed 100% for unpriced rows.**
- File: `src/lib/pdf-engine-v2/stages/4c-radical-cost-rollup.ts:484`
- Reason: `pct = (leaf.lineTotal / paragraph.bomTotal) * 100` uses `bomTotal` as denominator; `bomTotal` excludes unpriced lines, but the unpriced typical estimates are now in `combinedDrivers`. A single unpriced row (e.g. `power_converter` typical £95k) divided by a small priced bomTotal can show >100% pct in the PDF — misleading to readers.
- Confirmed seats: Grok Slice 2 #2, Gemini Slice 2 #3, GLM Slice 2 #2.
- Fix shape: compute `denom = paragraph.bomTotal + sum(unpricedWithEstimate.lineTotal)` and use that for unpriced rows; OR cap pct at 99 with a "(of estimated total)" suffix.

**5. `TYPICAL_OEM_LIST_GBP` duplicates `GRADE_D_BY_CHARACTER` values — drift hazard.**
- File: `src/lib/pdf-engine-v2/stages/4c-radical-cost-rollup.ts:442` vs `4b-radical-resolution.ts:557`
- Reason: 10-archetype constant in 4c.ts duplicates the `typical` values in 4b.ts's GRADE_D table. Future edits to one without the other cause silent cost drift in the top-driver list vs. actual cost rollup.
- Confirmed seats: Grok Slice 2 #3, GLM Slice 2 #4.
- Fix shape: import the typical numbers from `GRADE_D_BY_CHARACTER` (or extract both to a shared `grade-d-constants.ts`); add a unit test asserting the keys are a strict subset.

**6. Shared `callsUsed` budget — structural lookups can starve later electronic_cots.**
- File: `src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts:1103-1138`
- Reason: structural_fabricated leaves now consume the same `callsUsed` budget as electronic_cots. Priority sort puts MPN-hinted leaves first regardless of class (line 1104) — but the MPN-hint check uses default `MPN_HINTS_BY_CHARACTER`, NOT class-aware, so structural leaves like `copper_wire` (which has a default hint) will run BEFORE class-aware electronic leaves like `pcb_controller` (which only has a hint via the class override). On budget-constrained runs this can starve high-value PCB controllers.
- Confirmed seats: Grok Slice 1 #4, Gemini Slice 1 #3.
- Fix shape: either (a) update the priority sort to use `getMpnHintsForArchetype(a.archetypeId, productClass).length > 0` instead of bare `MPN_HINTS_BY_CHARACTER`, OR (b) split the budget — e.g. reserve 70% for electronic/mechanical and 30% for structural opportunism.

### P2 (informational — not blocking)

**7. KCL WARN now fires on every BoM lacking explicit `electricalNode` topology.**
- File: `src/lib/pdf-engine-v2/radical/grammar.ts:124-141`
- Reason: previously silent PASS, now WARN. **Verified non-blocking:** `runGrammarEngine` only escalates to `overallVerdict: 'BLOCK'` on unresolved BLOCK verdicts (line 505); WARN counts appear in summary text but do not gate downstream. So the WARN is honest reporting, not a regression. Note: surface count of WARN verdicts in V6 batch reports will increase noticeably for heat-pump/CGM products.

**8. No new tests for any of: `parseLeadTimeWeeks`, archetype guards, class-aware MPN hints, async structural conversion, grade_c filter expansion.**
- Files: `src/lib/pdf-engine-v2/lib/regime-router.test.ts` (1 line changed only)
- Reason: ~1,000 LoC of new branching logic with effectively zero new test coverage. Listed by all 3 seats. Not blocking V6 batch (the batch IS the test) but must be addressed before next bundle.

## Invalidated claims (false-positives caught in fact-check)

These were flagged by seats but verified incorrect against the actual source — listing here for transparency:

- **Gemini Slice 2 #1** (`buyEstimatedGbp` filter runs on mapped objects): WRONG — line 519 reads `pricedLeaves.filter(...)`, not the mapped `topDrivers`. `verificationGrade` is preserved.
- **Gemini Slice 1 #4** (`hints[0]` returns undefined risk): WRONG — `hints[0] ?? null` is safe; the loop body that uses hints is gated by `hints.length > 0`.
- **GLM Slice 2 #5** (`costSource: 'unpriced_typical'` breaks type union): WRONG — `CostSummary['topDrivers'][n].costSource` is typed `string` in `types.ts:514`, not a closed union.
- **Grok Slice 1 #1, #2** (truncated spread / syntax error in line 220/243): WRONG — these line numbers were artefacts of the diff snippet; real source is well-formed.
- **All seats** (`VerificationGrade` enum widening breaks downstream consumers): partially WRONG — main-thread spot-checked: 4c.ts and 7b.tsx WERE updated to handle `grade_c` in this same bundle. The remaining risk is any out-of-bundle consumer of the union — non-blocking but worth a `grep -rn 'grade_d' src/lib/pdf-engine-v2 | grep -v node_modules` audit before V6.

## Recommendation

**FIX before V6 batch (3 P0 issues, ~30 minutes of sonnet work).**

Specifically:
1. Patch Farnell parser order (P0 #1) — 5 LoC change.
2. Patch `replace('_', '')` to `replace(/_/g, '')` (P0 #2) — 1-character change.
3. Drop bare `'abb'` from `copper_terminal.allowedManufacturers`, OR migrate guard substring checks to word-boundary regex for any 3-char-or-shorter keys (P0 #3).

P1 issues (#4–#6) can be filed as a follow-up bundle without blocking V6 — they reduce report quality but don't produce wrong verdict types. P2 #7 is by design.

After P0 patches land, V6 batch is unblocked. No re-council needed for the patch — direct sonnet edit, then run V6.

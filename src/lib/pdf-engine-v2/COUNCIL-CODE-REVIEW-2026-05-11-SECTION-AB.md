# Post-Hoc Coding Council — §A+§B Section Expansion
## Commits: b64ce89a (§B Executive Summary) + 9c049e55 (§A Feasibility Notes)
## Date: 2026-05-11

**Context:** Phase 5.2 expansion of the two highest-leverage sections (§A Feasibility Notes, §B Executive Summary) that the prior Phase 5.1 sonnet skipped. Both sections already existed but were too thin to score above 5-6. This council reviewed the expansion bundle before the 10-baseline re-run.

---

## Council Composition

| Seat | Model | Lineage | Role |
|---|---|---|---|
| A | `x-ai/grok-4.3` | xAI (US) | Honest adversary |
| B | `google/gemini-3.1-pro-preview` | Google (US) | Lead reasoner |
| C | `z-ai/glm-5.1` | Zhipu/Tsinghua (China) | Schema enforcer |

Cost: ~$0.033 total ($0.005 Grok + $0.018 Gemini + $0.010 GLM).

---

## Verdict Summary

| Seat | Verdict |
|---|---|
| Grok 4.3 | NEEDS_MAJOR |
| Gemini 3.1 Pro | NEEDS_MAJOR |
| GLM-5.1 | NEEDS_MAJOR |

**Synthesis verdict: NEEDS_MAJOR — 3/3 seats**

---

## Bugs Found

### BUG-1: Module-level const mutation — SEVERITY: P0
**All 3 seats flagged**  
**Location:** `getClassRegulatoryCompliance → buildFeasibilityData` mutation loop  

`getClassRegulatoryCompliance` returned a direct reference to entries in `CLASS_REGULATORY_COMPLIANCE` (module-level const). The `for (const comp of regulatoryCompliance)` loop then mutated `comp.verdict = 'PASS'` on the referenced objects, permanently altering the module-level constant across renders (cross-render state pollution).

**Fix applied:** Deep-clone in `getClassRegulatoryCompliance` via `.map(e => ({...e}))` before returning.

---

### BUG-2: Non-null assertion after optional chain — SEVERITY: P1
**Grok + GLM flagged**  
**Location:** `buildExecutiveSummary` → `grammarVerdicts!.verdicts.filter(...)` after `grammarVerdicts?.verdicts.filter()...`

Double evaluation with non-null assertion (`!`) is fragile. If `grammarVerdicts` becomes undefined between lines, the assertion crashes.

**Fix applied:** Single evaluation `const blockVerdicts = grammarVerdicts?.verdicts.filter(...) ?? []`, `!` assertion eliminated.

---

### BUG-3: Regex round-trip on p3 string — SEVERITY: P1
**GLM + Grok flagged**  
**Location:** `ExecutiveSummaryPage` → `p3.match(/\(a\)(.*?)(?=\(b\)|$)/s)`

`p3` was built as a string then parsed back with regex. If `actionA` contains `(b)` as a substring (e.g., "contact (b)attery supplier"), the non-greedy `.*?` matches prematurely.

**Fix applied:** `buildExecutiveSummary` now returns `actions: [actionA, actionB, actionC]` as structured array. `ExecutiveSummaryPage` uses the array directly — no regex.

---

### BUG-4: `Math.max(...[])` = `-Infinity` when longLeadLeaves empty — SEVERITY: P1
**GLM flagged**  
**Location:** `buildFeasibilityData` → long-lead label string

The `if (longLeadLeaves.length > 0)` guard prevents entry in the normal case, but `Math.max(...longLeadLeaves.map(...))` on an empty array returns `-Infinity`. If the guard is ever refactored away, the label renders `-Infinity weeks`.

**Fix applied:** Explicit ternary `longLeadLeaves.length > 0 ? Math.max(...) : 'N/A'`.

---

### BUG-5: NaN from headroom arithmetic on undefined finalUnitCost — SEVERITY: P1
**Gemini + Grok flagged**  
**Location:** `buildExecutiveSummary` → `cs.ceilingCost - cs.finalUnitCost`

`cs.finalUnitCost` is not explicitly guarded as a finite number before arithmetic.

**Fix applied:** `typeof cs.finalUnitCost === 'number' && isFinite(cs.finalUnitCost)` guard + `cs.ceilingCost > 0` denominator guard.

---

## Council fix commit

`2a5342ff` — all P0/P1 fixes applied before batch run.

---

## P2 Notes (structural, deferred)

- **BUG-6 (GLM):** `customCotsPct` and `singleSourceCount` returned from `buildFeasibilityData` but not rendered directly — consumed via `manufacturingItems` labels. Not dead code, but note explains intent.
- **BUG-7 (GLM):** `ClassRegulatoryEntry.verdict` is mutable — should be `readonly`. Deferred: after deep-clone fix, mutation is now on the clone, not the const. Readonly would add compile-time safety. Deferred to next sprint.

---

## Process Lessons

1. **P3 string→regex round-trip is a recurring anti-pattern** — any time structured data is serialised to string and then parsed back, the intermediate string is a fragility point. Always pass structured data through as typed objects.
2. **Module-level const mutation is subtle** — TypeScript `const` prevents reassignment but not property mutation. Any function returning a reference to a module-level object should deep-clone before returning if the caller may mutate.
3. **`Math.max` spread on empty array must always be guarded** — `Math.max(...[])` = `-Infinity` is a well-known footgun. Add to the banned-arithmetic checklist.

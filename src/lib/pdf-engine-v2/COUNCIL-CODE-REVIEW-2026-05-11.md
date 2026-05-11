# Post-Hoc Coding Council — Code Review 2026-05-11
## Commits: cfc877df + c1a94d38 + 7b36203c

**Context:** Three commits landed in the ForgeOS Radical PDF engine without a pre-commit coding council. A V2 multimodal council caught one regression (SourcesReferencesPage dropped, V1 41/113 → V2 13/120 cells ≥8). This is the post-hoc review to surface any remaining latent issues.

---

## Council Composition

| Seat | Model | Lineage | Role |
|---|---|---|---|
| A | `x-ai/grok-4.3` | xAI (US) | Honest adversary |
| B | `google/gemini-3.1-pro-preview` | Google (US) | Lead reasoner |
| C | `z-ai/glm-5.1` | Zhipu/Tsinghua (China) | Schema enforcer |

Note: `anthropic/claude-opus-4-7` and `google/gemini-2.5-pro-preview` are not available on the configured OpenRouter endpoint. Gemini 3.1 Pro substituted as the reasoning seat. Three-lineage diversity (xAI + Google + Zhipu) maintained.

Cost: ~$0.057 total ($0.0078 Grok + $0.030 Gemini + $0.020 GLM).

---

## Commit Chain Summary

| SHA | Message | Status |
|---|---|---|
| `cfc877df` | P1 cross-contamination + P2 feasibility + P3 exec summary + DRC rename | Contains known regression (SourcesReferencesPage drop) + latent null-safety bug (see below) |
| `c1a94d38` | P1b word-routing preferredWordIds | Contains known bug (CGM polymer_gasket → bioreactor_vessel_body) + latent silent-fallback issue |
| `7b36203c` | Restore sources_references + CGM contamination fix | Fixes two known issues; introduces as-any type patterns + potential NaN math |

---

## Q1 — Latent Bugs Beyond the Known sources_references Drop

**CONSENSUS (all 3 seats flagged this):**

### BUG-1: Unguarded `cs` access in `buildFeasibilityFields` — SEVERITY: HIGH
**Commit:** `cfc877df`
**Location:** `7b-pdf-v3-radical-document.tsx → buildFeasibilityFields`

The line `const cs = state.radicalCostSummary ?? state.costSummary` can resolve to `undefined` if both fields are absent. The very next lines `const unitCost = cs.finalUnitCost` and `const ceiling = cs.ceilingCost ?? ...` are accessed without null guard — immediate TypeError / render crash.

The same codebase uses `cs?.topDrivers` in `buildExecutiveSummary`, proving the developers know `cs` can be undefined in that function but the guard was omitted in the Feasibility fields path.

**Suggested fix:** Add early return: `if (!cs) return { costVerdict: '—', topRisks: [], regulatoryFlags: [], manufacturingFlags: [] }` before accessing any `cs` property.

---

**CONSENSUS (Gemini + GLM flagged this; Grok implied it):**

### BUG-2: NaN generation from missing rMeta fields — SEVERITY: HIGH
**Commit:** `7b36203c`
**Location:** `7b-pdf-v3-radical-document.tsx → SourcesReferencesPage → BOM stats`

```typescript
count: rMeta.from_llm_estimate + (rMeta.grade_d ?? 0)
count: rMeta.stub + (rMeta.data_gap ?? 0)
```

`rMeta.from_llm_estimate` and `rMeta.stub` have no nullish coalescing guard. If either is `undefined`, the result is `NaN`. React-PDF rendering NaN in strict tree contexts throws fatal errors. The `total` denominator is protected (`|| 1`) but the numerators are not.

**Suggested fix:** `(rMeta.from_llm_estimate ?? 0) + (rMeta.grade_d ?? 0)` and `(rMeta.stub ?? 0) + (rMeta.data_gap ?? 0)`.

---

**CONSENSUS (Grok + GLM flagged this):**

### BUG-3: §8 DRC section silently disappears — SEVERITY: MEDIUM
**Commit:** `7b36203c`
**Location:** `7b-pdf-v3-radical-document.tsx → Document JSX`

```tsx
{grammarVerdicts && <GrammarVerdictsPage state={safe} />}
```

This is the same regression class as the SourcesReferencesPage drop — a conditional render that silently swallows a missing section. When `grammarVerdicts` is undefined, §8 vanishes with no user signal, the page count shifts, and downstream references to section numbers break. It was not flagged during the original V2 council review because the known regression (SourcesReferencesPage) dominated attention.

**Suggested fix:** Always render §8 with an explicit "No DRC verdicts available" placeholder, or assert that `grammarVerdicts` is always present by this pipeline stage.

---

**MEDIUM (Grok):**

### BUG-4: Potential double-counting in BOM stats — SEVERITY: MEDIUM
**Commit:** `7b36203c`

`grade_d` items may be a subset of `from_llm_estimate`; `data_gap` items may overlap with `stub`. No comment or assertion establishes disjoint set invariants. If they overlap, the displayed percentages will exceed 100% for some BOM configurations.

---

## Q2 — Code Quality Issues That Could Become Bugs

**CONSENSUS (all 3 seats):**

### QA-1: `cls.includes()` substring matching is collision-prone — SEVERITY: HIGH
**Commit:** `cfc877df`
**Location:** `structural-builder.ts → deriveClassMandatoryCharacters`

Order-dependent greedy substring matching across 10+ branches. A classification string like `"underwater edge server"` would match `vertical_farm` (via `'farm'` → false), then `edge_ai` (via `'server'`) before it reaches `auv` (via `'underwater'`). The first-match wins, silently assigning the wrong mandatory character set with no warning.

**Suggested fix:** Replace with exact match via a `Map<string, fn>` keyed on normalised classification enum values, or score all branches and pick the highest-specificity match.

---

**CONSENSUS (Gemini + GLM):**

### QA-2: `(src as any)` and `(state.research as any)` casts — SEVERITY: HIGH
**Commit:** `7b36203c`
**Location:** `7b-pdf-v3-radical-document.tsx → SourcesReferencesPage`

Four `(src as any)` property accesses and one `(state.research as any)?.synthesis...` cast completely bypass TypeScript. If the upstream schema renames any field, the compiler passes but the PDF renders blank strings at runtime. This is the primary access pattern for these data fields — not a temporary escape hatch.

**Suggested fix:** Define `interface SourceRef { title: string; type: string; source_grade: string; relevance: string }` and `interface ResearchSynthesis { claims_requiring_verification: string[] }`. Remove all `as any` casts.

---

**CONSENSUS (Grok + GLM):**

### QA-3: `preferredWordIds` silent fallback — SEVERITY: LOW
**Commit:** `c1a94d38`
**Location:** `structural-builder.ts → buildTreeFromLeaves`

When a `preferredWordIds` entry references an ID that doesn't exist in the character's word list, it silently falls back to `words[0]`. No log, no warning, no telemetry. A stale preferred ID (e.g., after a word is renamed in the hierarchy) will silently misbehave — indistinguishable from an intentional default.

**Suggested fix:** `console.warn(`preferredWordId ${preferredId} not found for character ${leaf.character_id}, falling back to default`)`.

---

**GLM only:**

### QA-4: Hardcoded 3500 kWh BESS fallback — SEVERITY: LOW
**Commit:** `cfc877df`
**Location:** `structural-builder.ts → deriveClassMandatoryCharacters → BESS branch`

Magic number `3500` with no named constant, no spec reference, no config coupling. If the BESS default capacity changes, this will be found only by output divergence.

**Suggested fix:** `const BESS_DEFAULT_CAPACITY_KWH = 3500 // per ForgeOS spec §3.2 — typical utility-scale ESS`

---

## Q3 — Missing Tests

**All three seats agree: no regression tests were added in commit 3.** The commits added zero test files.

| Test name | What it prevents | Priority | Seats |
|---|---|---|---|
| `radical-pdf-section-presence` — assert all expected section IDs/titles appear in rendered output | Section drop regression (SourcesReferencesPage class) | **P0** | All 3 |
| `null_cost_summary_render_test` — feed `state` with both costSummaries undefined, assert no throw | BUG-1 TypeError crash on missing cost data | **P0** | All 3 |
| `bom-stat-nan-guard-test` — feed `rMeta` with undefined `from_llm_estimate`, assert no NaN rendered | BUG-2 NaN in react-pdf | **P0** | Gemini + GLM |
| `classification-branch-coverage` — test each known class + ambiguous strings like "underwater edge server" | QA-1 includes() collision misrouting | **P1** | Gemini + GLM |
| `preferred-word-id-not-found-warning` — assert warning emitted when preferred ID is stale | QA-3 silent fallback masking config drift | **P1** | GLM |
| `bom-stat-non-overlap-invariant` — verify summed counts don't exceed total with overlapping fields | BUG-4 double-counting | **P2** | GLM |

---

## Q4 — Root Cause vs Symptom: polymer_gasket Routing Chain

**Verdict: NEEDS_MINOR structural improvement. Fix is directionally correct but fragile.**

**All 3 seats: is_fix_structurally_sound = false.**

The `polymer_gasket → hull_structure` fix in commit 3 is correct for CGM. But the mechanism — a manually maintained `Record<string, string>` with raw string values for both key and value — has produced two wrong entries across three commits with no compile-time feedback either time.

The root cause is that these mappings have no validation layer:
1. No compile-time check that target word IDs exist in the character hierarchy
2. No runtime warning when a preferred ID silently fails to resolve
3. No reverse check that every mandatory character has a preferred mapping
4. The map lives in the same file where it can be touched in any hotfix without triggering a schema validation step

**GLM structural fix recommendation (most concrete):**
> Move the mapping into a single source-of-truth data file (JSON/YAML) that is validated at build time against the known character set. Add a build-time or test-time assertion that every value resolves to an existing word ID. Add a reverse check: every character that should have a preferred mapping has one.

**Gemini structural fix recommendation:**
> If the mapping must stay on the frontend, type the values as a Literal Union (`type KnownWordIds = 'hull_structure' | 'biosensor_hardware' | ...`) instead of `Record<string, string>`, so TypeScript catches unknown target IDs at compile time.

Both recommendations are complementary and should both be applied.

---

## Q5 — Process Lessons

**CONSENSUS:**

### P1: Bundled multi-concern commits hide regressions
Commit `cfc877df` bundled P1 (cross-contamination), P2 (feasibility), P3 (exec summary), and DRC rename into a single commit. The SourcesReferencesPage was dropped in this bundle and not detected until the V2 multimodal council ran separately. A one-logical-change-per-commit policy would have made the drop visible during the P3 section wiring step.

**Action:** Enforce one logical concern per commit for PDF renderer changes. Separate structural fixes (tree builder) from renderer section additions.

### P2: Renderer sections must always render — no silent conditional drops
The SourcesReferencesPage was dropped silently. §8 DRC is dropped silently today. The pattern `{condition && <SectionPage />}` is structurally dangerous for a document renderer where section count and order is load-bearing.

**Action:** Add a post-render section manifest assertion to CI. Every section must either render its content OR render an explicit "data unavailable" placeholder — never silently vanish. This is P0: it would have caught the known regression automatically.

### P3: Manual maps without validation are a recurring failure class
The `preferredWordIds` map produced a wrong value in commit 2, was corrected in commit 3, but the mechanism that allowed the error is unchanged.

**Action:** Any new lookup map that maps character/word IDs must be validated at build or test time. Add a CI gate: if a `preferredWordIds` map entry references a value that doesn't appear in `character-hierarchy.ts`, the build fails.

### P4 (GLM): Null-safety enforcement is inconsistent
`cs?.topDrivers` (safe) and `cs.finalUnitCost` (unsafe) appear in the same code session. The TypeScript `strictNullChecks` config is apparently enforced inconsistently.

**Action:** Add `null-safety` to the code-review checklist: "Every derived value that can be undefined must be guarded before property access, or proven non-null by preceding assertion."

---

## Per-Commit Latent Issues Summary

| Commit | Latent issues found (beyond known regression) |
|---|---|
| `cfc877df` | **HIGH:** Unguarded `cs` access in `buildFeasibilityFields` → TypeErrors. **HIGH:** `cls.includes()` collision-prone routing. **LOW:** Hardcoded 3500 kWh magic number. |
| `c1a94d38` | **LOW:** preferredWordIds silent fallback with no telemetry (structural risk, not immediately broken). |
| `7b36203c` | **HIGH:** NaN from unguarded `rMeta.from_llm_estimate`. **MEDIUM:** §8 DRC conditional render silently drops section. **HIGH:** as-any casts bypass TypeScript on all sources data. **MEDIUM:** BOM stat double-counting risk. |

---

## Recommended Follow-Up Actions (Prioritised)

### P0 — Fix before next production run

1. **Null-guard `cs` in `buildFeasibilityFields`** (commit `cfc877df` regression, all 3 seats flagged)
   File: `src/lib/pdf-engine-v2/stages/7b-pdf-v3-radical-document.tsx`
   Fix: Early return with empty fallback when `cs` is undefined.

2. **NaN guard on `rMeta` numerators in SourcesReferencesPage** (commit `7b36203c`, Gemini + GLM)
   File: `src/lib/pdf-engine-v2/stages/7b-pdf-v3-radical-document.tsx`
   Fix: `(rMeta.from_llm_estimate ?? 0)` and `(rMeta.stub ?? 0)`.

3. **Add section-manifest smoke test** (process P0, all 3 seats)
   File: new `src/lib/pdf-engine-v2/stages/radical-pdf-sections.test.ts`
   Fix: Assert all 8 sections render (including conditional §8) with minimal stub state.

### P1 — Fix in next planned sprint

4. **Fix §8 DRC conditional render** — always render with placeholder (GLM + Grok)
   File: `7b-pdf-v3-radical-document.tsx`

5. **Type the `preferredWordIds` values as a Literal Union** (Gemini)
   File: `structural-builder.ts`
   Fix: `type KnownWordIds = 'hull_structure' | 'biosensor_hardware' | ...`; replace `Record<string, string>`.

6. **Add `console.warn` for silent preferredWordId misses** (Grok + GLM)
   File: `structural-builder.ts → buildTreeFromLeaves`

### P2 — Structural improvements

7. **Replace `cls.includes()` with exact-match dispatcher** (all 3 seats)
   File: `structural-builder.ts → deriveClassMandatoryCharacters`

8. **Type `brief.sources` and `state.research.synthesis`** — remove all `as any` (Gemini + GLM)
   File: `7b-pdf-v3-radical-document.tsx`

9. **Extract `BESS_DEFAULT_CAPACITY_KWH = 3500` as named constant** (GLM)

---

## Final Verdict

| Seat | Verdict |
|---|---|
| Grok 4.3 | NEEDS_MINOR |
| Gemini 3.1 Pro | **NEEDS_MAJOR** |
| GLM-5.1 | **NEEDS_MAJOR** |

**Synthesis verdict: NEEDS_MAJOR**

Two seats say NEEDS_MAJOR because BUG-1 (unguarded `cs` access) will cause a production TypeError crash on any brief where both `radicalCostSummary` and `costSummary` are absent from state — this is not a hypothetical. This is a P0 fix that must land before the next dispatch run.

Grok's NEEDS_MINOR verdict under-weights BUG-1 (it flagged it as HIGH severity but apparently treated the overall surface area as minor). The 2-seat majority for NEEDS_MAJOR is correct.

---

## Single Most Important Action

**Fix the null guard on `cs` in `buildFeasibilityFields`** (`7b-pdf-v3-radical-document.tsx`) — a one-line early-return that prevents a TypeError crash on every radical PDF render where cost data is absent. This is the only P0 fix that will cause a visible production failure on the next dispatch cycle.

---

## Council Notes

- `anthropic/claude-opus-4.7` model ID is not valid on this OpenRouter endpoint (confirmed: returns model-list error). The Grok scoring script note in the brief was correct to flag this. Valid Anthropic alternative via this endpoint: none currently. Use Gemini 3.1 Pro as the lead-reasoning seat.
- Saturation check: all three responses closed their JSON cleanly, output_tokens well below 16000 ceiling. No re-calls needed.
- Council methodology: 2+ seats flagging same issue = BLOCKER. BUG-1 and QA-1 are blockers by this rule (3/3 seats). BUG-2 and QA-2 are blockers (2/3 seats).

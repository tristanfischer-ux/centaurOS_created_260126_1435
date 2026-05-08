# PDF Engine v2 — Strict Adoption Migration Tracker

**Source plan:** `STRICT-ADOPTION-MIGRATION-PLAN.md` (commit `fe437ca6`)
**Started:** 2026-05-08
**Total estimated:** 25-30 sonnet hours / 8-10 wall-clock days realistic
**Owner:** Claude Opus 4.7 (autonomous)

---

## Overall progress

| Phase | Description | Sonnet hrs | Status | Council review | Date done |
|---|---|---|---|---|---|
| A | Brief Parsing as new Stage 1 | 3-4 | 🔄 In progress | ⬜ Pending | — |
| B | Reorder Research to consume Brief Parsing | 3-4 | ⬜ Pending | ⬜ Pending | — |
| C | Drop Training Data Dump | 0.5-1 | ⬜ Pending | ⬜ Pending | — |
| D1 | Module + Regulatory PA schemas | 3-4 | ⬜ Pending | ⬜ Pending | — |
| D2 | Sizing + Cost PA schemas | 3-4 | ⬜ Pending | ⬜ Pending | — |
| E | Cut over integrated BOM/Suppliers | 2-3 | ⬜ Pending (gated on v2 BOM ≥8 baseline) | ⬜ Pending | — |
| F | Demote Review/Polish + Report Type Router | 2-3 | ⬜ Pending | ⬜ Pending | — |
| G | Renderer integration with reportType | 2-3 | ⬜ Pending | ⬜ Pending | — |
| H | Flip defaults, cleanup | 1-2 | ⬜ Pending | ⬜ Pending | — |

**Status legend:** ⬜ Pending · 🔄 In progress · ✅ Done · ⚠️ Blocked · 🚫 Skipped
**Council legend:** ⬜ Pending · 🔄 In progress · ✅ Approved · ⚠️ Issues to fix · ❌ Rejected

**Q1-Q6 defaults (Tristan agreed 2026-05-08):**
- Q1: preserve brief revision loop as conditional (FEASIBILITY_EXCEPTION only)
- Q2: drop Polish entirely
- Q3: council scoring stays in-pipeline, FULL_REPORT-only guard
- Q4: split Regulatory Extraction as separate PA Stage 4 (+4 hrs)
- Q5: keep Suppliers as FULL_REPORT-only renderer section
- Q6: incremental RL manifest updates per phase
- Q7: minimum viable PA pipeline = TBD by Tristan

---

## Phase A — Brief Parsing as new Stage 1

**Status:** 🔄 In progress
**Started:** 2026-05-08 (this dispatch)
**Estimated:** 3-4 sonnet hours

### Planned (from migration plan)

| Sub-item | Status |
|---|---|
| Rewrite `stages/0-brief-generation.ts` prompt to PA Stage 1 schema | ⬜ |
| Rename function to `runBriefParsing()` | ⬜ |
| Add `StructuredBriefJSON` interface to `types.ts` | ⬜ |
| Add `parsedBrief?: StructuredBriefJSON` to `PipelineState` | ⬜ |
| Move `runBriefParsing()` call to top of pipeline (before Classification) on `PA_PIPELINE=true` | ⬜ |
| Dual-write to `state.research.designBrief` for backwards compat | ⬜ |
| Update `brief-validator.ts` to read `parsedBrief.missing_mandatory_fields` when present | ⬜ |
| Unit test against BESS brief fixture passes | ⬜ |
| Typecheck clean | ⬜ |

### Verification criteria

- [ ] `runBriefParsing()` produces valid `StructuredBriefJSON` against BESS brief fixture
- [ ] `parsedBrief.constraints.unit_cost_ceiling.value` === 180000 for BESS brief
- [ ] `parsedBrief.missing_mandatory_fields` empty for BESS brief
- [ ] `PA_PIPELINE=false` runs unchanged (no regression)
- [ ] `PA_PIPELINE=true` produces council score within ±0.5 of `PA_PIPELINE=false` baseline

### Council review

- [ ] Coding council fires on commit (6 LLMs from different lineages)
- [ ] All findings flagged by 2+ seats addressed before Phase B starts
- [ ] Council notes appended to this section

### Actual (filled in after phase lands)

- Commit SHA: TBD
- Files changed: TBD
- Deviations from plan: TBD
- Council findings: TBD

### Rollback plan

Delete `PA_PIPELINE=true` env var. Existing `runBriefGeneration()` path untouched.

---

## Phase B — Reorder Research to Consume Brief Parsing

**Status:** ⬜ Pending (blocked on A)

### Planned

| Sub-item | Status |
|---|---|
| Rewrite `stages/1-research.ts` `runResearch()` to accept `StructuredBriefJSON` | ⬜ |
| Adopt PA Stage 3 output schema | ⬜ |
| Add `ResearchSynthesis` interface to `types.ts` | ⬜ |
| Update `RESEARCH_SYNTHESIS_SYSTEM` in `prompts.ts` to PA Stage 3 prompt | ⬜ |
| Remove `extractResearchConstraints()` on PA path | ⬜ |
| Dual-write `state.research` for backwards compat | ⬜ |

### Verification

- [ ] `state.researchSynthesis.competitors.length >= 3` for BESS brief
- [ ] `state.researchSynthesis.claims_requiring_verification` non-empty
- [ ] `source_grade_overall === 'E'`
- [ ] Research council score ≥ current baseline

### Council review

- [ ] All findings ≥2 seats addressed before Phase C

---

## Phase C — Drop Training Data Dump

**Status:** ⬜ Pending (blocked on B)

### Planned

| Sub-item | Status |
|---|---|
| Gate `runTrainingDataDump()` call in `index.ts` with `if (!PA_PIPELINE)` | ⬜ |
| Mark `stages/0-training-data.ts` as `@deprecated` in JSDoc | ⬜ |
| Confirm downstream calls compile on both paths | ⬜ |

### Verification

- [ ] No `[stage-0] Starting parallel execution` log on PA path
- [ ] Pipeline wall-clock decreases by Training Data duration (~3-5 min)
- [ ] Council Research score unchanged or improved

### Council review

- [ ] All findings ≥2 seats addressed before Phase D

---

## Phase D — Restructure Modules / Sizing / BOM / Cost to PA Schemas

**Status:** ⬜ Pending (blocked on B)
**Two parallel sonnets:** D1 (Module + Regulatory) + D2 (Sizing + Cost)

### D1 — Module Decomposition + Regulatory Extraction

| Sub-item | Status |
|---|---|
| Rewrite `MODULE_DECOMPOSITION_SYSTEM` prompt to PA Stage 5 schema | ⬜ |
| Update `validateDecomposeResult()` for new required fields | ⬜ |
| Add 6 new `Module` fields to `types.ts` | ⬜ |
| Extract `runRegulatoryExtraction()` as separate PA Stage 4 function | ⬜ |
| Adopt PA Stage 4 prompt schema (`source_grade: 'C'`, `verification_status: 'UNVERIFIED'`) | ⬜ |
| Add 5 new `RegulatoryItem` fields to `types.ts` | ⬜ |

### D2 — Sizing Solver + Cost Computation

| Sub-item | Status |
|---|---|
| Extend `DimensionSheet` with 14 new fields per RENDERER-REDESIGN.md §3.4 | ⬜ |
| Surface `iso_container_layout` zones as `DimensionSheet.zones[]` | ⬜ |
| Extend `CostBreakdown` with `overheadLines[]`, `nreItems[]`, `reductionPaths[]`, `perModule[].pctOfBom`, `perModule[].grade`, `ceilingExceededBanner` | ⬜ |
| Update `cost-model.ts` and `lib/nre-from-regulatory.ts` to populate new fields | ⬜ |
| All new fields optional and null-safe | ⬜ |

### Verification

- [ ] `state.modules[0].maturity` populated on all 10 baseline briefs
- [ ] `state.modules[0].expected_parts.length >= 1` for all modules
- [ ] `state.regulatoryExtraction.regulatory_entries[0].source_grade === 'C'` for BESS
- [ ] `state.dimensionSheet.zones.length >= 1` for BESS
- [ ] `state.costBreakdown.overheadLines.length >= 3`
- [ ] Council Modules, Regulatory, Sizing, Cost scores ≥ current baseline

### Council review

- [ ] D1 council review: findings ≥2 seats addressed
- [ ] D2 council review: findings ≥2 seats addressed
- [ ] Cross-cut review (D1 + D2 together) for type consistency

---

## Phase E — Cut Over Integrated BOM/Suppliers

**Status:** ⚠️ Blocked on v2 BOM hitting ≥8 baseline (per migration plan §5.1)
**Estimated:** 2-3 sonnet hours

### Pre-condition

- [ ] v2 integrated BOM stage (`stages/4-bom-cost-suppliers.ts` at commit `7ee2f86d`) scores BOM ≥8, Cost ≥8, Suppliers ≥8 across all 10 baseline briefs (run after Phase D lands and uses fixed scorer)

### Planned

| Sub-item | Status |
|---|---|
| Remove `BOM_PIPELINE` env flag from `index.ts` | ⬜ |
| Make `runBomCostSuppliers()` the only BOM path | ⬜ |
| Mark `stages/4-bom-cost.ts` and `stages/5-suppliers.ts` as `@deprecated` (delete after 2026-05-22) | ⬜ |
| Wire LCSC into `findSkuForPart()` aggregator (once LCSC API key available) | ⬜ |
| Adopt PA Stage 6 BOM Generation prompt schema | ⬜ |

### Verification

- [ ] Baseline BOM ≥8, Cost ≥8, Suppliers ≥8 on all 10 briefs
- [ ] No `BOM_PIPELINE` references remain in `index.ts`

### Council review

- [ ] Findings ≥2 seats addressed
- [ ] Special focus: distributor API wiring (per migration plan risk #3)

---

## Phase F — Demote Review/Polish + Report Type Router

**Status:** ⬜ Pending (blocked on A-D)

### Planned

| Sub-item | Status |
|---|---|
| Remove `runPolish()` call from `index.ts` entirely | ⬜ |
| Move `runReview()` call inside `if (reportType === 'FULL_REPORT')` guard | ⬜ |
| Create `report-type-router.ts` implementing PA Stage 9 lookup table | ⬜ |
| Add `ReportType`, `ReportTypeRouterResult` to `types.ts` | ⬜ |
| Add `reportType?: ReportType` to `PipelineState` | ⬜ |
| Add `reportType` to `FeasibilityResult` | ⬜ |
| Mark `stages/7-polish.ts` as `@deprecated` | ⬜ |
| Brief revision loop: keep as conditional on FEASIBILITY_EXCEPTION (Q1 default) | ⬜ |

### Verification

- [ ] BESS brief (one FAIL: cost) routes to FULL_REPORT
- [ ] Brief with BOM=0 routes to FEASIBILITY_EXCEPTION
- [ ] Brief missing mass + cost ceiling routes to BRIEF_INCOMPLETE
- [ ] Polish log line absent from runs
- [ ] Review runs on FULL_REPORT only

### Council review

- [ ] Findings ≥2 seats addressed
- [ ] State-machine audit (PA Stage 9 routing logic) — use GLM-5.1 + Grok 4.3 + Kimi K2.6 council per coding-council.md

---

## Phase G — Renderer Integration with reportType

**Status:** ⬜ Pending (blocked on F; can overlap with F if D shapes ready)

### Planned

| Sub-item | Status |
|---|---|
| Add `state.reportType` guards to each major section in `stages/7-pdf-v3.tsx` | ⬜ |
| Implement section-count guard for max-pages enforcement (12 for FEASIBILITY_EXCEPTION, 6 for BRIEF_INCOMPLETE) | ⬜ |
| Make `PDF_RENDERER=v3` default when `PA_PIPELINE=true` | ⬜ |

### Verification

- [ ] FEASIBILITY_EXCEPTION report PDF ≤ 12 pages
- [ ] BRIEF_INCOMPLETE report PDF ≤ 6 pages
- [ ] FULL_REPORT renders all sections

### Council review

- [ ] Findings ≥2 seats addressed

---

## Phase H — Flip Defaults + Cleanup

**Status:** ⬜ Pending (blocked on all prior phases + baseline ≥8 on all 10 briefs)

### Planned

| Sub-item | Status |
|---|---|
| Flip `PA_PIPELINE` default to `true` in `index.ts` | ⬜ |
| Flip `PDF_RENDERER` default to `'v3'` in `index.ts` | ⬜ |
| Delete `stages/0-training-data.ts`, `stages/7-polish.ts`, `stages/4-bom-cost.ts`, `stages/5-suppliers.ts` (after hold period) | ⬜ |
| Update `STAGE-RL-MANIFEST.md` for new stage names | ⬜ |
| Update RL scripts (`brief-rl-iterate.ts` etc.) for stage name references | ⬜ |
| Mark `stages/7-pdf.tsx` `@deprecated`, delete after final regression check | ⬜ |

### Verification

- [ ] Default `npm run engine` produces PA-conformant pipeline run with no env vars
- [ ] All 10 baseline briefs produce council scores ≥8 across all sections
- [ ] No `@deprecated` stage files imported anywhere

### Council review

- [ ] Findings ≥2 seats addressed
- [ ] Final regression check across all 10 baseline briefs

---

## Risk register live status

Tracking the migration plan's §5 risks as they materialise:

| Risk | Severity | Status | Mitigation in flight |
|---|---|---|---|
| Brief Parsing fails on thin briefs | HIGH | ⬜ Not yet | Phase A regression suite TBD |
| FMEA quality loss when Decompose prompt changes | HIGH | ⬜ Not yet | Keep V1 prompt as rollback target |
| Distributor APIs orphaned during BOM rewrite | HIGH | ⬜ Not yet | Phase E checklist explicitly verifies |
| MiMo FMEA "Unknown" rejection on PA prompt | MEDIUM | ⬜ Not yet | RL iterate after Phase D if it fires |
| Renderer needs fields Phase D didn't emit | MEDIUM | ⬜ Not yet | Cross-check after Phase D |

---

## Missing-only recap

For watchdog drift detection. Pending items only:

- ❌ Phase A: ALL sub-items (just dispatched)
- ❌ Phase B-H: blocked on prior phases
- ❌ All council reviews
- ❌ All verification criteria

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-08 | Strict adoption of PA architecture (8-phase migration) | See `STRICT-ADOPTION-MIGRATION-PLAN.md` §0 |
| 2026-05-08 | Q1 preserve brief revision loop as conditional (FEASIBILITY_EXCEPTION only) | Better founder UX than hard INFEASIBLE wall |
| 2026-05-08 | Q2 drop Polish entirely | PA's JSON-first principle; RL fixes prose in source stages |
| 2026-05-08 | Q3 council scoring stays in-pipeline, FULL_REPORT-only | Async option requires UI/queue work out of scope |
| 2026-05-08 | Q4 split Regulatory as PA Stage 4 | Compliance is high-stakes, distinct expertise; +4 hrs worth it |
| 2026-05-08 | Q5 keep Suppliers as FULL_REPORT-only section | 3 suppliers per Make is hard rule, must render somewhere |
| 2026-05-08 | Q6 incremental RL manifest updates per phase | Avoids stale doc + final batch task |

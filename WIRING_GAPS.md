# WIRING_GAPS — 19 "universal" claims, actual coverage % (2026-05-23)

Code-verified coverage for every claim that a fix was applied universally. Source: Seat D + corroboration from Seats A/B/C/E.

**Verdict scale:**
- 🟩 **GREEN** — universal (≥95% coverage)
- 🟨 **YELLOW** — partial (10-95% coverage)
- 🟥 **RED** — broken (≤10% coverage OR fundamental design flaw)

**Score:** 1 GREEN | 12 YELLOW | 6 RED

---

## 1. Tool narrative fields universal — 🟥 RED

**Canonical files:** `scripts/lib/orchestrator/tools/python/*.py` (229 files)

**Claim:** Task #33 "Build #19d: provenance metadata on every tool wrapper" — marked completed.

**Actual coverage:**
- `description` / `what_it_does`: **0/229 (0%)**
- `results_interpretation`: **0/229 (0%)**
- `usage_pattern`: **0/229 (0%)**

**Evidence:** `grep -l "what_it_does" scripts/lib/orchestrator/tools/python/*.py` returns 0. Sample header `bemt_propeller.py:1-30` shows a docstring only — no structured narrative fields. The fields don't exist in the tool layer at all.

**Impact if unfixed:** Reviewer LLMs reading tool outputs cannot consume a structured "what this tool does / how to interpret results / when to use" block. The Tools-Used PDF appendix has to fall back to free-text mining of module docstrings, with high noise. CoolProp shows the rich 4-field narrative because someone hand-wrote it in `coolprop_run.py`; everything else shows only `reference_paper` + `underlying_math` + `source`.

---

## 2. Cost-stack reads ALL price sources — 🟨 YELLOW

**Canonical file:** `scripts/render-minimal-pdf.tsx:802-1133` (`computeBomTotals`)

**Claim:** Today's 2026-05-23 fix appends orchestratorContract macros to BoM total.

**Actual coverage:** 3/3 sources read (100%) BUT cross-source dedupe is asymmetric.

**Evidence:**
- Line 803: `partVerifications[]` read ✓
- Line 885: `engineeringContract.macro_assembly_prices` read ✓ (per-word matching)
- Lines 1095-1097: orch + eng macros concatenated → unmatched-loop ✓
- Line 1112: match check is `wordNames.has(name) || wordNames.has(\`${name}_word\`)`
- **Risk:** `claimedMacroAssemblies` set is populated only by the per-word override path (line 925), NOT by the unmatched loop. If both `orchestratorContract` and `engineeringContract` carry the same macro under the same name AND neither matches a design word, the unmatched-loop double-counts (`allMacros = [...orchMacros, ...engMacros]` concatenates without dedup between sources).

**Impact if unfixed:** Wind turbine, h2_electrolyser, solar_inverter, ups_inverter — emitters using `buildMinimalContract` leave engineeringContract.macros empty, so no double-count today. But any archetype that populates BOTH (BESS-style + orchestrator-pass) risks silent double-counting if name slugs diverge by one underscore.

---

## 3. Contract fallthrough-to-assume-unit pattern — 🟨 YELLOW

**Canonical file:** `scripts/lib/engineering-contract.ts` (36 `registerArchetype` blocks)

**Claim:** Today's fixes patched the 5 priority archetypes.

**Actual coverage:** **15/36 archetypes safe**, 7 confirmed UNSAFE, 14 uninspected.

**SAFE (15):** bess, bioreactor, h2_electrolyser, heat_pump_residential, solid_state_battery (today's fixes), plus drone, auv, cgm, edge_ai, ev_charger, vertical_farm (partial), dac (partial), haps (uninspected but `findScaleMetric` likely).

**UNSAFE (7):** solar_inverter, wind_turbine, ups_inverter, cnc_machine, e_bike, pemfc, smr — all use ternary `Number(tp.value ?? FALLBACK)` that silently treats unknown units as kW.

**UNCONFIRMED (14):** all 4 satellite archetypes, propulsion_thruster_product, ground_station, ventilator, dialysis_machine, evtol, quantum_computer, cryostat, fso, phased_array, humanoid, 3d_printer_fdm.

**Impact if unfixed:** Parser picks wrong key_metric (e.g. efficiency % instead of power kW) → unsafe archetype treats the bare number as kW → cost stack, sizing, physics critic all corrupted. Canonical "5 MW electrolyser sized as 5 kW" pattern.

---

## 4. Sub-module density splitter coverage — 🟩 GREEN

**Canonical files:** `scripts/lib/orchestrator/submodule-splitter.ts` + `scripts/lib/orchestrator/assembler.ts:26, 110`

**Actual coverage:** 100% — every emitter return wrapped in `finalise(design)`.

**Evidence:** Assembler:118 + 129 + 143 (BESS legacy path) all call `finalise`. Density floor 2.0 confirmed at `submodule-splitter.ts:42, 185-197`.

**Caveat:** When a sub-module has ≥3 words sharing ONE radical (e.g. bioreactor's vessel = all `pressure_vessel_function`), splitter passes through unchanged. Operator sees no expansion. Edge-case, not a fundamental break.

---

## 5. Envelope detector multi-field via Normaliser — 🟥 RED

**Canonical file:** `scripts/lib/orchestrator/envelope.ts` (36 `*ScaleTier` functions)

**Claim:** Task #66 "Universal envelope detector enhancement — read multiple candidate fields" — marked completed.

**Actual coverage:** **10/36 archetypes refactored (28%)**.

**REFACTORED:** bess, heatpump, bioreactor, evCharger, evtol, ssb, h2Electrolyser, solar, wind, dac (partial — has legacy fallback at line 1425).

**NOT REFACTORED — 26 detectors:** vfScaleTier, droneScaleTier, auvScaleTier, cgmScaleTier, edgeAiScaleTier, upsInverterScaleTier, printerFdmScaleTier, cncMachineScaleTier, eBikeScaleTier, all 4 satellite scale tiers, thrusterScaleTier, groundStationScaleTier, ventilatorScaleTier, dialysisScaleTier, quantumComputerScaleTier, cryostatScaleTier, fsoScaleTier, phasedArrayScaleTier, pemfcScaleTier, smrScaleTier, humanoidScaleTier — all still embed direct `c.target_performance` reads.

**Impact if unfixed:** Same bug family as cross-cut 3 (unsafe unit fallthrough) and cross-cut 7 (single-metric brief). Together they form ONE universal bug class: "brief parser picks wrong key_metric → cascade of silent unit assumptions downstream".

---

## 6. Render `wrap={false}` overlap — 🟨 YELLOW

**Canonical file:** `scripts/render-minimal-pdf.tsx`

**Actual coverage:** 2 sites fixed today (lines 3627-3635 SubModuleBomBlock + 4001-4007 sub-module title), **17 sites still wrap={false}**.

**HIGH-RISK remaining:**
- **Line 2532** — sub-module wrapper (variable-tall content) [Seat B Q7]
- **Line 5260** — supplier card (4-6 inches tall with bullets + URL + email + fit_bullets) [Seat C Q5]
- **Line 5942** — Tools-Used card (12 claims + 4-paragraph tool narrative) [Seat C Q5]

**MEDIUM-RISK:** lines 2662 (review row), 2919 (callout), 3068 (header), 3762 (callout), 4181 (FMEA hazard), 4362 + 4401 (decision cards), 4587 (verify card), 5846 (cost-analysis card).

**LOW-RISK (short rows):** lines 3662, 4051, 4118, 4236, 4783, 4922, 4934, 4941, 4950, 5782, 5790, 5809, 6168.

**Impact if unfixed:** Same overlap pattern as user-reported wind-turbine page 18. Renders 4+ text fragments at the same Y-coordinate. pdftotext extraction shows the smear; visual reader sees illegible stacked text.

---

## 7. Brief parser emits multi-metric — 🟥 RED

**Canonical files:** `src/lib/pdf-engine-v2/types.ts:26-31`, `src/lib/pdf-engine-v2/prompts.ts:27`

**Actual coverage:** **0% multi-metric**.

**Evidence:**
- `types.ts:26-31` — `StructuredBriefPerformance` is `{ key_metric, value, unit, source }` flat. Not array.
- `types.ts:71` comment: "BLOCKER-6 fix: single flat type, no union" — single-metric choice is explicit.
- `prompts.ts:27` — `"target_performance": { "key_metric": ..., "value": ..., "unit": ... }` — parser prompt allows only one.

**Impact if unfixed:** Briefs commonly have multiple performance dimensions (BESS: kWh + C-rate + cycle life; HAPS: endurance + payload + altitude; bioreactor: working volume + kLa + OTR). Parser must pick ONE → non-deterministic across runs → ROOT CAUSE of cross-cut 3 (unsafe unit) AND cross-cut 5 (envelope detector wrong field) AND cross-cut 8 (emitter fallback wins).

**Highest-leverage architectural fix in the codebase.** Collapses RED cross-cuts 3+5+7+8 simultaneously.

---

## 8. Emitter hardcoded scale defaults — 🟨 YELLOW

**Canonical files:** `scripts/lib/orchestrator/emitters/*.ts` (36 files)

**Actual coverage:** 100% of emitters use `q(c, key, FALLBACK)` pattern. The pattern itself is fine; the FALLBACK values are the bug.

**Evidence — top 5 most-likely problematic:**
1. `bioreactor.ts:111` — `working_volume_l = 1000`
2. `wind-turbine.ts:82` — `rated_power_kw = 50` (small-tier default)
3. `h2-electrolyser.ts:74` — `rated_power_kw = 1000`
4. `h2-electrolyser.ts:143` — **anti-pattern**: passes empty `quantities: {}` literal, so `97` is the only possible value
5. `vertical_farm.ts:254-294` — **6 scale-determining fallbacks** (trolley_count=8, led_power=12, annual_yield=25000, etc.)

**Impact if unfixed:** When contract is empty (orchestrator's tool plan didn't fire, or all tools failed), each emitter ships the FALLBACK as the design. PDF reports 1000L bioreactor / 50 kW wind / 12 kW LED VF / 25,000 kg/yr yield REGARDLESS of brief.

---

## 9. Silent-filter aggregation bugs — 🟨 YELLOW

**Canonical file:** `scripts/render-minimal-pdf.tsx` + `scripts/cost-repair.tsx` + `scripts/serial-design-chain-v2.tsx`

**Actual coverage:** The `cost_repair_excluded_from_subtotal` flag is wired into **5 separate aggregate-skip sites**:
1. `render-minimal-pdf.tsx:1010` — sub-module subtotal (the £96+£8=£0 site)
2. `render-minimal-pdf.tsx:1208` — `applyBatchEconomics` scaled-aggregate path (mirror)
3. `serial-design-chain-v2.tsx:3839-3842` — G2 cost-reality gate
4. `cost-repair.tsx:281` — UP-cap sets the flag
5. `cost-repair.tsx:296` — manual_sourcing_required also sets the flag

Plus other silent filters:
- `render-minimal-pdf.tsx:853` — `isCertWord` strips certification entries entirely (UKCA, BRCGS audits etc. cost real money but never appear in BoM)
- `render-minimal-pdf.tsx:1192` — W3 scale skipped for `engine_b_estimate_source ∈ {'curve', 'flash_lite_unknown_class'}`
- `render-minimal-pdf.tsx:4973` — TBD rows silently excluded from sub-totals (documented)
- `render-minimal-pdf.tsx:902-904` — single-fire macro guard (Loop 10 fix)
- `enrich-state-with-suppliers.tsx:5246-5249` — supplier card silently dropped when no contact info
- `enrich-state-with-suppliers.tsx:44` — `MIN_LLM_SCORE = 6` drops sub-6 candidates without footnote
- `validate-supplier-contacts.tsx:175-185` — bad URLs silently stripped

**Impact if unfixed:** Reader sees `unit_price × qty = line_total` in the BoM but sub-total doesn't add up. Reader cannot reconcile printed math without reading source code. User's "96+8=£0" is one such site; pattern recurrence is high.

---

## 10. keyMetrics=null for early reviewers — 🟥 RED

**Canonical file:** `scripts/serial-design-chain-v2.tsx`

**Actual coverage:** **100% confirmed bug**.

**Evidence:**
- Line 2102: `let keyMetrics: KeyMetrics | null = null  // populated AFTER Phase 2`
- Line 2563: R1 receives keyMetrics (still null)
- Lines 2582, 2628, 2695, 2745: further reviewers, all null
- **Line 3085: FIRST POPULATION** (`keyMetrics = derived as KeyMetrics`)

**Order of execution:** init (2102) → R1 (2563) → skeleton critic (2520) → R4 (2620) → specialist R4.5 (2684) → physics repair (2745) → headline derive (3085).

**Impact if unfixed:** Every reviewer between line 2102 and 3085 receives `formatKeyMetricsBlock(null)` → an empty / placeholder block. Reviewers cannot ground critique on the cover-page headline (e.g. "this BoM says £180k but the keyMetrics headline says £100k MAX") because the headline isn't available yet.

**Trivial fix:** move Stage 32 (deriveHeadlineFromModules) earlier — before Stage 18 skeleton critic. The function needs `design.modules + parsedResult.data + productClass + currentBriefText` — all available by line 2435.

---

## 11. stripWordSuffixFromDesign no-op — 🟥 RED

**Canonical file:** `scripts/serial-design-chain-v2.tsx`

**Actual coverage:** **2 valid call sites, 1 no-op.**

**Evidence:**
- Line 2176: `stripWordSuffixFromDesign(design)` — VALID (local var)
- Line 2412: `stripWordSuffixFromDesign(design)` — VALID
- **Line 3499: `try { stripWordSuffixFromDesign((state as any).design) } catch {}` — NO-OP**

State has `moduleDecomposition`, not `design`. All consumers downstream (line 3693, 3814, 3990) read `liveState.moduleDecomposition?.modules`. The cast-to-any masks the typo; try/catch silently swallows.

**Impact if unfixed:** Per the line 3496 comment: "Phase 2 LLM specialists sometimes re-emit name_human with the schema-suffix after the post-orchestrator strip ran. Catches whatever later stages reintroduced before render reads state." Result: BoM lines render with " word" suffix when Phase 2 specialists patched a row, until the renderer strips on its own (line 6217 — only on verifications side).

---

## 12. Stage 17 `__contractMisses` dead output — 🟨 YELLOW

**Actual coverage:** Read by 1 consumer (`scripts/serial-design-chain-v2.tsx:1675` inside reviewer-prompt builder). Not literally dead WITHIN the chain. But the value persists in `state.json` with no readers outside this script — Render/Engine B/C/D etc. never consume it.

**Impact if unfixed:** No production impact today (used in-process). Audit cost: state.json carries a property no downstream tool understands.

---

## 13. Stage 18 `skeletonFailFast` ignored — 🟨 YELLOW

**Actual coverage:** Set at line 2536 when plausibility ≤ 2. Read at line 2545 (`logAction({ fail_fast })`) only. NO `if (skeletonFailFast)` halt-block exists anywhere.

**Impact if unfixed:** Misleading variable name; reader expects "fail fast" semantic that doesn't exist. Comment at 2537 explicitly says "Loop continues so PDF lands for diagnosis" — intentional but should rename to `skeletonFailFastTriggered`.

---

## 14. Stages 40-44 disk-only mutation — 🟨 YELLOW

**Actual coverage:** Each subprocess at lines 3514, 3537, 3560, 3586, 3609 writes state.json on disk. Chain parent does NOT re-read between subprocess calls. Re-reads at 3691 (`liveState`) and 3774 (`liveState` — SAME name, shadowed scope).

**Impact if unfixed:** Discipline intact in current code. ANY future patch adding `state.X` access between line 3501 and 3691 reads stale data silently. Two `liveState` variables in the same function easy to confuse.

---

## 15. `as any` casts that hide bugs — 🟨 YELLOW

**Actual coverage:** 33 occurrences in `serial-design-chain-v2.tsx`, 1 in `engineering-contract.ts`, 12 in `render-minimal-pdf.tsx`.

**HIGH-RISK (touch state fields):**
- Lines 2155-2158: `engineeringContract.quantities as any` (casts away the very fields the validator depends on)
- Line 2887: `(t.modules as any).__briefConstraints = ...`
- Lines 3043, 3056: `(design as any).k10ShadowResult = ...`
- Line 3324: `(design as any).g4ManualReview = true`
- Line 3489-3490, 3499: `(state as any).designDecisionsReview`, `(state as any).design` — latter is the cross-cut 11 no-op

**Impact if unfixed:** `as any` bypasses writer/reader pair type-check. The cross-cut 11 bug (line 3499 reading `.design` instead of `.moduleDecomposition`) is a direct artefact of this pattern.

---

## 16. LLM temperature / top-p / seed scatter — 🟥 RED

**Actual coverage:** No single source. Temperature defined per-call at 13+ sites with values: 0, 0.1, 0.2, 0.3, 0.4, scaling-by-i.

`SCORER-AUDIT.md:204-226` documents this as a B3 bug: "Judge temperature not fixed to 0. Scoring the same output twice will produce different scores."

**Impact if unfixed:** Reproducibility: same brief gives different reviewers/cost-stack/PDF across runs. Council scorer cannot be a stable reward signal for RL.

---

## 17. JSON serialisation round-trips — 🟨 YELLOW

**Actual coverage:** All 3 re-reads use `JSON.parse(readFileSync(statePath, 'utf-8'))`. Style inconsistency at line 3654 uses `require('fs').readFileSync` (lazy import) — others use module-level import. Two `liveState` variables in same function (3691, 3774) shadow.

**Impact if unfixed:** None functional. Style noise.

---

## 18. Log format + exit codes inconsistent — 🟨 YELLOW

**Actual coverage:** 4 exit calls, 3 distinct codes:
- `process.exit(1)` at lines 1776 + 4061 — **OVERLOADED** (brief halt OR catch-all)
- `process.exit(2)` at 1987 — Phase 0 fatal halt
- `process.exit(3)` at 2831 — G0.5 reconciliation halt

**Impact if unfixed:** Worker / cron cannot distinguish "retry" from "give up". Autopilot would re-run on exit 1 even when brief is unfixable.

---

## 19. Subprocess cwd + env inheritance — 🟨 YELLOW

**Actual coverage:** 9 of 10 subprocesses set `cwd: resolve(__dirname, '..')` explicitly. Only line 4036 (renderer) sets `env` explicitly (RENDER_NO_OPEN under PDF_ENGINE_WORKER). All others inherit full parent env (incl. all API keys).

**Impact if unfixed:** Acceptable in current single-tenant setup. Risky if a subprocess ever logs env or a future patch adds an isolated test mode.

---

## SUMMARY TABLE

| # | Cross-cut | Verdict |
|---|---|---|
| 1 | Tool narrative fields universal | 🟥 RED |
| 2 | Cost-stack reads ALL price sources | 🟨 YELLOW |
| 3 | Contract fallthrough-to-assume-unit | 🟨 YELLOW |
| 4 | Sub-module density splitter coverage | 🟩 GREEN |
| 5 | Envelope detector multi-field via Normaliser | 🟥 RED |
| 6 | Render wrap={false} overlap | 🟨 YELLOW |
| 7 | Brief parser emits multi-metric | 🟥 RED |
| 8 | Emitter hardcoded scale defaults | 🟨 YELLOW |
| 9 | Silent-filter aggregation bugs | 🟨 YELLOW |
| 10 | keyMetrics=null for early reviewers | 🟥 RED |
| 11 | stripWordSuffixFromDesign no-op | 🟥 RED |
| 12 | Stage 17 __contractMisses dead output | 🟨 YELLOW |
| 13 | Stage 18 skeletonFailFast ignored | 🟨 YELLOW |
| 14 | Stages 40-44 disk-only mutation | 🟨 YELLOW |
| 15 | `as any` casts that hide bugs | 🟨 YELLOW |
| 16 | LLM temperature/top-p/seed scatter | 🟥 RED |
| 17 | JSON serialisation round-trips | 🟨 YELLOW |
| 18 | Log format + exit codes inconsistent | 🟨 YELLOW |
| 19 | Subprocess cwd + env inheritance | 🟨 YELLOW |

**1 GREEN | 12 YELLOW | 6 RED.**

**Top-3 highest-impact RED:**
1. **Cross-cut 7** (Brief parser single-metric) — root cause of 3, 5, 8 simultaneously. Highest-leverage architectural fix.
2. **Cross-cut 10** (keyMetrics=null) — every reviewer in the cascade flies blind. Trivial fix (reorder lines).
3. **Cross-cut 1** (tool narrative fields 0% coverage) — Tools-Used PDF appendix is mostly empty.

# Universal Improvement Plan — 2026-05-09

**Engine version:** PDF Engine v2 (PA path, PA_PIPELINE=true)  
**Baseline council:** COUNCIL-V2-FULL-PDF-REVIEW-2026-05-09.md (commit 9c17616d)  
**Plan council:** 3-LLM validation — Claude Opus 4.5, DeepSeek R1, Grok 3 Mini  
**Scope:** Lift all 8 sub-8/10 sections to ≥8 across ALL 10 product classes (BESS, drone, CGM, heat pump, EV charger, bioreactor, vertical farm, AUV, edge AI, HAPS)

---

## Score Matrix — Current State

| Section | Score | Verdict | Target |
|---------|-------|---------|--------|
| S07 Assembly Shortlist | 5.7 | WEAK | ≥8 |
| S04 Feasibility Gate | 6.0 | WEAK | ≥8 |
| S03 Sizing + Spatial | 6.3 | WEAK | ≥8 |
| S12 Source Attribution | 6.7 | WEAK | ≥8 |
| S05 System Modules | 7.0 | ACCEPTABLE | ≥8 |
| S08 Cost Waterfall | 7.0 | ACCEPTABLE | ≥8 |
| S11 Audit Log | 7.3 | ACCEPTABLE | ≥8 |
| S06 BOM | 7.3 | ACCEPTABLE | ≥8 |
| S01 Cover Page | 8.0 | GOOD | keep |
| S09 Regulatory | 8.0 | GOOD | keep |
| S10 FMEA | 8.0 | GOOD | keep |
| S02 Brief | 8.7 | GOOD | keep |

---

## Pattern A: Truth Propagation — Summary Layer Disconnected from Body Data

**Leverage rank: 1 (highest)**  
**Affected sections:** S04 6.0→8+, S03 6.3→8+, S01 8.0 (contradiction removed)  
**Fix type:** Code-only, no LLM calls, no cost

### Problem

Three separate truth-propagation bugs all manifest as "substantive data in the body sections, wrong verdict in the summary layer." They are independent bugs but share the same failure mode.

**Bug A1 — risk_matrix_populated reads wrong field (S04):**  
`7-pdf-v3.tsx` line 824 checks:
```
state.modules?.some(m => (m.riskMatrix?.length ?? 0) > 0)
```
But on the PA path, 6b-fmea-generation.ts stores FMEA output at `(state as any).fmea`, not inside each module's `riskMatrix`. The PA decompose stage does not populate `module.riskMatrix`. Result: 10 FMEA rows exist, gate reads 0 rows and emits FAIL.

**Bug A2 — Cover verdict stale at compute time (S01, S04):**  
`determineFeasibility()` runs at ~line 716 of index.ts — before BOM, FMEA, and supplier stages execute. The computed `feasibility.status` is correct for brief+sizing but it permanently becomes the cover page verdict even after the rendered gate checks show WARN/FAIL. The cover says "FEASIBLE — all gates pass" while the gate section shows FAIL for `risk_matrix_populated`.

**Bug A3 — Mass budget not checked in sizing solver (S03):**  
The sizing solver (`3-size-layout.ts extendSizingSheetPA`) checks floor-area utilisation but not total zone mass vs. container payload limit. For BESS: `totalZoneMassKg = 34,650 kg > max_payload_kg = 27,230 kg` but `Layout Feasible: YES` because floor area fits. No remediation note is generated.

### Universal Fix

**CODE — 7-pdf-v3.tsx, line 824 (risk_matrix_populated):**
```typescript
// BEFORE:
status: state.modules?.some(m => (m.riskMatrix?.length ?? 0) > 0) ? 'PASS' : 'FAIL',
evidence: `${state.modules?.flatMap(m => m.riskMatrix || []).length ?? 0} risks`,

// AFTER:
const _fmeaCount = ((state as any).fmea?.length ?? 0) + (state.modules?.flatMap(m => m.riskMatrix || []).length ?? 0)
status: _fmeaCount > 0 ? 'PASS' : 'FAIL',
evidence: `${_fmeaCount} risks`,
```

**CODE — 7-pdf-v3.tsx, CoverPage/FeasibilityGateSection (cover verdict):**  
Derive the cover-page feasibility badge from the gate check outcomes computed in the renderer, not from the upstream `feasibility.status`. After the `checks` array is built (~line 830), compute:
```typescript
const _anyFail = checks.some(c => c.status === 'FAIL')
const _anyWarn = checks.some(c => c.status === 'WARN')
const _coverVerdict = _anyFail ? 'NOT FEASIBLE' : _anyWarn ? 'CONDITIONAL' : 'FEASIBLE'
```
Pass `_coverVerdict` to the CoverPage component so it reflects real gate outcomes.

**CODE — 3-size-layout.ts, extendSizingSheetPA (mass budget check):**  
After summing `totalZoneMassKg` from zone allocations, compare against `containerSpec.max_payload_kg`. If exceeded:
- Set `massMarginKg = containerSpec.max_payload_kg - totalZoneMassKg` (negative value)
- Set `layoutFeasible: false` on the PA extension fields
- Add remediation note: `Mass overrun by ${Math.abs(massMarginKg)} kg — consider 45-ft HC container (max_payload_kg = 29,500 kg) or select a lighter cell chemistry`
- This check only fires for container-class domains (BESS, AUV, edge AI pod) where ISO_CONTAINER_SPECS applies.

**Expected lift:** S04 6.0→8+, S03 6.3→8+, S01 contradiction removed (8 → likely 9)

**Why universal:** The FMEA field path bug affects every product class on the PA path — 6b-fmea-generation.ts always writes to `state.fmea`, decompose-PA never populates `module.riskMatrix`. The cover-verdict timing bug is product-class-agnostic. The mass budget check applies to any container-class product (BESS, large edge-AI pod, AUV launch canister).

---

## Pattern B: Missing Pipeline Wiring — Schema Exists, Upstream Never Populates

**Leverage rank: 2**  
**Affected sections:** S11 7.3→8+, S06 7.3→8+, S05 7.0→7.5+  
**Fix type:** Code + prompt change, no new LLM calls

### Problem

Three fields defined in the renderer schema have nothing upstream writing to them.

**Bug B1 — Audit Log Duration always blank (S11):**  
`AuditLogSection` checks `(state as any).pipelineTrace` first; if absent, falls back to static rows where `durationMs: null`. The `trackStage()` function in index.ts accumulates a `stages[]` array with real `durationMs` values but never mirrors it to `(state as any).pipelineTrace`. The connection is missing.

**Bug B2 — BOM placeholder pricing for safety-critical components (S06):**  
The BOM generation prompt has no minimum-price guard. A £1 BMS or £0 FDS passes validation. The `deduplicateBom()` and `buildDeterministicPhase()` functions do not enforce price floors. For BESS: BMS controller £1, fire suppression cylinders £0. Same pattern will recur for every product class with unpriced safety systems.

**Bug B3 — BMS/FDS absent from required-parts-manifest (S05):**  
`checkRequiredParts()` validates that required parts exist per product class, but the manifest does not include BMS or Fire Detection/Suppression entries for BESS. These modules are decomposed correctly but have 0 BOM rows because no deterministic fallback inserts them.

### Universal Fix

**CODE — index.ts, inside trackStage() (~line 278):**
```typescript
function trackStage(name: string, result: StageResult<unknown>) {
  stages.push({ name, ok: result.ok, durationMs: result.durationMs, error: result.error })
  // ADD: mirror to pipelineTrace for AuditLogSection
  if (!(state as any).pipelineTrace) (state as any).pipelineTrace = []
  ;(state as any).pipelineTrace.push({
    step: name,
    status: result.ok ? 'Complete' : 'BLOCKED',
    durationMs: result.durationMs,
    source: STAGE_SOURCE_MAP[name] || 'LLM',
    notes: result.error || `${name} stage complete`,
  })
  if (name !== 'pdf') llmCalls++
  ...
}
```
Add `STAGE_SOURCE_MAP` constant mapping stage names to their source labels (Deterministic / LLM / Corpus+API).

**PROMPT — 4-bom-cost-suppliers.ts, BOM_GENERATION_SYSTEM:**  
Add to system prompt:
```
PRICING FLOOR (mandatory): Never output unitCostGbp < 50 for any safety-critical system component.
Safety-critical means: BMS controller/master unit, fire suppression cylinder/panel, pressure relief device,
contactor/isolator, arc detection sensor, emergency shutdown relay, sterility filter (bioreactor),
parachute system (HAPS), pressure hull penetrator (AUV). Use ESTIMATE pricing from 2024 market data.
Minimum floors: BMS controller £1,500, fire suppression cylinder £800, contactor £200.
```

**CODE — lib/required-parts-manifest.ts (or equivalent):**  
Extend the product-class manifest to include safety subsystem floor entries. Pattern:
```typescript
'bess': [
  ...existingEntries,
  { name: 'BMS master controller', partType: 'named_manufacturer_reseller', estimatedUnitCostGbp: 3500, qty: 1 },
  { name: 'Fire suppression cylinder (Novec)', partType: 'buy_mechanical_industrial', estimatedUnitCostGbp: 1200, qty: 4 },
  { name: 'Arc flash detection sensor', partType: 'buy_electronic', estimatedUnitCostGbp: 450, qty: 2 },
],
'drone': [
  { name: 'Flight controller (FC)', partType: 'named_manufacturer_reseller', estimatedUnitCostGbp: 280, qty: 1 },
  { name: 'ESC (4-in-1)', partType: 'buy_electronic', estimatedUnitCostGbp: 120, qty: 1 },
  { name: 'GPS+compass module', partType: 'buy_electronic', estimatedUnitCostGbp: 95, qty: 1 },
],
// ... add entries for each of the 10 product classes
```
The manifest is already called via `checkRequiredParts()` — extending it requires no architectural change.

**Expected lift:** S11 7.3→8+, S06 7.3→8+, S05 7.0→7.5+

**Why universal:** `trackStage()` is called for every stage on every product class — Duration fix is product-class-agnostic. Every product class has safety-critical components that will receive £0/£1 placeholder pricing without a floor. The manifest pattern is already designed to be product-class-keyed.

**Council note (Opus + DeepSeek):** The manifest entries must be class-specific — HAPS needs parachute/recovery system, bioreactor needs sterility sensors, AUV needs pressure hull penetrators. The pattern is universal; the content must be implemented for each of the 10 classes.

---

## Pattern C: Domain Knowledge Gap — Product-Class Vendor Catalog Missing from Prompts

**Leverage rank: 5**  
**Affected sections:** S07 5.7→8+  
**Fix type:** New static file + prompt injection. No LLM cost to build catalog.

### Problem

The BOM stage prompt (`4-bom-cost-suppliers.ts BOM_GENERATION_SYSTEM`) has no product-class-specific vendor list. For any `named_manufacturer_reseller` part — PCS, cells, BMS for BESS; flight controller, motor, GPS for drone — the LLM returns `confidence: LOW` with no supplier name, because the prompt doesn't instruct it to name real vendors.

This is the primary driver of S07's low score: 10 BOM rows, 10 LOW-confidence suppliers, 10 blank supplier names.

### Universal Fix

**CODE — new file `src/lib/pdf-engine-v2/lib/vendor-catalog.ts`:**

```typescript
export const VENDOR_CATALOG: Record<string, Array<{ partType: string; vendors: string[]; typicalLeadWeeks: number; typicalMoqUnits: number }>> = {
  bess: [
    { partType: 'power_conversion_system', vendors: ['Sungrow', 'SMA Solar Technology', 'ABB'], typicalLeadWeeks: 16, typicalMoqUnits: 1 },
    { partType: 'battery_cell_lfp', vendors: ['CATL', 'EVE Energy', 'Samsung SDI'], typicalLeadWeeks: 12, typicalMoqUnits: 100 },
    { partType: 'bms_controller', vendors: ['Nuvation Energy', 'Inventec', 'Orion BMS'], typicalLeadWeeks: 8, typicalMoqUnits: 1 },
    { partType: 'hv_switchgear', vendors: ['Schneider Electric', 'ABB', 'Eaton'], typicalLeadWeeks: 10, typicalMoqUnits: 1 },
  ],
  drone: [
    { partType: 'flight_controller', vendors: ['Pixhawk (Holybro)', 'Cube Orange+', 'mRo'], typicalLeadWeeks: 2, typicalMoqUnits: 1 },
    { partType: 'propulsion_motor', vendors: ['T-Motor', 'KDE Direct', 'Scorpion'], typicalLeadWeeks: 3, typicalMoqUnits: 1 },
    { partType: 'battery_pack_lipo', vendors: ['Tattu (Grepow)', 'Maxamps', 'Bonka'], typicalLeadWeeks: 4, typicalMoqUnits: 5 },
    { partType: 'esc', vendors: ['Hobbywing', 'VESC Project', 'Myunfa'], typicalLeadWeeks: 2, typicalMoqUnits: 1 },
  ],
  cgm: [
    { partType: 'glucose_sensor_electrode', vendors: ['Metrohm', 'Radiometer', 'YSI (Xylem)'], typicalLeadWeeks: 6, typicalMoqUnits: 10 },
    { partType: 'asic_analog_frontend', vendors: ['Analog Devices', 'Texas Instruments'], typicalLeadWeeks: 12, typicalMoqUnits: 100 },
    { partType: 'rf_module_ble', vendors: ['Nordic Semiconductor', 'Laird'], typicalLeadWeeks: 6, typicalMoqUnits: 100 },
  ],
  heat_pump: [
    { partType: 'scroll_compressor', vendors: ['Danfoss', 'Emerson (Copeland)', 'Panasonic'], typicalLeadWeeks: 8, typicalMoqUnits: 1 },
    { partType: 'plate_heat_exchanger', vendors: ['Alfa Laval', 'SWEP', 'GEA'], typicalLeadWeeks: 6, typicalMoqUnits: 1 },
    { partType: 'inverter_drive', vendors: ['Danfoss Drives', 'ABB', 'Yaskawa'], typicalLeadWeeks: 8, typicalMoqUnits: 1 },
  ],
  ev_charger: [
    { partType: 'ac_dc_rectifier', vendors: ['Delta Electronics', 'Brusa', 'Bel Power'], typicalLeadWeeks: 12, typicalMoqUnits: 5 },
    { partType: 'ev_connector_ccs2', vendors: ['Phoenix Contact', 'Huber+Suhner', 'Radiall'], typicalLeadWeeks: 6, typicalMoqUnits: 10 },
    { partType: 'energy_meter', vendors: ['Eastron', 'Carlo Gavazzi', 'Schneider iEM'], typicalLeadWeeks: 4, typicalMoqUnits: 1 },
  ],
  bioreactor: [
    { partType: 'peristaltic_pump', vendors: ['Watson-Marlow', 'Masterflex (Avantor)', 'Verder'], typicalLeadWeeks: 4, typicalMoqUnits: 1 },
    { partType: 'dissolved_o2_probe', vendors: ['Hamilton', 'Mettler Toledo', 'Broadley-James'], typicalLeadWeeks: 4, typicalMoqUnits: 1 },
    { partType: 'sterile_filter', vendors: ['Millipore (Merck)', 'Sartorius', 'Pall'], typicalLeadWeeks: 2, typicalMoqUnits: 10 },
  ],
  vertical_farm: [
    { partType: 'led_grow_light_bar', vendors: ['Signify (Philips Horticulture)', 'Fluence', 'Gavita'], typicalLeadWeeks: 6, typicalMoqUnits: 10 },
    { partType: 'hvac_fan_coil', vendors: ['Munters', 'Carel', 'Stulz'], typicalLeadWeeks: 8, typicalMoqUnits: 1 },
    { partType: 'fertigation_controller', vendors: ['Priva', 'Ridder', 'Netafim'], typicalLeadWeeks: 8, typicalMoqUnits: 1 },
  ],
  auv: [
    { partType: 'thruster', vendors: ['Blue Robotics', 'VideoRay', 'Tecnadyne'], typicalLeadWeeks: 4, typicalMoqUnits: 1 },
    { partType: 'pressure_housing', vendors: ['Blue Robotics', 'DeepSea Power & Light', 'RJE International'], typicalLeadWeeks: 6, typicalMoqUnits: 1 },
    { partType: 'dvl_acoustic', vendors: ['Teledyne (Wayfinder)', 'Nortek', 'LinkQuest'], typicalLeadWeeks: 12, typicalMoqUnits: 1 },
  ],
  edge_ai: [
    { partType: 'gpu_compute_module', vendors: ['NVIDIA Jetson', 'Hailo', 'Coral (Google)'], typicalLeadWeeks: 8, typicalMoqUnits: 1 },
    { partType: 'industrial_ssd', vendors: ['Samsung (PM9A3)', 'Micron', 'Western Digital'], typicalLeadWeeks: 6, typicalMoqUnits: 5 },
    { partType: 'poe_switch', vendors: ['Cisco IE', 'Advantech', 'Moxa'], typicalLeadWeeks: 4, typicalMoqUnits: 1 },
  ],
  haps: [
    { partType: 'solar_cell_array', vendors: ['SunPower', 'Alta Devices (Hanergy)', 'MiaSole'], typicalLeadWeeks: 16, typicalMoqUnits: 1 },
    { partType: 'regenerative_fuel_cell', vendors: ['Intelligent Energy', 'Proton Motor', 'Ballard'], typicalLeadWeeks: 20, typicalMoqUnits: 1 },
    { partType: 'parachute_recovery', vendors: ['Airborne Systems', 'Pioneer Aerospace', 'Butler Parachute'], typicalLeadWeeks: 10, typicalMoqUnits: 1 },
  ],
}
```

**PROMPT — 4-bom-cost-suppliers.ts, BOM_GENERATION_SYSTEM:**  
Inject vendor catalog for the current product class into the BOM prompt:
```
VENDOR CATALOG for {productClass} (inject from vendor-catalog.ts):
{vendorCatalogJson}

For every named-manufacturer-reseller or buy_mechanical_industrial part, select the best-matching 
vendor from the catalog above or name an equivalent real vendor. Always populate:
  - regimeRouterResult.supplier: primary vendor name (required, never null/empty)
  - regimeRouterResult.leadTimeWeeks: typical lead time in weeks (integer)
  - regimeRouterResult.moqUnits: minimum order quantity in units (integer)
If the part has no catalog match, name a real distributor (RS Components, Farnell, Digi-Key) as fallback.
```

**Note on S07 lead time + MOQ (council addition):**  
Both Opus and DeepSeek flagged that the council V2 weakness for S07 explicitly includes "no lead times or MOQ" — not just missing supplier names. The vendor catalog above includes `typicalLeadWeeks` and `typicalMoqUnits` per entry. The SupplierAppendix renderer (`7-pdf-v3.tsx`) must add two columns to the supplier table — `Lead Time` and `MOQ` — reading from the new fields. This is a renderer-tier addition, not a prompt-only fix.

**Expected lift:** S07 5.7→8+

**Why universal:** All 10 product classes now have explicit vendor catalog entries. The prompt injection mechanism is product-class-agnostic — vendor catalog is keyed by the same `classification.productClass` string already available in index.ts at BOM stage call time.

**Council caveat (Opus):** Pattern C content requires 10x more effort than the description suggests — the vendor entries above are a starting point and must be validated for accuracy. Prioritise correctness over completeness: 2-3 verified vendors per part-type beats 5 unverified ones.

---

## Pattern D: Cost Narrative Missing — Arithmetic Results Without Engineering Context

**Leverage rank: 3**  
**Affected sections:** S08 7.0→8+  
**Fix type:** One arithmetic step (no LLM) + small LLM sub-call for narrative

### Problem

**Bug D1 — pctOfBom column always '—':**  
`CostSection` renders `cb.perModule[].pctOfBom`. The BOM stage (`4-bom-cost-suppliers.ts`) computes `totalGbp` per module but never divides by the grand total to derive `pctOfBom`. One arithmetic step is missing in the aggregation loop.

**Bug D2 — Cost overrun with no narrative:**  
When `unitTotalGbp > ceilingGbp` (guaranteed for first-article complex hardware at engineer-grade pricing), the report states the overrun number with no contextual explanation. A reviewer sees "449% over budget — FEASIBLE" and stops reading.

### Universal Fix

**CODE — 4-bom-cost-suppliers.ts, cost aggregation step:**  
After the per-module `totalGbp` array is assembled, compute percentages:
```typescript
const grandTotalGbp = perModule.reduce((sum, m) => sum + m.totalGbp, 0)
const perModuleWithPct = perModule.map(m => ({
  ...m,
  pctOfBom: grandTotalGbp > 0 ? (m.totalGbp / grandTotalGbp) * 100 : 0,
}))
```
Write `perModuleWithPct` to `costBreakdown.perModule`. O(n) arithmetic, no LLM cost.

**PROMPT — add to BOM/cost LLM call OR new post-BOM step:**  
When `unitTotalGbp > ceilingGbp * 1.2`, generate a cost-context paragraph via LLM:
```
The estimated unit cost (£{unitTotalGbp}) exceeds the first-article cost ceiling (£{ceilingGbp}) 
by {overPct}%. This is expected at pre-production engineering-grade pricing. 
Volume cost reduction paths: [enumerate top 3 cost drivers from perModule, state realistic 
volume-pricing scenarios for each, e.g. "LFP cells: £85/cell @ 1 unit → £60/cell @ 500+ units"]. 
At {targetBatch}-unit volume, projected BOM cost: £{volumeEstimate}.
```
Alternatively: add this narrative as a static template populated from the perModule data — no LLM needed if the cost-driver logic is deterministic.

**Expected lift:** S08 7.0→8+

**Why universal:** Cost ceiling overruns are expected for first-article engineering across all 10 product classes (a first-article CGM, AUV, or HAPS will always exceed a production cost target). The pctOfBom arithmetic gap is identical for all product classes.

---

## Pattern E: Source Attribution Dual-Table Fix

**Leverage rank: 4**  
**Affected sections:** S12 6.7→8+, S02 8.7 (removes only remaining weakness)  
**Fix type:** Single dual-write mapping fix in index.ts, no LLM

### Problem

The Research Sources table on page 3 (inside `BriefPages`) reads from `b?.sources` which is populated in `index.ts` at the PA dual-write step:
```typescript
state.research.sources = synthesis.research_sources.map(s => ({ uri: '', title: s.title }))
```
Only `title` is mapped. `type`, `sourceGrade`, and `relevance` are left undefined. The renderer shows `[?]` for every grade and blank for type/relevance — effectively useless. The `researchSynthesis.research_sources` array does have richer data (the upstream `runResearchSynthesis` prompt requests it), but it is not mapped through.

Additionally, the page-43 Source Attribution section uses a static hardcoded list (`staticRows` in `SourceAttributionSection`) that is product-class-agnostic and does not reference real citations from the run.

### Universal Fix

**CODE — index.ts, PA dual-write at ~line 480:**  
Change:
```typescript
state.research.sources = synthesis.research_sources.map(s => ({ uri: '', title: s.title }))
```
to:
```typescript
state.research.sources = synthesis.research_sources.map(s => ({
  uri: s.url || '',
  title: s.title,
  type: s.source_type || 'industry_report',
  sourceGrade: s.confidence_grade || 'C',
  relevance: s.relevance_note || '',
}))
```

**PROMPT — verify 1-research.ts runResearchSynthesis output schema:**  
Confirm that `research_sources[]` entries include `source_type`, `confidence_grade`, and `relevance_note` fields. If not, add to the synthesis prompt:
```
For each source in research_sources, include:
  - source_type: one of "primary_standard" | "engineering_analysis" | "industry_report" | "expert_estimate"
  - confidence_grade: one of "A" | "B" | "C" | "D" | "E" (A=primary test data, E=LLM hypothesis)
  - relevance_note: one sentence explaining how this source informs the design
```

**CODE — index.ts or 7-pdf-v3.tsx SourceAttributionSection:**  
Replace static `staticRows` fallback with a dynamic list built from `state.sourceAttributions` (already populated in index.ts with per-stage records). This removes the "these are always the same regardless of product" problem.

**Expected lift:** S12 6.7→8+, S02 removes sole remaining weakness

**Why universal:** The dual-write mapping at index.ts line ~480 runs for ALL product classes on the PA path. The static attribution rows are product-class-agnostic in the wrong direction — they don't reference any product-class-specific sources.

---

## Sequencing

Apply in this order to minimise rework and maximise early score lift:

1. **Pattern A** — Pure code fixes, highest per-section lift (3 sections), zero cost. Unblocks credibility for all downstream reviews. ~2-3 hours implementation.
2. **Pattern B** — Audit log (single code mirror, 30 min). BOM pricing floor (prompt addition, 30 min). Manifest extension per product class (~2-3 hours for all 10). Total: ~4 hours.
3. **Pattern E** — Single dual-write change, ~30 min. Removes the page-3 table "No data available" that the council flagged on BOTH S12 and S02.
4. **Pattern D** — pctOfBom arithmetic is 5 lines, 15 min. Cost narrative prompt is an optional LLM sub-call or a deterministic template fill.
5. **Pattern C** — Requires building and validating vendor catalog for all 10 product classes. Highest effort (~4-6 hours), highest S07 impact. Do last because S07 is partially addressed by Pattern B (pricing floor) and the SupplierAppendix renderer improvement.

**Renderer addition required (Pattern C):**  
The SupplierAppendix table in `7-pdf-v3.tsx` needs two new columns: `Lead Time (wks)` and `MOQ`. This is a 30-minute render-tier change but is blocked until Pattern C vendor catalog exists.

---

## Council Validation Summary

| Seat | Model | Plan Score | Verdict |
|------|-------|-----------|---------|
| A | Claude Opus 4.5 | 7/10 | Strong diagnosis; Pattern C effort undersold by 5x; missing lead time/MOQ |
| B | DeepSeek R1 | 7/10 | Patterns A/D/E correctly universal; Pattern C BESS-specific in content; missing MOQ prompt guard |
| C | Grok 3 Mini | 7/10 | Pattern B partially BESS-specific; missing cross-section validation loops |
| **Mean** | | **7.0/10** | |

**What the council added that was missing from the draft:**
- Lead time and MOQ columns are absent from S07 — both Opus and DeepSeek flagged this independently. The plan originally addressed supplier names only. Pattern C now includes `typicalLeadWeeks` + `typicalMoqUnits` in the vendor catalog and requires a renderer-tier column addition.
- Pattern C content requires product-specific validation — vendor entries must be verified per class (Opus). Draft treated this as low-effort; it is not.
- Pattern B's safety-system manifest must be class-specific (DeepSeek): HAPS → parachute, bioreactor → sterility sensors, AUV → pressure penetrators.

---

## What We Are NOT Doing in Phase 3

- **Visual layout diagram for S03** — requires SVG/PDF drawing primitives or a canvas library. Not in scope until Phase 4.
- **Regulatory compliance timeline and owner columns for S09** — S09 is already at 8.0; adding a timeline would require a new LLM call in the regulatory extraction stage. Defer to Phase 4.
- **FMEA verification test scheduling** — S10 is already at 8.0. Adding test schedules requires a project management schema. Out of scope.
- **Live distributor API price validation** — replacing LLM ESTIMATE pricing with real-time API prices is Phase 4 scope (distributor aggregator already built in lib/distributors/).
- **Cross-section consistency validator** (Grok suggestion) — a post-render validator that checks mass in S03 matches mass in S05 BOM etc. Architecturally correct but deferred to Phase 4.

---

## Implementation Notes for Phase 3 Agent

- All code changes are in: `7-pdf-v3.tsx`, `3-size-layout.ts`, `4-bom-cost-suppliers.ts`, `index.ts`, and new file `lib/vendor-catalog.ts`.
- No database migrations required.
- No new API keys or external services.
- Test by running the BESS brief through the full pipeline and checking: (a) risk_matrix_populated shows PASS, (b) cover verdict matches gate outcomes, (c) mass budget check fires for BESS, (d) audit log Duration column populated, (e) research sources table non-empty, (f) pctOfBom column non-empty.
- After BESS: re-run with drone and heat pump briefs to verify universality.
- Budget for Phase 3: ~£3-5 LLM (BOM stage runs for each test product class).

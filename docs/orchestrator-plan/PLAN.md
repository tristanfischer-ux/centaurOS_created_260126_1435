# ForgeOS PDF Engine v2 — Universal Engineering Orchestrator Plan

**Status:** Council-reviewed (3 rounds), refined. Phase 0 gate pending.
**Authoring session:** 2026-05-21 Loop 15 evening.
**Reference drawers:**
- `drawer_forgeos_decisions_b6ca90761c861622` — refined LLM-position (LLM at boundaries only, deterministic sandwich validators)
- `drawer_forgeos_decisions_98d0586eb00a5c7f` — council round-3 verdict
- `drawer_forgeos_decisions_38d21ae00d436a9b` — Phase 0 investigation spec
- `drawer_forgeos_decisions_961c722f0e77d105` — Tristan's orchestrator reframe
- `drawer_forgeos_decisions_19fc93959f30b92c` — Loop 15 empirical disproof of structural-determinism-fixes-plausibility

---

## 1. Why this plan exists

ForgeOS PDF Engine v2 produces engineering brief PDFs that score 2-3/10 on Physics Critic engineering_plausibility. Five architectural pivots have been attempted:

| Build | Approach | Result |
|---|---|---|
| Build #1-#5 | Engineering Contract architecture + macro-assembly pricing | Macros now declared, but Generator ignores them |
| Build #6c | Inject Contract into Generator LLM system prompt | Macro coverage 100%, plausibility still 2-3/10 |
| Build #9a | Add BESS macro-assembly prices | Internal coherence improved 2→6, plausibility flat |
| Build #11b | Heat pump classifier alias fix | Heat pump now gets a Contract, plausibility 3/10 |
| Build #17a/b | Hand-coded deterministic BESS emitter (no LLM Generator) | Plausibility went DOWN to 2/10 (Loop 15) |

**The empirical signal:** Removing the LLM Generator from structural emission does NOT fix the plausibility plateau. Build #17a's hand-coded template is mechanically working (Loop 15 produced £946k BoM, 153 priced lines, cost_reality PASS) but Physics Critic still scores it at 2/10.

**The reframe (Tristan, 2026-05-21):** The right architecture is NOT hand-coded templates per class. It's an orchestrator that uses LLMs only at boundaries (parsing input + narrating output) and delegates ALL engineering computation to open-source verified tools that engineers already trust (PyBaMM, CoolProp, ngspice, PandaPower, OpenDSS, CalculiX, Cantera, OpenVSP, Octopart, IEC/UL standards). At the end of the PDF, explicit attribution: "computed by PyBaMM v23.5, CoolProp v6.4.3, ngspice 41, etc." — credibility primitive.

**The council position (round 3):** Refined architecture — LLM at boundaries only, deterministic sandwich validators around each LLM use, deterministic envelope detection, deterministic tool plan selection, iterative solver for coupled physics, cross-tool consistency verifier, field-level attribution. 5/6 conditional-YES; 1/6 hard-NO (Grok). After Tristan's clarification on parser/narrator roles, Grok's hard-NO softens to address only the sequencing/selection roles, which the refined architecture also makes deterministic.

---

## 2. The architecture (final commitment)

```
Brief markdown
   │
   ▼ LLM PARSER (extraction only) ←─── ACCEPTABLE LLM USE
   │   Low-hallucination model (MiMo V2.5 Pro / Claude structured output)
   ▼ Schema validator (reject if required fields missing/typed wrong) ←── DETERMINISTIC SANDWICH
   │
Structured constraints (typed)
   │
   ▼ Envelope detector (rules-only — keyword + range matching) ←── DETERMINISTIC
   ▼ Envelope validator (reject if undefined envelope) ←── DETERMINISTIC
   │
(class, scale_tier, voltage_tier, form_factor, application)
   │
   ▼ Tool plan selector (STATIC LOOKUP TABLE per (class, envelope)) ←── DETERMINISTIC
   ▼ Plan validator (every tool in plan must be applicable_to envelope) ←── DETERMINISTIC
   │
Ordered Tool[]
   │
   ▼ Tool executor with iterative-solver framework ←── DETERMINISTIC
   │   For coupled physics: fixed-point iteration until convergence
   │   For independent stages: sequential
   ▼ Per-tool typed I/O validation ←── DETERMINISTIC
   │
ToolResults (each result has provenance: tool_id, version, license, input, output)
   │
   ▼ Cross-tool consistency verifier ←── DETERMINISTIC
   │   Boundary conditions match across tool outputs
   │   Reject entire bundle if invalid
   ▼ Aggregator → typed EngineeringContract ←── DETERMINISTIC
   │   (units + uncertainty + basis + scope + temporal resolution per quantity)
   │
EngineeringContract (complete, validated, field-level provenance)
   │
   ▼ Design assembler (mechanical instantiation from Contract) ←── DETERMINISTIC
   │
DesignJSON (structure + numbers, empty prose fields)
   │
   ▼ LLM NARRATOR (prose only) ←─── ACCEPTABLE LLM USE
   │   Forbidden from touching numbers (structurally)
   ▼ Prose-number validator ←── DETERMINISTIC SANDWICH
   │   Extract every number from generated prose via regex
   │   Cross-check against DesignJSON
   │   Reject prose if any number doesn't match
   │
Narrated DesignJSON
   │
   ▼ Renderer + Tools-Used attribution end-page ←── DETERMINISTIC
   │
Final PDF
```

**LLM appears in exactly 2 places (parser, narrator). Each LLM use is sandwiched between deterministic validators. Every other stage is deterministic.**

---

## 3. Phase 0 — Investigation gate (UNANIMOUS council requirement)

**Time:** 2 hours.
**Owner:** Next session start.
**Status:** PENDING.

### Objective

Determine whether the Physics Critic's plausibility-pulling issues map to specific verified-tool capabilities. If <50% map, the orchestrator architecture WILL NOT MOVE the engineering_plausibility score off the 2-3/10 plateau, regardless of how well it's built. If ≥50% map, proceed to Phase 1.

### Inputs (already on disk)

| Chain | Path | Build state | Plausibility |
|---|---|---|---|
| Loop 12 BESS | `/tmp/bess-fresh-v2/` | No Contract macros, no Build #6c | 2/10 |
| Loop 13 BESS | `/tmp/loop13-bess/` | Build #9a macros, no Build #6c | 3/10 |
| Loop 14 BESS | `/tmp/loop14-bess/` | Build #9a + Build #6c LLM-with-prompt | 3/10 |
| Loop 15 BESS | `/tmp/loop15-bess-deterministic/` | Build #17a/b deterministic emitter (no LLM Generator) | 2/10 |
| Loop 14 HAPS | `/tmp/loop14-haps/` | Build #6c | 2/10 |
| Loop 14 VF | `/tmp/loop14-vf/` | Build #6c | 4/10 |
| Loop 14 heat pump | `/tmp/loop14-heatpump/` | Build #11b alias + Build #6c | 3/10 |

Each chain has 6-8 Physics Critic issues in `actions.jsonl` (search `step_name=physics_critic`) and full text in `physics-critique.json` or `7-5-physics-critique.json`. Total ~45-55 issues.

### Method

1. **Extract** — open each chain's physics-critique JSON; collect every issue text + severity + affected module.
2. **Categorise** each issue:
   - **(a) Brief infeasibility** — physics says brief is unsatisfiable (HAPS 209kg vs 95kg cap, heat pump residential-scaling vs 30kW commercial brief). NO TOOL FIXES; needs brief-feasibility revisor (Build #16).
   - **(b) BoM line quantity hallucination** — Generator emitted ×33 container, ×50 cells, etc. NO TOOL FIXES; needs BoM quantity-sanity gate.
   - **(c) Coupled physics mismatch** — compressor capacity contradicts HX rating, voltage stack-up wrong, current rating insufficient. **YES tools address** (ngspice + CoolProp + PandaPower + Cantera).
   - **(d) Prose contradicts BoM** — overview says X, parts list shows Y. NO TOOL FIXES; needs narrator-prose-number validator.
   - **(e) Part selection unrealistic** — chose generic part where vetted catalog has named alternative. **YES tools address** (Octopart + parts catalog).
   - **(f) Missing regulatory tag** — IEC clause not addressed in design. **YES tools address** (IEC/UL/ENA standards lookup).
   - **(g) Other** — unclassified.
3. **Tally** — count (c) + (e) + (f) / total.
4. **Decision matrix:**
   - **≥50% tool-addressable** → ORCHESTRATOR is the right lever → proceed Phase 1
   - **<50% tool-addressable** → ORCHESTRATOR won't fix plateau → STOP, investigate dominant non-tool category
   - **Mostly (a)** → Build #16 brief-feasibility revisor is the lever
   - **Mostly (b)** → BoM aggregator fix + quantity-sanity gate is the lever (also note: bisect Loop 14 BESS BoM=£0 regression between Build #6c and earlier)
   - **Mostly (d)** → narrator-prose-number validator is the lever (cheap, ship now)
   - **Mixed** → smallest-scope pilot (PyBaMM-only on BESS), measure, decide on broadening

### Deliverable

`/tmp/phase-0-investigation.md` (~1 page):
- Total issues across all chains
- Category counts (a/b/c/d/e/f/g) with examples
- Tool-addressable %
- Per-issue tool-mapping table (issue text → which tool addresses OR "no tool")
- Go/no-go for Phase 1 with one-line rationale
- If no-go: which other lever is the actual root cause

### Parallel discoveries to capture during Phase 0

- **Loop 14 BESS BoM=£0 regression** — git bisect between Loop 12 commit and Loop 14 commit. Likely Build #4 / #4b / #6 / #6b / #6c. Document the regression cause.
- **Loop 15 macro miss bug** — `bms_slave_module` was Contract-declared but deterministic emitter's word ID `bms_slave_pcb_assembled_word` doesn't pass 66% token overlap test against `bms_slave_module`. Fix the emitter's word ID OR adjust the matcher.

---

## 4. Phase 1 — Foundation (~2 days)

**Blocked by:** Phase 0 GO.
**Owner:** TBD.

### Deliverables (in commit order)

#### 4.1 Formal contract schema (`scripts/lib/orchestrator/types.ts`) ~200 lines

```typescript
// Every quantity now has explicit metadata
export interface TypedQuantity {
  value: number
  unit: string                      // canonical SI: 'kWh', 'kg', 'A', 'V', '°C', 'm²'
  family: UnitFamily                // 'energy' | 'mass' | 'current' | 'voltage' | ...
  basis: QuantityBasis              // 'nameplate' | 'usable' | 'continuous' | 'peak' | 'rated'
  scope: QuantityScope              // 'cell' | 'module' | 'pack' | 'rack' | 'system' | 'site'
  uncertainty_pct: number           // ±% (e.g. 2.5 for ±2.5%)
  temporal_resolution_s: number | null  // null for static, otherwise sampling interval
  condition: string | null          // e.g. '25°C ambient, BoL'
  provenance: Provenance            // see below — field-level, not chain-level
}

export interface Provenance {
  source: string                    // 'tool:pybamm:cell-sizing' | 'tool:coolprop:r290' | 'brief' | 'envelope_detector' | 'class_anchor'
  tool_id?: string                  // e.g. 'pybamm:cell-sizing'
  tool_version?: string             // e.g. '23.5'
  tool_license?: string             // e.g. 'BSD-3'
  tool_source_url?: string          // e.g. 'github.com/pybamm-team/PyBaMM'
  invocation_input?: unknown        // exact input that produced this value
  invocation_output_field?: string  // which field of the tool output this is from
  pinned_versions?: Record<string, string>  // for reproducibility (python, numpy, etc.)
  timestamp?: string                // ISO 8601
  duration_ms?: number
}
```

This replaces the existing `Quantity` interface in `engineering-contract.ts`. The migration is mechanical — every existing `q(...)` call gets the new fields filled in.

#### 4.2 Tool interface (`scripts/lib/orchestrator/types.ts`)

```typescript
export type ToolDomain = 'battery' | 'thermal' | 'power_electronics' | 'mechanical' | 'grid' | 'aero' | 'process' | 'parts_catalog' | 'standards' | 'biochemistry' | 'photonics'

export interface Tool<TInput, TOutput> {
  id: string                        // 'pybamm:cell-sizing'
  name: string                      // 'PyBaMM Cell Sizing'
  version: string                   // '23.5'
  license: License                  // 'MIT' | 'BSD-3' | 'GPL-2' | 'GPL-3' | 'LGPL' | 'Apache-2' | 'free-proprietary'
  source_url: string                // 'github.com/pybamm-team/PyBaMM'
  domain: ToolDomain
  pinned_environment: Record<string, string>  // {'python': '3.11.4', 'pybamm': '23.5', 'numpy': '1.26.0'}

  /** Returns true if this tool is applicable to the given envelope + partial Contract. Used by tool plan validator. */
  applicable_to(envelope: BriefEnvelope, contract: Partial<EngineeringContract>): boolean

  /** Pure: same input → same output. Network/subprocess calls allowed but must be reproducible. */
  invoke(input: TInput, contract: Partial<EngineeringContract>): Promise<ToolResult<TOutput>>
}

export interface ToolResult<TOutput> {
  ok: boolean
  output: TOutput | null
  provenance: Provenance
  warnings: string[]                // soft issues (e.g. "extrapolating beyond tested range")
  error?: string                    // hard failure message
}
```

#### 4.3 Envelope detector (`scripts/lib/orchestrator/envelope.ts`) ~150 lines

Pure rules. NO LLM. Per-class envelope-decoder modules.

```typescript
export interface BriefEnvelope {
  class: string                     // 'bess', 'haps', 'vf', 'heat_pump', 'drone', 'auv', 'bioreactor', 'cgm', 'edge_ai', 'ev_charger'
  scale_tier: string                // class-specific: 'residential' | 'commercial' | 'utility_containerised' | 'utility_farm' for BESS
  voltage_tier: string              // 'lv' | 'mv' | 'hv'
  form_factor: string               // '40hc_iso' | 'monobloc' | 'rack_1u' | 'split' | etc.
  application: string               // 'behind_the_meter' | 'front_of_meter' | 'commercial_retrofit' | etc.
}

export function detectEnvelope(constraints: ParsedConstraints): BriefEnvelope {
  const cls = detectClass(constraints)        // already exists in product-classifier.ts
  const scaleTier = detectScaleTier(cls, constraints)  // capacity → tier per class
  const voltageTier = detectVoltageTier(cls, constraints)
  const formFactor = detectFormFactor(cls, constraints)
  const application = detectApplication(cls, constraints)
  return { class: cls, scale_tier: scaleTier, voltage_tier: voltageTier, form_factor: formFactor, application }
}
```

Each class has its own rules file: `envelope/bess.ts`, `envelope/haps.ts`, etc.

Validator: if any field is "unknown" or undefined, fall back to LLM Generator path (existing chain).

#### 4.4 Tool plan selector (`scripts/lib/orchestrator/planner.ts`) ~100 lines

Static lookup table. NO LLM.

```typescript
export interface ToolStep {
  tool_id: string
  input_from_contract: (c: Partial<EngineeringContract>, brief: ParsedConstraints) => unknown
  contract_update: (c: EngineeringContract, output: unknown) => EngineeringContract
  required: boolean                 // if true, failure halts plan; if false, plan continues without
  feeds_into: string[]              // tool_ids that depend on this output (for fixed-point iteration)
}

export interface ClassToolPlan {
  envelope_predicate: (e: BriefEnvelope) => boolean
  tools: ToolStep[]
  coupled_pairs: Array<[string, string]>  // pairs that need fixed-point iteration
  max_iterations: number            // for the coupled solver
  convergence_tolerance_pct: number // when to declare convergence
}

export const PLANS: ClassToolPlan[] = [
  BESS_UTILITY_CONTAINERISED_PLAN,
  BESS_RESIDENTIAL_PLAN,            // (later)
  HAPS_PLAN,
  // ... etc.
]

export function selectPlan(envelope: BriefEnvelope): ClassToolPlan | null {
  return PLANS.find(p => p.envelope_predicate(envelope)) ?? null
}
```

If no plan matches the envelope, return null → chain falls back to LLM Generator (existing path).

#### 4.5 Iterative solver framework (`scripts/lib/orchestrator/executor.ts`) ~150 lines

For coupled physics: fixed-point iteration with convergence check.

```typescript
export async function runToolPlan(
  plan: ClassToolPlan,
  initialContract: EngineeringContract,
  brief: ParsedConstraints,
): Promise<{ contract: EngineeringContract; toolResults: Map<string, ToolResult<unknown>>; iterations: number }> {
  let contract = initialContract
  let prevContract = null
  let iter = 0

  // Run independent tools once
  const independent = plan.tools.filter(t => !plan.coupled_pairs.some(([a, b]) => a === t.tool_id || b === t.tool_id))
  for (const step of independent) {
    const tool = TOOL_REGISTRY.get(step.tool_id)!
    const input = step.input_from_contract(contract, brief)
    const result = await tool.invoke(input, contract)
    if (result.ok) contract = step.contract_update(contract, result.output)
    else if (step.required) throw new Error(`Required tool ${step.tool_id} failed: ${result.error}`)
  }

  // Fixed-point iteration for coupled tools
  const coupled = plan.tools.filter(t => plan.coupled_pairs.some(([a, b]) => a === t.tool_id || b === t.tool_id))
  while (iter < plan.max_iterations) {
    iter++
    prevContract = contract
    for (const step of coupled) {
      const tool = TOOL_REGISTRY.get(step.tool_id)!
      const input = step.input_from_contract(contract, brief)
      const result = await tool.invoke(input, contract)
      if (result.ok) contract = step.contract_update(contract, result.output)
    }
    if (contractsConverged(prevContract, contract, plan.convergence_tolerance_pct)) break
  }

  return { contract, toolResults: ..., iterations: iter }
}

function contractsConverged(a: EngineeringContract, b: EngineeringContract, tolerancePct: number): boolean {
  // Compare key quantities; return true if max delta < tolerancePct
  // ...
}
```

#### 4.6 Cross-tool consistency verifier (`scripts/lib/orchestrator/verifier.ts`) ~200 lines

Automated check that tool outputs jointly satisfy boundary conditions. **This addresses Grok's primary concern.**

```typescript
export interface ConsistencyRule {
  id: string
  description: string
  check(contract: EngineeringContract, toolResults: Map<string, ToolResult<unknown>>): ConsistencyResult
}

export interface ConsistencyResult {
  passed: boolean
  detail: string
  affected_quantities: string[]
  affected_tools: string[]
}

export const BESS_CONSISTENCY_RULES: ConsistencyRule[] = [
  {
    id: 'thermal_balance',
    description: 'Inverter dissipation ≤ cooling system capacity',
    check(c, r) {
      const dissipated = c.quantities.inverter_dissipated_kw.value
      const cooling = c.quantities.cooling_capacity_kw.value
      return {
        passed: cooling >= dissipated * 1.5,
        detail: `dissipated=${dissipated}kW, cooling=${cooling}kW (margin=${(cooling/dissipated).toFixed(2)}×)`,
        affected_quantities: ['inverter_dissipated_kw', 'cooling_capacity_kw'],
        affected_tools: ['ngspice:pcs-simulation', 'coolprop:refrigerant-properties'],
      }
    },
  },
  {
    id: 'current_rating',
    description: 'Every series-path component rated ≥ continuous bus current × 1.25',
    // ...
  },
  // ... 10-20 rules per class
]
```

If any rule fails → reject the bundle → fall back to LLM Generator path with warning logged.

#### 4.7 Aggregator + Design assembler (`scripts/lib/orchestrator/aggregator.ts`, `assembler.ts`) ~300 lines combined

- Aggregator: tool results → typed EngineeringContract (already exists in skeleton form in engineering-contract.ts).
- Design assembler: Contract → DesignJSON. Mechanical: for each canonical sub-module + word, instantiate with Contract-derived quantities + parts-catalog manufacturer/part numbers. This is what Build #17a did but constraint-driven now.

#### 4.8 Prose-number validator (`scripts/lib/orchestrator/prose-validator.ts`) ~80 lines

```typescript
export interface ProseValidationResult {
  passed: boolean
  mismatches: Array<{
    prose_number: number
    prose_unit: string
    field: string
    design_value: number
    design_unit: string
  }>
}

export function validateProseNumbers(prose: string, design: DesignJSON): ProseValidationResult {
  const numbers = extractNumbersFromProse(prose)  // regex: capture numeric + unit
  const mismatches = []
  for (const n of numbers) {
    const matchingField = findFieldInDesign(design, n)
    if (matchingField && Math.abs(matchingField.value - n.value) / matchingField.value > 0.01) {
      mismatches.push({ ... })
    }
  }
  return { passed: mismatches.length === 0, mismatches }
}
```

If mismatches found → re-narrate (with mismatches as feedback) up to 3 retries → if still failing, blacklist prose for that section.

#### 4.9 Attribution renderer (`scripts/lib/orchestrator/attribution.ts`) ~150 lines

Field-level provenance → PDF end-page. Each computed quantity tagged `tool:<id>:<version>:<output_field>:<unit>`, grouped by tool, rendered with name + version + license + source URL + per-claim list with units.

### Phase 1 acceptance criteria

- TypeScript compiles cleanly (`tsc --noEmit -p tsconfig.json`)
- Unit tests pass for envelope detector, tool plan selector, prose-number validator
- One sample chain (BESS, 3.5 MWh) runs the orchestrator end-to-end WITHOUT any actual tools registered — falls through to LLM Generator path gracefully when no plan matches
- Foundation file count: ~10 files, ~1500 lines total

---

## 5. Phase 2 — ONE class deep (BESS, ~2 days)

**Blocked by:** Phase 1 acceptance.

### Tools to integrate (BESS-specific)

| Tool | Domain | Wrapper effort | What it computes |
|---|---|---|---|
| **PyBaMM v23.5** (BSD-3) | battery | 4-6 hours (Python subprocess + JSON) | cell_count from target_energy + DoD + chemistry; capacity fade @ 6000 cycles; voltage profile |
| **CoolProp v6.4.3** (MIT) | thermal | 2-3 hours (Python lib direct) | refrigerant saturation properties; coolant heat-transfer coefficients |
| **ngspice 41** (GPL) | power electronics | 4-6 hours (CLI subprocess + netlist generation) | PCS dissipation; switching losses; DC-link ripple |
| **PandaPower v2.13** (BSD) | grid | 4-6 hours (Python lib direct) | PCC short-circuit; transformer rating; harmonic distortion |
| **Octopart API** | parts catalog | 2-3 hours (REST + cache) | real-time component availability + price + lead time for each BoM word |
| **IEC standards lookup** | standards | 4-6 hours (scrape + cache) | mandatory clauses for BESS (IEC 62619, UL 9540) |

### Tool plan for BESS utility-containerised

```typescript
export const BESS_UTILITY_CONTAINERISED_PLAN: ClassToolPlan = {
  envelope_predicate: (e) =>
    e.class === 'bess' &&
    e.scale_tier === 'utility_containerised' &&
    e.form_factor.startsWith('iso_'),

  tools: [
    // Independent (run once)
    { tool_id: 'pybamm:cell-sizing', required: true, ... },        // → cell_count, fade, voltage_profile
    { tool_id: 'coolprop:refrigerant-properties', required: true, ... },  // → refrigerant + coolant props
    { tool_id: 'iec-standards:bess', required: false, ... },       // → regulatory tags

    // Coupled (fixed-point with thermal_balance)
    { tool_id: 'ngspice:pcs-simulation', required: true, ... },    // → dissipated_kw depends on bus current
    { tool_id: 'pandapower:grid-integration', required: true, ... }, // → PCC fault level affects transformer choice

    // Final (after Contract is mostly set)
    { tool_id: 'octopart:parts-lookup', required: false, ... },    // → manufacturer/part_no/availability/price
  ],
  coupled_pairs: [
    ['ngspice:pcs-simulation', 'coolprop:refrigerant-properties'],  // dissipation → cooling capacity → ambient impact on dissipation
  ],
  max_iterations: 5,
  convergence_tolerance_pct: 2.0,
}
```

### Consistency rules for BESS

1. **thermal_balance** — cooling capacity ≥ inverter dissipation × 1.5
2. **current_rating** — every series-path component rated ≥ continuous bus current × 1.25
3. **mass_closure** — sum(part_mass × qty) ≤ brief mass cap
4. **capacity_closure** — cell_count × voltage × Ah / 1000 ≈ nameplate ± 5%
5. **dc_link_ripple** — PCS output ripple ≤ 3% (per IEEE 519)
6. **regulatory_coverage** — all IEC 62619 + UL 9540 mandatory clauses tagged
7. **part_availability** — every BoM word has Octopart hit OR is documented as custom

### Phase 2 acceptance criteria

- Single BESS chain on 3.5 MWh brief runs orchestrator end-to-end
- All 6 tools invoke without error
- Cross-tool consistency verifier returns pass
- Attribution end-page renders with all 6 tools listed + field-level claims
- Compare Loop 16 BESS Physics Critic plausibility vs Loops 12-15:
  - **Pass: ≥6/10** → architecture moves the score → proceed Phase 3
  - **Fail: 2-3/10** → architecture doesn't move score → STOP, investigate why (likely prose layer or Critic prompt)

---

## 6. Phase 3 — Hard decision point

**Trigger:** Phase 2 completes.
**Decision time:** Immediate (data is clear).

### Decision matrix

| Phase 2 BESS plausibility | Decision |
|---|---|
| ≥7/10 | Strong validation. Scope to Phase 4 multi-class rollout. |
| 5-6/10 | Partial validation. Add iterative solver tuning + verifier rules. Re-test BESS before broadening. |
| 4/10 | Marginal. Investigate which seam is leaking. Likely fixable. |
| 2-3/10 | **NO IMPROVEMENT.** The orchestrator architecture is not the right lever. STOP. Pivot to: (a) brief-feasibility revisor for HAPS-class infeasibility, OR (b) prose-narrative quality investigation, OR (c) Physics Critic prompt audit. |

If Phase 3 says STOP, the Phase 0-2 work is still useful — the formal contract schema, tool interfaces, and BESS plan are reusable for future engineering integrations.

---

## 7. Phase 4 — Multi-class rollout (~7-10 days, only if Phase 3 PASS)

Per-class tool plans + wrappers. Add tools missing from Phase 2:

| Class | Tools added |
|---|---|
| HAPS | OpenVSP (aero), XFOIL (foil), AVL (vortex lattice), FEMM (motor EM) |
| VF | (existing thermal/refrigerant tools) + photonics (LED efficacy lookup) + Octopart LED catalogs |
| Heat pump | CoolProp (existing) + Cantera (refrigerant kinetics) + ASHRAE tables (paid? abstract scrape) |
| Drone | ArduPilot SITL (control sim) + propeller datasheets + LiPo databases + Octopart |
| AUV | SU2 (CFD) + CalculiX (pressure hull FEA) + Octopart + IEC 61892 |
| Bioreactor | Cantera (kinetics) + BioSTEAM (process) + ASME BPVC + Octopart |
| CGM | (tool-light) ISO 15197 + IEC 60601-1 + Octopart |
| Edge AI | thermal + MLPerf benchmark database + GPU catalogs + roofline modeling |
| EV charger | PandaPower (existing) + CoolProp (existing) + CCS2 spec lookup + cable ampacity tables |

Each class gets its own envelope rules, tool plan, and consistency rules. Maybe 200-300 lines per class on top of the shared foundation.

---

## 8. Risks + mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| Phase 0 shows tools don't address majority of issues | Medium | STOP early; don't sunk-cost into Phase 1 |
| Tool wrappers are flaky (subprocess timeouts, API rate limits) | High | Per-tool fail-open: if tool fails, fall back to LLM Generator for that quantity. Log + alert. |
| GPL license contamination (OpenFOAM, ngspice, CalculiX) | Low if subprocess-only | Subprocess invocation doesn't link GPL; output piped via JSON. Safe. Document per Tool. |
| Tool version drift breaks reproducibility | Medium | Pin every tool version in Tool.pinned_environment; CI checks env matches before chain run. |
| Cross-tool boundary conditions don't match | High | This is the cross-tool consistency verifier's job. Build it from day 1. |
| Iterative solver doesn't converge for some briefs | Medium | max_iterations + tolerance; if no convergence, fall back to LLM Generator. |
| LLM parser hallucinates input fields | Low (extraction is narrow) | Schema validator catches missing/typed-wrong fields; reject + ask LLM to retry. |
| LLM narrator invents numbers | Medium | Prose-number validator catches mismatches; reject + ask LLM to re-narrate. |
| Attribution claims accidentally certify (legal) | Medium | Explicit disclaimer: "tools computed values within their documented domain; chain is engineering reference design, not certified for procurement without separate engineer sign-off." |

---

## 9. Cost estimate

- Phase 0: 2 hours engineering, ~£0 (no chain runs)
- Phase 1: 2 days engineering, ~£0
- Phase 2: 2 days engineering + ~£5 chain run (Loop 16 BESS)
- Phase 3: 0 days (decision only)
- Phase 4: 7-10 days engineering + ~£20 chain runs (Loops 17-N across classes)
- **Total IF Phase 0 + 2 + 3 all PASS:** ~12-15 days + ~£25
- **Total IF Phase 0 KILLS:** 2 hours + £0
- **Total IF Phase 3 KILLS:** ~4 days + £5

---

## 10. Decisions deferred to execution

- Which LLM model for parser? Default: MiMo V2.5 Pro (low hallucination) OR Claude with structured output mode. Decide at Phase 1.
- Which LLM model for narrator? Default: Claude Sonnet or Haiku (good prose, validator catches errors). Decide at Phase 2.
- Octopart free tier vs paid? Decide at Phase 2 based on chain volume.
- ASHRAE tables paid vs scrape? Decide at Phase 4 (heat pump class).
- Per-tool subprocess timeout values? Decide empirically during Phase 2.

---

## 11. Where to start next session

1. Read this PLAN.md
2. Read `drawer_forgeos_decisions_b6ca90761c861622` (LLM-position refinement)
3. Read `drawer_forgeos_decisions_38d21ae00d436a9b` (Phase 0 spec)
4. Run Phase 0 investigation (2 hours)
5. Decide go/no-go based on Phase 0 deliverable

If Phase 0 says GO → start Phase 1 (formal contract schema + tool interface).
If Phase 0 says NO-GO → pivot to dominant non-tool failure mode per Phase 0 deliverable's recommendation.

---

**End of plan. Authored 2026-05-21. Validate with next session's data, do not treat as immutable.**

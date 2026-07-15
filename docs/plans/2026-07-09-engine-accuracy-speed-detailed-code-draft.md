# Engine Accuracy + Speed — Detailed Implementation Plan and Code Draft

**Status:** DESIGN/DRAFT ONLY — no engine source edited  
**Constraint:** another terminal is modifying this repository. Re-read every target file and diff immediately before implementation.  
**Goal:** universal accuracy and speed improvements with no regression to existing dossiers.

## 0. What the current engine already does

The implementation is ahead of the original suggestion pack in several places:

- Excel already performs LibreOffice recalculation and ONE-TRUTH score readback.
- Gate 38 already prevents an old workbook from shipping after a failed build.
- LLM stages already use content-hash caches.
- `run-validation.sh` already checks `.venv` before a full validation run.
- Provenance rooting, quantity lineage, drawing gates, manifest SIGHT, and wall-clock attribution exist.
- Gate 37 already blocks a dead Python bridge or an empty worked-calculation set, but only after paid stages.

Therefore this plan does **not** replace those systems. It closes their remaining gaps with small, staged changes.

---

# Safety protocol before any implementation

## Concurrent-terminal rule

Before each wave:

1. Wait for the other terminal to reach a checkpoint.
2. Record:
   - `git status --short --branch`;
   - current commit;
   - hashes of every target file.
3. Re-read every target file.
4. If any target changed since this plan was written, update the implementation spec before editing.
5. Commit only explicit pathspecs.
6. Never clean/reset unrelated untracked or modified work.

## Change protocol

Every wave follows:

1. Baseline existing selftests.
2. Add known-bad fixture/proveCatch.
3. Add known-good counter-case.
4. Implement the smallest universal rule.
5. Run affected selftests.
6. Run cross-archetype offline replay.
7. Compare full-vs-changed deterministic slices.
8. Only then run one fresh `excel-iterate`.
9. Do not begin the next wave until the current wave is reversible and green.

## Golden portfolio

Use four fixed cases:

1. Mature utility BESS.
2. Codema/water treatment.
3. CO₂ or aquaculture unseen/thin archetype.
4. Residential wall ESS.

For each wave, unchanged archetypes must remain byte/cell/geometry identical unless the change is deliberately universal and enumerated.

---

# Wave 1 — Fail before spending money

## Purpose

Move the existing gate-37 environment check into the chain's own startup path, while preserving the existing post-orchestrator gate.

## Files

- `scripts/lib/chain-preflight.ts`
- new `scripts/lib/tool-bridge-liveness.ts`
- `scripts/serial-design-chain-v2.tsx`
- `scripts/run-validation.sh`
- `scripts/lib/gate-registry.ts`
- `scripts/verify-engine-guards.sh`

## Design

Separate two decisions:

1. **Boot probe:** is the configured Python bridge executable and capable of importing required base dependencies?
2. **Run-result verdict:** did the actual tool plan produce enough live results and at least one worked calculation?

The boot probe catches infrastructure failure before the first LLM. The existing runtime verdict remains because a healthy interpreter does not guarantee healthy tools.

## Draft code: pure runtime verdict

```ts
// scripts/lib/tool-bridge-liveness.ts
export interface ToolResultLike {
  ok: boolean
  error?: string | null
}

export interface WorkedToolLike {
  worked?: readonly unknown[]
}

export interface ToolBridgeVerdict {
  ok: boolean
  attempted: number
  pythonDead: number
  workedTotal: number
  bridgeDead: boolean
  calculationsEmpty: boolean
  reasons: string[]
}

export function evaluateToolBridgeLiveness(
  results: Iterable<readonly [string, ToolResultLike]>,
  tools: readonly WorkedToolLike[],
  minimumAttempted = 3,
): ToolBridgeVerdict {
  const rows = [...results]
  const attempted = rows.length
  const pythonDead = rows.filter(
    ([, result]) =>
      !result.ok &&
      /Python exit (null|-?\d+)/.test(String(result.error ?? '')),
  ).length
  const workedTotal = tools.reduce(
    (total, tool) => total + (tool.worked?.length ?? 0),
    0,
  )
  const bridgeDead =
    attempted >= minimumAttempted && pythonDead / attempted > 0.5
  const calculationsEmpty =
    attempted >= minimumAttempted && workedTotal === 0
  const reasons = [
    ...(bridgeDead ? ['python_bridge_majority_dead'] : []),
    ...(calculationsEmpty ? ['worked_calculations_empty'] : []),
  ]
  return {
    ok: reasons.length === 0,
    attempted,
    pythonDead,
    workedTotal,
    bridgeDead,
    calculationsEmpty,
    reasons,
  }
}
```

## Draft code: startup probe

```ts
import { execFileSync } from 'child_process'
import { existsSync, lstatSync, readlinkSync } from 'fs'
import { resolve } from 'path'

export interface PythonBridgeProbe {
  ok: boolean
  pythonPath: string
  version?: string
  fatal: string[]
}

export function probePythonBridge(repoRoot: string): PythonBridgeProbe {
  const pythonPath = resolve(repoRoot, '.venv/bin/python')
  const fatal: string[] = []

  const venvPath = resolve(repoRoot, '.venv')
  if (existsSync(venvPath) && lstatSync(venvPath).isSymbolicLink()) {
    const target = readlinkSync(venvPath)
    if (target === '.venv' || target.endsWith('/.venv')) {
      fatal.push(`self_referential_venv:${target}`)
    }
  }
  if (!existsSync(pythonPath)) {
    fatal.push(`python_missing:${pythonPath}`)
    return { ok: false, pythonPath, fatal }
  }

  try {
    const version = execFileSync(
      pythonPath,
      ['-c', 'import numpy; import sys; print(sys.version.split()[0])'],
      { encoding: 'utf8', timeout: 15_000 },
    ).trim()
    return { ok: fatal.length === 0, pythonPath, version, fatal }
  } catch (error) {
    fatal.push(
      `python_import_probe_failed:${
        error instanceof Error ? error.message : 'unknown'
      }`,
    )
    return { ok: false, pythonPath, fatal }
  }
}
```

## Draft integration

```ts
// chain-preflight.ts
export interface PreflightDependencies {
  repoRoot: string
  probePython: (repoRoot: string) => PythonBridgeProbe
}

export function runChainPreflight(
  env: NodeJS.ProcessEnv = process.env,
  deps: PreflightDependencies = DEFAULT_PREFLIGHT_DEPENDENCIES,
): PreflightResult {
  // existing checks remain
  if (env.CHAIN_SKIP_TOOL_BRIDGE_PREFLIGHT !== '1') {
    const bridge = deps.probePython(deps.repoRoot)
    if (!bridge.ok) fatal.push(...bridge.fatal)
  }
  // ...
}
```

The post-orchestrator block becomes a call to `evaluateToolBridgeLiveness`; its thresholds and action-log step remain unchanged.

## Backward compatibility

- No new profile or cache logic in this wave.
- Startup probe is enabled for normal/full execution.
- `CHAIN_SKIP_TOOL_BRIDGE_PREFLIGHT=1` exists only as an emergency diagnostic escape and must be logged as a degrading toggle.
- Keep the post-plan gate, because it catches tool-output defects the boot probe cannot.
- Do **not** allocate or renumber exit codes in this wave. Gate 37 currently collides with provenance rooting; resolve the canonical exit-code registry separately after inventory.

## Tests

1. Missing `.venv/bin/python` → startup fatal.
2. Self-symlink `.venv` → startup fatal.
3. Python executable but `numpy` import failure → startup fatal.
4. Healthy Python → startup pass.
5. Four dead Python tool results → runtime gate fires.
6. Three successful tools but zero `worked` entries → runtime gate fires.
7. Healthy plan with a worked calculation → pass.
8. `run-validation.sh` and direct chain invocation produce the same verdict.

## Exit criteria

- No paid model call occurs on the known v51–v53 environment failure.
- Existing healthy runs behave identically after preflight.
- Gate 37 has a registry proveCatch and good counter-case.

---

# Wave 2 — Named run profiles without changing current defaults

## Purpose

Replace tribal combinations of environment variables with explicit, auditable profiles while preserving existing behaviour.

## Files

- new `scripts/lib/chain-run-profile.ts`
- `scripts/serial-design-chain-v2.tsx`
- `scripts/lib/chain-preflight.ts`
- `scripts/run-validation.sh`
- `src/lib/pdf-engine-v2/lib/action-logger.ts` only if its event type is closed

## Safety decision

First release uses default profile **`legacy`**, not `ship`. This prevents silently changing existing invocations. After golden evidence, `run-validation.sh` explicitly selects `ship`; agents explicitly select `excel-iterate`.

## Draft code

```ts
export type ChainRunProfile =
  | 'legacy'
  | 'smoke'
  | 'excel-iterate'
  | 'drawings'
  | 'ship'

export interface ChainProfilePolicy {
  profile: ChainRunProfile
  qualityLoopPhase?: 1 | 2 | 3
  qualityLoopMaxIters?: number
  wantPdf?: boolean
  skipImageGeneration?: boolean
  skipBackgroundEnrichment?: boolean
  benchmarkForce?: boolean
  requireExcelReadback: boolean
  requireDrawingGates: boolean
}

const PROFILE_POLICY = {
  legacy: {
    profile: 'legacy',
    requireExcelReadback: true,
    requireDrawingGates: false,
  },
  smoke: {
    profile: 'smoke',
    qualityLoopPhase: 1,
    qualityLoopMaxIters: 1,
    wantPdf: false,
    skipImageGeneration: true,
    skipBackgroundEnrichment: true,
    benchmarkForce: false,
    requireExcelReadback: false,
    requireDrawingGates: false,
  },
  'excel-iterate': {
    profile: 'excel-iterate',
    qualityLoopPhase: 2,
    qualityLoopMaxIters: 1,
    wantPdf: false,
    skipImageGeneration: true,
    skipBackgroundEnrichment: true,
    benchmarkForce: false,
    requireExcelReadback: true,
    requireDrawingGates: true,
  },
  drawings: {
    profile: 'drawings',
    qualityLoopPhase: 2,
    qualityLoopMaxIters: 1,
    wantPdf: false,
    skipImageGeneration: true,
    skipBackgroundEnrichment: true,
    benchmarkForce: false,
    requireExcelReadback: true,
    requireDrawingGates: true,
  },
  ship: {
    profile: 'ship',
    qualityLoopPhase: 3,
    wantPdf: false, // Excel-first product; PDF remains explicit if required
    skipImageGeneration: false,
    skipBackgroundEnrichment: false,
    benchmarkForce: true,
    requireExcelReadback: true,
    requireDrawingGates: true,
  },
} satisfies Record<ChainRunProfile, ChainProfilePolicy>

export function resolveChainRunProfile(
  env: NodeJS.ProcessEnv,
): ChainProfilePolicy {
  const raw = String(env.CHAIN_RUN_PROFILE ?? 'legacy')
  if (!(raw in PROFILE_POLICY)) {
    throw new Error(`Unknown CHAIN_RUN_PROFILE: ${raw}`)
  }
  return PROFILE_POLICY[raw as ChainRunProfile]
}
```

## Application rule

Profile policy is resolved before preflight and logged before any mutation. Explicit user environment overrides:

- are allowed in `legacy`;
- are rejected if they weaken `ship`;
- are logged if they alter iterate profiles.

```ts
export function validateProfileOverrides(
  profile: ChainProfilePolicy,
  env: NodeJS.ProcessEnv,
): string[] {
  if (profile.profile !== 'ship') return []
  return SHIP_FORBIDDEN_SKIPS.filter((name) => truthy(env[name]))
}
```

## Tests

- Unknown profile fails immediately.
- `legacy` reproduces current environment behaviour.
- `ship` refuses inherited `CHAIN_SKIP_PART_VERIFY`, benchmark skip, or Excel-readback skip.
- `excel-iterate` still builds and reingests Excel.
- Profile is present in `actions.jsonl`, state run metadata, and scorecard metadata.

## Exit criteria

- Existing commands remain unchanged under `legacy`.
- Validation runner explicitly selects `ship`.
- Iteration commands need one profile, not a dozen flags.

---

# Wave 3 — Provenance honesty without a schema migration

## Purpose

Stop values marked `source:'brief'` when they were calculated or assumed. Do this additively before attempting to merge `Quantity` and `TypedQuantity`.

## Files

- new `scripts/lib/quantity-provenance-honesty.ts`
- `scripts/lib/engineering-contract.ts`
- `scripts/lib/orchestrator/generic/provenance-trace.ts`
- `scripts/lib/gate-registry.ts`
- selected quantity writers only after the audit identifies violations

## Safety decision

Do **not** replace the existing source enums yet. The code has two quantity types and thousands of writers. First add a validator and tighten the helper.

## Draft code

```ts
export interface BriefLiteralEvidence {
  kind: 'brief_field'
  path: string
}

export interface DerivedEvidence {
  kind: 'derivation'
  from: string[]
  formula?: string
  calculator?: string
}

export type QuantityEvidence = BriefLiteralEvidence | DerivedEvidence

export function validateQuantityProvenance(
  key: string,
  quantity: Quantity,
  brief: unknown,
): string[] {
  const findings: string[] = []
  if (quantity.source === 'brief') {
    const path = quantity.source_detail?.trim()
    if (!path || !path.startsWith('brief.')) {
      findings.push(`${key}:brief_source_without_structured_path`)
    } else if (!briefPathEqualsQuantity(brief, path, quantity)) {
      findings.push(`${key}:brief_path_does_not_equal_quantity`)
    }
  }
  if (quantity.source === 'calculator' && !quantity.lineage?.from?.length) {
    findings.push(`${key}:calculator_without_machine_lineage`)
  }
  if (
    quantity.lineage?.from?.includes(key)
  ) {
    findings.push(`${key}:self_referential_lineage`)
  }
  return findings
}
```

## Tighten `q()` through additive helpers

```ts
export function qBrief(
  value: number,
  unit: string,
  family: UnitFamily,
  basis: QuantityBasis,
  scope: QuantityScope,
  briefPath: string,
): Quantity {
  return q(value, unit, family, basis, scope, 'brief', {
    source_detail: `brief.${briefPath}`,
  })
}

export function qDerived(
  value: number,
  unit: string,
  family: UnitFamily,
  basis: QuantityBasis,
  scope: QuantityScope,
  from: string[],
  formula: string,
): Quantity {
  if (!from.length) throw new Error('qDerived requires at least one input')
  return q(value, unit, family, basis, scope, 'calculator', {
    source_detail: formula,
    from,
    formula,
  })
}
```

Existing `q()` remains for compatibility. New and touched calculations use the stricter helpers. The validator identifies the migration backlog.

## Critical correction to current rooting logic

Current `briefStatesNumber()` can infer a brief root from the same number appearing anywhere in the prose. That is useful diagnostically but is not strong enough for authoritative provenance: a brief containing “90” can accidentally root an unrelated 90.

Draft policy:

```ts
export type RootStrength = 'structured' | 'tool' | 'derived' | 'text_hint' | 'none'
```

- Structured brief path: authoritative root.
- Tool invocation: authoritative root.
- Derivation from authoritative roots: authoritative root.
- Bare number found in prose: `text_hint`, not sufficient for an enforcing gate.

Keep existing behaviour in shadow until the structured-path coverage is measured.

## Tests

- A calculator-produced 7.5 kW marked `brief` without path fails.
- A structured brief field with same value/unit passes.
- Same number in unrelated prose does not create an authoritative root.
- A derived breaker current with `from:['continuous_power_kw','grid_voltage_v']` passes.
- Circular and missing lineage fail.
- Existing BESS/Codema contracts produce a migration report before enforcement.

## Exit criteria

- New/touched quantities cannot lie about source.
- No mass migration occurs in this wave.
- Enforcement remains shadow until the golden portfolio reaches agreed structured provenance coverage.

---

# Wave 4 — Strict metric equivalence, not fuzzy aliases

## Purpose

Eliminate false UNVERIFIED without manufacturing false PASS.

## Existing authority

`scripts/build-excel-export.py::_match_quantity()` is currently the compliance truth. It already:

- excludes target/echo suffixes;
- checks unit families;
- normalises unit forms;
- uses subsystem identity tokens;
- handles scope-qualified siblings;
- avoids target-value closeness.

Do not rewrite this wholesale.

## Files

- new `scripts/lib/metric-equivalence-fixtures.json`
- new `scripts/lib/metric-equivalence.ts`
- `scripts/build-excel-export.py`
- `scripts/lib/orchestrator/generic/universal-contract-sizing.ts`
- `scripts/lib/orchestrator/generic/bootstrap-tool-plan.ts`
- `scripts/lib/benchmark-expectation.ts` later, after parity
- existing `scripts/lib/orchestrator/generic/brief-metric-delivery-selftest.ts`

## Architecture

Use one shared fixture corpus across Python and TypeScript before trying to share runtime code across languages.

Each fixture includes:

```json
{
  "name": "usable-not-nameplate",
  "metric": {
    "key_metric": "usable_energy_kwh",
    "value": 13.5,
    "unit": "kWh"
  },
  "quantities": {
    "usable_energy_kwh_requested": {
      "value": 13.5,
      "unit": "kWh"
    },
    "nameplate_capacity_kwh": {
      "value": 14,
      "unit": "kWh"
    }
  },
  "expected_key": null
}
```

## Strict match result

```ts
export type MetricMatchStrategy =
  | 'scope_sibling'
  | 'exact_key'
  | 'normalised_key'
  | 'identity_overlap'
  | 'registered_equivalence'

export interface MetricMatch {
  briefKey: string
  achievedKey: string
  strategy: MetricMatchStrategy
  family: string
  achievedInBriefUnit: number
  confidence: 'exact' | 'registered' | 'derived'
}

export function matchDeliveredMetric(
  metric: StructuredBriefMetric,
  quantities: Record<string, QuantityLike>,
  context: { briefText: string },
): MetricMatch | null
```

## Match order

1. Scope-qualified sibling.
2. Exact key.
3. Unit-suffix-normalised exact key.
4. Same-family identity overlap with distinctive subject token.
5. Registered equivalence whose qualifier/scope contract is explicit.
6. Otherwise UNVERIFIED.

Never match by closeness to target value.

## Registered equivalence shape

```ts
export interface MetricEquivalenceRule {
  id: string
  briefConcept: string[]
  deliveredConcept: string[]
  family: string
  requiredScope?: QuantityScope
  requiredBasis?: QuantityBasis
  forbiddenQualifiers: string[]
}
```

Rules are conceptual and universal, for example `makeup + flow` can map to a delivered `permeate + capacity` only if the system topology declares permeate as the makeup source and lineage connects the two. A noun synonym alone is insufficient.

## Codema fixture

`ro_makeup_flow_m3_per_hr` may resolve to `ro_permeate_capacity_m3_h` only when:

- both are flow family;
- topology/lineage declares RO permeate supplies makeup;
- neither is a target/demand echo;
- scope is system/site;
- the achieved value is delivered, not requested.

This is a proveCatch fixture, not a product-specific branch.

## Parallel matcher policy

- Python remains score authority during migration.
- TypeScript mirror runs against the same fixtures.
- CI fails if Python and TypeScript choose different keys.
- `bootstrap-tool-plan.ts`'s 2% value fallback must not be reused for compliance.
- Benchmark matcher migration happens only after parity on the fixture corpus.

## Tests

Required catches and counter-cases:

- RO makeup/permeate with topology lineage → match.
- Same nouns but no lineage → UNVERIFIED.
- Usable vs nameplate → no match.
- Continuous vs peak → no match.
- Plant total vs per-unit → no match.
- Hand watering vs fertigation → no match.
- Nursery vs irrigation generic pump → distinctive subject wins.
- 5000 L vs 5 m³ → match and compare after conversion.
- Exact delivered key beats requested echo.
- Scope-only battery cost does not match full-system cost.

## Exit criteria

- Codema false UNVERIFIED is removed through semantic evidence.
- All anti-Goodhart fixtures remain failures.
- Python/TS matcher parity is exact.

---

# Wave 5 — Dependency-aware re-derivation

## Purpose

Prevent stale values after reconciliation (for example, panel kW changes while current/cable/breaker remain stale).

## Safety decision

Do not build a global stage-resume DAG yet. Start with a quantity dependency index and validation. Caching comes later.

## Files

- new `scripts/lib/quantity-dependency-graph.ts`
- `scripts/lib/engineering-contract.ts`
- `scripts/lib/design-loop/writeback-bridge.ts`
- `scripts/lib/design-loop/settle-loop.ts`
- selected reconciliation functions

## Draft code

```ts
export interface QuantityDependency {
  output: string
  inputs: string[]
  derive: (
    quantities: Readonly<Record<string, Quantity>>,
  ) => Quantity
}

export class QuantityDependencyGraph {
  private readonly byInput = new Map<string, Set<string>>()
  private readonly rules = new Map<string, QuantityDependency>()

  register(rule: QuantityDependency): void {
    if (this.rules.has(rule.output)) {
      throw new Error(`Duplicate quantity writer: ${rule.output}`)
    }
    this.rules.set(rule.output, rule)
    for (const input of rule.inputs) {
      const consumers = this.byInput.get(input) ?? new Set<string>()
      consumers.add(rule.output)
      this.byInput.set(input, consumers)
    }
  }

  affectedBy(changed: readonly string[]): string[] {
    const affected = new Set<string>()
    const queue = [...changed]
    while (queue.length) {
      const key = queue.shift()!
      for (const consumer of this.byInput.get(key) ?? []) {
        if (!affected.has(consumer)) {
          affected.add(consumer)
          queue.push(consumer)
        }
      }
    }
    return [...affected]
  }
}
```

## First registered family

Electrical:

```ts
register({
  output: 'design_current_a',
  inputs: [
    'connected_electrical_load_kw',
    'grid_voltage_v',
    'phase_count',
    'power_factor',
  ],
  derive: deriveDesignCurrent,
})
```

Then breaker, cable, transformer and thermal dependants.

## Writer rule

Any reconciliation returns a change set:

```ts
export interface QuantityChange {
  key: string
  before: number | null
  after: number
  writer: string
  reason: string
}
```

The graph computes affected outputs. The run cannot render while affected quantities are stale.

## Tests

- Rescale connected kW → current changes.
- Current change → breaker/cable become dirty.
- Unrelated price change does not dirty electrical sizing.
- Circular dependency is rejected.
- Two authoritative writers for one output are rejected.
- Full derivation is idempotent.

## Exit criteria

- Known panel stale-current fixture fails before render.
- At least one complete dependency family is closed end-to-end.
- No global caching depends on this graph yet.

---

# Wave 6 — Safer cache invalidation

## Purpose

Make existing LLM caches invalidate when relevant source code changes, without introducing whole-chain resume.

## Existing risk

`design-stage-cache.ts` hashes caller payload, model and prompt when callers include them. A helper/parser/normaliser code change outside prompt text may still reuse stale output.

## Files

- `scripts/lib/design-stage-cache.ts`
- selected call sites in `scripts/serial-design-chain-v2.tsx`
- new cache parity harness

## Additive API

```ts
export interface CachedDesignStageOptions<T> {
  stage: string
  payload: unknown
  codeDependencies?: readonly string[]
  schemaVersion?: string
  run: () => Promise<T>
  isValid?: (value: T) => boolean
}

export interface DesignStageCacheRecord<T> {
  key: string
  stage: string
  cached_at: string
  code_fingerprint: string
  schema_version: string
  value: T
}
```

## Draft fingerprint

```ts
export function hashCodeDependencies(paths: readonly string[]): string {
  const hash = createHash('sha256')
  for (const path of [...paths].sort()) {
    hash.update(path)
    hash.update('\0')
    hash.update(readFileSync(path))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 24)
}

export function designStageCacheKeyV2(opts: {
  stage: string
  payload: unknown
  codeFingerprint: string
  schemaVersion: string
}): string {
  return designStageCacheKey(opts)
}
```

## Atomic writes

```ts
const temp = `${path}.${process.pid}.tmp`
writeFileSync(temp, JSON.stringify(record))
renameSync(temp, path)
```

## Migration policy

- Keep current API working.
- Add V2 fields only at high-value call sites one at a time.
- A missing V2 field means cache miss, not acceptance of legacy data.
- Do not hash the whole repository; declare per-stage dependencies.
- Log hit/miss key and code fingerprint in `actions.jsonl`.

## Tests

- Same payload + same code → hit.
- Same payload + changed dependency contents → miss.
- Unrelated file change → hit.
- Corrupt/truncated cache → miss.
- Invalid schema version → miss.
- Concurrent writes leave one valid complete record.
- Cached and uncached golden outputs match.

## Exit criteria

- High-value LLM caches are code-aware.
- No global resume exists yet.
- Full-vs-cached deterministic parity is proven.

---

# Wave 7 — Extend SIGHT only where it is incomplete

## Purpose

Do not replace existing Excel readback. Add deterministic checks for displayed cross-tab engineering values and drawing installation constraints.

## Files

- `scripts/build-excel-export.py`
- `scripts/lib/dossier_audit.py`
- `scripts/lib/manifest_sight.py`
- `scripts/blender-universal/drawing_gates.py`

## Excel draft

Create a delivered-claim index after workbook recalculation:

```py
@dataclass(frozen=True)
class DisplayedClaim:
    sheet: str
    cell: str
    concept: str
    value: float
    unit: str
    qualifier: str
    source_key: str | None

def read_displayed_claims(workbook) -> list[DisplayedClaim]:
    ...

def audit_displayed_claims(
    claims: list[DisplayedClaim],
    authoritative_quantities: dict,
) -> list[Finding]:
    ...
```

Start with claims already carrying source keys. Do not infer concepts from arbitrary prose in the first release.

## Drawing draft

```py
def check_installation_envelope(
    manifest: dict,
    drawing_metadata: dict,
) -> Gate:
    required = drawing_metadata.get("required_clearances_mm", {})
    actual = drawing_metadata.get("shown_clearances_mm", {})
    missing = [
        side for side, value in required.items()
        if actual.get(side) is None or actual[side] < value
    ]
    return Gate(
        id="installation_clearance",
        passed=not missing,
        stage="draw_ga",
        details={"missing_or_short": missing},
    )
```

The mechanism is universal: installation envelope metadata, not Powerwall-specific dimensions.

## Tests

- A displayed Excel value differs from its source quantity → fail.
- Same quantity in converted units → pass.
- Unlinked prose remains advisory, not falsely authoritative.
- Wall-mounted product missing declared clearance → fail.
- Product with no clearance requirement → not applicable, not fail.

## Exit criteria

- Scorecard remains sourced from delivered workbook.
- New checks route to producing cells/drawing stages.
- Existing ONE-TRUTH parity remains unchanged.

---

# Wave 8 — Incremental drawings, then pure parallelism

## Purpose

Reduce iteration time after dependency and invalidation evidence exists.

## Per-drawing cache draft

```py
@dataclass(frozen=True)
class DrawingCacheKey:
    drawing_id: str
    manifest_hash: str
    connection_hash: str
    envelope_hash: str
    annotation_hash: str
    generator_hash: str
    style_hash: str
```

A drawing is reusable only if all fields match and its own gates passed previously.

## Pure gate runner draft

```ts
export interface PureGate<TState, TResult> {
  id: string
  run: (state: Readonly<TState>) => Promise<TResult> | TResult
}

export async function runPureGates<TState>(
  state: TState,
  gates: readonly PureGate<TState, unknown>[],
): Promise<Record<string, unknown>> {
  const snapshot = structuredClone(state)
  deepFreeze(snapshot)
  const entries = await Promise.all(
    gates.map(async (gate) => [gate.id, await gate.run(snapshot)] as const),
  )
  return Object.fromEntries(entries)
}
```

## Safety gates

- A candidate gate must prove no filesystem writes and no state mutation.
- PDF-dependent gates remain post-render.
- DB-only lookups use bounded concurrency.
- Parallel and serial results must be identical.

## Exit criteria

- Price-only change does not regenerate unaffected drawings.
- Contract/envelope change invalidates every affected drawing.
- Serial-vs-parallel gate results match exactly.

---

# Deferred work

Do not include these in the first implementation programme:

1. Merging `Quantity` and `TypedQuantity` in one migration.
2. Global stage DAG and arbitrary resume.
3. Replacing Python compliance truth with TypeScript.
4. Fuzzy/bidirectional alias graph.
5. Making LLM benchmark verdicts part of deterministic floor.
6. Enabling physics autocorrection by default.
7. New live API calls in the chain.
8. Model swaps before real A/B evidence.
9. Autonomous code-rewriting loop.

---

# Exact implementation order

| Order | Wave | Risk | Accuracy | Speed |
|---:|---|---|---|---|
| 1 | Tool-bridge preflight | Low | High | High |
| 2 | Named profiles (`legacy` default) | Low | Medium | High |
| 3 | Provenance honesty validator | Medium | High | Medium |
| 4 | Strict metric fixture parity | Medium | High | High |
| 5 | Quantity dependency/re-derive | Medium | High | Medium |
| 6 | Code-aware LLM cache | Medium | Medium | High |
| 7 | Delivered claim/clearance SIGHT | Medium | High | Low |
| 8 | Drawing cache + pure parallel gates | Higher | Neutral if correct | High |

Do not combine waves 3–8 in one commit or one cold-run campaign.

---

# Regression matrix

Every wave must report:

| Evidence | Required |
|---|---|
| New proveCatch | Yes |
| New correct counter-case | Yes |
| Existing relevant selftests | Green |
| Gate registry | Green |
| Design-token/UI checks | N/A unless UI touched |
| Cross-archetype saved replay | BESS + Codema + one unseen |
| Determinism slice | No unexplained changes |
| Full-vs-cached parity | Required for cache waves |
| Excel ONE-TRUTH readback | Required for iterate/ship waves |
| Drawing gates | Required when drawing inputs change |
| `actions.jsonl` routing | Every new failure/cache decision |

---

# Success measures

After all approved waves:

- Zero paid calls on a dead engineering environment.
- Zero false compliance PASS from target echoes.
- Zero false UNVERIFIED on the golden semantic-equivalence fixtures.
- Every significant displayed engineering number has structured provenance.
- Reconciled quantities cannot leave declared dependants stale.
- Median `excel-iterate` wall time improves by at least 30%.
- Full-vs-cached and serial-vs-parallel outputs agree.
- No golden dossier's honest minimum tab score regresses.
- No product-class-specific condition is introduced.

---

# First implementation handover

The first agent should implement **Wave 1 only**.

Before editing:

1. Re-read the current versions of all Wave-1 files.
2. Check whether the other terminal has already changed gate 37, preflight, or the registry.
3. If so, merge the intent into that implementation rather than applying this draft literally.
4. Add the pure evaluator and fixtures first.
5. Preserve action-log field names and runtime thresholds.
6. Do not run a full cold chain until selftests and saved gate-37 fixtures are green.


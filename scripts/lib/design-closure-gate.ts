/**
 * @file design-closure-gate.ts
 * @description Gate 40 — design-closure BEFORE LLM paint (Block 2 closure plan).
 *
 * INTENT (Sol+Fable 2026-07-27): Block 1 seeded counts and bound per_<scope>_
 * multiplicity, but reviewers still paint an unclosed skeleton (×1 on
 * non-prefixed channel hardware, 0 m² / missing rating on heatsinks with
 * positive dissipation, all-TBD scored as "honest"). This gate is the
 * pre-paint choke: ledger complete enough to bind, per-scope words match
 * their count, no zero-dim/rating on demand, fillable-TBD on critical roles
 * is a DEFECT.
 *
 * P2 (same night): unbound_multiplicity MUST fire on bare-named channel roles
 * ("Charge Current Source" ×1) — not only on `per_channel_*` / "Per Channel …"
 * surface forms. proveCatch uses the delivered cold-v5 disease words.
 *
 * SHADOW by default (`DESIGN_CLOSURE_ENFORCING` / `CLOSURE_GATE_ENFORCING`
 * opt-in → exit 40). Kill: `CHAIN_SKIP_DESIGN_CLOSURE=1`.
 *
 * UNIVERSAL — keyed on quantity shape + role→scope replication + unit-family
 * dissipation/area signals. No product-class table.
 */

import { contractCountFor } from './orchestrator/generic/derive-skeleton'
import {
  isChannelReplicatedRole,
  isSharedChannelAxisRole,
} from './orchestrator/generic/replication-scope'

export const DESIGN_CLOSURE_EXIT_CODE = 40

export type DesignClosureSeverity = 'high' | 'med' | 'low'

export type DesignClosureKind =
  | 'ledger_incomplete'
  | 'unbound_multiplicity'
  | 'zero_dim_on_demand'
  | 'nonconserving_demand_allocation'
  | 'fillable_tbd_critical_role'

export interface DesignClosureFinding {
  severity: DesignClosureSeverity
  kind: DesignClosureKind
  where: string
  issue: string
  evidence: string
}

export interface DesignClosureResult {
  verdict: 'pass' | 'fail'
  findings: DesignClosureFinding[]
  ledger_complete: boolean
  unbound_words: number
  zero_dim_on_demand: number
  fillable_tbd: number
  honesty_score: number
  message: string
}

export interface DesignClosureEnforcement {
  shouldExit: boolean
  exitCode: number
  reasons: string[]
}

function qtyMap(state: unknown): Record<string, { value?: unknown; source?: string; family?: string; unit?: string }> {
  const s = state as Record<string, any> | null | undefined
  return (s?.orchestratorContract?.quantities
    ?? s?.engineeringContract?.quantities
    ?? {}) as Record<string, { value?: unknown; source?: string; family?: string; unit?: string }>
}

function modulesOf(state: unknown): any[] {
  const s = state as Record<string, any> | null | undefined
  return (s?.moduleDecomposition?.modules ?? s?.design?.modules ?? []) as any[]
}

function walkWords(state: unknown): Array<{ where: string; word: any; name: string; id: string }> {
  const out: Array<{ where: string; word: any; name: string; id: string }> = []
  const modules = modulesOf(state)
  for (let mi = 0; mi < modules.length; mi++) {
    const m = modules[mi]
    const mid = String(m?.module ?? m?.module_id ?? mi)
    const subs = m?.sub_modules
    if (!Array.isArray(subs)) continue
    for (let si = 0; si < subs.length; si++) {
      const sm = subs[si]
      const words = sm?.words
      if (!Array.isArray(words)) continue
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi]
        const name = String(w?.name_human ?? w?.id ?? wi)
        const id = String(w?.content_character?.character_id ?? w?.id ?? name)
        out.push({
          where: `modules[${mi}:${mid}].sub_modules[${si}].words[${wi}]`,
          word: w,
          name,
          id,
        })
      }
    }
  }
  return out
}

function quantityOf(word: any): number {
  const mods = word?.modifier_characters
  if (!Array.isArray(mods)) return 1
  for (const mc of mods) {
    if (mc?.kind !== 'quantity') continue
    const m = String(mc.value ?? '').match(/×\s*(\d+)/)
    if (m) return Number(m[1])
  }
  return 1
}

function hasDimOrRating(word: any): boolean {
  const mods = word?.modifier_characters
  if (!Array.isArray(mods)) return false
  return mods.some((mc: any) => {
    if (mc?.kind === 'dimension' || mc?.kind === 'dimensions') {
      const v = String(mc.value ?? '')
      // "0 m² area" is NOT a real projection
      if (/^0(\.0+)?\s*m²/i.test(v.trim())) return false
      return v.trim().length > 0
    }
    if (mc?.kind === 'rating_primary') {
      const n = Number(mc.value)
      return Number.isFinite(n) && n > 0
    }
    return false
  })
}

function isTbdPart(word: any): boolean {
  const mods = word?.modifier_characters
  if (!Array.isArray(mods)) return true
  const pn = mods.find((mc: any) => mc?.kind === 'part_number')
  const v = String(pn?.value ?? '').trim()
  if (!v) return true
  return /^(TBD|TBC|n\/?a|unknown|generic|detailed design)/i.test(v)
}

function isHeatsinkRole(name: string, id: string): boolean {
  const t = `${name} ${id}`
  // DECISION: fan / fan-assembly words are airflow accessories — the sizing
  // stamp skips them (universal-contract-sizing stampHeatsinkThermalFromContract).
  // Gate 40 must not demand fin-area/rating on the accessory while the principal
  // heatsink/heat-pipe carries the projection.
  if (/\bfan\b/i.test(t)) return false
  return /heatsink|heat[_\s-]?sink|heatpipe|heat[_\s-]?pipe/i.test(t)
}

/** True when the word must replicate with channel_count (prefix OR bare role). */
function isChannelAxisWord(name: string, id: string): boolean {
  if (isSharedChannelAxisRole(id) || isSharedChannelAxisRole(name)) return false
  return isChannelReplicatedRole(id) || isChannelReplicatedRole(name)
}

function dissipationWatts(quantities: Record<string, { value?: unknown }>): number {
  let best = 0
  for (const [k, tq] of Object.entries(quantities)) {
    // TEC / hot-side rejection is a different thermal loop — do not let it
    // inflate the linear-stage conservation budget or zero-dim demand signal.
    if (/heatsink_rejection|hot_side_rejection|tec_|peltier_/i.test(k)) continue
    if (!/(dissipation|thermal_rejection)_w$/i.test(k) && !/aggregate_.*_dissipation_w$/i.test(k)) {
      continue
    }
    const v = Number(tq?.value)
    if (Number.isFinite(v) && v > best) best = v
  }
  return best
}

/** Prefer explicit aggregate / max-simultaneous keys for the conservation budget. */
function aggregateDissipationBudgetW(quantities: Record<string, { value?: unknown }>): number {
  let best = 0
  for (const [k, tq] of Object.entries(quantities)) {
    if (/heatsink_rejection|hot_side_rejection|tec_|peltier_/i.test(k)) continue
    if (
      !/^(max_simultaneous|aggregate|total_instrument).*dissipation_w$/i.test(k)
      && !/aggregate_.*_dissipation_w$/i.test(k)
      && !/linear_stage_dissipation_w$/i.test(k)
    ) {
      continue
    }
    const v = Number(tq?.value)
    if (Number.isFinite(v) && v > best) best = v
  }
  if (best > 0) return best
  const chMax = Number(quantities.channel_max_dissipation_w?.value ?? quantities.per_channel_dissipation_w?.value)
  const nCh = Number(quantities.channel_count?.value)
  if (Number.isFinite(chMax) && chMax > 0 && Number.isFinite(nCh) && nCh >= 2) {
    return chMax * nCh
  }
  return dissipationWatts(quantities)
}

function ratingPrimaryWatts(word: any): number {
  const mods = word?.modifier_characters
  if (!Array.isArray(mods)) return 0
  for (const mc of mods) {
    if (mc?.kind !== 'rating_primary') continue
    const n = Number(mc.value)
    if (!Number.isFinite(n) || n <= 0) continue
    const unit = String(mc.unit ?? 'W').toLowerCase()
    if (unit === 'kw') return n * 1000
    return n
  }
  return 0
}

function areaM2(quantities: Record<string, { value?: unknown }>): number {
  let best = 0
  for (const [k, tq] of Object.entries(quantities)) {
    if (!/heatsink.*area_m2$|_fin_surface_area_m2$/i.test(k)) continue
    const v = Number(tq?.value)
    if (Number.isFinite(v) && v > best) best = v
  }
  return best
}

function isCriticalRole(name: string, id: string): boolean {
  // Principal power / sense / safety / thermal on a multi-channel instrument.
  // Universal noun keys — never a class slug.
  return (
    isChannelAxisWord(name, id)
    || isHeatsinkRole(name, id)
    || /afe|mosfet|shunt|thermistor|comparator|cutout|peltier|c14|power[_\s-]?module|mcu|controller/i.test(`${name} ${id}`)
  )
}

/**
 * @description Pure design-closure audit of a chain state / fixture.
 */
export function computeDesignClosure(state: unknown): DesignClosureResult {
  const findings: DesignClosureFinding[] = []
  const quantities = qtyMap(state)
  const words = walkWords(state)

  // ── 1. Ledger: a multi-channel brief must expose a count axis ──────────────
  const channelCount = Number(quantities.channel_count?.value)
  const hasChannelAxis = Number.isFinite(channelCount) && channelCount >= 2
  const perChannelWords = words.filter((w) => isChannelAxisWord(w.name, w.id))
  let ledgerComplete = true
  if (perChannelWords.length > 0 && !hasChannelAxis) {
    ledgerComplete = false
    findings.push({
      severity: 'high',
      kind: 'ledger_incomplete',
      where: 'orchestratorContract.quantities.channel_count',
      issue: `Design emits ${perChannelWords.length} per-channel word(s) but channel_count is absent/invalid on the contract ledger`,
      evidence: `per-channel examples: ${perChannelWords.slice(0, 3).map((w) => w.name).join(', ')}`,
    })
  }

  // ── 2. Unbound multiplicity (prefix OR bare channel role) ─────────────────
  const contract = { quantities } as never
  let unbound = 0
  for (const w of words) {
    if (!isChannelAxisWord(w.name, w.id)) continue
    const expected = contractCountFor(w.id || w.name, contract)
    const actual = quantityOf(w.word)
    if (expected >= 2 && actual !== expected) {
      unbound++
      findings.push({
        severity: 'high',
        kind: 'unbound_multiplicity',
        where: w.where,
        issue: `"${w.name}" emits ×${actual} but ledger binds channel_count → ×${expected}`,
        evidence: `contractCountFor(${w.id || w.name})=${expected}`,
      })
    }
  }

  // ── 3. Zero dim/rating on thermal demand ──────────────────────────────────
  // DECISION: demand is closed when ANY heatsink principal carries a projection.
  // Flagging every blank sibling (shared chamber sink beside sized channel sinks)
  // forced double-stamping the aggregate onto both families.
  const dissW = dissipationWatts(quantities)
  const area = areaM2(quantities)
  let zeroDim = 0
  if (dissW > 0 || area > 0) {
    const sinks = words.filter((w) => isHeatsinkRole(w.name, w.id))
    const anyClosed = sinks.some((w) => hasDimOrRating(w.word))
    if (sinks.length > 0 && !anyClosed) {
      zeroDim = sinks.length
      for (const w of sinks) {
        findings.push({
          severity: 'high',
          kind: 'zero_dim_on_demand',
          where: w.where,
          issue: `"${w.name}" has no nonzero dimension/rating while thermal demand is present on the ledger (no peer sink closes the demand either)`,
          evidence: `dissipation_w=${dissW || 'n/a'}, heatsink_area_m2=${area || 'n/a'}`,
        })
      }
    }
  }

  // ── 3b. Thermal conservation — qty × rating must not exceed aggregate budget ─
  // INTENT (Sol+Fable 2026-07-28): cold-v13 stamped 8×200 W channel heatsinks
  // against aggregate_dissipation_w=200. Accept 8×25 W OR 1×200 W; fire on
  // 8×200 W or shared+replicated totals that overshoot the budget.
  const budgetW = aggregateDissipationBudgetW(quantities)
  let nonconserving = 0
  if (budgetW > 0) {
    const sinks = words.filter((w) => isHeatsinkRole(w.name, w.id))
    let allocatedW = 0
    const parts: string[] = []
    for (const w of sinks) {
      const ratingW = ratingPrimaryWatts(w.word)
      if (!(ratingW > 0)) continue
      const qty = quantityOf(w.word)
      const line = ratingW * qty
      allocatedW += line
      parts.push(`${w.name}×${qty}@${ratingW}W=${line}W`)
    }
    if (allocatedW > budgetW * 1.15) {
      nonconserving = 1
      findings.push({
        severity: 'high',
        kind: 'nonconserving_demand_allocation',
        where: 'heatsink_thermal_allocation',
        issue: `Heatsink watt allocation ${Math.round(allocatedW)} W exceeds ledger aggregate dissipation budget ${Math.round(budgetW)} W (>15% over) — scope-blind stamp (e.g. aggregate onto every channel sink)`,
        evidence: parts.slice(0, 8).join('; ') || `allocated=${allocatedW}`,
      })
    }
  }

  // ── 4. Fillable TBD on critical roles ─────────────────────────────────────
  // A critical role with TBD is fillable when the ledger already carries a
  // matching count/dissipation/area the part slot should have resolved against.
  let fillableTbd = 0
  const ledgerCanResolve = hasChannelAxis || dissW > 0 || area > 0
  if (ledgerCanResolve) {
    for (const w of words) {
      if (!isCriticalRole(w.name, w.id)) continue
      if (!isTbdPart(w.word)) continue
      // Genuine-unknown carve-out: shared fasteners / legend / foot pad stay TBD-ok.
      // Cell holder fixtures are made-to-spec mechanical (not catalogue MPN slots).
      if (/fastener|foot[_\s-]?pad|legend|bezel|wire_harness|status_led|decoupling|cell[_\s-]?holder|holder[_\s-]?fixture/i.test(`${w.name} ${w.id}`)) {
        continue
      }
      fillableTbd++
      findings.push({
        // MED: docks honesty_score; HARD block reserved for unbound/zero-dim
        // until early DB part-fit runs (Phase 5). Still a defect, not disclosure.
        severity: 'med',
        kind: 'fillable_tbd_critical_role',
        where: w.where,
        issue: `"${w.name}" is TBD while the ledger already carries resolvable scale/thermal facts — fillable-TBD is a defect, not disclosure`,
        evidence: `channel_count=${hasChannelAxis ? channelCount : 'n/a'}, dissipation_w=${dissW || 'n/a'}`,
      })
    }
  }

  // Honesty: all-critical-TBD → ≤2; each fillable TBD docks; closed → 10
  const critical = words.filter((w) => isCriticalRole(w.name, w.id)
    && !/fastener|foot[_\s-]?pad|legend|bezel|wire_harness|status_led|decoupling|cell[_\s-]?holder|holder[_\s-]?fixture/i.test(`${w.name} ${w.id}`))
  const criticalTbd = critical.filter((w) => isTbdPart(w.word)).length
  let honesty = 10
  if (critical.length > 0 && criticalTbd === critical.length) honesty = 2
  else if (fillableTbd > 0) honesty = Math.max(2, 10 - Math.min(8, fillableTbd))

  const highs = findings.filter((f) => f.severity === 'high')
  const verdict: 'pass' | 'fail' = highs.length === 0 ? 'pass' : 'fail'
  return {
    verdict,
    findings,
    ledger_complete: ledgerComplete,
    unbound_words: unbound,
    zero_dim_on_demand: zeroDim,
    fillable_tbd: fillableTbd,
    honesty_score: honesty,
    message: verdict === 'pass'
      ? `design-closure PASS (honesty=${honesty})`
      : `design-closure FAIL: ${highs.length} HIGH (${unbound} unbound, ${zeroDim} zero-dim, ${nonconserving} nonconserving, ${fillableTbd} fillable-TBD)`,
  }
}

/** Kinds that hard-block paint when enforcing. fillable_tbd docks honesty and
 *  stays in findings, but part-fit (Phase 5) clears it after DB fill — exiting
 *  on TBD alone would freeze the chain before the early fillBlank pass runs. */
const HARD_BLOCK_KINDS: ReadonlySet<DesignClosureKind> = new Set([
  'ledger_incomplete',
  'unbound_multiplicity',
  'zero_dim_on_demand',
  'nonconserving_demand_allocation',
])

export function evaluateDesignClosureEnforcement(
  result: DesignClosureResult,
  mode: 'off' | 'on',
): DesignClosureEnforcement {
  if (mode === 'off') {
    return { shouldExit: false, exitCode: DESIGN_CLOSURE_EXIT_CODE, reasons: [] }
  }
  const hard = result.findings.filter(
    (f) => f.severity === 'high' && HARD_BLOCK_KINDS.has(f.kind),
  )
  if (hard.length === 0) {
    return { shouldExit: false, exitCode: DESIGN_CLOSURE_EXIT_CODE, reasons: [] }
  }
  return {
    shouldExit: true,
    exitCode: DESIGN_CLOSURE_EXIT_CODE,
    reasons: hard.map((f) => `${f.kind}@${f.where}: ${f.issue}`),
  }
}

export function designClosureEnforceModeFromEnv(
  raw: string | undefined = process.env.DESIGN_CLOSURE_ENFORCING ?? process.env.CLOSURE_GATE_ENFORCING,
): 'off' | 'on' {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v || v === '0' || v === 'false' || v === 'off' || v === 'no' || v === 'shadow') return 'off'
  return 'on'
}

/** Deterministic honesty section input for scorecard-floor. */
export function buildClosureHonestyFromState(state: unknown): {
  score: number
  fillable_tbd: number
  defects: string[]
  advisory: false
} {
  const r = computeDesignClosure(state)
  return {
    score: r.honesty_score,
    fillable_tbd: r.fillable_tbd,
    defects: r.findings
      .filter((f) => f.kind === 'fillable_tbd_critical_role' || f.kind === 'unbound_multiplicity' || f.kind === 'zero_dim_on_demand')
      .slice(0, 12)
      .map((f) => f.issue),
    advisory: false,
  }
}

/** proveCatch + CLI selftest */
export function selftestDesignClosure(): number {
  let bad = 0

  // OPEN fixture — representative of DELIVERED cold-v5 disease words (bare names
  // at ×1), not only the synthetic `per_channel_*` forms the first proveCatch used.
  const bareTbd = (name: string, id: string) => ({
    name_human: name,
    content_character: { character_id: id },
    modifier_characters: [
      { kind: 'quantity', value: '×1' },
      { kind: 'part_number', value: 'TBD (detailed design)' },
    ],
  })
  const open = {
    orchestratorContract: {
      quantities: {
        channel_count: { value: 8, source: 'brief', family: 'dimensionless' },
        channel_max_dissipation_w: { value: 25, unit: 'W', family: 'power' },
        heatsink_fin_surface_area_m2: { value: 0.153, unit: 'm2', family: 'area' },
      },
    },
    moduleDecomposition: {
      modules: [
        {
          module: 'energy_conversion_transduction',
          sub_modules: [{
            words: [
              bareTbd('Per Channel Precision Afe', 'per_channel_precision_afe'),
              {
                name_human: 'Per Channel Power Heatsink',
                content_character: { character_id: 'per_channel_power_heatsink' },
                modifier_characters: [
                  { kind: 'quantity', value: '×1' },
                  { kind: 'dimension', value: '0 m² area' },
                  { kind: 'part_number', value: 'TBD (detailed design)' },
                ],
              },
              // Bare-named cold-v5 disease — Gate 40 MUST hard-block these.
              bareTbd('Charge Current Source', 'charge_current_source'),
              bareTbd('Discharge Load Mosfet', 'discharge_load_mosfet'),
              bareTbd('Current Shunt Measurement', 'current_shunt_measurement'),
              bareTbd('Cell Thermistor Input', 'cell_thermistor_input'),
              bareTbd('Over Under Voltage Comparator Latch', 'over_under_voltage_comparator_latch'),
              bareTbd('Overcurrent Comparator', 'overcurrent_comparator'),
              bareTbd('Overtemp Trip', 'overtemp_trip'),
              bareTbd('Reverse Polarity Detector', 'reverse_polarity_detector'),
              bareTbd('Channel Power Bus', 'channel_power_bus'),
            ],
          }],
        },
      ],
    },
  }
  const openR = computeDesignClosure(open)
  if (openR.verdict !== 'fail') {
    console.error('FAIL: open cold-v5-like fixture must FAIL', openR.message)
    bad++
  }
  for (const kind of ['unbound_multiplicity', 'zero_dim_on_demand', 'fillable_tbd_critical_role'] as const) {
    if (!openR.findings.some((f) => f.kind === kind)) {
      console.error(`FAIL: open fixture must fire ${kind}`, openR.findings.map((f) => f.kind))
      bad++
    }
  }
  if (openR.unbound_words < 5) {
    console.error(
      `FAIL: open fixture must flag ≥5 unbound bare/prefix channel roles (got ${openR.unbound_words})`,
      openR.findings.filter((f) => f.kind === 'unbound_multiplicity').map((f) => f.issue),
    )
    bad++
  }
  for (const must of ['Charge Current Source', 'Overtemp Trip', 'Reverse Polarity Detector']) {
    if (!openR.findings.some((f) => f.kind === 'unbound_multiplicity' && f.issue.includes(must))) {
      console.error(`FAIL: unbound_multiplicity must fire on bare role "${must}"`)
      bad++
    }
  }
  if (openR.findings.some((f) => f.kind === 'unbound_multiplicity' && /Channel Power Bus/i.test(f.issue))) {
    console.error('FAIL: Channel Power Bus must stay shared (×1), not unbound')
    bad++
  }
  if (openR.honesty_score > 3) {
    console.error(`FAIL: all-TBD open fixture honesty must be ≤3 (got ${openR.honesty_score})`)
    bad++
  }

  // CLOSED twin
  const closed = {
    orchestratorContract: {
      quantities: {
        channel_count: { value: 8, source: 'brief', family: 'dimensionless' },
        channel_max_dissipation_w: { value: 25, unit: 'W', family: 'power' },
        heatsink_fin_surface_area_m2: { value: 0.153, unit: 'm2', family: 'area' },
      },
    },
    moduleDecomposition: {
      modules: [
        {
          module: 'energy_conversion_transduction',
          sub_modules: [{
            words: [
              {
                name_human: 'Per Channel Precision Afe',
                content_character: { character_id: 'per_channel_precision_afe' },
                modifier_characters: [
                  { kind: 'quantity', value: '×8' },
                  { kind: 'part_number', value: 'AD7606BSTZ' },
                ],
              },
              {
                name_human: 'Per Channel Power Heatsink',
                content_character: { character_id: 'per_channel_power_heatsink' },
                modifier_characters: [
                  { kind: 'quantity', value: '×8' },
                  // Conserving: 8 × 25 W = aggregate 200 W (not 8 × full area/budget).
                  { kind: 'rating_primary', value: '25', unit: 'W' },
                  { kind: 'part_number', value: 'ATS-EXL51-300-R0' },
                ],
              },
              {
                name_human: 'Channel Power Bus',
                content_character: { character_id: 'channel_power_bus' },
                modifier_characters: [
                  { kind: 'quantity', value: '×1' },
                  { kind: 'part_number', value: 'BUSBAR-CU-8CH' },
                ],
              },
              {
                name_human: 'IEC C14 Fused Inlet',
                content_character: { character_id: 'iec_c14_fused_inlet' },
                modifier_characters: [
                  { kind: 'quantity', value: '×1' },
                  { kind: 'part_number', value: 'PX0580/63' },
                ],
              },
            ],
          }],
        },
      ],
    },
  }
  const closedR = computeDesignClosure(closed)
  if (closedR.verdict !== 'pass') {
    console.error('FAIL: closed twin must PASS', closedR.message, closedR.findings)
    bad++
  }
  if (closedR.honesty_score < 9) {
    console.error(`FAIL: closed twin honesty must be ≥9 (got ${closedR.honesty_score})`)
    bad++
  }

  // Shared bus must NOT be flagged unbound
  if (closedR.findings.some((f) => /Channel Power Bus/i.test(f.issue))) {
    console.error('FAIL: Channel Power Bus must not be treated as per-channel unbound')
    bad++
  }

  const enfOn = evaluateDesignClosureEnforcement(openR, 'on')
  const enfOff = evaluateDesignClosureEnforcement(openR, 'off')
  if (!enfOn.shouldExit || enfOn.exitCode !== 40 || enfOff.shouldExit) {
    console.error('FAIL: enforcement mode contract broken', { enfOn, enfOff })
    bad++
  }
  if (designClosureEnforceModeFromEnv('shadow') !== 'off' || designClosureEnforceModeFromEnv('1') !== 'on') {
    console.error('FAIL: designClosureEnforceModeFromEnv mapping broken')
    bad++
  }

  // proveCatch (cold-v13 disease): 8 × 200 W against aggregate 200 W MUST fire.
  const overAlloc = {
    orchestratorContract: {
      quantities: {
        channel_count: { value: 8, family: 'dimensionless' },
        aggregate_dissipation_w: { value: 200, unit: 'W', family: 'power' },
        max_simultaneous_dissipation_w: { value: 200, unit: 'W', family: 'power' },
      },
    },
    moduleDecomposition: {
      modules: [{
        module: 'energy_conversion_transduction',
        sub_modules: [{
          words: [
            {
              name_human: 'Per Channel Power Heatsink',
              content_character: { character_id: 'per_channel_power_heatsink' },
              modifier_characters: [
                { kind: 'quantity', value: '×8' },
                { kind: 'rating_primary', value: '200', unit: 'W' },
                { kind: 'part_number', value: 'TBD (detailed design)' },
              ],
            },
            {
              name_human: 'Finned Heatsink',
              content_character: { character_id: 'finned_heatsink' },
              modifier_characters: [
                { kind: 'quantity', value: '×1' },
                { kind: 'rating_primary', value: '200', unit: 'W' },
                { kind: 'part_number', value: 'TBD (detailed design)' },
              ],
            },
          ],
        }],
      }],
    },
  }
  const overR = computeDesignClosure(overAlloc)
  if (!overR.findings.some((f) => f.kind === 'nonconserving_demand_allocation')) {
    console.error('FAIL: 8×200 W + shared 200 W vs aggregate 200 W must fire nonconserving_demand_allocation', overR.findings)
    bad++
  }
  const overEnf = evaluateDesignClosureEnforcement(overR, 'on')
  if (!overEnf.shouldExit) {
    console.error('FAIL: nonconserving_demand_allocation must hard-block when enforcing')
    bad++
  }
  // Conserving twin: 8 × 25 W = 200 W budget — must NOT fire.
  const okAlloc = {
    orchestratorContract: {
      quantities: {
        channel_count: { value: 8, family: 'dimensionless' },
        aggregate_dissipation_w: { value: 200, unit: 'W', family: 'power' },
        channel_max_dissipation_w: { value: 25, unit: 'W', family: 'power' },
      },
    },
    moduleDecomposition: {
      modules: [{
        module: 'energy_conversion_transduction',
        sub_modules: [{
          words: [{
            name_human: 'Per Channel Power Heatsink',
            content_character: { character_id: 'per_channel_power_heatsink' },
            modifier_characters: [
              { kind: 'quantity', value: '×8' },
              { kind: 'rating_primary', value: '25', unit: 'W' },
              { kind: 'part_number', value: 'ATS-EXL51-300-R0' },
            ],
          }],
        }],
      }],
    },
  }
  const okR = computeDesignClosure(okAlloc)
  if (okR.findings.some((f) => f.kind === 'nonconserving_demand_allocation')) {
    console.error('FAIL: 8×25 W against 200 W aggregate must NOT fire nonconserving', okR.findings)
    bad++
  }

  if (bad === 0) console.error('[design-closure-gate] selftest OK')
  return bad
}

if (require.main === module) {
  const mode = process.argv[2]
  if (mode === '--selftest') {
    process.exit(selftestDesignClosure() === 0 ? 0 : 1)
  }
  console.error('Usage: design-closure-gate.ts --selftest')
  process.exit(2)
}

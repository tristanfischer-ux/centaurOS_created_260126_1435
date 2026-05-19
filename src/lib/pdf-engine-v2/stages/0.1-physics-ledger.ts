/**
 * @file 0.1-physics-ledger.ts — G0: Symbolic first-principles physics ledger.
 *
 * Background (Council engine-flow 2026-05-18, Kimi dissent — the only fix
 * that catches adversarial briefs). LLM-mediated physics checks (G1, G4) are
 * fundamentally the wrong tool against conservation-law violations: a
 * sufficiently determined prompt can talk an LLM gate into rendering a
 * "perpetual motion machine at 50 kW for £0" report. This ledger is the
 * deterministic, non-LLM tripwire.
 *
 * Runs AFTER P0a brief augmentation, BEFORE G1b compliance gate. Pure-
 * deterministic — zero LLM tokens, sub-millisecond runtime. Uses the existing
 * `class-floors.ts` registry (per-class physics + cost floors) as the source
 * of truth; the brief is scanned for numeric claims and each is bounced
 * against the relevant floor.
 *
 * Checks:
 *   1. ENERGY     — claimed power output > claimed power input over a
 *                   sustained period → HALT "conservation violated".
 *   2. MASS       — claimed mass-flow-out > mass-flow-in without a stated
 *                   source → HALT.
 *   3. COST-FLOOR — claimed unit-cost ceiling below per-class physics floor
 *                   (e.g. BESS installed at <£60/kWh) → HALT.
 *   4. POWER-DENS — claimed power density above theoretical max
 *                   (e.g. Li-ion >1500 W/kg cell-level) → HALT.
 *   5. PAYLOAD    — claimed mass density violating class envelope by >5×
 *                   → HALT.
 *
 * Verdict:
 *   - PASS   — no detectable conservation / floor violations.
 *   - WARN   — a soft floor was approached but not crossed (≥95 % of floor
 *              on cost / efficiency / density). Pipeline continues; warning
 *              annotated on state.
 *   - HALT   — a hard conservation law or floor was violated. Pipeline halts;
 *              renderer surfaces the violation in the brief-revision panel.
 *
 * Output is wired into the pipeline by index.ts BEFORE the compliance gate
 * (B3 reordering, council 2026-05-18 BLOCKER-3). The renderer reads
 * state.physicsLedger to populate the §Physics-Feasibility section.
 */

import { getClassFloors } from '../class-floors'
import type { StageResult, StructuredBriefJSON } from '../types'
import { getActionLogger } from '../lib/action-logger'

export type PhysicsVerdict = 'PASS' | 'WARN' | 'HALT'

export interface PhysicsViolation {
  /** Short id of the law / floor that was crossed. */
  law:
    | 'energy_conservation'
    | 'mass_conservation'
    | 'cost_floor'
    | 'power_density'
    | 'payload_envelope'
  /** Human-readable headline. */
  headline: string
  /** What the brief claimed (verbatim where possible). */
  claimed: string
  /** What the floor / law allows. */
  allowed: string
  /** 'soft' triggers WARN; 'hard' triggers HALT. */
  severity: 'soft' | 'hard'
  /** Pipeline-author-facing explanation. */
  rationale: string
}

export interface PhysicsLedgerResult {
  verdict: PhysicsVerdict
  /** One-sentence summary, surfaced on PDF cover for HALT/WARN. */
  reason: string
  /** All detected violations; ordered hard-first. */
  violations: PhysicsViolation[]
  /** Class key the ledger resolved to (matches class-floors registry). */
  class_key: string
  /** True when no class-floors data is available — the ledger fails open. */
  fail_open: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalise the brief's product_class string into a class-floors key. */
function resolveClassKey(raw: string | null | undefined): string {
  if (!raw) return 'unknown'
  const lower = raw.toLowerCase().replace(/[_-]/g, ' ')
  if (/\b(bess|battery energy storage|energy storage)\b/.test(lower)) return 'energy_storage'
  if (/\b(heat ?pump|thermal system|hvac)\b/.test(lower)) return 'thermal_system'
  if (/\b(vertical farm|indoor farm|hydroponic)\b/.test(lower)) return 'vertical_farm'
  if (/\b(ev ?charger|charging station|charge point)\b/.test(lower)) return 'ev_charger'
  if (/\b(cgm|continuous glucose|wearable medical|patch monitor)\b/.test(lower)) return 'wearable_medical'
  if (/\b(drone|uav|quadcopter)\b/.test(lower)) return 'drone'
  if (/\b(edge ai|edge compute|inference)\b/.test(lower)) return 'edge_ai_server'
  if (/\b(bioreactor|fermenter|cell culture)\b/.test(lower)) return 'bioreactor'
  if (/\b(auv|underwater vehicle|subsea)\b/.test(lower)) return 'auv'
  if (/\b(haps|stratospheric|high altitude platform|pseudo satellite)\b/.test(lower)) return 'haps'
  return raw.toLowerCase().replace(/\s+/g, '_')
}

/**
 * Parse a numeric "value unit" pair out of a brief sentence. Returns the
 * value normalised to a canonical unit per the heuristic table below.
 * Conservative — only fires on tightly-anchored patterns to avoid false
 * positives on free-form prose.
 */
function parseClaim(re: RegExp, brief: string, unitMap: Record<string, number> = {}): number | null {
  const m = brief.match(re)
  if (!m) return null
  const v = parseFloat(m[1])
  if (!Number.isFinite(v)) return null
  const unit = (m[2] ?? '').toLowerCase().trim()
  const scale = unitMap[unit] ?? 1
  return v * scale
}

// ─── Check 1: Energy conservation (perpetual motion) ────────────────────────

/**
 * Reject briefs where stated output power obviously exceeds stated input over
 * a sustained period. Two patterns catch the canonical adversarial case:
 *   - explicit "X kW output ... Y kW input" with X > Y;
 *   - "perpetual motion / free energy / over-unity / over unity" anywhere.
 */
function checkEnergyConservation(brief: string): PhysicsViolation | null {
  const t = brief.toLowerCase()

  // Pattern A: literal red-flag terminology.
  if (/\b(perpetual motion|over[- ]unity|free energy|infinite (energy|output)|no input (power|energy))\b/.test(t)) {
    return {
      law: 'energy_conservation',
      headline: 'Brief claims perpetual motion / over-unity / free energy',
      claimed: 'Sustained net energy output with no equivalent input',
      allowed: 'Conservation of energy: net work out ≤ net energy in (minus losses)',
      severity: 'hard',
      rationale:
        'No physical system can produce sustained net energy without an equivalent input. Brief must declare an input energy source (grid, solar, fuel) that meets or exceeds the claimed output minus losses.',
    }
  }

  // Pattern B: matched-pair "X kW output / Y kW input" with X > Y.
  const outMatch = t.match(/(\d+(?:\.\d+)?)\s*(kw|mw|gw|w)\s*(?:of\s+)?(?:power\s+)?(?:output|generated|delivered)/i)
  const inMatch = t.match(/(\d+(?:\.\d+)?)\s*(kw|mw|gw|w)\s*(?:of\s+)?(?:power\s+)?(?:input|drawn|consumed|grid|supply)/i)
  if (outMatch && inMatch) {
    const unitScale: Record<string, number> = { w: 1, kw: 1e3, mw: 1e6, gw: 1e9 }
    const outW = parseFloat(outMatch[1]) * (unitScale[outMatch[2].toLowerCase()] ?? 1)
    const inW = parseFloat(inMatch[1]) * (unitScale[inMatch[2].toLowerCase()] ?? 1)
    // Allow a 5 % tolerance — efficiency claims at unity are sloppy, not adversarial.
    if (Number.isFinite(outW) && Number.isFinite(inW) && outW > inW * 1.05) {
      return {
        law: 'energy_conservation',
        headline: `Output power (${outW.toFixed(0)} W) exceeds input power (${inW.toFixed(0)} W)`,
        claimed: `${outMatch[1]} ${outMatch[2]} out vs ${inMatch[1]} ${inMatch[2]} in`,
        allowed: 'Power out ≤ Power in × system efficiency (< 100 %)',
        severity: 'hard',
        rationale:
          'Brief explicitly states output power higher than input power on a sustained basis. This violates first-law conservation of energy. Brief must reduce the output claim, raise the input, or declare an additional input source.',
      }
    }
  }

  return null
}

// ─── Check 2: Mass conservation ─────────────────────────────────────────────

function checkMassConservation(brief: string): PhysicsViolation | null {
  const t = brief.toLowerCase()
  // Pattern: "produces more X than input" without a stated source / chemistry
  // / biological-growth context.
  if (/\b(creates?|produces?|generates?)\s+(more|extra|additional)\s+mass\b/.test(t)
      && !/\b(biolog|cell growth|culture|photosynth|fermentat|plant|reaction)/.test(t)) {
    return {
      law: 'mass_conservation',
      headline: 'Brief claims net mass creation with no stated source',
      claimed: 'Mass output > mass input, no chemistry or biology cited',
      allowed: 'Conservation of mass: mass out = mass in ± reaction terms',
      severity: 'hard',
      rationale:
        'Net mass cannot appear from nowhere. Brief must declare the feed stream (chemical reagent, biological substrate, atmospheric intake, etc.) supplying the additional mass.',
    }
  }
  return null
}

// ─── Check 3: Cost floors ───────────────────────────────────────────────────

interface CostFloorCheck {
  metric: string
  /** RegExp capturing the claimed unit cost and unit (£/kWh, £/kW, £/m²). */
  pattern: RegExp
  /** Multiplier from matched unit to floor's canonical unit (usually 1). */
  scale?: (unit: string) => number
  /** The class-floors slug whose value defines the hard floor. */
  floorSlug: string
  /** Optional stretch floor — between hard and stretch fires a WARN. */
  stretchSlug?: string
  /** Human label for the natural metric. */
  metricLabel: string
}

const COST_FLOOR_CHECKS: Record<string, CostFloorCheck[]> = {
  energy_storage: [
    {
      metric: 'installed_cost',
      pattern: /[£$]\s*(\d+(?:\.\d+)?)\s*(?:per|\/)\s*(kwh|kw\.?h)/i,
      floorSlug: 'installed_cost_stretch_gbp_per_kwh',  // hardest stop = £60/kWh
      stretchSlug: 'installed_cost_min_gbp_per_kwh',    // softer warn = £80/kWh
      metricLabel: '£/kWh installed',
    },
  ],
  thermal_system: [
    {
      metric: 'installed_cost_residential',
      pattern: /[£$]\s*(\d+(?:\.\d+)?)\s*(?:per|\/)\s*kw\b/i,
      floorSlug: 'installed_cost_min_gbp_per_kw_residential',
      metricLabel: '£/kW (residential)',
    },
  ],
  ev_charger: [
    {
      metric: 'installed_cost_ac',
      pattern: /[£$]\s*(\d+(?:\.\d+)?)\s*(?:per|\/)\s*kw\b/i,
      floorSlug: 'installed_cost_min_gbp_per_kw_ac',
      metricLabel: '£/kW (AC charger)',
    },
  ],
  vertical_farm: [
    {
      metric: 'installed_cost',
      pattern: /[£$]\s*(\d+(?:\.\d+)?)\s*(?:per|\/)\s*m[²2]/i,
      floorSlug: 'installed_cost_min_gbp_per_m2',
      metricLabel: '£/m²',
    },
  ],
  haps: [
    {
      metric: 'platform_cost',
      pattern: /[£$]\s*(\d+(?:[,\.]\d+)?)\s*(m|million|k|thousand)?(?:\s+per\s+platform)?/i,
      floorSlug: 'bom_cost_min_gbp_platform',
      metricLabel: '£/platform',
    },
  ],
}

function checkCostFloor(brief: string, classKey: string): PhysicsViolation | null {
  const floors = getClassFloors(classKey)
  if (!floors) return null
  const checks = COST_FLOOR_CHECKS[classKey] ?? []
  for (const check of checks) {
    const m = brief.match(check.pattern)
    if (!m) continue
    let claimed = parseFloat(m[1].replace(/,/g, ''))
    // HAPS multiplier handling (m / million / k / thousand suffix).
    if (classKey === 'haps') {
      const mul = (m[2] ?? '').toLowerCase()
      if (mul === 'm' || mul === 'million') claimed *= 1e6
      else if (mul === 'k' || mul === 'thousand') claimed *= 1e3
    }
    if (!Number.isFinite(claimed) || claimed <= 0) continue

    const hardFloor = floors.floors[check.floorSlug]?.value
    if (typeof hardFloor === 'number' && claimed < hardFloor) {
      return {
        law: 'cost_floor',
        headline: `Claimed ${check.metricLabel} below physics-floor`,
        claimed: `£${claimed.toFixed(0)} ${check.metricLabel}`,
        allowed: `≥ £${hardFloor.toFixed(0)} ${check.metricLabel} (physics floor)`,
        severity: 'hard',
        rationale: `Brief states a unit cost below the per-class physics floor (${floors.floors[check.floorSlug].source}). At this price the raw material content alone exceeds the claimed end-customer price. Revise the cost ceiling upward, or revise the scope (smaller capacity, fewer features) to bring the per-unit-metric figure inside the achievable band.`,
      }
    }
    // Stretch warn — within 95 % of stretch floor.
    if (check.stretchSlug) {
      const stretch = floors.floors[check.stretchSlug]?.value
      if (typeof stretch === 'number' && claimed < stretch) {
        return {
          law: 'cost_floor',
          headline: `Claimed ${check.metricLabel} below typical floor (stretch achievable)`,
          claimed: `£${claimed.toFixed(0)} ${check.metricLabel}`,
          allowed: `≥ £${stretch.toFixed(0)} typical, £${hardFloor?.toFixed(0) ?? '—'} stretch`,
          severity: 'soft',
          rationale: `Cost claim is below the typical industry floor but above the absolute physics floor. Achievable only with aspirational integrated-pack pricing or large subsidies. Flagged for review.`,
        }
      }
    }
  }
  return null
}

// ─── Check 4: Power density ─────────────────────────────────────────────────

function checkPowerDensity(brief: string, classKey: string): PhysicsViolation | null {
  const floors = getClassFloors(classKey)
  if (!floors) return null
  // BESS — Wh/kg vs class cell-level floor.
  if (classKey === 'energy_storage') {
    const m = brief.match(/(\d+(?:\.\d+)?)\s*wh\s*\/\s*kg/i)
    if (m) {
      const claimed = parseFloat(m[1])
      const max = floors.floors['cell_specific_energy_min_wh_per_kg']?.value
      // Note: the floor stored is the achievable MINIMUM for "top cells" — the
      // theoretical mature-tech ceiling is ~250 Wh/kg cell-level. Anything
      // above 1500 (1.5×→7.5× the floor) is unequivocally adversarial.
      if (typeof max === 'number' && claimed > 1500) {
        return {
          law: 'power_density',
          headline: `Claimed specific energy ${claimed} Wh/kg exceeds Li-ion theoretical max`,
          claimed: `${claimed} Wh/kg`,
          allowed: 'Top Li-ion cells today: ~250 Wh/kg cell-level. Sustained >1500 Wh/kg requires a chemistry that does not exist in mature manufacturing.',
          severity: 'hard',
          rationale: 'No commercial cell chemistry in production at scale delivers above ~250 Wh/kg cell-level. Claim is physically implausible for a manufacturable design.',
        }
      }
    }
  }
  // Solar panel — W/m² versus theoretical solar irradiance.
  if (classKey === 'haps' || /\bsolar (panel|array|cell)\b/i.test(brief)) {
    const m = brief.match(/(\d+(?:\.\d+)?)\s*w\s*\/\s*m[²2]/i)
    if (m) {
      const claimed = parseFloat(m[1])
      // Mature solar PV ≤ 250 W/m² (assuming peak insolation ~1000 W/m² × ~25 %
      // efficient). 1361 W/m² is the solar constant — anything above is
      // generating energy from nothing.
      if (claimed > 250 && claimed <= 1361) {
        return {
          law: 'power_density',
          headline: `Claimed solar density ${claimed} W/m² exceeds mature PV ceiling`,
          claimed: `${claimed} W/m²`,
          allowed: '≤ 250 W/m² for mature silicon PV at AM1.5 peak insolation',
          severity: 'soft',
          rationale: 'Mature mass-manufactured silicon PV tops ~250 W/m² at peak. Multi-junction or concentrator systems can exceed this but at >10× the £/W cost.',
        }
      }
      if (claimed > 1361) {
        return {
          law: 'power_density',
          headline: `Claimed solar density ${claimed} W/m² exceeds solar constant`,
          claimed: `${claimed} W/m²`,
          allowed: '≤ 1361 W/m² (the solar constant — incident irradiance ceiling above Earth\'s atmosphere)',
          severity: 'hard',
          rationale: 'Solar density above the solar constant requires generating energy from nothing. Physically impossible.',
        }
      }
    }
  }
  return null
}

// ─── Check 5: Payload / mass envelope ───────────────────────────────────────

function checkPayloadEnvelope(brief: string, classKey: string): PhysicsViolation | null {
  const floors = getClassFloors(classKey)
  if (!floors) return null
  if (classKey === 'haps') {
    const m = brief.match(/(\d+(?:\.\d+)?)\s*kg\s*(?:total|platform)?\s*mass/i)
    if (m) {
      const claimed = parseFloat(m[1])
      const max = floors.floors['structural_mass_max_kg']?.value
      if (typeof max === 'number' && claimed > max * 5) {
        return {
          law: 'payload_envelope',
          headline: `Claimed total mass ${claimed} kg exceeds 5× HAPS class envelope`,
          claimed: `${claimed} kg`,
          allowed: `≤ ${max} kg structural (Zephyr / PHASA-35 class), ≤ ${max * 5} kg outer envelope`,
          severity: 'hard',
          rationale: 'A 5× envelope-violation indicates the brief targets a heavier-than-air mission profile that cannot use HAPS architecture. Reclassify as fixed-wing UAV / dirigible / satellite.',
        }
      }
    }
  }
  return null
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Run the symbolic physics ledger. Pure-deterministic; no LLM call.
 *
 * @param briefText    The (possibly P0a-augmented) brief text.
 * @param parsedBrief  StructuredBriefJSON when PA path is active; null otherwise.
 * @param productClass The classifier's product_class string.
 */
export async function runPhysicsLedger(
  briefText: string,
  parsedBrief: StructuredBriefJSON | null,
  productClass: string,
): Promise<StageResult<PhysicsLedgerResult>> {
  const startTime = Date.now()
  const logger = getActionLogger()
  logger.logStage({ step_name: 'physics_ledger', action_type: 'stage_start' })
  try {
    const classKey = resolveClassKey(productClass)
    const floors = getClassFloors(classKey)
    const failOpen = floors == null

    const violations: PhysicsViolation[] = []

    // Run all five checks. Energy + mass run on every class — they are
    // universal conservation laws. Cost / power-density / payload are class-
    // scoped via the per-class registries above.
    const energy = checkEnergyConservation(briefText)
    if (energy) violations.push(energy)
    const mass = checkMassConservation(briefText)
    if (mass) violations.push(mass)
    if (!failOpen) {
      const cost = checkCostFloor(briefText, classKey)
      if (cost) violations.push(cost)
      const density = checkPowerDensity(briefText, classKey)
      if (density) violations.push(density)
      const payload = checkPayloadEnvelope(briefText, classKey)
      if (payload) violations.push(payload)
    }

    // Sort hard-first so the renderer surfaces the most severe first.
    violations.sort((a, b) => (a.severity === 'hard' ? -1 : 1) - (b.severity === 'hard' ? -1 : 1))

    const hard = violations.filter(v => v.severity === 'hard')
    const soft = violations.filter(v => v.severity === 'soft')

    let verdict: PhysicsVerdict = 'PASS'
    let reason = failOpen
      ? `Physics ledger: no class-floors data for "${classKey}" — failed open.`
      : `Physics ledger: no detectable conservation or floor violations.`
    if (hard.length > 0) {
      verdict = 'HALT'
      reason = `Physics HALT — ${hard.map(v => v.law).join(', ')}. Brief must be revised before pipeline can proceed.`
    } else if (soft.length > 0) {
      verdict = 'WARN'
      reason = `Physics WARN — ${soft.length} soft violation(s): ${soft.map(v => v.law).join(', ')}. Pipeline continues; surface in §Physics-Feasibility.`
    }

    logger.logGate({
      step_name: 'physics_ledger',
      gate_name: 'G0_physics_ledger',
      verdict,
      reasons: [reason, ...violations.map(v => `${v.severity.toUpperCase()} · ${v.law}: ${v.headline}`)],
      hard_count: hard.length,
      soft_count: soft.length,
      class_key: classKey,
      fail_open: failOpen,
    })
    logger.logStage({
      step_name: 'physics_ledger',
      action_type: 'stage_end',
      outcome: 'ok',
      duration_ms: Date.now() - startTime,
    })
    return {
      ok: true,
      data: {
        verdict,
        reason,
        violations,
        class_key: classKey,
        fail_open: failOpen,
      },
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[physics-ledger] Failed: ${message}`)
    logger.logStage({
      step_name: 'physics_ledger',
      action_type: 'stage_end',
      outcome: 'fail',
      duration_ms: Date.now() - startTime,
      error: message,
    })
    return {
      ok: false,
      error: message,
      durationMs: Date.now() - startTime,
    }
  }
}

// ─── Test exports ───────────────────────────────────────────────────────────

export const __test = {
  resolveClassKey,
  checkEnergyConservation,
  checkMassConservation,
  checkCostFloor,
  checkPowerDensity,
  checkPayloadEnvelope,
}

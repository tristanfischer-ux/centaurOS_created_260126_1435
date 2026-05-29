/**
 * mass-consistency-audit.ts — Phase B3 of the deterministic-generation plan.
 *
 * The design council (2026-05-28, Gemini 3.1 Pro + GLM-5.1) asked for a
 * mass-reconciliation gate: the canonical system mass must reconcile, not just
 * be single-sourced into the render. Per-part mass is NOT carried on BoM words
 * (the emitter records mass only in the engineering contract's `quantities`),
 * so the reconciliation is at the CONTRACT level: the mass quantities must be
 * mutually consistent (e.g. system-with-external = in-container + external
 * transformer; per-container × container-count = in-container). A divergence
 * means two different "system mass" numbers exist in the contract and the
 * renderer could surface either — the exact bug Phase B set out to kill.
 *
 * Universal: only checks the relationships whose operands are present; classes
 * without external transformers / multi-container splits simply skip those.
 */

export interface MassConsistencyViolation {
  relationship: string
  expected: number
  actual: number
  abs_gap_kg: number
  tolerance_kg: number
}

export interface MassConsistencyResult {
  passed: boolean
  checks_run: number
  violations: MassConsistencyViolation[]
}

function num(q: Record<string, unknown>, key: string): number | null {
  const v = q?.[key]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Tolerance: 0.5% of the larger operand, floor 1 kg (rounding/format slack). */
function tol(...vals: number[]): number {
  return Math.max(1, 0.005 * Math.max(...vals.map((v) => Math.abs(v))))
}

export function runMassConsistencyAudit(quantities: Record<string, unknown> | null | undefined): MassConsistencyResult {
  const q = quantities ?? {}
  const violations: MassConsistencyViolation[] = []
  let checks = 0

  const inContainer = num(q, 'in_container_mass_kg')
  const withExternal = num(q, 'system_mass_with_external_kg')
  const externalTx = num(q, 'external_transformer_mass_kg') ?? num(q, 'transformer_mass_kg')
  const totalSystem = num(q, 'total_system_mass_kg')
  const perContainer = num(q, 'per_container_mass_kg')
  const containerCount = num(q, 'container_count') ?? num(q, 'recommended_container_count')

  // (1) system-with-external = in-container + external transformer
  if (inContainer != null && withExternal != null && externalTx != null) {
    checks++
    const expected = inContainer + externalTx
    const gap = Math.abs(withExternal - expected)
    const t = tol(withExternal, expected)
    if (gap > t) violations.push({ relationship: 'system_mass_with_external_kg == in_container_mass_kg + external_transformer_mass_kg', expected, actual: withExternal, abs_gap_kg: round(gap), tolerance_kg: round(t) })
  }

  // (2) total_system_mass_kg must equal whichever system total exists
  if (totalSystem != null) {
    const ref = withExternal ?? inContainer
    if (ref != null) {
      checks++
      const gap = Math.abs(totalSystem - ref)
      const t = tol(totalSystem, ref)
      if (gap > t) violations.push({ relationship: 'total_system_mass_kg == system_mass_with_external_kg (or in_container_mass_kg)', expected: ref, actual: totalSystem, abs_gap_kg: round(gap), tolerance_kg: round(t) })
    }
  }

  // (3) per-container × container-count = in-container mass
  if (perContainer != null && containerCount != null && inContainer != null && containerCount >= 1) {
    checks++
    const expected = perContainer * containerCount
    const gap = Math.abs(inContainer - expected)
    const t = tol(inContainer, expected)
    if (gap > t) violations.push({ relationship: 'per_container_mass_kg × container_count == in_container_mass_kg', expected, actual: inContainer, abs_gap_kg: round(gap), tolerance_kg: round(t) })
  }

  return { passed: violations.length === 0, checks_run: checks, violations }
}

function round(n: number): number { return Math.round(n * 100) / 100 }

/**
 * F1f Layer 0 — the DESIGN SCALE TIER, pinned once from brief PHYSICS (2026-07-20).
 *
 * The recurring class-drift failure (Tristan's "heater" example): the classifier gets the
 * product roughly right (a benchtop bioreactor), then downstream stages RE-IDENTIFY the design
 * from shared NOUNS — "heater" retrieves a fish-farm tank heater, "vessel" a 3 m³ process tank,
 * "cartridge" a pressure-vessel filter — and the dossier ends up a desktop product with big
 * plant leftovers. Nouns are overloaded; ENVELOPE + POWER + WORKING VOLUME + form factor are
 * not. This module pins the physical scale tier ONCE, from those signals, so every retrieval /
 * tool pick / word-expand can gate on the pinned identity instead of re-inferring from a noun.
 *
 * UNIVERSAL — no product class named. The SAME signal family as `isWattScaleInstrument`
 * (universal-contract-sizing.ts) and `isDeviceScaleProduct` (enrich-state-with-reference-anchor.ts):
 * this is the single SOURCE those should eventually delegate to. Pure + deterministic.
 */

export type DesignScaleTier =
  | 'handheld'   // hand-held: max edge ≤ ~155 mm AND sub-0.02 m³
  | 'benchtop'   // lab instrument / kit: sub-1 m³ AND low power / small working volume
  | 'cabinet'    // rack/cabinet, still site-power LV (sub-plant, but not a lab device)
  | 'plant'      // process plant / building / multi-m³ / kW–MW
  | 'field'      // erected outdoors / farm / civil footprint
  | 'unknown'    // insufficient signal to pin (never fabricate a tier)

export interface ScaleSignals {
  enclosure_volume_m3?: number | null
  max_edge_mm?: number | null
  peak_electrical_power_w?: number | null
  connected_electrical_load_kw?: number | null
  working_volume_ml?: number | null
}

/** A finite positive number, or undefined. */
function pos(x: number | null | undefined): number | undefined {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Pin the design scale tier from brief physics. Rules of thumb (encoded + selftested, NOT a
 * per-class table):
 *   • enclosure < 1 m³ AND (peak ≤ 120 W OR load ≤ 0.12 kW OR working volume ≤ 500 mL)
 *       → benchtop  (→ handheld when the largest edge ≤ 155 mm)
 *   • enclosure ≥ ~2 m³, OR connected load ≥ 15 kW, OR (no device signal but a large edge)
 *       → plant / field
 *   • an in-between sealed unit (sub-plant, but not a lab device) → cabinet
 *   • no usable signal → unknown (the caller must not force a tier)
 * scale_tier is AUTHORITATIVE — a classifier slug may SUGGEST a domain, but a "heater" noun
 * must never move this tier.
 */
export function deriveDesignScaleTier(s: ScaleSignals): DesignScaleTier {
  const vol = pos(s.enclosure_volume_m3)
  const edge = pos(s.max_edge_mm)
  const powW = pos(s.peak_electrical_power_w)
  const loadKw = pos(s.connected_electrical_load_kw)
  const volMl = pos(s.working_volume_ml)

  // ---- PLANT / FIELD: unambiguous large-scale signals win first. ----
  if ((vol !== undefined && vol >= 2)
      || (loadKw !== undefined && loadKw >= 15)
      || (powW !== undefined && powW >= 3000)) {
    // a civil/outdoor footprint reads as field; otherwise process plant.
    if ((vol !== undefined && vol >= 30) || (edge !== undefined && edge >= 6000)) return 'field'
    return 'plant'
  }

  // ---- DEVICE: sub-1 m³ enclosure AND a low-power / small-volume signal. ----
  const deviceLowDuty =
    (powW !== undefined && powW <= 120)
    || (loadKw !== undefined && loadKw <= 0.12)
    || (volMl !== undefined && volMl <= 500)
  if (vol !== undefined && vol < 1 && deviceLowDuty) {
    if (edge !== undefined && edge <= 155) return 'handheld'
    return 'benchtop'
  }
  // A device-duty signal WITHOUT an enclosure figure (envelope not yet computed) still pins a
  // device tier — the low duty / small working volume is itself decisive (a 20 mL / 35 W thing
  // is never a plant, whatever its noun says).
  if (vol === undefined && deviceLowDuty
      && ((powW !== undefined && powW <= 120) || (volMl !== undefined && volMl <= 500))) {
    if (edge !== undefined && edge <= 155) return 'handheld'
    return 'benchtop'
  }

  // ---- CABINET: a sub-plant sealed unit that is neither a lab device nor plant. ----
  if (vol !== undefined && vol < 2) return 'cabinet'

  return 'unknown'
}

/** Tiers compatible with a locked tier for retrieval/tool gating (a benchtop may borrow
 *  handheld micro-parts; a plant may borrow field kit) — used by Layer 1's hard veto. */
export function compatibleTiers(tier: DesignScaleTier): DesignScaleTier[] {
  switch (tier) {
    case 'handheld': return ['handheld', 'benchtop']
    case 'benchtop': return ['handheld', 'benchtop']
    case 'cabinet': return ['benchtop', 'cabinet']
    case 'plant': return ['cabinet', 'plant', 'field']
    case 'field': return ['plant', 'field']
    default: return ['handheld', 'benchtop', 'cabinet', 'plant', 'field']
  }
}

/** Extract the scale signals from wherever the chain stashed them (shared_quantities on either
 *  contract, module derived_parameters, brief target-performance metrics, max_dimensions_mm). */
export function scaleSignalsFromState(state: any): ScaleSignals {
  const asNum = (x: any): number | undefined => {
    const n = typeof x === 'object' && x != null ? Number(x.value) : Number(x)
    return Number.isFinite(n) ? n : undefined
  }
  const q = (key: string): number | undefined => {
    const cands = [
      state?.engineeringContract?.shared_quantities?.[key],
      state?.orchestratorContract?.shared_quantities?.[key],
      state?.orchestratorContract?.quantities?.[key],
      state?.wordDomainCoherence?.[key],
    ]
    for (const c of cands) { const n = asNum(c); if (n !== undefined) return n }
    for (const m of (state?.moduleDecomposition?.modules ?? [])) {
      const n = asNum(m?.derived_parameters?.[key]); if (n !== undefined) return n
    }
    return undefined
  }
  // working volume: contract first, else the brief's target_performance metric.
  let workingMl = q('working_volume_ml')
  if (workingMl === undefined) {
    const metrics = state?.parsedBrief?.constraints?.target_performance?.metrics ?? []
    for (const m of metrics) {
      if (String(m?.key_metric ?? '').toLowerCase() === 'working_volume_ml') { workingMl = asNum(m?.value); break }
    }
  }
  // max edge from the brief's max_dimensions_mm (any of L/W/H), if stated.
  let maxEdge: number | undefined
  const md = state?.parsedBrief?.constraints?.max_dimensions_mm
  if (md && typeof md === 'object') {
    const edges = ['length_mm', 'width_mm', 'height_mm', 'l', 'w', 'h', 'length', 'width', 'height']
      .map((k) => asNum((md as any)[k])).filter((n): n is number => n !== undefined)
    if (edges.length) maxEdge = Math.max(...edges)
  }
  return {
    enclosure_volume_m3: q('enclosure_volume_m3') ?? null,
    max_edge_mm: maxEdge ?? null,
    peak_electrical_power_w: q('peak_electrical_power_w') ?? null,
    connected_electrical_load_kw: q('connected_electrical_load_kw') ?? null,
    working_volume_ml: workingMl ?? null,
  }
}

export interface DesignIdentity {
  product_class: string
  scale_tier: DesignScaleTier
  compatible_tiers: DesignScaleTier[]
  signals: ScaleSignals
  identity_locked: true
  basis: string
}

/** Build the immutable design-identity pin for `state.designIdentity` (F1f Layer 0). */
export function buildDesignIdentity(state: any): DesignIdentity {
  const signals = scaleSignalsFromState(state)
  const tier = deriveDesignScaleTier(signals)
  const product_class = String(
    state?.moduleDecomposition?.product_class
    ?? state?.orchestratorContract?.product_class
    ?? state?.parsedBrief?.product_class
    ?? state?.keyMetrics?.product_class ?? '')
  const basisBits: string[] = []
  if (signals.enclosure_volume_m3) basisBits.push(`enclosure ${signals.enclosure_volume_m3} m³`)
  if (signals.peak_electrical_power_w) basisBits.push(`${signals.peak_electrical_power_w} W`)
  if (signals.connected_electrical_load_kw) basisBits.push(`${signals.connected_electrical_load_kw} kW`)
  if (signals.working_volume_ml) basisBits.push(`${signals.working_volume_ml} mL working vol`)
  if (signals.max_edge_mm) basisBits.push(`${signals.max_edge_mm} mm max edge`)
  return {
    product_class,
    scale_tier: tier,
    compatible_tiers: compatibleTiers(tier),
    signals,
    identity_locked: true,
    basis: basisBits.length
      ? `scale_tier=${tier} from ${basisBits.join(', ')} (physics, not part nouns)`
      : `scale_tier=${tier} — no physical scale signal in the brief`,
  }
}

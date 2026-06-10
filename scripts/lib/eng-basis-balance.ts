/**
 * scripts/lib/eng-basis-balance.ts
 *
 * PHASE 4.1 — UNIVERSAL mass & energy balance selector for the Engineering Basis
 * page (Part 1, Block 2). The page previously hard-coded a 13-key CO2-
 * mineralisation list, so the balance table rendered BLANK for every other
 * archetype. This selector derives the balance straight from the contract's own
 * `orchestratorContract.quantities` — the same universal pattern as the gate-17
 * Brief Compliance table (auto-render whatever exists; never fabricate).
 *
 * What belongs in a mass & energy balance:
 *   • mass/volume FLOWS (feeds, products, internal streams)  → the MASS balance
 *   • thermal DUTIES + electrical POWER + ENERGY             → the ENERGY balance
 *   • the headline EFFICIENCY / recovery / conversion        → ties the two
 * What does NOT (and is excluded): dimensions, counts, voltages, currents,
 * pressures, temperatures, areas, torques, thrust — those are spec-sheet items.
 *
 * Pure + dependency-injected (`humanise` passed in) so it is unit-testable with
 * no react-pdf import. British spelling throughout.
 */

export type BalanceRole = 'input' | 'output' | 'flow' | 'duty' | 'power' | 'energy' | 'efficiency'

/** Render order: feeds, then products, then internal streams, then the energy
 *  terms, then the intensive efficiency that reconciles them. */
const ROLE_ORDER: readonly BalanceRole[] = ['input', 'output', 'flow', 'duty', 'power', 'energy', 'efficiency']

/** Trailing key tokens that encode the UNIT (shown in its own column) — popped
 *  off the key before humanising so the label doesn't repeat the unit. */
const UNIT_TOKENS = new Set([
  'kw', 'mw', 'w', 'kwh', 'mwh', 'wh', 'gj', 'mj',
  'kg', 'g', 't', 'm3', 'nm3', 'l', 'lpm',
  'pct', 'percent', 'frac', 'ratio',
  'hour', 'hr', 'h', 'day', 'yr', 'year', 's', 'sec', 'min', 'per',
])

/**
 * Classify a quantity into a mass/energy-balance ROLE from its unit + key, or
 * null when it is not a balance term. Conservative: anything that isn't clearly
 * a flow / duty / power / energy / efficiency is excluded (so voltages, currents,
 * pressures, dimensions, counts, temperatures and areas never leak in).
 */
export function classifyBalanceRole(key: string, unit: string): BalanceRole | null {
  const k = String(key ?? '').toLowerCase()
  const u = String(unit ?? '').toLowerCase().trim()

  // 0. INTENSITIES (per-area / per-energy / per-watt) and DATA rates are NOT
  //    absolute balance terms — they are normalised or non-stream metrics: W/m²
  //    irradiance, kg/m²/yr yield density, µmol/m²/s PPFD, tps/W, Gb/s. Excluded
  //    up front so they never crowd out the real flows/duties (real-data finding,
  //    satellite/HAPS contracts: velocities + irradiances were leaking in).
  if (/\/\s*m2|\/\s*m²|\bw\/m|µmol\/m|umol\/m|per[_\s]?m2|per[_\s]?m²|tps\/|\/\s*w\b|\/\s*kwh?\b|\/\s*mj\b/.test(u)) return null
  //    …and key-encoded intensities when the unit is blank (kgCO2/kWh, g/kWh,
  //    kg/m², per-kWh — the `_kwh` suffix would otherwise read as an energy term).
  if (/_kg_?m2$|_w_?m2$|_per_m2$|_kgco2e?_kwh$|_gco2e?_kwh$|_co2_kwh$|_per_kwh$|_kwh_per_kg$|_g_kwh$|intensity/.test(k)) return null

  const isFracUnit = /(^|[^a-z])(%|pct|percent|frac|ratio|dimensionless|cop|pue)([^a-z]|$)/.test(u) || /_pct$|_frac$|_ratio$|_cop$|_pue$|_efficiency$/.test(k)
  // 1. efficiency / recovery / conversion — the intensive headline of the balance
  if (isFracUnit && /efficien|recovery|conversion|capture|yield|purity|selectiv|utilis|utiliz|\bcop\b|cop$|\bpue\b|pue$/.test(k)) return 'efficiency'
  // 2. energy (kWh-family)
  if (/(^|[^a-z])(kwh|mwh|gwh|wh|gj|mj|kj)([^a-z]|$)/.test(u) || /_kwh$|_mwh$|_wh$/.test(k)) return 'energy'
  // 3. mass / volume FLOW — the NUMERATOR must be a mass or volume over time, NOT
  //    a length (m/s, km/yr are velocities → excluded). The mass balance.
  const isMassVolRate = /(kg|g|t|tonnes?|m3|m³|nm3|nm³|sm3|l|ml|kmol|mol|bbl)\s*\/\s*(s|sec|min|h|hr|hour|day|d|wk|week|yr|year|a)\b/.test(u) || /\blpm\b|\bgpm\b/.test(u)
  const isMassVolKey = u === '' && /(kg|t|m3|nm3|l)_per_(hour|h|day|yr|year|s|min)$/.test(k)
  if (isMassVolRate || isMassVolKey) {
    if (/feed|input|intake|inlet|supply|makeup|make_up|consum|raw_|inflow|charge|reagent|reactant|dosing|demand/.test(k)) return 'input'
    if (/output|product|yield|production|generat|export|effluent|discharge|outflow|recovered|permeate|distillate|harvest/.test(k)) return 'output'
    return 'flow'
  }
  // 4. thermal DUTY vs electrical POWER (both kW-family; W/m² already excluded)
  const isPowerUnit = /(^|[^a-z])(kw|mw|w)([^a-z]|$)/.test(u) || /_kw$|_mw$/.test(k)
  if (isPowerUnit) {
    if (/duty|reboiler|condenser|exchanger|thermal|cooling|heating|heat_(load|duty|reject|rejection)|chiller|refriger|hvac|dissipat|crah|crac/.test(k)) return 'duty'
    return 'power' // load / consumption / generation / bare kW → electrical power
  }
  return null
}

/** Strip trailing unit tokens from a key so the label reads cleanly (the unit is
 *  shown in its own column). `reboiler_duty_kw` → `reboiler_duty`. */
export function stripUnitTokens(key: string): string {
  const toks = String(key ?? '').toLowerCase().split('_').filter(Boolean)
  while (toks.length > 1 && UNIT_TOKENS.has(toks[toks.length - 1])) toks.pop()
  return toks.join('_')
}

interface QtyLike { value?: unknown; unit?: unknown }

/**
 * Select the balance-relevant rows from a contract's quantities, ordered for the
 * Engineering Basis table. `humanise` turns the stripped key into a label (the
 * renderer passes its own acronym-aware humaniser; defaults to identity for
 * tests). De-dupes by label (a contract often carries system + module-scope
 * variants of the same duty). Nothing is fabricated — only quantities that carry
 * a finite value are emitted. The caller applies the final `.slice(0, N)`.
 */
export function selectUniversalBalanceRows(
  quantities: Record<string, QtyLike | number | null | undefined> | null | undefined,
  humanise: (k: string) => string = (k) => k,
): Array<{ label: string; q: QtyLike | number }> {
  const collected: Array<{ role: BalanceRole; label: string; q: QtyLike | number }> = []
  for (const [key, q] of Object.entries(quantities ?? {})) {
    if (key.startsWith('auto_planned_tool_ran__')) continue // breadcrumb flag, never a balance term
    const value = (q && typeof q === 'object') ? (q as QtyLike).value : q
    if (value == null || (typeof value === 'number' && !Number.isFinite(value))) continue
    const unit = (q && typeof q === 'object') ? String((q as QtyLike).unit ?? '') : ''
    const role = classifyBalanceRole(key, unit)
    if (!role) continue
    collected.push({ role, label: humanise(stripUnitTokens(key)), q: q as QtyLike | number })
  }
  const seen = new Set<string>()
  const deduped = collected.filter((r) => {
    const kk = r.label.toLowerCase()
    if (seen.has(kk)) return false
    seen.add(kk)
    return true
  })
  // stable sort by role priority (Array.prototype.sort is stable in Node ≥ 12)
  deduped.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
  return deduped.map(({ label, q }) => ({ label, q }))
}

/**
 * scripts/lib/orchestrator/sizing-families/units.ts
 *
 * Self-contained unit-conversion for the sizing-family G6 boundary.
 *
 * WHY LOCAL (2026-06-10): the canonical helpers live in
 * `../constraint-normaliser` (the `convertToCanonical` / UnitFamily family —
 * the orchestrator member of the `targetPerformanceValueAs` helper family).
 * Importing them AT RUNTIME pulls in the constraint-normaliser → envelope →
 * envelope-vector → constraint-normaliser cycle that E1's concurrently-landed
 * `envelope-vector.ts` introduced (module-level ENERGY_KWH access during the
 * cycle → ReferenceError when the sizing layer is the first to load
 * constraint-normaliser). A sizing layer must NOT transitively depend on
 * envelope DETECTION, so the conversion is mirrored here, byte-equivalent to
 * constraint-normaliser's tables.
 *
 * POST-MERGE TODO (once E1's circular import is resolved): replace this file's
 * imports with `import { convertToCanonical, POWER_KW, ... } from
 * '../constraint-normaliser'` and delete the duplicated tables.
 *
 * British spelling throughout.
 */

/** Structurally identical to constraint-normaliser's UnitFamily. */
export interface UnitFamily {
  canonical: string
  aliases: ReadonlyArray<string>
  conversions: Readonly<Record<string, number>>
}

function normUnit(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw).toLowerCase().trim().replace(/\s+/g, '')
}

/** Convert (value, raw_unit) → family canonical unit. null when not in family.
 *  Identical semantics to constraint-normaliser.convertToCanonical. */
export function convertToCanonical(value: number, rawUnit: string, family: UnitFamily): number | null {
  const u = normUnit(rawUnit)
  const canon = normUnit(family.canonical)
  if (u === canon) return value
  if (family.aliases.map(normUnit).includes(u)) return value
  const multiplier = family.conversions[u] ?? family.conversions[rawUnit] ?? family.conversions[String(rawUnit).toLowerCase().trim()]
  if (multiplier !== undefined) return value * multiplier
  return null
}

// ── families used by the sizing-family plugins (mirror constraint-normaliser) ──

export const POWER_KW: UnitFamily = {
  canonical: 'kw',
  aliases: ['kw'],
  conversions: { w: 0.001, mw: 1000, gw: 1_000_000, kwe: 1, kwt: 1, mwe: 1000, mwt: 1000 },
}

export const ENERGY_KWH: UnitFamily = {
  canonical: 'kwh',
  aliases: ['kwh'],
  conversions: { wh: 0.001, mwh: 1000, gwh: 1_000_000 },
}

export const VOLUME_M3: UnitFamily = {
  canonical: 'm3',
  aliases: ['m3', 'm³', 'cubicmetre', 'cubicmetres'],
  conversions: { l: 0.001, litre: 0.001, litres: 0.001, ml: 0.000_001 },
}

export const MASS_KG: UnitFamily = {
  canonical: 'kg',
  aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'],
  conversions: { g: 0.001, mg: 0.000_001, t: 1000, ton: 1000, tons: 1000, tonne: 1000, tonnes: 1000, mt: 1000, lb: 0.453_592, lbs: 0.453_592 },
}

export const AREA_M2: UnitFamily = {
  canonical: 'm2',
  aliases: ['m2', 'm²', 'sqm'],
  conversions: { cm2: 0.0001, 'cm²': 0.0001, mm2: 0.000_001, ft2: 0.092_903, sqft: 0.092_903, ha: 10_000, hectare: 10_000, hectares: 10_000 },
}

/** Mass flow in tonnes/day. */
export const MASS_FLOW_T_DAY: UnitFamily = {
  canonical: 't/day',
  aliases: ['t/day', 'tday', 'tonnesperday', 'tonnes/day', 'tpd'],
  conversions: { 'kg/day': 0.001, kgday: 0.001, 'kg/h': 0.024, kgh: 0.024, 'kg/hr': 0.024, 't/h': 24, 't/hr': 24 },
}

/** Velocity in m/s. */
export const VELOCITY_M_S: UnitFamily = {
  canonical: 'm/s',
  aliases: ['m/s', 'ms', 'mps', 'm/sec', 'metrespersecond'],
  conversions: { 'km/h': 1 / 3.6, kmh: 1 / 3.6, kph: 1 / 3.6, kt: 0.514444, kts: 0.514444, knots: 0.514444, mph: 0.44704 },
}

/** Density in kg/m³. */
export const DENSITY_KG_M3: UnitFamily = {
  canonical: 'kg/m3',
  aliases: ['kg/m3', 'kg/m³', 'kgm3', 'kgperm3'],
  conversions: { 'g/cm3': 1000, 'g/cm³': 1000, 'g/l': 1, 'g/ml': 1000 },
}

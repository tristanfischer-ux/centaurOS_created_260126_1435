/**
 * scripts/lib/orchestrator/sizing-families/units.ts
 *
 * Unit-conversion families for the sizing-family G6 boundary.
 *
 * UNIFIED (2026-06-10, tracker #19): the canonical helpers now live in the
 * LEAF module `../unit-families` (zero orchestrator imports — the
 * constraint-normaliser → envelope → envelope-vector cycle that forced this
 * file to duplicate the tables was broken in the same increment). The
 * families shared with the orchestrator (UnitFamily, convertToCanonical,
 * POWER_KW, ENERGY_KWH, MASS_KG, AREA_M2) are RE-EXPORTED from the leaf;
 * the sizing-only families (VOLUME_M3 — canonical m³, unlike the
 * orchestrator's VOLUME_L — plus MASS_FLOW_T_DAY, VELOCITY_M_S,
 * DENSITY_KG_M3) stay declared here.
 *
 * NOTE: the leaf's convertToCanonical is behaviourally identical to the
 * previous local copy for every family in this file — all alias/conversion
 * keys are already lowercase with no internal whitespace, so the local
 * copy's extra raw-key fallback lookups could never fire.
 *
 * British spelling throughout.
 */

export type { UnitFamily } from '../unit-families'
export { convertToCanonical, POWER_KW, ENERGY_KWH, MASS_KG, AREA_M2 } from '../unit-families'

import type { UnitFamily } from '../unit-families'

// ── sizing-only families (no orchestrator equivalent — keep local) ──

/** Volume with canonical m³ (the orchestrator's VOLUME_L is litre-canonical;
 *  process-plant sizing reasons in cubic metres). */
export const VOLUME_M3: UnitFamily = {
  canonical: 'm3',
  aliases: ['m3', 'm³', 'cubicmetre', 'cubicmetres'],
  conversions: { l: 0.001, litre: 0.001, litres: 0.001, ml: 0.000_001 },
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

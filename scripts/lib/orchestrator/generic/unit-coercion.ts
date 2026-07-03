/**
 * scripts/lib/orchestrator/generic/unit-coercion.ts
 *
 * UNIT-COERCION LAYER for the tool-plan INPUT MAPPING (2026-07-03, the v56d
 * metres-into-millimetres vessel: `pressure-vessel:design` received
 * diameter_mm = 1.3587 — the METRES value of the contract quantity
 * `gac_vessel_diameter_m` wired straight through — and honestly computed a
 * physically absurd 2.011 kg "vessel mass" that propagated into
 * mass-aggregator's total_system_mass_kg = 902 kg for a whole water plant).
 *
 * THE RULE (universal, no per-class table): a tool parameter whose NAME carries
 * a dimension suffix (`_mm`, `_m3`, `_kw`, `_bar`, `_kg_h`, …) DECLARES the unit
 * it expects. A contract quantity carries its OWN declared unit (and its key
 * usually carries the same suffix convention). The input mapping must CONVERT
 * from the quantity's unit to the parameter's suffix unit — never pass a raw
 * magnitude across a unit boundary. This is the unit-confusion bug family
 * (MEMORY: forgeos_unit_confusion_and_corpus_mismatch_bug_families) killed at
 * the single payload-build point instead of per-tool.
 *
 * RESOLUTION ORDER for the SOURCE unit of a wired value:
 *   1. the contract quantity's declared `unit` string (authoritative);
 *   2. else (blank/unparseable/foreign-family) the contract KEY's own dimension
 *      suffix (`gac_vessel_diameter_m` → metres) — the contract's naming
 *      convention is self-describing;
 *   3. else NO coercion (indeterminate) — the magnitude guard below backs it.
 *
 * IDENTITY GUARANTEE (byte-identity on unaffected runs): when the source and
 * target units agree (factor 1) the ORIGINAL number is returned untouched — no
 * floating-point round-trip — so a plan whose wiring was already unit-correct
 * produces bit-identical payloads.
 *
 * MAGNITUDE GUARD (the assert backing the coercion): a vessel-scale
 * `*diameter_mm` below 50 mm or above 50,000 mm is REFUSED with a loud error
 * naming the suspected unit mismatch. The refusal THROWS from the input
 * builder; the executor fail-softs the step (required:false) and RECORDS the
 * refusal in tool_results — the plan never carries a silent absurd number.
 * Bounds are curated to unambiguous cases only (a 1.75 mm filament or a 3 mm
 * corrosion allowance is legitimate — those params are NOT bounded).
 *
 * CASE NOTE: parsing is lowercase snake-token based (the param/key naming
 * convention), so `mw` reads as MEGAwatt per the engineering convention used
 * across the manifest (`fieldNameUnitFamily` agrees) — milliwatts do not occur
 * in this domain.
 *
 * Pure + deterministic. No LLM, no I/O. British spelling.
 * Selftest: npx tsx scripts/lib/orchestrator/generic/unit-coercion.ts --selftest
 */

export type CoercibleFamily =
  | 'length' | 'area' | 'volume' | 'mass' | 'power' | 'apparent_power'
  | 'energy' | 'pressure' | 'volflow' | 'massflow' | 'voltage' | 'current'
  | 'frequency'

export interface UnitSpec {
  family: CoercibleFamily
  /** Multiples of the family's base unit (length→m, volume→m3, mass→kg,
   *  power→kW, energy→kWh, pressure→bar, volflow→m3/h, massflow→kg/h, …). */
  factor: number
  /** Canonical display token, e.g. 'mm', 'm3/h'. */
  canonical: string
}

// ── Single-token units (token → base-unit factor) ───────────────────────────
const SINGLE_TOKEN_UNITS: Record<string, UnitSpec> = {
  // length (base m)
  um: { family: 'length', factor: 1e-6, canonical: 'µm' },
  mm: { family: 'length', factor: 1e-3, canonical: 'mm' },
  cm: { family: 'length', factor: 1e-2, canonical: 'cm' },
  m: { family: 'length', factor: 1, canonical: 'm' },
  km: { family: 'length', factor: 1e3, canonical: 'km' },
  // area (base m2)
  mm2: { family: 'area', factor: 1e-6, canonical: 'mm2' },
  cm2: { family: 'area', factor: 1e-4, canonical: 'cm2' },
  m2: { family: 'area', factor: 1, canonical: 'm2' },
  // volume (base m3)
  ml: { family: 'volume', factor: 1e-6, canonical: 'ml' },
  l: { family: 'volume', factor: 1e-3, canonical: 'l' },
  litre: { family: 'volume', factor: 1e-3, canonical: 'l' },
  litres: { family: 'volume', factor: 1e-3, canonical: 'l' },
  m3: { family: 'volume', factor: 1, canonical: 'm3' },
  // mass (base kg) — mg/g included so ratio suffixes like `_mg_l` are DETECTED
  // as unit/unit ratios (→ indeterminate), never misread as litres.
  mg: { family: 'mass', factor: 1e-6, canonical: 'mg' },
  g: { family: 'mass', factor: 1e-3, canonical: 'g' },
  kg: { family: 'mass', factor: 1, canonical: 'kg' },
  t: { family: 'mass', factor: 1e3, canonical: 't' },
  tonne: { family: 'mass', factor: 1e3, canonical: 't' },
  tonnes: { family: 'mass', factor: 1e3, canonical: 't' },
  // power (base kW) — engineering convention: mw = MEGAwatt (see module head)
  w: { family: 'power', factor: 1e-3, canonical: 'W' },
  kw: { family: 'power', factor: 1, canonical: 'kW' },
  mw: { family: 'power', factor: 1e3, canonical: 'MW' },
  gw: { family: 'power', factor: 1e6, canonical: 'GW' },
  // apparent power (base kVA)
  va: { family: 'apparent_power', factor: 1e-3, canonical: 'VA' },
  kva: { family: 'apparent_power', factor: 1, canonical: 'kVA' },
  mva: { family: 'apparent_power', factor: 1e3, canonical: 'MVA' },
  // energy (base kWh)
  wh: { family: 'energy', factor: 1e-3, canonical: 'Wh' },
  kwh: { family: 'energy', factor: 1, canonical: 'kWh' },
  mwh: { family: 'energy', factor: 1e3, canonical: 'MWh' },
  gwh: { family: 'energy', factor: 1e6, canonical: 'GWh' },
  // pressure (base bar; barg treated as bar in MAGNITUDE — gauge vs absolute is
  // a datum offset the tools already own, not a scale factor)
  pa: { family: 'pressure', factor: 1e-5, canonical: 'Pa' },
  kpa: { family: 'pressure', factor: 1e-2, canonical: 'kPa' },
  mpa: { family: 'pressure', factor: 10, canonical: 'MPa' },
  bar: { family: 'pressure', factor: 1, canonical: 'bar' },
  barg: { family: 'pressure', factor: 1, canonical: 'barg' },
  psi: { family: 'pressure', factor: 0.0689476, canonical: 'psi' },
  // voltage (base V)
  v: { family: 'voltage', factor: 1, canonical: 'V' },
  kv: { family: 'voltage', factor: 1e3, canonical: 'kV' },
  // current (base A)
  ma: { family: 'current', factor: 1e-3, canonical: 'mA' },
  a: { family: 'current', factor: 1, canonical: 'A' },
  ka: { family: 'current', factor: 1e3, canonical: 'kA' },
  // frequency (base Hz)
  hz: { family: 'frequency', factor: 1, canonical: 'Hz' },
  khz: { family: 'frequency', factor: 1e3, canonical: 'kHz' },
  mhz: { family: 'frequency', factor: 1e6, canonical: 'MHz' },
  ghz: { family: 'frequency', factor: 1e9, canonical: 'GHz' },
  // single-token flow contractions
  lpm: { family: 'volflow', factor: 0.06, canonical: 'l/min' },
  lph: { family: 'volflow', factor: 1e-3, canonical: 'l/h' },
  lps: { family: 'volflow', factor: 3.6, canonical: 'l/s' },
  m3h: { family: 'volflow', factor: 1, canonical: 'm3/h' },
  tpy: { family: 'massflow', factor: 1e3 / 8760, canonical: 't/yr' },
  tpd: { family: 'massflow', factor: 1e3 / 24, canonical: 't/day' },
  tph: { family: 'massflow', factor: 1e3, canonical: 't/h' },
}

// ── Two-token per-time flows: <quantity>_<time> ─────────────────────────────
const FLOW_NUMERATORS: Record<string, { family: 'volflow' | 'massflow'; baseFactor: number; canon: string }> = {
  m3: { family: 'volflow', baseFactor: 1, canon: 'm3' },
  l: { family: 'volflow', baseFactor: 1e-3, canon: 'l' },
  ml: { family: 'volflow', baseFactor: 1e-6, canon: 'ml' },
  kg: { family: 'massflow', baseFactor: 1, canon: 'kg' },
  g: { family: 'massflow', baseFactor: 1e-3, canon: 'g' },
  t: { family: 'massflow', baseFactor: 1e3, canon: 't' },
}
const TIME_DENOM_HOURS: Record<string, { hours: number; canon: string }> = {
  s: { hours: 1 / 3600, canon: 's' },
  sec: { hours: 1 / 3600, canon: 's' },
  min: { hours: 1 / 60, canon: 'min' },
  h: { hours: 1, canon: 'h' },
  hr: { hours: 1, canon: 'h' },
  d: { hours: 24, canon: 'day' },
  day: { hours: 24, canon: 'day' },
  yr: { hours: 8760, canon: 'yr' },
  year: { hours: 8760, canon: 'yr' },
  pa: { hours: 8760, canon: 'yr' }, // "per annum" — only reached as a TIME token after a flow numerator
}

/** Parse the LAST one-or-two snake tokens of a param/contract-key name into the
 *  unit its name declares, else null (no dimension suffix / ratio / unknown).
 *  A `<unit>_<unit>` tail that is not a known flow (e.g. `_mg_l`, `_kwh_m3`,
 *  `_m_s`, `_kg_m3`) is a RATIO → indeterminate (null): never coerced. */
export function unitFromNameSuffix(name: string): UnitSpec | null {
  const tokens = String(name ?? '').toLowerCase().split(/[_\s]+/).filter(Boolean)
  if (tokens.length === 0) return null
  const last = tokens[tokens.length - 1]
  const prev = tokens.length >= 2 ? tokens[tokens.length - 2] : null

  // Two-token flow: <numerator>_<time> (m3_h, kg_s, t_yr, l_min, …)
  if (prev && FLOW_NUMERATORS[prev] && TIME_DENOM_HOURS[last]) {
    const n = FLOW_NUMERATORS[prev]
    const t = TIME_DENOM_HOURS[last]
    return { family: n.family, factor: n.baseFactor / t.hours, canonical: `${n.canon}/${t.canon}` }
  }

  const single = SINGLE_TOKEN_UNITS[last]
  if (!single) return null
  // RATIO GUARD: a unit token directly preceded by ANOTHER unit token is a
  // compound/ratio quantity (density kg_m3, dosing mg_l, intensity kwh_m3) —
  // its magnitude is not convertible by this layer. Indeterminate.
  if (prev && (SINGLE_TOKEN_UNITS[prev] || FLOW_NUMERATORS[prev])) return null
  return single
}

/** Parse a DECLARED unit string (a contract quantity's `unit` field: 'm',
 *  'm³/h', 'kW', 'L/min', 'bar(g)', 't/yr', …) into a UnitSpec, else null. */
export function parseDeclaredUnit(unit: string): UnitSpec | null {
  const norm = String(unit ?? '')
    .toLowerCase()
    .replace(/³/g, '3').replace(/²/g, '2').replace(/µ/g, 'u')
    .replace(/°/g, '').replace(/\(g\)/g, 'g') // bar(g) → barg
    .replace(/\bper\b/g, '/')
    .replace(/[\s·-]+/g, '')
    .replace(/\//g, '_')
    .trim()
  if (!norm) return null
  return unitFromNameSuffix(norm)
}

export interface CoercionOutcome {
  /** The value to pass to the tool (converted iff `converted`). */
  value: number
  converted: boolean
  factor: number
  from_unit: string | null
  to_unit: string | null
  /** How the source unit was resolved: the quantity's declared unit string,
   *  the contract key's own suffix, or not at all. */
  source_of_truth: 'declared-unit' | 'key-suffix' | 'none'
}

/**
 * Coerce a contract-wired value into the unit the PARAMETER NAME declares.
 * `declaredUnit` is the contract quantity's own `unit` string; `fromKey` is the
 * contract key it was wired from (its suffix is the fallback source unit).
 * Identity (factor 1) returns the ORIGINAL value untouched.
 */
export function coerceContractValueToParamUnit(
  param: string,
  value: number,
  declaredUnit: string,
  fromKey: string,
): CoercionOutcome {
  const identity: CoercionOutcome = {
    value, converted: false, factor: 1, from_unit: null, to_unit: null, source_of_truth: 'none',
  }
  if (!Number.isFinite(value)) return identity
  const target = unitFromNameSuffix(param)
  if (!target) return identity // param declares no dimension — nothing to coerce to

  // (1) the quantity's own declared unit, when it parses to the SAME family.
  const declared = parseDeclaredUnit(declaredUnit)
  let source: UnitSpec | null = declared && declared.family === target.family ? declared : null
  let sourceOf: CoercionOutcome['source_of_truth'] = source ? 'declared-unit' : 'none'
  // (2) else the contract KEY's own suffix (self-describing naming convention).
  if (!source) {
    const keyImplied = unitFromNameSuffix(fromKey)
    if (keyImplied && keyImplied.family === target.family) {
      source = keyImplied
      sourceOf = 'key-suffix'
    }
  }
  if (!source) return identity // indeterminate — the magnitude guard backs this

  const factor = source.factor / target.factor
  if (factor === 1) {
    return { value, converted: false, factor: 1, from_unit: source.canonical, to_unit: target.canonical, source_of_truth: sourceOf }
  }
  return {
    value: value * factor,
    converted: true,
    factor,
    from_unit: source.canonical,
    to_unit: target.canonical,
    source_of_truth: sourceOf,
  }
}

// ── MAGNITUDE GUARD (the assert backing the coercion) ───────────────────────
//
// Curated to UNAMBIGUOUS absurdity only. A vessel/tank/column/shell/drum/
// reactor-scale diameter or shell length in mm has a hard physical band; a
// bare `diameter_mm`/`length_mm` param (pressure-vessel:design's own names)
// is vessel-scale by construction. Deliberately NOT bounded: filament/wire/
// conductor/rod/tool/cable/pipe diameters (legitimately a few mm) and
// thickness/allowance params.
interface MagnitudeBound { re: RegExp; min: number; max: number; what: string }
const MAGNITUDE_BOUNDS: MagnitudeBound[] = [
  {
    re: /(^|_)(vessel|tank|column|shell|drum|reactor)[a-z0-9_]*_diameter_mm$|^diameter_mm$/,
    min: 50, max: 50_000,
    what: 'a vessel-scale diameter in mm',
  },
  {
    re: /(^|_)(vessel|tank|column|shell|drum|reactor)[a-z0-9_]*_length_mm$|^length_mm$/,
    min: 100, max: 200_000,
    what: 'a vessel-scale shell length in mm',
  },
]

/**
 * Refuse a contract-wired value whose magnitude is physically absurd for the
 * parameter — the loud backstop for a unit mismatch the coercion could not
 * resolve (missing/foreign declared unit AND no key suffix). Returns the
 * refusal message (the caller throws it), or null when the value is sane /
 * the param carries no curated bound. Applied ONLY to contract-wired values —
 * plan-authored constants/fallbacks are written in param units by the author.
 */
export function magnitudeRefusal(
  param: string,
  value: number,
  ctx: { tool_id: string; from_key: string; declared_unit: string },
): string | null {
  if (!Number.isFinite(value)) return null
  const bound = MAGNITUDE_BOUNDS.find(b => b.re.test(param.toLowerCase()))
  if (!bound) return null
  if (value >= bound.min && value <= bound.max) return null
  // Name the SUSPECTED unit mismatch: which power-of-1000 shift would land in-band?
  let suspect = 'unknown unit family'
  if (value * 1000 >= bound.min && value * 1000 <= bound.max) {
    suspect = `METRES fed into a millimetre parameter (${value} m would be ${value * 1000} mm — ×1000 too small)`
  } else if (value / 1000 >= bound.min && value / 1000 <= bound.max) {
    suspect = `micrometres-or-metres×10⁶ fed into a millimetre parameter (${value} / 1000 = ${value / 1000} mm — ×1000 too large)`
  }
  return (
    `UNIT-MISMATCH REFUSAL: ${ctx.tool_id} input "${param}" = ${value} is outside the physical band ` +
    `[${bound.min}, ${bound.max}] for ${bound.what} (wired from contract key "${ctx.from_key}", ` +
    `declared unit "${ctx.declared_unit || '(none)'}"). Suspected mismatch: ${suspect}. ` +
    `REFUSING to run the tool with an absurd magnitude — fix the wiring/unit at source ` +
    `(the mapping coerces automatically when the quantity's unit or key suffix is parseable).`
  )
}

// ── Selftest (proveCatch BOTH directions + conversion table) ─────────────────
function runSelftest(): void {
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) throw new Error(`unit-coercion selftest: ${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)
  }
  const approx = (a: number, b: number, msg: string) => {
    if (Math.abs(a - b) > Math.abs(b) * 1e-9 + 1e-12) throw new Error(`unit-coercion selftest: ${msg} (got ${a}, want ${b})`)
  }

  // THE v56d BUG, killed: gac_vessel_diameter_m (1.3587 m, declared 'm') wired
  // into pressure-vessel:design's diameter_mm MUST become 1358.7 mm.
  const c1 = coerceContractValueToParamUnit('diameter_mm', 1.358748446131949, 'm', 'gac_vessel_diameter_m')
  eq(c1.converted, true, 'm→mm must convert')
  approx(c1.value, 1358.748446131949, 'm→mm value')
  eq(c1.source_of_truth, 'declared-unit', 'm→mm resolves via declared unit')

  // Declared unit blank → the KEY suffix (…_m) still resolves the source unit.
  const c2 = coerceContractValueToParamUnit('diameter_mm', 1.36, '', 'gac_vessel_diameter_m')
  eq(c2.converted, true, 'key-suffix m→mm must convert')
  eq(c2.source_of_truth, 'key-suffix', 'key-suffix resolution')
  approx(c2.value, 1360, 'key-suffix m→mm value')

  // IDENTITY GUARANTEE: same unit → the ORIGINAL number, untouched, not converted.
  const v = 13360.000000000002
  const c3 = coerceContractValueToParamUnit('flow_m3_h', v, 'm3/h', 'recirculation_flow_m3_h')
  eq(c3.converted, false, 'identity must not convert')
  eq(c3.value === v, true, 'identity must return the exact original number')
  const c3b = coerceContractValueToParamUnit('vessel_mass_kg', 2.233, 'kg', 'gac_vessel_mass_kg')
  eq(c3b.converted, false, 'kg→kg identity')
  eq(c3b.value, 2.233, 'kg→kg untouched')

  // Cross-family declared unit NEVER converts (declared 'kW' into a _mm param).
  const c4 = coerceContractValueToParamUnit('diameter_mm', 5, 'kW', 'pump_motor_kw')
  eq(c4.converted, false, 'cross-family must not convert')

  // Ratio suffixes are INDETERMINATE, never misread: mg_l is not litres,
  // kg_m3 is not m3, m_s is not metres.
  eq(unitFromNameSuffix('hardness_mg_l'), null, 'mg_l is a ratio')
  eq(unitFromNameSuffix('density_kg_m3'), null, 'kg_m3 is a ratio')
  eq(unitFromNameSuffix('velocity_m_s'), null, 'm_s is indeterminate')
  // …but genuine flows parse.
  eq(unitFromNameSuffix('feed_flow_m3_h')?.canonical, 'm3/h', 'm3_h parses')
  eq(unitFromNameSuffix('dosing_l_min')?.family, 'volflow', 'l_min parses')
  approx(unitFromNameSuffix('production_t_yr')!.factor, 1000 / 8760, 't_yr factor')

  // Declared-unit string forms.
  eq(parseDeclaredUnit('m³/h')?.canonical, 'm3/h', 'm³/h normalises')
  eq(parseDeclaredUnit('L/min')?.canonical, 'l/min', 'L/min normalises')
  eq(parseDeclaredUnit('bar(g)')?.canonical, 'barg', 'bar(g) normalises')
  eq(parseDeclaredUnit('kW')?.canonical, 'kW', 'kW parses')
  eq(parseDeclaredUnit('%'), null, '% is not coercible')
  approx(coerceContractValueToParamUnit('design_pressure_mpa', 600, 'kPa', 'loop_pressure_kpa').value, 0.6, 'kPa→MPa')
  approx(coerceContractValueToParamUnit('rated_power_kw', 2, 'MW', 'plant_power_mw').value, 2000, 'MW→kW')

  // ── proveCatch, direction 1: metres-into-mm with NO resolvable unit is REFUSED loudly.
  const refusal = magnitudeRefusal('diameter_mm', 1.36, { tool_id: 'pressure-vessel:design', from_key: 'gac_vessel_diameter', declared_unit: '' })
  if (!refusal || !/UNIT-MISMATCH REFUSAL/.test(refusal) || !/METRES/.test(refusal)) {
    throw new Error(`unit-coercion selftest: 1.36 into diameter_mm must be refused naming METRES (got: ${refusal})`)
  }
  // …and the over-large direction (×1000 too large).
  const refusal2 = magnitudeRefusal('tank_inner_diameter_mm', 1_358_748, { tool_id: 't', from_key: 'k', declared_unit: '' })
  if (!refusal2 || !/too large/.test(refusal2)) throw new Error('unit-coercion selftest: 1.36e6 into a tank diameter_mm must be refused as ×1000 too large')

  // ── proveCatch, direction 2: a CORRECT mm value PASSES (both bare + stemmed params).
  eq(magnitudeRefusal('diameter_mm', 1358.7, { tool_id: 't', from_key: 'k', declared_unit: 'mm' }), null, 'correct mm passes')
  eq(magnitudeRefusal('column_diameter_mm', 900, { tool_id: 't', from_key: 'k', declared_unit: 'mm' }), null, 'column mm passes')
  eq(magnitudeRefusal('length_mm', 6000, { tool_id: 't', from_key: 'k', declared_unit: 'mm' }), null, 'shell length passes')
  // …and legitimately-small NON-vessel diameters are NOT bounded (no false catch).
  eq(magnitudeRefusal('filament_diameter_mm', 1.75, { tool_id: 't', from_key: 'k', declared_unit: 'mm' }), null, 'filament 1.75 mm is legitimate')
  eq(magnitudeRefusal('conductor_diameter_mm', 2.05, { tool_id: 't', from_key: 'k', declared_unit: 'mm' }), null, 'conductor 2 mm is legitimate')
  eq(magnitudeRefusal('wall_thickness_mm', 6, { tool_id: 't', from_key: 'k', declared_unit: 'mm' }), null, 'wall thickness is not bounded')

  // eslint-disable-next-line no-console
  console.log('unit-coercion --selftest OK (m→mm coercion; declared-unit + key-suffix resolution; identity untouched; ratio suffixes indeterminate; magnitude proveCatch both directions)')
}

if (process.argv.includes('--selftest')) runSelftest()

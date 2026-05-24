/**
 * Parts-spec validator (universal — runs for every chain, every class).
 *
 * Root cause it fixes: deterministic-emitter.ts emits `mod('form', ...)`
 * strings that pin a real industrial part by manufacturer + part-number AND
 * inline a claimed rating (e.g. "1500 A continuous / 1500 V DC HVDC"). Nothing
 * cross-checks the claimed rating against the manufacturer datasheet. So the
 * pipeline happily ships:
 *   - "Schaltbau C310 (1500 A continuous)"        ← real spec: 500 A continuous
 *   - "Pfannenberg CC 90.000, 50 kW @ 35°C"       ← real spec: 9 kW @ 35°C
 *   - "Bussmann 170M6810 (200 A)"                 ← real spec: 1250 A fuse
 *   - "LEM HASS 100-S (±300 A peak)"              ← real spec ok but bus peak exceeds it
 *
 * The validator parses every emitted form string with a Manufacturer + Part
 * regex, looks the part up in KNOWN_PART_AUTHORITATIVE, and reports any claim
 * that exceeds (or under-claims by ≥ 2×) the authoritative spec. Findings flow
 * into AUDIT-PARTS.md alongside the other gate reports.
 *
 * Universal: every class that pins a real industrial part is covered. New
 * parts get added to KNOWN_PART_AUTHORITATIVE once — every future chain
 * across every class benefits.
 *
 * Not a substitute for the parts library (pretraining_extracted_parts). The
 * library is for advisory candidate suggestion ("which contactors exist?").
 * The validator is for spec correctness ("does our claim about this part
 * match the manufacturer datasheet?"). Both can coexist; validator data is
 * curated, library data is scraped.
 */

import { readFileSync } from 'node:fs'

// ── AUTHORITATIVE PARTS TABLE ────────────────────────────────────────────────
// Source: manufacturer datasheets (verified entries cite source).
// Add new entries here as new parts are pinned by deterministic-emitter.ts.
// Pattern for entries:
//   - part_number_pattern: case-insensitive RegExp matching part number AS
//     emitted (so "C310", "iso685-D-B", "HASS 100-S" all match).
//   - Lowest-cost matching field wins (e.g. specifying just `rated_current_a`
//     skips voltage check unless `rated_voltage_dc_v` is also set).
//   - cooling_curve points are interpolated/snapped — closest ambient match
//     is the comparison baseline.
//
// Convention: if a part has rated_current_peak_a, the peak is the limit
// (LEM transducers saturate at peak); if it has both nominal + peak, the
// validator checks against the appropriate one based on the form text.
export interface AuthSpec {
  manufacturer: string
  part_number_pattern: RegExp
  category: string
  rated_current_a?: number
  rated_current_peak_a?: number
  rated_voltage_dc_v?: number
  rated_voltage_ac_v?: number
  rated_power_kw?: number
  cooling_curve?: Array<{ ambient_c: number; capacity_kw: number }>
  notes?: string
}

export const KNOWN_PART_AUTHORITATIVE: AuthSpec[] = [
  // ── BESS DC switchgear ────────────────────────────────────────
  {
    manufacturer: 'Schaltbau',
    part_number_pattern: /^C310(?:[\s/].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 500,
    rated_voltage_dc_v: 1500,
    notes: 'Schaltbau C310 (datasheet): 350-500 A continuous, 1500 V DC, IEC 60947-2. Some variants list 350 A continuous; 500 A is the highest in the series. Anything > 500 A is wrong.',
  },
  {
    manufacturer: 'Gigavac',
    part_number_pattern: /^MX12(?:[\s/].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 500,
    rated_voltage_dc_v: 800,
    notes: 'Gigavac MX12 series: 350-500 A continuous, 800 V DC.',
  },
  // ── BESS DC fuses (Bussmann 170M family) ──────────────────────
  // 170M68xx subfamily: 1250 A fuses. Lower-current 170M variants exist.
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^170M68\d{2}$/i,
    category: 'dc_fuse',
    rated_current_a: 1250,
    rated_voltage_dc_v: 1100,
    notes: 'Bussmann 170M68xx (e.g. 170M6810): 1250 A semiconductor fuse, 1100 V DC, IEC 60269-4 + UL 248-13. Claiming 200 A on a 170M6810 is wrong — that is the 170M65xx subfamily.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^170M65\d{2}$/i,
    category: 'dc_fuse',
    rated_current_a: 200,
    rated_voltage_dc_v: 1100,
    notes: 'Bussmann 170M65xx: ~125-250 A semiconductor fuse, 1100 V DC.',
  },
  // ── BESS isolation monitor ────────────────────────────────────
  {
    manufacturer: 'Bender',
    part_number_pattern: /^iso685(?:[-_]?D)?(?:[-_]?B)?$/i,
    category: 'iso_monitor',
    rated_voltage_dc_v: 1000,
    notes: 'Bender iso685-D-B (datasheet): 1000 V DC, IEC 61557-8.',
  },
  // ── BESS current transducers (LEM HASS series) ────────────────
  // HASS series: rated current x specifies nominal (A); peak measuring range
  // is typically 3× nominal. Saturating beyond peak yields wrong current
  // measurement → wrong control loop → safety risk.
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*50-S/i,
    category: 'current_transducer',
    rated_current_a: 50,
    rated_current_peak_a: 150,
  },
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*100-S/i,
    category: 'current_transducer',
    rated_current_a: 100,
    rated_current_peak_a: 300,
  },
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*200-S/i,
    category: 'current_transducer',
    rated_current_a: 200,
    rated_current_peak_a: 600,
  },
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*300-S/i,
    category: 'current_transducer',
    rated_current_a: 300,
    rated_current_peak_a: 900,
  },
  // ── Chillers (Pfannenberg CC + EB series) ─────────────────────
  // Pfannenberg naming convention: "CC 90.000" → 9.0 kW nominal cooling.
  // Numeric is W × 1000 (so 90.000 = 90,000 W = 9 kW). At +35°C ambient
  // = nominal; at +50°C ambient typically ~40% derate.
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^CC[\s.-]*60\.000$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 6 },
      { ambient_c: 50, capacity_kw: 3.6 },
    ],
    notes: 'Pfannenberg CC 60.000: 6 kW @ 35°C ambient, ~3.6 kW @ 50°C (40% derate).',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^CC[\s.-]*90\.000$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 9 },
      { ambient_c: 50, capacity_kw: 5.4 },
    ],
    notes: 'Pfannenberg CC 90.000: 9 kW @ 35°C ambient. Anything > 9 kW @ 35°C is wrong — that is the CC 120.000 (12 kW) or higher.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^CC[\s.-]*120\.000$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 12 },
      { ambient_c: 50, capacity_kw: 7.2 },
    ],
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*60$/i,
    category: 'enclosure_cooler',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 0.6 },
      { ambient_c: 50, capacity_kw: 0.36 },
    ],
    notes: 'Pfannenberg EB 60 panel cooler: 600 W @ 35°C. Claiming 60 kW on an EB 60 was a 100× spec error caught Loop ~28.',
  },
  // ── BESS AC switchgear (ABB Emax E2.2 family) ─────────────────
  // E2.2 frame variants: 800/1000/1250/1600/2000/2500 A.
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*2500(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 2500,
    rated_voltage_ac_v: 690,
  },
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*2000(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 2000,
    rated_voltage_ac_v: 690,
  },
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*1600(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 1600,
    rated_voltage_ac_v: 690,
  },
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*1250(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 1250,
    rated_voltage_ac_v: 690,
  },
  // ── BESS busbar lugs ──────────────────────────────────────────
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^RKS\s*50-8$/i,
    category: 'crimp_lug',
    rated_current_a: 200,
    notes: 'Klauke RKS 50-8: 50 mm² M8 stud ring lug, 200 A continuous.',
  },
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^RKS\s*70-8$/i,
    category: 'crimp_lug',
    rated_current_a: 280,
  },
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^RKS\s*95-10$/i,
    category: 'crimp_lug',
    rated_current_a: 350,
  },
]

// ── PARSERS ──────────────────────────────────────────────────────────────────

interface ParsedPart {
  manufacturer: string
  part_number: string
}

/**
 * Parse "Manufacturer Part_Number" prefix from a form string.
 * Manufacturers can be one or two capitalised tokens (e.g. "Phoenix Contact",
 * "TE Connectivity"). Part numbers can include digits, dots, dashes, slashes.
 */
export function parseManufacturerAndPart(formText: string): ParsedPart | null {
  if (!formText) return null
  const trimmed = formText.trim()
  let m = trimmed.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)\s+([A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*){0,3})/)
  if (m) return { manufacturer: m[1].trim(), part_number: m[2].trim() }
  m = trimmed.match(/^([A-Z][A-Za-z]{2,}(?:[A-Z][A-Za-z]+)?)\s+([A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*){0,3})/)
  if (m) return { manufacturer: m[1].trim(), part_number: m[2].trim() }
  return null
}

/** Parse a number+unit string like "1500 A", "200 A", "9 kW". Returns the
 * numeric value, or null if the unit doesn't match. */
function parseValueWithUnit(raw: string, expectedUnit: 'A' | 'V' | 'kW' | 'MW'): number | null {
  if (typeof raw !== 'string') return null
  // Strip commas (thousands separators) before matching. Allow optional ± prefix.
  const cleaned = raw.replace(/,(?=\d{3}\b)/g, '')
  const re = new RegExp(`±?\\s*(\\d+(?:\\.\\d+)?)\\s*${expectedUnit}\\b`, 'i')
  const m = cleaned.match(re)
  if (!m) return null
  return parseFloat(m[1])
}

/** Find the highest-confidence claimed current from modifier_characters.
 * Order: `rating_primary` > `capacity` (A units) > `dimension` (A units). */
function claimedCurrentFromModifiers(mods: Array<{ kind: string; value: string }>): { value: number; isPeak: boolean } | null {
  const ratingPrimary = mods.find((m) => m.kind === 'rating_primary')
  if (ratingPrimary) {
    const a = parseValueWithUnit(ratingPrimary.value, 'A')
    if (a != null) return { value: a, isPeak: /peak/i.test(ratingPrimary.value) }
  }
  const capacity = mods.find((m) => m.kind === 'capacity')
  if (capacity) {
    const a = parseValueWithUnit(capacity.value, 'A')
    if (a != null) return { value: a, isPeak: /peak/i.test(capacity.value) }
  }
  return null
}

/** Find claimed voltage from modifiers. */
function claimedVoltageFromModifiers(mods: Array<{ kind: string; value: string }>): number | null {
  const dim = mods.find((m) => m.kind === 'dimension' && /V\b/i.test(m.value))
  if (dim) {
    const v = parseValueWithUnit(dim.value, 'V')
    if (v != null) return v
  }
  const rp = mods.find((m) => m.kind === 'rating_primary' && /V\b/i.test(m.value))
  if (rp) {
    const v = parseValueWithUnit(rp.value, 'V')
    if (v != null) return v
  }
  return null
}

/** Find claimed cooling/power from modifiers (capacity with kW or MW units). */
function claimedPowerKwFromModifiers(mods: Array<{ kind: string; value: string }>): number | null {
  for (const kind of ['rating_primary', 'capacity']) {
    const m = mods.find((x) => x.kind === kind && /(kW|MW)\b/i.test(x.value))
    if (m) {
      const kw = parseValueWithUnit(m.value, 'kW')
      if (kw != null) return kw
      const mw = parseValueWithUnit(m.value, 'MW')
      if (mw != null) return mw * 1000
    }
  }
  return null
}

/** Pull ambient temp out of form / capacity / regulatory modifier values. */
function claimedAmbientFromModifiers(mods: Array<{ kind: string; value: string }>): number | null {
  for (const m of mods) {
    const match = String(m.value).match(/@\s*\+?(\d+(?:\.\d+)?)\s*°\s*C/i)
    if (match) return parseFloat(match[1])
  }
  return null
}

/** Resolve part_number for a word. Prefer explicit `part_number` modifier;
 * fall back to parsing `form` modifier or content_character.character_id. */
function resolvePartNumber(word: any, mfr: string): string | null {
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  const pn = mods.find((m) => m.kind === 'part_number')
  if (pn && typeof pn.value === 'string' && pn.value.trim()) return pn.value.trim()
  // Fall back: scan form modifier for "<Manufacturer> <PartNum>" pattern.
  const form = mods.find((m) => m.kind === 'form')
  if (form && typeof form.value === 'string') {
    const re = new RegExp(`^${mfr}\\s+([A-Za-z0-9][\\w.-]*(?:\\s+[A-Za-z0-9][\\w.-]*){0,3})`, 'i')
    const m = form.value.match(re)
    if (m) return m[1].trim()
  }
  // Last-resort: scan name_human for the same pattern.
  if (typeof word?.name_human === 'string') {
    const re = new RegExp(`${mfr}\\s+([A-Za-z0-9][\\w.-]*(?:\\s+[A-Za-z0-9][\\w.-]*){0,3})`, 'i')
    const m = word.name_human.match(re)
    if (m) return m[1].trim()
  }
  return null
}

/** Resolve manufacturer for a word. Prefer explicit `manufacturer` modifier;
 * fall back to scanning the form modifier. */
function resolveManufacturer(word: any): string | null {
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  const mfr = mods.find((m) => m.kind === 'manufacturer')
  if (mfr && typeof mfr.value === 'string' && mfr.value.trim()) return mfr.value.trim()
  // Fall back: scan form modifier prefix.
  const form = mods.find((m) => m.kind === 'form')
  if (form && typeof form.value === 'string') {
    const parsed = parseManufacturerAndPart(form.value)
    if (parsed) return parsed.manufacturer
  }
  return null
}

// ── VALIDATOR ────────────────────────────────────────────────────────────────

export interface PartsValidationFinding {
  word_id: string
  module_id: string
  sub_module_id: string
  manufacturer: string
  part_number: string
  field: 'current_a' | 'voltage_v' | 'cooling_kw'
  claimed: number
  authoritative: number
  ratio: number
  severity: 'HIGH' | 'MED' | 'LOW'
  explanation: string
  source_form: string
}

export interface PartsValidationResult {
  findings: PartsValidationFinding[]
  parts_checked: number
  parts_unknown: number
  parts_known_no_check: number
}

function findAuth(parsed: ParsedPart): AuthSpec | null {
  return (
    KNOWN_PART_AUTHORITATIVE.find(
      (p) =>
        p.manufacturer.toLowerCase() === parsed.manufacturer.toLowerCase() &&
        p.part_number_pattern.test(parsed.part_number),
    ) ?? null
  )
}

function collectWords(state: any): Array<{ word: any; module_id: string; sub_module_id: string }> {
  const out: Array<{ word: any; module_id: string; sub_module_id: string }> = []
  const modules =
    state?.moduleDecomposition?.modules ??
    state?.module_decomposition?.modules ??
    state?.modules ??
    []
  for (const m of modules) {
    const mid = String(m?.module ?? m?.id ?? m?.module_id ?? 'unknown')
    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : Array.isArray(m?.submodules) ? m.submodules : []
    for (const sm of subs) {
      const sid = String(sm?.id ?? sm?.sub_module_id ?? sm?.name ?? 'unknown')
      const wordArrays = [sm?.words, sm?.components, sm?.parts, sm?.items]
      for (const wa of wordArrays) {
        if (!Array.isArray(wa)) continue
        for (const w of wa) {
          if (w && typeof w === 'object') out.push({ word: w, module_id: mid, sub_module_id: sid })
        }
      }
    }
  }
  return out
}

/** Build a synthetic display string for the source_form field of findings.
 * Combines manufacturer + part_number + the modifiers that carry the claim. */
function synthesiseFormDisplay(word: any, mfr: string, pn: string): string {
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  const interesting = mods.filter((m) =>
    ['rating_primary', 'capacity', 'dimension', 'form', 'regulatory'].includes(m.kind),
  )
  const parts = interesting.map((m) => m.value).filter((v): v is string => typeof v === 'string')
  return `${mfr} ${pn} (${parts.join(' / ')})`.trim()
}

export function validateEmittedParts(state: any): PartsValidationResult {
  const findings: PartsValidationFinding[] = []
  let parts_checked = 0
  let parts_unknown = 0
  let parts_known_no_check = 0

  const all = collectWords(state)
  for (const entry of all) {
    const word = entry.word
    const mfr = resolveManufacturer(word)
    if (!mfr) continue
    const pn = resolvePartNumber(word, mfr)
    const wordId = String(word?.id ?? word?.content_character?.character_id ?? 'unknown')

    // Find authoritative entry. Strategy:
    //   1. If PN explicitly extracted and matches a regex → use that entry
    //      (exact match — never a false positive).
    //   2. If PN extracted but DOESN'T match any authoritative regex →
    //      treat as unknown variant (skip). Manufacturer-only fallback is
    //      WRONG here because the PN tells us this is a different product
    //      line (e.g. Gigavac P115 ≠ Gigavac MX12; ABB E2.2 2500 ≠ E2.2 1250).
    //   3. If PN missing entirely (downstream extraction failed) AND the
    //      manufacturer has authoritative entries → use the LOWEST-rated
    //      entry so an over-claim is still caught. We never let a missing
    //      PN mask a 3× over-claim.
    let auth: AuthSpec | null = null
    if (pn) {
      auth = findAuth({ manufacturer: mfr, part_number: pn })
      if (!auth) {
        // Known manufacturer, unknown PN — skip rather than misattribute.
        parts_unknown += 1
        continue
      }
    } else {
      const sameMfr = KNOWN_PART_AUTHORITATIVE.filter(
        (p) => p.manufacturer.toLowerCase() === mfr.toLowerCase(),
      )
      if (sameMfr.length > 0) {
        auth = sameMfr.reduce((best, curr) => {
          const bestA = best.rated_current_a ?? Number.POSITIVE_INFINITY
          const currA = curr.rated_current_a ?? Number.POSITIVE_INFINITY
          return currA < bestA ? curr : best
        })
      }
    }
    if (!auth) {
      parts_unknown += 1
      continue
    }
    parts_checked += 1
    const pnDisplay = pn ?? '<no-part-number>'
    const sourceForm = synthesiseFormDisplay(word, mfr, pnDisplay)
    let didCheck = false

    const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
      ? word.modifier_characters
      : []

    // ── Current check (continuous or peak) ───────────────────
    const claimedAObj = claimedCurrentFromModifiers(mods)
    if (claimedAObj) {
      const claimedA = claimedAObj.value
      const isPeak = claimedAObj.isPeak
      const authA =
        isPeak && auth.rated_current_peak_a != null ? auth.rated_current_peak_a : auth.rated_current_a
      if (authA != null) {
        didCheck = true
        const ratio = claimedA / authA
        if (ratio > 1.05) {
          findings.push({
            word_id: wordId,
            module_id: entry.module_id,
            sub_module_id: entry.sub_module_id,
            manufacturer: auth.manufacturer,
            part_number: pnDisplay,
            field: 'current_a',
            claimed: claimedA,
            authoritative: authA,
            ratio,
            severity: ratio > 1.5 ? 'HIGH' : 'MED',
            explanation:
              `${auth.manufacturer} ${pnDisplay} claimed ${claimedA} A${isPeak ? ' peak' : ' continuous'} ` +
              `but authoritative spec is ${authA} A (${ratio.toFixed(2)}× over).` +
              (auth.notes ? ` ${auth.notes}` : ''),
            source_form: sourceForm,
          })
        } else if (ratio < 0.5 && claimedA > 10) {
          findings.push({
            word_id: wordId,
            module_id: entry.module_id,
            sub_module_id: entry.sub_module_id,
            manufacturer: auth.manufacturer,
            part_number: pnDisplay,
            field: 'current_a',
            claimed: claimedA,
            authoritative: authA,
            ratio,
            severity: 'LOW',
            explanation:
              `${auth.manufacturer} ${pnDisplay} claimed ${claimedA} A but authoritative spec is ${authA} A ` +
              `(${ratio.toFixed(2)}× under — part oversized for application; either wrong part number or cost overstated).` +
              (auth.notes ? ` ${auth.notes}` : ''),
            source_form: sourceForm,
          })
        }
      }
    }

    // ── Voltage check ────────────────────────────────────────
    const claimedV = claimedVoltageFromModifiers(mods)
    if (claimedV != null) {
      const authV = auth.rated_voltage_dc_v ?? auth.rated_voltage_ac_v
      if (authV != null) {
        didCheck = true
        const ratio = claimedV / authV
        if (ratio > 1.05) {
          findings.push({
            word_id: wordId,
            module_id: entry.module_id,
            sub_module_id: entry.sub_module_id,
            manufacturer: auth.manufacturer,
            part_number: pnDisplay,
            field: 'voltage_v',
            claimed: claimedV,
            authoritative: authV,
            ratio,
            severity: ratio > 1.5 ? 'HIGH' : 'MED',
            explanation:
              `${auth.manufacturer} ${pnDisplay} claimed ${claimedV} V but authoritative spec is ${authV} V ` +
              `(${ratio.toFixed(2)}× over).` + (auth.notes ? ` ${auth.notes}` : ''),
            source_form: sourceForm,
          })
        }
      }
    }

    // ── Cooling capacity check (ambient-aware) ───────────────
    const claimedKw = claimedPowerKwFromModifiers(mods)
    const claimedAmbient = claimedAmbientFromModifiers(mods)
    if (claimedKw != null && Array.isArray(auth.cooling_curve) && auth.cooling_curve.length > 0) {
      const ambient = claimedAmbient ?? 35
      const closest = auth.cooling_curve.reduce((best, curr) =>
        Math.abs(curr.ambient_c - ambient) < Math.abs(best.ambient_c - ambient) ? curr : best,
      )
      const authKw = closest.capacity_kw
      didCheck = true
      const ratio = claimedKw / authKw
      if (ratio > 1.10) {
        findings.push({
          word_id: wordId,
          module_id: entry.module_id,
          sub_module_id: entry.sub_module_id,
          manufacturer: auth.manufacturer,
          part_number: pnDisplay,
          field: 'cooling_kw',
          claimed: claimedKw,
          authoritative: authKw,
          ratio,
          severity: ratio > 1.5 ? 'HIGH' : 'MED',
          explanation:
            `${auth.manufacturer} ${pnDisplay} claimed ${claimedKw} kW @ ${ambient}°C ambient ` +
            `but authoritative spec is ${authKw} kW @ ${closest.ambient_c}°C (${ratio.toFixed(2)}× over).` +
            (auth.notes ? ` ${auth.notes}` : ''),
          source_form: sourceForm,
        })
      }
    }

    if (!didCheck) parts_known_no_check += 1
  }

  return { findings, parts_checked, parts_unknown, parts_known_no_check }
}

// ── CLI ENTRYPOINT ───────────────────────────────────────────────────────────
// Usage: npx tsx scripts/lib/parts-spec-validator.ts <statePath> [outMdPath]
// Exit code 13 on any HIGH-severity finding (reserved alongside 10/11).

function severitySort(a: PartsValidationFinding, b: PartsValidationFinding): number {
  const order = { HIGH: 0, MED: 1, LOW: 2 }
  return order[a.severity] - order[b.severity]
}

function renderMarkdown(result: PartsValidationResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Parts-Spec Validator — ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.parts_checked} pinned parts checked** against authoritative spec table ` +
      `(${KNOWN_PART_AUTHORITATIVE.length} entries). ` +
      `${result.parts_unknown} parts not in authoritative table (no validation). ` +
      `${result.parts_known_no_check} parts known but no spec-claim found to check.`,
  )
  lines.push('')
  if (result.findings.length === 0) {
    lines.push('✅ **PASS** — no claim mismatches detected.')
    return lines.join('\n')
  }
  const sorted = [...result.findings].sort(severitySort)
  const high = sorted.filter((f) => f.severity === 'HIGH')
  const med = sorted.filter((f) => f.severity === 'MED')
  const low = sorted.filter((f) => f.severity === 'LOW')
  lines.push(
    `❌ **FAIL** — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`,
  )
  lines.push('')
  for (const f of sorted) {
    lines.push(
      `## [${f.severity}] ${f.manufacturer} ${f.part_number} — ${f.field}`,
    )
    lines.push(`- **Module:** ${f.module_id} → ${f.sub_module_id}`)
    lines.push(`- **Word ID:** ${f.word_id}`)
    lines.push(`- **Claimed:** ${f.claimed}`)
    lines.push(`- **Authoritative:** ${f.authoritative}`)
    lines.push(`- **Ratio:** ${f.ratio.toFixed(2)}×`)
    lines.push(`- **Reason:** ${f.explanation}`)
    lines.push(`- **Source form:** "${f.source_form}"`)
    lines.push('')
  }
  return lines.join('\n')
}

// CLI main: invoked when run as `npx tsx scripts/lib/parts-spec-validator.ts ...`.
// Detection uses argv[1] basename match — works under both CJS and ESM tsx.
const argv1 = process.argv[1] ?? ''
const isMain = /parts-spec-validator\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: parts-spec-validator <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[parts-validator] failed to read ${statePath}: ${(err as Error).message}`)
    process.exit(1)
  }
  const result = validateEmittedParts(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[parts-validator] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  // Exit 13 on any HIGH finding (reserved alongside 10 BoM, 11 layout).
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(`[parts-validator] FAIL: ${high.length} HIGH-severity finding(s)`)
    process.exit(13)
  }
  console.log(
    `[parts-validator] PASS: ${result.parts_checked} parts checked, ${result.findings.length} findings (${result.findings.filter((f) => f.severity === 'MED').length} MED, ${result.findings.filter((f) => f.severity === 'LOW').length} LOW)`,
  )
}

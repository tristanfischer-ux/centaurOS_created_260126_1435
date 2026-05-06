/**
 * @file spec-extraction.ts — deterministic spec extraction from brief text
 *
 * Purpose: pull canonical product specs out of the raw brief + research
 * DesignBrief so the BOM quantity derivation has hard numbers to work with
 * instead of re-asking the LLM on every run.
 *
 * Scope: regex-only. No LLM calls. No network. Pure function.
 *
 * Callers:
 *   - index.ts attaches the result to state.productSpecs at pipeline top
 *   - stages/4-bom-cost.ts consumes it to override LLM-generated quantities
 *   - stages/7-pdf.tsx may consume it for cost-waterfall benchmark bands
 */

import type { DesignBrief } from '../types'

export interface ProductSpecs {
  // ─── Electrical / energy ────────────────────────────────────────────
  /** Energy capacity in kWh (e.g. BESS 3.5 MWh → 3500). */
  capacityKwh?: number
  /** Power rating in kW (e.g. 1 MW PCS → 1000; 30 kW heat pump → 30). */
  powerKw?: number
  /** System / DC-bus voltage in volts (e.g. BESS 800 V). */
  voltageV?: number
  /** Cell nominal voltage (LFP prismatic default 3.2 V). */
  cellVoltageV?: number
  /** Cell capacity in ampere-hours (e.g. CATL 280 Ah). */
  cellCapacityAh?: number
  /**
   * Usable depth of discharge as a fraction (0–1). BESS briefs with an
   * 80 % DoD constraint have dod=0.8 → nominal capacity must be oversized
   * by 1/DoD to deliver the stated usable energy.
   */
  dod?: number

  // ─── Physical ──────────────────────────────────────────────────────
  /** Gross mass limit in kilograms. */
  massKg?: number
  /** External envelope (width × depth × height in mm). */
  dimensionsMm?: { w: number; d: number; h: number }

  // ─── Vertical farm specific ────────────────────────────────────────
  /** Total growing footprint in square metres. */
  growingAreaM2?: number
  /** Number of vertical tiers. */
  tiers?: number
  /** Total tray count (often = tiers × trays_per_tier). */
  trayCount?: number
  /** Single tray footprint in square metres. */
  trayAreaM2?: number

  // ─── Production / batch ────────────────────────────────────────────
  /** Annual production volume in units per year. */
  batchSize?: number
}

// ───────────────────────────────────────────────────────────────────────
//  Regex helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Match a number followed by a unit, accepting comma thousands separators
 * and decimals. Returns the raw numeric value (pre-unit-conversion).
 */
function matchNumber(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern)
  if (!m || !m[1]) return null
  const raw = m[1].replace(/,/g, '')
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ───────────────────────────────────────────────────────────────────────
//  Individual extractors
//  Each returns null when the brief doesn't mention it. Callers coalesce.
// ───────────────────────────────────────────────────────────────────────

/** MWh / kWh energy capacity. MWh values are scaled to kWh. */
function extractCapacityKwh(text: string): number | null {
  // MWh wins over kWh when both present — MWh is almost always the system
  // rating on BESS briefs. Ranges ("3.5 MWh minimum", "100-250 m²") pick
  // the first value.
  const mwh = matchNumber(text, /([\d,]+(?:\.\d+)?)\s*mwh/i)
  if (mwh !== null) return mwh * 1000
  const kwh = matchNumber(text, /([\d,]+(?:\.\d+)?)\s*kwh(?!\/)/i) // kwh not kwh/kg
  if (kwh !== null) return kwh
  return null
}

/**
 * kW / MW power rating. MW scales to kW. Avoids matching "kWh" by requiring
 * the unit to be end-of-token.
 */
function extractPowerKw(text: string): number | null {
  // MW first. Must not be MWh.
  const mw = matchNumber(text, /([\d,]+(?:\.\d+)?)\s*mw\b(?!h)/i)
  if (mw !== null) return mw * 1000
  const kw = matchNumber(text, /([\d,]+(?:\.\d+)?)\s*kw\b(?!h)/i)
  if (kw !== null) return kw
  return null
}

/**
 * DC bus / system voltage. "~800 V nominal" / "400 V / 50 Hz".
 * Ignores 3.2 V cell voltage (too small for a bus), and 24 V control rails.
 */
function extractVoltageV(text: string): number | null {
  // Scan all "<n> V" matches and pick the largest plausible bus voltage.
  const all = Array.from(text.matchAll(/([\d,]+(?:\.\d+)?)\s*v\b/gi))
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => Number.isFinite(n) && n >= 100 && n <= 2000)
  if (all.length === 0) return null
  return Math.max(...all)
}

/**
 * Cell nominal voltage. Looks for "3.2 V cell" or "cell voltage of 3.2 V"
 * or "LFP prismatic" (default to 3.2 V when LFP chemistry mentioned).
 */
function extractCellVoltageV(text: string): number | null {
  const direct = matchNumber(text, /cell\s+(?:voltage|nominal|rated)[\s\w]*?([\d.]+)\s*v/i)
  if (direct !== null && direct < 10) return direct
  // LFP default. NMC default is 3.65 V but most grid-scale is LFP now.
  if (/\blfp\b|lithium.?iron.?phosphate/i.test(text)) return 3.2
  if (/\bnmc\b|nickel.?manganese/i.test(text)) return 3.65
  return null
}

/**
 * Cell capacity in Ah. Looks for "280 Ah" or "CATL 280 Ah" pattern.
 * Ignores battery-rack Ah which can be 10× larger; only trust the
 * number when it's 50–1000 Ah (plausible large-format prismatic range).
 */
function extractCellCapacityAh(text: string): number | null {
  const all = Array.from(text.matchAll(/([\d,]+(?:\.\d+)?)\s*ah\b/gi))
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => Number.isFinite(n) && n >= 50 && n <= 1000)
  if (all.length === 0) return null
  // Prefer the smallest — cell Ah is usually the lowest mentioned.
  return Math.min(...all)
}

/**
 * Depth of discharge as a fraction. "80 % DoD" / "depth of discharge" /
 * "at 80 % depth". Defaults to null if not mentioned (caller decides fallback).
 */
function extractDoD(text: string): number | null {
  // Look for a percentage immediately near the phrase.
  const m = text.match(/([\d]{2,3})\s*%?\s*(?:depth\s+of\s+discharge|dod)/i)
  if (m && m[1]) {
    const pct = parseFloat(m[1])
    if (Number.isFinite(pct) && pct >= 10 && pct <= 100) return pct / 100
  }
  // Alt: "at 80 %"
  const m2 = text.match(/\bat\s+([\d]{2,3})\s*%\s*(?:dod|depth)/i)
  if (m2 && m2[1]) {
    const pct = parseFloat(m2[1])
    if (Number.isFinite(pct) && pct >= 10 && pct <= 100) return pct / 100
  }
  return null
}

/**
 * Gross mass in kg. Looks for "28,000 kg" / "≤ 180 kg" / "mass: 180 kg".
 * Only returns a value when the biggest mass in the text is plausible
 * as a unit gross mass (> 10 kg).
 */
function extractMassKg(text: string): number | null {
  const all = Array.from(text.matchAll(/([\d,]+(?:\.\d+)?)\s*kg\b/gi))
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => Number.isFinite(n) && n >= 10 && n <= 50000)
  if (all.length === 0) return null
  // Prefer the biggest — that's almost always the gross-mass ceiling.
  return Math.max(...all)
}

/**
 * External envelope dimensions "W × D × H mm" or "12,192 × 2,438 × 2,896 mm".
 * Returns first three-dimension triple found.
 */
function extractDimensionsMm(text: string): { w: number; d: number; h: number } | null {
  // Matches "12,192 × 2,438 × 2,896" or "1100 x 450 x 1300".
  const m = text.match(
    /([\d,]+)\s*[×x]\s*([\d,]+)\s*[×x]\s*([\d,]+)\s*mm/i
  )
  if (!m) return null
  const w = parseFloat(m[1].replace(/,/g, ''))
  const d = parseFloat(m[2].replace(/,/g, ''))
  const h = parseFloat(m[3].replace(/,/g, ''))
  if ([w, d, h].every(n => Number.isFinite(n) && n > 0)) return { w, d, h }
  return null
}

/** Growing footprint. "12 m² per unit" / "Growing footprint: 12 m²". */
function extractGrowingAreaM2(text: string): number | null {
  // Only grab if the number is explicitly tied to "growing" / "footprint"
  // nearby; a stray "12 m²" elsewhere is a false positive. Note no \b after
  // m² — "²" is a non-word char so \b never matches; drop it.
  const m = text.match(
    /(?:growing|canopy|footprint)[^.\n]{0,30}?([\d,]+(?:\.\d+)?)\s*m[²2]/i
  )
  if (m && m[1]) {
    const n = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0 && n < 10000) return n
  }
  // Alt order: "12 m² growing footprint" / "12 m² canopy"
  const m2 = text.match(
    /([\d,]+(?:\.\d+)?)\s*m[²2]\s+(?:growing|canopy|footprint)/i
  )
  if (m2 && m2[1]) {
    const n = parseFloat(m2[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0 && n < 10000) return n
  }
  return null
}

/** Vertical tiers. "6 vertical tiers" / "across 6 tiers". */
function extractTiers(text: string): number | null {
  const m = text.match(/([\d]{1,2})\s*(?:vertical\s+)?tiers?\b/i)
  if (m && m[1]) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > 0 && n < 50) return n
  }
  return null
}

/** Total tray count. "60 growing trays across 6 vertical tiers". */
function extractTrayCount(text: string): number | null {
  const m = text.match(/([\d]{1,4})\s+(?:growing\s+)?trays?\b/i)
  if (m && m[1]) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > 0 && n < 10000) return n
  }
  return null
}

/** Single tray area. "each 1.2 × 1.0 m" → 1.2 m². */
function extractTrayAreaM2(text: string): number | null {
  // Look for an "each A × B m" pattern where A and B are small numbers.
  const m = text.match(/each\s+([\d.]+)\s*[×x]\s*([\d.]+)\s*m\b/i)
  if (m && m[1] && m[2]) {
    const a = parseFloat(m[1])
    const b = parseFloat(m[2])
    if ([a, b].every(n => Number.isFinite(n) && n > 0 && n < 5)) return a * b
  }
  return null
}

/**
 * Annual batch size. "Annual batch size: 25 units per year" /
 * "batch of 500" / "100 units / year".
 */
function extractBatchSize(text: string): number | null {
  const patterns = [
    /annual\s+batch\s+size[:\s]+([\d,]+)/i,
    /batch\s+size[:\s]+([\d,]+)/i,
    /([\d,]+)\s+units?\s+per\s+year/i,
    /([\d,]+)\s+units?\s*\/\s*year/i,
    /([\d,]+)\s+units?\s+annually/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m && m[1]) {
      const n = parseInt(m[1].replace(/,/g, ''), 10)
      if (Number.isFinite(n) && n > 0 && n < 1_000_000) return n
    }
  }
  return null
}

// ───────────────────────────────────────────────────────────────────────
//  Public API
// ───────────────────────────────────────────────────────────────────────

/**
 * Extract canonical product specs from the founder's brief and the
 * research-stage DesignBrief. Pure regex; no LLM calls.
 *
 * Precedence:
 *   1. DesignBrief.constraints when a structured field exists (batchSize,
 *      maxMassKg, unitCostCeilingGbp) — already LLM-parsed and reliable.
 *   2. Raw briefText regex — primary source for everything else.
 *
 * @param briefText raw founder brief (may be markdown)
 * @param designBrief optional structured brief from research stage
 */
export function extractSpecs(
  briefText: string,
  designBrief?: DesignBrief | null,
): ProductSpecs {
  const text = briefText || ''
  const specs: ProductSpecs = {}

  // Electrical / energy
  const capacityKwh = extractCapacityKwh(text)
  if (capacityKwh !== null) specs.capacityKwh = capacityKwh

  const powerKw = extractPowerKw(text)
  if (powerKw !== null) specs.powerKw = powerKw

  const voltageV = extractVoltageV(text)
  if (voltageV !== null) specs.voltageV = voltageV

  const cellVoltageV = extractCellVoltageV(text)
  if (cellVoltageV !== null) specs.cellVoltageV = cellVoltageV

  const cellCapacityAh = extractCellCapacityAh(text)
  if (cellCapacityAh !== null) specs.cellCapacityAh = cellCapacityAh

  const dod = extractDoD(text)
  if (dod !== null) specs.dod = dod

  // Physical
  const dimensionsMm = extractDimensionsMm(text)
  if (dimensionsMm) specs.dimensionsMm = dimensionsMm

  // Mass: prefer structured DesignBrief constraint if present
  const structMass = designBrief?.constraints?.maxMassKg
  if (typeof structMass === 'number' && structMass > 0) {
    specs.massKg = structMass
  } else {
    const regexMass = extractMassKg(text)
    if (regexMass !== null) specs.massKg = regexMass
  }

  // Vertical farm
  const growingAreaM2 = extractGrowingAreaM2(text)
  if (growingAreaM2 !== null) specs.growingAreaM2 = growingAreaM2
  const tiers = extractTiers(text)
  if (tiers !== null) specs.tiers = tiers
  const trayCount = extractTrayCount(text)
  if (trayCount !== null) specs.trayCount = trayCount
  const trayAreaM2 = extractTrayAreaM2(text)
  if (trayAreaM2 !== null) specs.trayAreaM2 = trayAreaM2

  // Batch size — structured first
  const structBatch = designBrief?.constraints?.batchSize
  if (typeof structBatch === 'number' && structBatch > 0) {
    specs.batchSize = structBatch
  } else {
    const regexBatch = extractBatchSize(text)
    if (regexBatch !== null) specs.batchSize = regexBatch
  }

  return specs
}

/**
 * Human-readable summary of the extracted specs for logging.
 */
export function summariseSpecs(specs: ProductSpecs): string {
  const parts: string[] = []
  if (specs.capacityKwh) parts.push(`${specs.capacityKwh} kWh`)
  if (specs.powerKw) parts.push(`${specs.powerKw} kW`)
  if (specs.voltageV) parts.push(`${specs.voltageV} V bus`)
  if (specs.cellVoltageV && specs.cellCapacityAh)
    parts.push(`${specs.cellVoltageV} V × ${specs.cellCapacityAh} Ah cells`)
  if (specs.dod) parts.push(`${Math.round(specs.dod * 100)} % DoD`)
  if (specs.massKg) parts.push(`${specs.massKg} kg`)
  if (specs.dimensionsMm)
    parts.push(`${specs.dimensionsMm.w}×${specs.dimensionsMm.d}×${specs.dimensionsMm.h} mm`)
  if (specs.growingAreaM2) parts.push(`${specs.growingAreaM2} m² growing`)
  if (specs.tiers) parts.push(`${specs.tiers} tiers`)
  if (specs.trayCount) parts.push(`${specs.trayCount} trays`)
  if (specs.trayAreaM2) parts.push(`${specs.trayAreaM2} m² per tray`)
  if (specs.batchSize) parts.push(`batch ${specs.batchSize}/yr`)
  return parts.length > 0 ? parts.join(', ') : '(no specs extracted)'
}

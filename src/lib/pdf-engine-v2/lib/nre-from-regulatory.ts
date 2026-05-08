import type { NreItem } from '../types'

// INTENT: Compute non-recurring engineering cost by summing per-standard
// estimates from the project's regulatory matrix, rather than using a flat
// domain-based figure.  Each recognised standard is matched to a cost and
// duration band; the NRE total is the sum and the programme duration is the
// maximum (certifications run in parallel).
//
// The classification is deterministic (regex matching on standard codes/names)
// with no LLM calls, so it can run at render time without latency.
//
// PA Stage 7b: also exports computeNreItemsFromRegulatory() which returns the
// new NreItem[] shape for the BESS-style renderer.  All costs are Grade C
// (published industry benchmarks for UK-accredited test-house programmes).

export interface NreLineItem {
  standardCode: string
  standardName: string
  estimatedCostGbp: number
  estimatedDurationWeeks: number
  /** 'regulatory_matrix' when matched to a known standard; 'default' for the generic fallback row. */
  source: 'regulatory_matrix' | 'default'
}

export interface NreBreakdown {
  totalGbp: number
  /** Longest single certification — certifications run in parallel. */
  totalWeeks: number
  items: NreLineItem[]
  /** 'regulatory_sum' when at least one regulatory entry was matched; 'flat_estimate' when falling back to product-class defaults. */
  method: 'regulatory_sum' | 'flat_estimate'
}

// ── Per-standard cost/duration look-up ───────────────────────────────────────
//
// Each rule is { test, costGbp, weeks, label }.  Rules are tried top-to-bottom;
// the first match wins.  Values reference UK-accredited test-house small-batch
// programmes (2025/26 pricing).  Where the existing 7-pdf.tsx inline estimator
// already had reference-grade figures for a specific standard, those figures are
// carried over; otherwise the category midpoints from the task spec are used.

interface StandardRule {
  test: RegExp
  costGbp: number
  weeks: number
  label: string
}

const STANDARD_RULES: StandardRule[] = [
  // ── Aviation ──────────────────────────────────────────────────────────────
  { test: /easa|sc[-\s]?haps|cs[-\s]?23|cs[-\s]?25|cs[-\s]?vla/i, costGbp: 200_000, weeks: 24, label: 'Aviation type certification' },
  { test: /as\s*9100/i, costGbp: 40_000, weeks: 16, label: 'AS9100D quality management system' },
  { test: /do[-\s]?160/i, costGbp: 60_000, weeks: 20, label: 'DO-160 environmental qualification' },

  // ── Medical devices ───────────────────────────────────────────────────────
  { test: /mdr|2017\/745/i, costGbp: 150_000, weeks: 24, label: 'EU MDR class II conformity' },
  { test: /510[\s.]?k/i, costGbp: 80_000, weeks: 20, label: 'FDA 510(k) clearance' },
  { test: /iso\s*13485/i, costGbp: 50_000, weeks: 18, label: 'ISO 13485 quality system' },
  { test: /iec\s*62304/i, costGbp: 25_000, weeks: 8, label: 'IEC 62304 medical software lifecycle' },

  // ── Battery / BESS safety ─────────────────────────────────────────────────
  { test: /ul\s*9540a/i, costGbp: 100_000, weeks: 16, label: 'UL 9540A fire/thermal-runaway test' },
  { test: /ul\s*1973/i, costGbp: 55_000, weeks: 12, label: 'UL 1973 stationary battery type test' },
  { test: /iec\s*62619/i, costGbp: 40_000, weeks: 12, label: 'IEC 62619 cell-level safety type test' },
  { test: /nfpa\s*855/i, costGbp: 10_000, weeks: 8, label: 'NFPA 855 installation design review' },

  // ── UK grid connection ────────────────────────────────────────────────────
  { test: /\bg99\b|grid\s*code/i, costGbp: 60_000, weeks: 20, label: 'G99 UK DNO grid-connection test' },
  { test: /\bg100\b/i, costGbp: 35_000, weeks: 14, label: 'G100 UK export-limit test' },

  // ── Maritime ──────────────────────────────────────────────────────────────
  { test: /dnv|det\s*norske/i, costGbp: 35_000, weeks: 12, label: 'DNV marine classification' },
  { test: /lloyd/i, costGbp: 40_000, weeks: 14, label: "Lloyd's Register marine approval" },
  { test: /imo|marpol/i, costGbp: 25_000, weeks: 10, label: 'IMO/MARPOL compliance' },

  // ── Safety testing (general) ──────────────────────────────────────────────
  { test: /en\s*60335|iec\s*60335/i, costGbp: 18_000, weeks: 6, label: 'EN/IEC 60335 appliance safety' },
  { test: /ul\s*9540\b/i, costGbp: 30_000, weeks: 10, label: 'UL 9540 energy storage safety' },

  // ── Switchgear / electrical ───────────────────────────────────────────────
  { test: /(bs\s*en\s*)?61439/i, costGbp: 50_000, weeks: 14, label: 'BS EN 61439 LV switchgear' },
  { test: /ip\s*[56]\d/i, costGbp: 8_000, weeks: 4, label: 'IP ingress protection rating' },

  // ── Refrigeration / HVAC ──────────────────────────────────────────────────
  { test: /en\s*378/i, costGbp: 20_000, weeks: 8, label: 'EN 378 refrigeration safety' },
  { test: /en\s*14825/i, costGbp: 35_000, weeks: 10, label: 'EN 14825 SCOP performance test' },
  { test: /ped|pressure\s*equipment/i, costGbp: 12_000, weeks: 6, label: 'PED pressure equipment assessment' },
  { test: /mcs\s*mis|mcs\s*30/i, costGbp: 15_000, weeks: 8, label: 'MCS microgeneration accreditation' },
  { test: /f[\s.\-]?gas|517\/2014/i, costGbp: 4_000, weeks: 2, label: 'F-Gas registration' },

  // ── Machinery ─────────────────────────────────────────────────────────────
  { test: /machinery\s*directive|2006\/42/i, costGbp: 8_000, weeks: 4, label: 'Machinery Directive conformity' },
  { test: /en\s*60204/i, costGbp: 15_000, weeks: 6, label: 'EN 60204-1 machinery electrical safety' },

  // ── Transport (UN dangerous goods) ────────────────────────────────────────
  { test: /un\s*38\.3/i, costGbp: 10_000, weeks: 5, label: 'UN 38.3 transport testing' },
  { test: /adr|rid|imdg/i, costGbp: 8_000, weeks: 4, label: 'Dangerous goods transport compliance' },

  // ── EMC / radio ───────────────────────────────────────────────────────────
  { test: /en\s*55032|en\s*55035|en\s*61000/i, costGbp: 5_500, weeks: 3, label: 'EMC emissions/immunity test' },
  { test: /en\s*55|emc\s*directive|2014\/30/i, costGbp: 8_000, weeks: 4, label: 'EMC Directive testing' },
  { test: /en\s*301\s*489|en\s*300\s*328/i, costGbp: 6_000, weeks: 3, label: 'Radio equipment EMC test' },

  // ── CE / UKCA marking ─────────────────────────────────────────────────────
  { test: /ce[\s-]?mark|uk[\s-]?ca[\s-]?mark/i, costGbp: 10_000, weeks: 6, label: 'CE / UKCA technical file' },
  { test: /ukca/i, costGbp: 10_000, weeks: 6, label: 'UKCA marking compliance' },

  // ── Environmental / substance ─────────────────────────────────────────────
  { test: /rohs|2011\/65/i, costGbp: 2_500, weeks: 2, label: 'RoHS self-declaration' },
  { test: /reach|1907\/2006/i, costGbp: 4_000, weeks: 3, label: 'REACH substance declaration' },
  { test: /weee|2012\/19/i, costGbp: 2_500, weeks: 2, label: 'WEEE producer registration' },

  // ── Quality management ────────────────────────────────────────────────────
  { test: /iso\s*9001/i, costGbp: 12_000, weeks: 8, label: 'ISO 9001 certification' },
  { test: /iso\s*14001/i, costGbp: 8_000, weeks: 6, label: 'ISO 14001 environmental management' },

  // ── Food contact ──────────────────────────────────────────────────────────
  { test: /brcgs|bs\s*en\s*1186|eu\s*10\/2011/i, costGbp: 6_000, weeks: 4, label: 'Food-contact material compliance' },
  { test: /wras/i, costGbp: 3_500, weeks: 4, label: 'WRAS potable water approval' },
]

// ── Category-level fallback (broader matching when no specific standard is identified) ──

interface CategoryRule {
  keywords: RegExp[]
  costGbp: number
  weeks: number
  label: string
}

const CATEGORY_RULES: CategoryRule[] = [
  { keywords: [/aviation/i, /aerospace/i, /drone/i, /uav/i, /easa/i, /haps/i], costGbp: 200_000, weeks: 24, label: 'Aviation certification' },
  { keywords: [/medical/i, /mdr/i, /iec\s*62304/i, /iso\s*13485/i, /510k/i], costGbp: 100_000, weeks: 18, label: 'Medical device certification' },
  { keywords: [/maritime/i, /marine/i, /dnv/i, /lloyd/i, /imo/i, /vessel/i, /ship/i], costGbp: 35_000, weeks: 12, label: 'Maritime classification' },
  { keywords: [/battery/i, /bess/i, /energy\s*storage/i, /lithium/i, /cell\s*safety/i], costGbp: 20_000, weeks: 9, label: 'Battery safety testing' },
  { keywords: [/safety/i, /iec\s*60335/i, /ul\s*9540/i], costGbp: 20_000, weeks: 9, label: 'Safety testing' },
  { keywords: [/grid/i, /g99/i, /g100/i, /connection/i, /interconnect/i], costGbp: 7_500, weeks: 6, label: 'Grid connection testing' },
  { keywords: [/transport/i, /un\s*38/i, /dangerous\s*goods/i, /adr/i], costGbp: 10_000, weeks: 5, label: 'Transport compliance' },
  { keywords: [/emc/i, /electromagnetic/i, /en\s*55/i, /en\s*61000/i], costGbp: 5_500, weeks: 3, label: 'EMC testing' },
  { keywords: [/ce/i, /ukca/i, /marking/i, /conformity/i], costGbp: 10_000, weeks: 6, label: 'CE/UKCA marking' },
]

// ── Product-class flat-estimate fallback ─────────────────────────────────────
//
// Used when the regulatory array is empty or no entries could be matched.
// Based on typical NRE for a single-product programme at small batch.

const PRODUCT_CLASS_NRE: Record<string, { costGbp: number; weeks: number }> = {
  battery_energy_storage: { costGbp: 260_000, weeks: 20 },
  heat_pump:              { costGbp: 60_000,  weeks: 12 },
  vertical_farm:          { costGbp: 25_000,  weeks:  8 },
  aerospace:              { costGbp: 300_000, weeks: 32 },
  medical:                { costGbp: 200_000, weeks: 24 },
  vehicle:                { costGbp: 150_000, weeks: 20 },
  consumer_electronics:   { costGbp: 30_000,  weeks:  8 },
  industrial:             { costGbp: 50_000,  weeks: 12 },
}

const DEFAULT_FLAT_NRE = { costGbp: 50_000, weeks: 12 }

// ── Matching logic ───────────────────────────────────────────────────────────

function matchStandard(codeOrName: string): StandardRule | null {
  const trimmed = codeOrName.trim()
  if (!trimmed) return null
  for (const rule of STANDARD_RULES) {
    if (rule.test.test(trimmed)) return rule
  }
  return null
}

function matchCategory(codeOrName: string): CategoryRule | null {
  const trimmed = codeOrName.trim().toLowerCase()
  if (!trimmed) return null
  for (const cat of CATEGORY_RULES) {
    if (cat.keywords.some(kw => kw.test(trimmed))) return cat
  }
  return null
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute non-recurring engineering cost from the project's regulatory matrix.
 *
 * For each regulatory entry, the function first tries a precise per-standard
 * match (UL 9540A, G99, MDR, etc.); failing that it falls back to a
 * category-level match (aviation, battery safety, grid connection, etc.); and
 * finally uses a generic £15k / 6-week default.
 *
 * When no regulatory data is present at all, the function returns a flat
 * estimate based on the product class.
 *
 * @param regulatory - Array of regulatory items from the design brief.
 * @param productClass - Product domain string (e.g. 'battery_energy_storage').
 * @returns NreBreakdown with per-line items, total cost, and programme duration.
 */
export function computeNreFromRegulatory(
  regulatory: Array<{
    code?: string
    name?: string
    summary?: string
    applicability?: string
  }>,
  productClass: string,
): NreBreakdown {
  // No regulatory data → flat estimate from product class.
  if (!regulatory || regulatory.length === 0) {
    const flat = PRODUCT_CLASS_NRE[productClass] || DEFAULT_FLAT_NRE
    return {
      totalGbp: flat.costGbp,
      totalWeeks: flat.weeks,
      items: [{
        standardCode: productClass || 'default',
        standardName: `${productClass || 'General product'} — domain-average NRE`,
        estimatedCostGbp: flat.costGbp,
        estimatedDurationWeeks: flat.weeks,
        source: 'default',
      }],
      method: 'flat_estimate',
    }
  }

  const items: NreLineItem[] = []

  for (const entry of regulatory) {
    const key = entry.code || entry.name || ''
    const trimmedKey = key.trim()

    // Tier 1: precise per-standard match.
    const stdMatch = matchStandard(trimmedKey)
    if (stdMatch) {
      items.push({
        standardCode: trimmedKey || 'unknown',
        standardName: stdMatch.label,
        estimatedCostGbp: stdMatch.costGbp,
        estimatedDurationWeeks: stdMatch.weeks,
        source: 'regulatory_matrix',
      })
      continue
    }

    // Tier 2: category-level match (try code, name, and summary).
    const searchText = [entry.code, entry.name, entry.summary].filter(Boolean).join(' ')
    const catMatch = matchCategory(searchText)
    if (catMatch) {
      items.push({
        standardCode: trimmedKey || 'unknown',
        standardName: catMatch.label,
        estimatedCostGbp: catMatch.costGbp,
        estimatedDurationWeeks: catMatch.weeks,
        source: 'regulatory_matrix',
      })
      continue
    }

    // Tier 3: generic default — "industry-typical certification".
    items.push({
      standardCode: trimmedKey || 'unknown',
      standardName: entry.name || trimmedKey || 'Unidentified standard',
      estimatedCostGbp: 15_000,
      estimatedDurationWeeks: 6,
      source: 'regulatory_matrix',
    })
  }

  const totalGbp = items.reduce((sum, item) => sum + item.estimatedCostGbp, 0)
  // Certifications run in parallel — programme duration is the longest single item.
  const totalWeeks = items.reduce((max, item) => Math.max(max, item.estimatedDurationWeeks), 0)

  return {
    totalGbp,
    totalWeeks,
    items,
    method: 'regulatory_sum',
  }
}

// ── PA Stage 7b — NreItem[] output for the BESS-style renderer ───────────────

/**
 * PA Stage 7b variant: returns the new NreItem[] shape expected by the
 * BESS-style renderer (CostBreakdownPA.nreItems).  Each regulatory standard
 * that requires testing becomes one NreItem.  All items carry grade='C'
 * (published industry benchmark pricing).
 *
 * Unlike computeNreFromRegulatory(), this function never collapses multiple
 * standards into a single total — each entry is preserved as a distinct line
 * so the Cost section renderer can list them individually.
 */
export function computeNreItemsFromRegulatory(
  regulatory: Array<{
    code?: string
    name?: string
    summary?: string
    applicability?: string
  }>,
  productClass: string,
): NreItem[] {
  // No regulatory data → fall back to product-class defaults as individual items.
  if (!regulatory || regulatory.length === 0) {
    const flat = PRODUCT_CLASS_NRE[productClass] || DEFAULT_FLAT_NRE
    return [{
      label: `${productClass || 'General product'} — domain-average NRE`,
      gbp: flat.costGbp,
      durationWeeks: flat.weeks,
      grade: 'C',
    }]
  }

  const result: NreItem[] = []

  for (const entry of regulatory) {
    const key = entry.code || entry.name || ''
    const trimmedKey = key.trim()

    const stdMatch = matchStandard(trimmedKey)
    if (stdMatch) {
      result.push({
        label: stdMatch.label,
        gbp: stdMatch.costGbp,
        durationWeeks: stdMatch.weeks,
        grade: 'C',
      })
      continue
    }

    const searchText = [entry.code, entry.name, entry.summary].filter(Boolean).join(' ')
    const catMatch = matchCategory(searchText)
    if (catMatch) {
      result.push({
        label: catMatch.label,
        gbp: catMatch.costGbp,
        durationWeeks: catMatch.weeks,
        grade: 'C',
      })
      continue
    }

    // Generic default — unknown standard.
    result.push({
      label: entry.name || trimmedKey || 'Unidentified standard',
      gbp: 15_000,
      durationWeeks: 6,
      grade: 'C',
    })
  }

  return result
}

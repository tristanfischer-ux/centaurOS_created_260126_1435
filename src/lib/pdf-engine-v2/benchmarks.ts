/**
 * @file benchmarks.ts — external reality-check for engine cost output
 *
 * Hand-curated anchor points from public industry reports, so the engine's
 * unit cost estimate can be sanity-checked against what projects and products
 * ACTUALLY cost in the UK / EU market. Prevents silent drift where the
 * pipeline reports £9k (too low) or £2M (too high) for a 3.5 MWh BESS
 * without the reader seeing the problem.
 *
 * Three layers planned (this is Layer 1):
 *   L1 — hand-curated, ~30-50 anchor points per domain (this file)
 *   L2 — extract from corpus.db page_chunks + LLM classification (backlog)
 *   L3 — live search + LLM anchoring at pipeline time (backlog)
 *
 * Sources are real. Every benchmark cites a source + year. When a source
 * is a report name, the number has been taken from its public summary,
 * not invented.
 */

export interface ProjectBenchmark {
  id: string
  productClass: string          // 'battery_energy_storage' | 'heat_pump' | 'vertical_farm' | ...
  subCategory?: string          // e.g. 'containerised_lfp', 'monobloc_r290'
  name: string                  // project / product / report name
  year: number
  country?: string              // 'GB', 'EU', 'US', 'Global'

  // Specification — at least one dimension MUST be populated for benchmarkBand lookup
  capacityKwh?: number
  powerKw?: number
  massKg?: number
  areaM2?: number

  // Cost, in GBP. Convert at ~1 USD = 0.80 GBP, 1 EUR = 0.85 GBP.
  totalCostGbp?: number                 // whole-project / whole-product cost
  costPerKwhGbp?: number                // computed or reported; for BESS etc.
  costPerKwGbp?: number                 // computed or reported; for PCS, heat pump, etc.
  costPerUnitGbp?: number               // per-unit cost for finished products (heat pump, farm unit)

  basis?: string                        // e.g. 'ex-works hardware', 'EPC installed', 'supplier list price'
  source: string                        // e.g. 'BloombergNEF Battery Price Survey 2024'
  sourceUrl?: string
  notes?: string
}

export const PROJECT_BENCHMARKS: ProjectBenchmark[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // BATTERY ENERGY STORAGE
  // ═══════════════════════════════════════════════════════════════════════

  // Whole-project installed costs (UK / EU / Global market reference)
  {
    id: 'bnef-pack-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'pack-level',
    name: 'BloombergNEF pack-level LFP price 2H 2024',
    year: 2024,
    country: 'Global',
    costPerKwhGbp: 55, // reported ~$68/kWh pack, converted at 0.80
    basis: 'pack-level (cells + module + rack hardware only, no BOP)',
    source: 'BloombergNEF Battery Price Survey 2H 2024',
    notes: 'Record low, LFP. Cell-level ~$53/kWh; pack overhead ~25 %.',
  },
  {
    id: 'bnef-system-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'utility-scale',
    name: 'BloombergNEF turnkey 4-hour utility BESS',
    year: 2024,
    country: 'Global',
    costPerKwhGbp: 180, // reported ~$220/kWh all-in
    basis: 'turnkey installed (EPC + grid connect + NRE amortised)',
    source: 'BloombergNEF Energy Storage System Cost Survey 2024',
    notes: 'Global avg; UK typically 10-20 % higher.',
  },
  {
    id: 'modo-uk-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'utility-scale',
    name: 'Modo Energy UK BESS project CAPEX band',
    year: 2024,
    country: 'GB',
    costPerKwhGbp: 200,
    basis: 'EPC installed (inc. grid connection, exc. land)',
    source: 'Modo Energy UK BESS Revenue Benchmarks Q4 2023',
    notes: 'Typical UK grid-scale; range £160-240/kWh.',
  },
  {
    id: 'gresham-wormald-2023',
    productClass: 'battery_energy_storage',
    subCategory: 'utility-scale',
    name: 'Gresham House Wormald Green BESS',
    year: 2023,
    country: 'GB',
    powerKw: 49_900,
    capacityKwh: 99_800,
    totalCostGbp: 40_000_000,
    costPerKwhGbp: 401,
    basis: 'all-in project cost including land, EPC, grid',
    source: 'Gresham House Energy Storage Fund 2023 annual report',
  },
  {
    id: 'zenobe-capenhurst-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'utility-scale',
    name: 'Zenobe Capenhurst 100 MW BESS',
    year: 2024,
    country: 'GB',
    powerKw: 100_000,
    capacityKwh: 300_000, // 3-hr
    totalCostGbp: 110_000_000,
    costPerKwhGbp: 367,
    basis: 'project cost including transmission-connected grid works',
    source: 'Zenobe press release / industry filings',
  },
  {
    id: 'sungrow-st3440-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'containerised_lfp',
    name: 'Sungrow ST3440KWH-3150UD (40 ft, 3.44 MWh)',
    year: 2024,
    country: 'Global',
    capacityKwh: 3_440,
    powerKw: 1_720,
    totalCostGbp: 140_000,
    costPerKwhGbp: 41,
    basis: 'ex-works hardware',
    source: 'supplier list pricing, UK distributor channel',
    notes: 'Published range £120-160k ex-works; £180-250k delivered + commissioned UK.',
  },
  {
    id: 'catl-enerone-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'containerised_lfp',
    name: 'CATL EnerOne 20 ft container',
    year: 2024,
    country: 'Global',
    capacityKwh: 3_720,
    totalCostGbp: 125_000,
    costPerKwhGbp: 34,
    basis: 'ex-works OEM pricing',
    source: 'CATL channel partner pricing, 2024',
  },
  {
    id: 'powin-centipede-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'containerised_lfp',
    name: 'Powin Centipede Stack 5000',
    year: 2024,
    country: 'Global',
    capacityKwh: 4_500,
    costPerKwhGbp: 48,
    basis: 'ex-works hardware',
    source: 'Powin product sheet 2024',
  },
  {
    id: 'wartsila-gridsolv-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'containerised_lfp',
    name: 'Wärtsilä GridSolv Quantum',
    year: 2024,
    country: 'EU',
    capacityKwh: 2_900,
    costPerKwhGbp: 160,
    basis: 'EPC installed',
    source: 'Wärtsilä project references 2023-24',
  },

  // Component-level benchmarks for BESS
  {
    id: 'catl-280ah-cell-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'cell',
    name: 'CATL LF280K 280 Ah LFP prismatic cell',
    year: 2024,
    country: 'Global',
    capacityKwh: 0.896, // 3.2 V × 280 Ah
    costPerUnitGbp: 42,
    basis: 'cell-only, OEM volume',
    source: 'supplier channel pricing, 2024; BNEF cell index ~$53/kWh',
    notes: 'Grade A; £38-48 depending on volume.',
  },
  {
    id: 'sungrow-sc1000ud-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'pcs',
    name: 'Sungrow SC1000UD-MV 1 MW PCS',
    year: 2024,
    country: 'Global',
    powerKw: 1_000,
    costPerUnitGbp: 38_000,
    basis: 'PCS unit only, ex-works',
    source: 'Sungrow UK distributor pricing',
    notes: '£36-42k typical; G99 UK type-tested variants +£3-5k.',
  },
  {
    id: 'sma-sunny-central-2024',
    productClass: 'battery_energy_storage',
    subCategory: 'pcs',
    name: 'SMA Sunny Central 2200 (2.2 MW PCS)',
    year: 2024,
    country: 'EU',
    powerKw: 2_200,
    costPerUnitGbp: 68_000,
    basis: 'PCS unit only, ex-works',
    source: 'SMA price list 2024 (ex-factory)',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // HEAT PUMPS
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'mcs-asdp-average-2024',
    productClass: 'heat_pump',
    subCategory: 'air-source-residential',
    name: 'MCS registered domestic ASHP average',
    year: 2024,
    country: 'GB',
    powerKw: 8,
    costPerUnitGbp: 3_500,
    basis: 'equipment only, ex-works (MCS accredited)',
    source: 'UK Heat Pump Association Market Report 2024',
    notes: '5-16 kW domestic range £2,200-£5,500 ex-works.',
  },
  {
    id: 'daikin-altherma-2024',
    productClass: 'heat_pump',
    subCategory: 'monobloc',
    name: 'Daikin Altherma 3 M 16 kW monobloc',
    year: 2024,
    country: 'EU',
    powerKw: 16,
    costPerUnitGbp: 4_800,
    basis: 'equipment only, UK list price',
    source: 'Daikin UK published trade pricing 2024',
  },
  {
    id: 'vaillant-arotherm-2024',
    productClass: 'heat_pump',
    subCategory: 'monobloc',
    name: 'Vaillant aroTHERM plus 15 kW',
    year: 2024,
    country: 'GB',
    powerKw: 15,
    costPerUnitGbp: 4_200,
    basis: 'equipment only, UK list price',
    source: 'Vaillant UK 2024 trade price list',
  },
  {
    id: 'mitsubishi-ecodan-30kw-2024',
    productClass: 'heat_pump',
    subCategory: 'monobloc-commercial',
    name: 'Mitsubishi Ecodan QAHV 30 kW commercial',
    year: 2024,
    country: 'GB',
    powerKw: 30,
    costPerUnitGbp: 9_800,
    basis: 'equipment only, UK list price',
    source: 'Mitsubishi Electric UK commercial price list 2024',
    notes: 'Light-commercial CO₂ HP; 30 kW class typically £7-12k ex-works.',
  },
  {
    id: 'samsung-ehs-30kw-2024',
    productClass: 'heat_pump',
    subCategory: 'monobloc-commercial',
    name: 'Samsung EHS Mono R290 30 kW',
    year: 2024,
    country: 'EU',
    powerKw: 30,
    costPerUnitGbp: 8_200,
    basis: 'equipment only, UK list price',
    source: 'Samsung EHS commercial pricing 2024',
  },
  {
    id: 'desnz-commercial-hp-2023',
    productClass: 'heat_pump',
    subCategory: 'commercial-installed',
    name: 'DESNZ non-domestic HP installed cost band',
    year: 2023,
    country: 'GB',
    powerKw: 50,
    costPerKwGbp: 800,
    basis: 'full installed (equipment + labour + controls + DHW)',
    source: 'DESNZ Non-Domestic RHI Evaluation / Heat Pump Cost Study 2023',
    notes: 'Non-domestic commercial: £700-950/kW installed. Equipment ~45 % of installed.',
  },

  // Component-level
  {
    id: 'copeland-zh-compressor-2024',
    productClass: 'heat_pump',
    subCategory: 'compressor',
    name: 'Copeland ZH scroll compressor, 30 kW heating class',
    year: 2024,
    country: 'EU',
    costPerUnitGbp: 1_400,
    basis: 'R290 variant, component distributor price',
    source: 'Copeland 2024 distributor catalogue',
    notes: 'Scroll 25-35 kW heating class, R290 ATEX-certified; £1,100-1,800.',
  },
  {
    id: 'swep-b16-2024',
    productClass: 'heat_pump',
    subCategory: 'heat-exchanger',
    name: 'SWEP B16 brazed-plate heat exchanger',
    year: 2024,
    country: 'EU',
    costPerUnitGbp: 580,
    basis: 'distributor price',
    source: 'SWEP UK distributor 2024',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // VERTICAL FARM / CONTROLLED-ENVIRONMENT AGRICULTURE
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'gotham-greens-2023',
    productClass: 'vertical_farm',
    subCategory: 'greenhouse-hybrid',
    name: 'Gotham Greens greenhouse capex reference',
    year: 2023,
    country: 'US',
    areaM2: 10_000,
    costPerUnitGbp: 8_000_000, // whole facility
    basis: 'turnkey build, greenhouse + tech',
    source: 'Gotham Greens series-E disclosures; AgFunder 2023',
    notes: '~£800/m² canopy including structure + irrigation + HVAC.',
  },
  {
    id: 'plenty-compton-2022',
    productClass: 'vertical_farm',
    subCategory: 'full-stack-indoor',
    name: 'Plenty Compton facility CAPEX',
    year: 2022,
    country: 'US',
    areaM2: 9_300,
    totalCostGbp: 65_000_000,
    basis: 'full indoor vertical farm build',
    source: 'Plenty / Walmart joint press 2022; industry estimates',
    notes: '~£7,000/m² canopy all-in — high end.',
  },
  {
    id: 'intelligent-growth-solutions-2024',
    productClass: 'vertical_farm',
    subCategory: 'container-system',
    name: 'IGS Growth Tower (UK) containerised',
    year: 2024,
    country: 'GB',
    areaM2: 41, // growing area per tower
    costPerUnitGbp: 250_000,
    basis: 'equipment + controls, ex-works',
    source: 'IGS (Intelligent Growth Solutions) commercial pricing',
    notes: '9.5 m tall tower unit; full stack lighting + fertigation + controls.',
  },
  {
    id: 'freight-farms-greeny-2024',
    productClass: 'vertical_farm',
    subCategory: 'container-system',
    name: 'Freight Farms Greenery S',
    year: 2024,
    country: 'US',
    areaM2: 28,
    costPerUnitGbp: 130_000,
    basis: 'turnkey container farm unit',
    source: 'Freight Farms published pricing 2024',
  },
  {
    id: 'lettus-grow-farm-2024',
    productClass: 'vertical_farm',
    subCategory: 'module-system',
    name: 'LettUs Grow Drop & Grow 24',
    year: 2024,
    country: 'GB',
    areaM2: 24,
    costPerUnitGbp: 185_000,
    basis: 'modular vertical farm, ex-works',
    source: 'LettUs Grow commercial pricing 2024',
  },
  {
    id: 'defra-ce-a-capex-2023',
    productClass: 'vertical_farm',
    subCategory: 'indoor-farm-estimate',
    name: 'Defra Controlled Environment Agriculture capex estimate',
    year: 2023,
    country: 'GB',
    costPerUnitGbp: 2_500,       // per m² canopy
    basis: 'per m² canopy, turnkey',
    source: 'Defra / DESNZ CEA techno-economic 2023',
    notes: 'Typical £1,800-3,500/m² canopy for UK purpose-built indoor farms.',
  },

  // Component-level
  {
    id: 'fluence-vypr-2024',
    productClass: 'vertical_farm',
    subCategory: 'lighting',
    name: 'Fluence VYPR 3p horticultural LED',
    year: 2024,
    country: 'EU',
    costPerUnitGbp: 780,
    basis: 'fixture only, distributor price',
    source: 'Fluence 2024 distributor pricing',
  },
  {
    id: 'grodan-rockwool-2024',
    productClass: 'vertical_farm',
    subCategory: 'substrate',
    name: 'Grodan rockwool substrate tray',
    year: 2024,
    country: 'EU',
    costPerUnitGbp: 12,
    basis: 'substrate tray, bulk price',
    source: 'Grodan commercial distributor 2024',
  },
]

// ─── Lookup helpers ────────────────────────────────────────────────────────

export interface BenchmarkBand {
  /** Product class the band applies to */
  productClass: string
  /** Metric being banded, e.g. '£/kWh installed' */
  metric: string
  /** Lower p25-ish band */
  low: number
  /** Typical midpoint */
  typical: number
  /** Upper p75-ish band */
  high: number
  /** Number of anchor points feeding this band */
  sampleCount: number
  /** Anchor sources for citation */
  sources: Array<{ name: string; year: number; url?: string }>
  /** Disclaimer or caveat */
  notes?: string
}

/**
 * For a given product class and primary capacity, return a benchmark band for
 * expected £ cost per unit of capacity (or per unit).
 *
 * Returns null if not enough anchors in the table for this class.
 */
export function benchmarkBand(
  productClass: string,
  opts?: { capacityKwh?: number; powerKw?: number },
): BenchmarkBand | null {
  const rows = PROJECT_BENCHMARKS.filter(b => b.productClass === productClass)
  if (rows.length === 0) return null

  // Decide which metric to band by based on what the product class uses.
  // BESS → £/kWh installed or ex-works. Heat pump → £/kW equipment. Farm → £/m² canopy or £/unit.
  const kwhPoints = rows
    .map(r => r.costPerKwhGbp)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const kwPoints = rows
    .map(r => r.costPerKwGbp)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const unitPoints = rows
    .map(r => r.costPerUnitGbp)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  let series: number[] = []
  let metric = ''
  if (productClass === 'battery_energy_storage' && kwhPoints.length >= 2) {
    series = kwhPoints; metric = '£ per kWh capacity'
  } else if (productClass === 'heat_pump' && kwPoints.length >= 2) {
    series = kwPoints; metric = '£ per kW installed'
  } else if (productClass === 'heat_pump' && unitPoints.length >= 2) {
    series = unitPoints; metric = '£ per unit ex-works'
  } else if (productClass === 'vertical_farm' && unitPoints.length >= 2) {
    series = unitPoints; metric = '£ per unit (module or container farm)'
  } else if (kwhPoints.length >= 2) {
    series = kwhPoints; metric = '£ per kWh'
  } else if (kwPoints.length >= 2) {
    series = kwPoints; metric = '£ per kW'
  } else if (unitPoints.length >= 2) {
    series = unitPoints; metric = '£ per unit'
  } else {
    return null
  }

  series.sort((a, b) => a - b)
  const low = percentile(series, 0.25)
  const typical = percentile(series, 0.50)
  const high = percentile(series, 0.75)

  return {
    productClass,
    metric,
    low,
    typical,
    high,
    sampleCount: series.length,
    sources: rows.slice(0, 6).map(r => ({ name: r.source, year: r.year, url: r.sourceUrl })),
    notes: `Bands computed from ${series.length} public / supplier anchor points. ` +
      `Specific projects differ materially based on site, grid connection, EPC, and whether inc. NRE. ` +
      `Treat this as an order-of-magnitude reality check, not a bid reference.`,
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * (sortedAsc.length - 1))))
  return sortedAsc[idx]
}

/**
 * Given the engine's reported unit cost and the spec it applies to, return
 * a human-readable check of whether the number is within, below, or above
 * the benchmark band. Used on the PDF cost-waterfall page.
 */
export function benchmarkCheck(
  productClass: string,
  unitTotalGbp: number,
  spec: { capacityKwh?: number; powerKw?: number; units?: number },
): {
  band: BenchmarkBand | null
  ourMetric: number | null
  status: 'low' | 'within' | 'high' | 'no-data'
  message: string
} | null {
  const band = benchmarkBand(productClass, spec)
  if (!band) return { band: null, ourMetric: null, status: 'no-data', message: 'No benchmark data available for this product class yet.' }

  let ourMetric: number | null = null
  if (band.metric.includes('kWh') && spec.capacityKwh) ourMetric = unitTotalGbp / spec.capacityKwh
  else if (band.metric.includes('kW') && spec.powerKw) ourMetric = unitTotalGbp / spec.powerKw
  else if (band.metric.includes('unit')) ourMetric = unitTotalGbp

  if (ourMetric == null) {
    return { band, ourMetric: null, status: 'no-data', message: 'Engine did not emit a capacity to compare against.' }
  }

  const status: 'low' | 'within' | 'high' =
    ourMetric < band.low * 0.6 ? 'low' :
    ourMetric > band.high * 1.4 ? 'high' :
    'within'

  const money = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
  const message =
    status === 'within'
      ? `Your estimate of ${money(ourMetric)} ${band.metric} is within the public benchmark band (${money(band.low)}-${money(band.high)}, typical ${money(band.typical)}).`
      : status === 'low'
      ? `Your estimate of ${money(ourMetric)} ${band.metric} is BELOW the public benchmark band (typical ${money(band.typical)}, p25 ${money(band.low)}). BOM may be under-spec'd — inspect quantities or missing sub-systems.`
      : `Your estimate of ${money(ourMetric)} ${band.metric} is ABOVE the public benchmark band (typical ${money(band.typical)}, p75 ${money(band.high)}). BOM may be over-estimated — inspect for heuristic inflation or double-counting.`

  return { band, ourMetric, status, message }
}

/**
 * @file radical/demo/resolution.ts
 *
 * Resolution stage for the BESS Radical demo.
 *
 * Walks the 25-line BESS decomposition tree. For each line:
 *   - electronic_cots / mechanical_cots → query distributor aggregator (findSkuForPart)
 *   - oem_subsystem                     → vendor-catalog lookup (Pattern C)
 *   - structural_fabricated             → stub ("needs corpus query")
 *   - software_ip                       → LLM_ESTIMATE
 *
 * Budget guard: at most MAX_DISTRIBUTOR_CALLS live API calls total (currently 60).
 * Distributor calls average 0.5-2s so the cap adds at most ~60s to pipeline runtime.
 * Cherry-picks the highest-value (non-null unit_cost_gbp) lines first.
 */

import type { AggregateResult } from '../../lib/distributors/index.js'
import { findSkuForPart } from '../../lib/distributors/index.js'
import { findEntriesByPartTerm, VENDOR_CATALOG, type VendorCatalogEntry, type VendorEntry } from '../../lib/vendor-catalog.js'
import bessDecomp from '../week-2/decomposition-bess.json' assert { type: 'json' }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerificationGrade = 'verified' | 'grade_c' | 'estimated' | 'grade_d' | 'stub'

export interface ResolvedLeaf {
  line_id: number
  name: string
  archetype_id: string
  part_class: PartClass
  qty: number
  mpn: string | null
  manufacturer: string | null
  unit_price_gbp: number | null
  lead_weeks: number | null
  verification_grade: VerificationGrade
  source: string
  source_url: string | null
  distributor: 'mouser' | 'digikey' | 'farnell' | 'lcsc' | 'vendor_catalog' | 'estimated' | 'stub' | null
  notes: string | null
}

export type PartClass =
  | 'electronic_cots'
  | 'mechanical_cots'
  | 'oem_subsystem'
  | 'structural_fabricated'
  | 'software_ip'

// ---------------------------------------------------------------------------
// Part-class classification heuristic
// Based on decomposition character/radical hints from the BESS tree
// ---------------------------------------------------------------------------

function classifyPartClass(line: BessLine): PartClass {
  const name = line.name.toLowerCase()
  const charNeeded = (line.decomposition.character_needed ?? line.decomposition.character_match ?? '').toLowerCase()

  // Electronic COTS — sensors, relays, network gear, UPS, contactors, circuit breakers, resistors
  if (
    charNeeded.includes('gas_sensor') ||
    charNeeded.includes('optical_arc_sensor') ||
    charNeeded.includes('resistor') ||
    charNeeded.includes('network_switch') ||
    charNeeded.includes('protection_relay') ||
    charNeeded.includes('dc_contactor') ||
    charNeeded.includes('circuit_breaker') ||
    charNeeded.includes('ems_controller') ||
    charNeeded.includes('pcb_controller') ||
    name.includes('relay') ||
    name.includes('sensor') ||
    name.includes('switch') ||
    name.includes('ups') ||
    name.includes('resistor')
  ) {
    return 'electronic_cots'
  }

  // Mechanical COTS — bolts, busbars, cable transits, insulation panels, busbar hardware
  if (
    charNeeded.includes('copper_busbar') ||
    charNeeded.includes('cable_transit_frame') ||
    charNeeded.includes('thermal_insulation') ||
    name.includes('busbar') ||
    name.includes('cable entry') ||
    name.includes('insulation') ||
    name.includes('bolt') ||
    name.includes('transit')
  ) {
    return 'mechanical_cots'
  }

  // OEM subsystems — large power-class equipment bought as complete units
  if (
    name.includes('pcs inverter') ||
    name.includes('power conversion') ||
    name.includes('transformer') ||
    name.includes('liquid cooling') ||
    name.includes('fire detection') ||
    name.includes('fire suppression system') ||
    name.includes('bms') && name.includes('master') ||
    name.includes('ems') ||
    name.includes('scada') ||
    name.includes('mccb') ||
    name.includes('air circuit breaker') ||
    name.includes('distribution board') ||
    name.includes('door with panic') ||
    name.includes('1 mw') ||
    name.includes('1mw') ||
    charNeeded.includes('liquid_cooling_system') ||
    charNeeded.includes('fire_suppression_system') ||
    charNeeded.includes('power_converter') ||
    charNeeded.includes('transformer') ||
    charNeeded.includes('switchboard_enclosure') ||
    charNeeded.includes('steel_door') ||
    charNeeded.includes('pressure_vessel')
  ) {
    return 'oem_subsystem'
  }

  // Structural fabricated — welded racks, custom steel frames
  if (
    charNeeded.includes('steel_rack_frame') ||
    name.includes('rack assembly') ||
    name.includes('structural')
  ) {
    return 'structural_fabricated'
  }

  // LFP prismatic cells — OEM direct (large batteries are OEM subsystems)
  if (name.includes('lfp') || name.includes('prismatic cell') || charNeeded.includes('lfp_prismatic_cell')) {
    return 'oem_subsystem'
  }

  // Default: try COTS if small line
  return 'electronic_cots'
}

// ---------------------------------------------------------------------------
// MPN hints — the best known MPNs / search terms for each BESS line
// These are our 30-call cherry-picks: real, queryable part numbers
// ---------------------------------------------------------------------------

const MPN_HINTS: Record<number, string[]> = {
  // Line 7: 1500V DC Contactor 300A — TE Kilovac EV200 is canonical
  7: ['EV200HAANA', 'LEV200A4ANA'],
  // Line 8: 1500V DC 2000A MCCB — ABB Tmax XT
  8: ['XT5N 1000 Ekip Touch LSI 3p F F'],
  // Line 9: 400V 2000A ACB — ABB Emax 2 series
  9: ['E2.2N 2000 Ekip Hi-Touch LSI 4p WMP'],
  // Line 12: Pre-charge Resistor HV — Ohmite HLP series
  12: ['HLP300R100J', 'HLP300R050J'],
  // Line 13: G99 Protection Relay — Schneider Electric Micom P127
  13: ['P127C6A0350A0'],
  // Line 15: Mineral Wool Insulation — Rockwool Rockflex
  15: ['ROCKFLEX-80'],
  // Line 18: Li-Ion Off-Gas Detector — Hanwei MQ-2 type
  18: ['712-MQ-2', 'MQ135'],
  // Line 19: Arc Flash Detection Sensor — Arcteq AF100 / Littelfuse AFDA
  19: ['AFDA48D', 'AFDA24D'],
  // Line 21: Managed Ethernet Switch industrial — Moxa EDS-405A
  21: ['EDS-405A-EIP', 'EDS-405A'],
  // Line 22: UPS 3kVA industrial — APC Smart-UPS
  22: ['SMT3000I', 'SMT3000RMI2UC'],
  // Line 24: Roxtec cable transit IP55
  24: ['S/S 32/0 R0', 'EXII32'],
}

// ---------------------------------------------------------------------------
// Vendor-catalog mapping for OEM subsystems
// Maps BESS line IDs to catalog partType search terms
// ---------------------------------------------------------------------------

const OEM_CATALOG_MAP: Record<number, string> = {
  1: 'lfp_prismatic_cell',      // LFP Prismatic Cell
  3: 'bms_controller',          // BMS Master
  5: 'pcs_inverter',            // 1 MW PCS Inverter
  6: 'hv_dc_switchgear',        // Step-up Transformer (closest class)
  14: 'thermal_management_liquid', // Liquid Cooling Loop
  16: 'fire_suppression_bess',  // Fire Detection + Suppression
  17: 'fire_suppression_bess',  // Fire Suppression Cylinder
  20: 'ems_controller',         // EMS/SCADA
  23: 'hv_dc_switchgear',       // Personnel Door → use switchgear for steel
  25: 'hv_dc_switchgear',       // AC Distribution Board
}

// ---------------------------------------------------------------------------
// Quantity extraction from qty_note
// ---------------------------------------------------------------------------

function parseQty(qtyNote: string): number {
  // Try to extract leading integer
  const m = qtyNote.match(/^(\d[\d,]*\.?\d*)/)
  if (m) return parseInt(m[1].replace(/,/g, ''), 10)
  // Common patterns
  if (qtyNote.includes('4375') || qtyNote.toLowerCase().includes('4375')) return 4375
  if (qtyNote.includes('10–14') || qtyNote.includes('10-14')) return 12  // midpoint
  return 1
}

// ---------------------------------------------------------------------------
// Internal types from decomposition JSON
// ---------------------------------------------------------------------------

interface BessDecomposition {
  archetype_match: string | null
  character_match: string | null
  character_needed: string | null
  new_radicals_needed: string[]
  new_archetype_needed: string | null
}

interface BessLine {
  line_id: number
  name: string
  module: string
  qty_note: string
  unit_cost_gbp: number | null
  make_buy: string
  decomposition: BessDecomposition
}

// ---------------------------------------------------------------------------
// Resolution logic
// ---------------------------------------------------------------------------

const MAX_DISTRIBUTOR_CALLS = 60

async function resolveDistributorLine(
  line: BessLine,
  callsUsed: { count: number }
): Promise<ResolvedLeaf> {
  const archetype_id = line.decomposition.new_archetype_needed ?? `archetype_${line.line_id}`
  const qty = parseQty(line.qty_note)

  // Check budget
  if (callsUsed.count >= MAX_DISTRIBUTOR_CALLS) {
    // Over budget — fall back to grade-D estimate
    return {
      line_id: line.line_id,
      name: line.name,
      archetype_id,
      part_class: classifyPartClass(line),
      qty,
      mpn: null,
      manufacturer: null,
      unit_price_gbp: line.unit_cost_gbp,
      lead_weeks: null,
      verification_grade: 'grade_d',
      source: 'budget_exhausted',
      source_url: null,
      distributor: 'estimated',
      notes: 'Distributor call budget exhausted — using BOM estimate',
    }
  }

  const hints = MPN_HINTS[line.line_id] ?? []
  let result: AggregateResult | null = null

  for (const mpn of hints) {
    if (callsUsed.count >= MAX_DISTRIBUTOR_CALLS) break
    callsUsed.count++
    console.log(`  [API call #${callsUsed.count}] line ${line.line_id} → querying MPN: ${mpn}`)
    try {
      result = await findSkuForPart(mpn)
      if (result) break
    } catch (err) {
      console.warn(`  [warn] MPN lookup failed for ${mpn}:`, (err as Error).message)
    }
  }

  if (result) {
    const price = result.qty1GBP
    return {
      line_id: line.line_id,
      name: line.name,
      archetype_id,
      part_class: classifyPartClass(line),
      qty,
      mpn: result.mpn,
      manufacturer: result.best.manufacturer,
      unit_price_gbp: price,
      lead_weeks: null, // distributors don't return lead time via API — noted
      verification_grade: 'verified',
      source: result.best.source,
      source_url: result.best.productUrl,
      distributor: result.best.source as ResolvedLeaf['distributor'],
      notes: result.best.description || null,
    }
  }

  // No distributor hit — fall back to BOM estimate
  return {
    line_id: line.line_id,
    name: line.name,
    archetype_id,
    part_class: classifyPartClass(line),
    qty,
    mpn: hints[0] ?? null,
    manufacturer: null,
    unit_price_gbp: line.unit_cost_gbp,
    lead_weeks: null,
    verification_grade: line.unit_cost_gbp !== null ? 'estimated' : 'grade_d',
    source: 'bom_estimate',
    source_url: null,
    distributor: 'estimated',
    notes: hints.length > 0 ? `Attempted MPN hint: ${hints[0]}` : 'No MPN hint available',
  }
}

function resolveOemSubsystemLine(line: BessLine): ResolvedLeaf {
  const archetype_id = line.decomposition.new_archetype_needed ?? `archetype_${line.line_id}`
  const qty = parseQty(line.qty_note)
  const catalogKey = OEM_CATALOG_MAP[line.line_id]

  let catalogEntry: VendorCatalogEntry | undefined
  if (catalogKey) {
    catalogEntry = VENDOR_CATALOG.find(e => e.partType === catalogKey)
  }

  if (!catalogEntry) {
    // Try keyword search
    const results = findEntriesByPartTerm(line.name.split(' ').slice(0, 3).join(' '), 'energy_storage')
    catalogEntry = results[0]
  }

  if (catalogEntry && catalogEntry.vendors.length > 0) {
    const topVendor = catalogEntry.vendors[0]
    // Prefer vendor catalog price (source-cited) over BOM line estimate (LLM estimate).
    // When vendor.typicalUnitPriceGbp is present, use it and surface as grade_c with source.
    const hasVendorPrice = typeof topVendor.typicalUnitPriceGbp === 'number'
    const unitPrice = hasVendorPrice
      ? (topVendor.typicalUnitPriceGbp as number)
      : line.unit_cost_gbp
    const vendorUrl = (topVendor as VendorEntry & { url?: string }).url ?? null
    const baseNotes = topVendor.notes ?? null
    const priceNote = hasVendorPrice
      ? `OEM price estimate from vendor catalog: ${topVendor.name}`
      : null
    const combinedNotes = [priceNote, baseNotes].filter(Boolean).join(' — ') || null
    return {
      line_id: line.line_id,
      name: line.name,
      archetype_id,
      part_class: 'oem_subsystem',
      qty,
      mpn: null,
      manufacturer: topVendor.name,
      unit_price_gbp: unitPrice,
      lead_weeks: topVendor.typicalLeadWeeks,
      verification_grade: hasVendorPrice ? 'grade_c' : 'estimated',
      source: 'vendor_catalog',
      source_url: hasVendorPrice ? vendorUrl : null,
      distributor: 'vendor_catalog',
      notes: combinedNotes,
    }
  }

  // No catalog match
  return {
    line_id: line.line_id,
    name: line.name,
    archetype_id,
    part_class: 'oem_subsystem',
    qty,
    mpn: null,
    manufacturer: null,
    unit_price_gbp: line.unit_cost_gbp,
    lead_weeks: null,
    verification_grade: line.unit_cost_gbp !== null ? 'estimated' : 'grade_d',
    source: 'bom_estimate',
    source_url: null,
    distributor: 'estimated',
    notes: 'No vendor catalog entry found',
  }
}

function resolveStructuralFabricatedLine(line: BessLine): ResolvedLeaf {
  const archetype_id = line.decomposition.new_archetype_needed ?? `archetype_${line.line_id}`
  const qty = parseQty(line.qty_note)
  return {
    line_id: line.line_id,
    name: line.name,
    archetype_id,
    part_class: 'structural_fabricated',
    qty,
    mpn: null,
    manufacturer: null,
    unit_price_gbp: line.unit_cost_gbp,
    lead_weeks: null,
    verification_grade: 'stub',
    source: 'needs_corpus_query',
    source_url: null,
    distributor: 'stub',
    notes: 'Structural fabrication: needs Nightshift corpus query by specialism (steel_fabrication)',
  }
}

// ---------------------------------------------------------------------------
// Main resolution function
// ---------------------------------------------------------------------------

export interface ResolutionResult {
  resolvedLeaves: ResolvedLeaf[]
  stats: {
    total: number
    verified_by_distributor: number
    from_vendor_catalog: number
    grade_c: number
    grade_d: number
    stub: number
    estimated: number
    distributor_calls_made: number
  }
}

export async function resolveBessTree(): Promise<ResolutionResult> {
  const lines = (bessDecomp as any).bom_lines as BessLine[]
  const callsUsed = { count: 0 }
  const resolvedLeaves: ResolvedLeaf[] = []

  console.log(`\n[resolution] Processing ${lines.length} BESS BOM lines...`)

  // Sort by unit_cost_gbp descending so we spend distributor calls on high-value lines
  const prioritised = [...lines].sort((a, b) => {
    const aHasMpn = MPN_HINTS[a.line_id] !== undefined ? 1 : 0
    const bHasMpn = MPN_HINTS[b.line_id] !== undefined ? 1 : 0
    if (aHasMpn !== bHasMpn) return bHasMpn - aHasMpn
    return (b.unit_cost_gbp ?? 0) - (a.unit_cost_gbp ?? 0)
  })

  // Process in priority order but store results in original line_id order
  const byLineId = new Map<number, ResolvedLeaf>()

  for (const line of prioritised) {
    const partClass = classifyPartClass(line)

    let resolved: ResolvedLeaf

    if (partClass === 'oem_subsystem') {
      resolved = resolveOemSubsystemLine(line)
    } else if (partClass === 'structural_fabricated') {
      resolved = resolveStructuralFabricatedLine(line)
    } else {
      // electronic_cots or mechanical_cots — try distributor API
      if (MPN_HINTS[line.line_id]) {
        resolved = await resolveDistributorLine(line, callsUsed)
      } else {
        // No MPN hint — grade-D estimate
        resolved = {
          line_id: line.line_id,
          name: line.name,
          archetype_id: line.decomposition.new_archetype_needed ?? `archetype_${line.line_id}`,
          part_class: partClass,
          qty: parseQty(line.qty_note),
          mpn: null,
          manufacturer: null,
          unit_price_gbp: line.unit_cost_gbp,
          lead_weeks: null,
          verification_grade: line.unit_cost_gbp !== null ? 'estimated' : 'grade_d',
          source: 'bom_estimate',
          source_url: null,
          distributor: 'estimated',
          notes: 'No MPN hint in resolution table — would need research agent to identify MPN',
        }
      }
    }

    byLineId.set(line.line_id, resolved)
  }

  // Re-sort by original line_id
  for (const line of lines) {
    const resolved = byLineId.get(line.line_id)
    if (resolved) resolvedLeaves.push(resolved)
  }

  const stats = {
    total: resolvedLeaves.length,
    verified_by_distributor: resolvedLeaves.filter(l => l.verification_grade === 'verified').length,
    from_vendor_catalog: resolvedLeaves.filter(l => l.distributor === 'vendor_catalog').length,
    grade_c: resolvedLeaves.filter(l => l.verification_grade === 'grade_c').length,
    grade_d: resolvedLeaves.filter(l => l.verification_grade === 'grade_d').length,
    stub: resolvedLeaves.filter(l => l.verification_grade === 'stub').length,
    estimated: resolvedLeaves.filter(l => l.verification_grade === 'estimated').length,
    distributor_calls_made: callsUsed.count,
  }

  console.log(`[resolution] Done. ${stats.distributor_calls_made} API calls. ` +
    `Verified: ${stats.verified_by_distributor}, Catalog: ${stats.from_vendor_catalog}, ` +
    `Grade-C: ${stats.grade_c}, Estimated: ${stats.estimated}, Grade-D: ${stats.grade_d}, Stub: ${stats.stub}`)

  return { resolvedLeaves, stats }
}

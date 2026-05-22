/**
 * @file quantity-derivation.ts — deterministic BOM quantity rules
 *
 * Purpose: replace LLM-guessed BOM quantities with formulae derived from
 * the extracted ProductSpecs. The LLM is allowed to name parts freely;
 * we override the quantities after the BOM is generated.
 *
 * Why: BOM cost is qty × unit cost. The cost-model (B1b) multiplies
 * correctly, but LLM-generated qty can swing ~20× between runs on the
 * same brief (272 cells one run, 5,000 the next). Deterministic qty
 * closes that gap.
 *
 * Scope: matches part names against classifier rules. Does NOT rewrite
 * part names, costs, or suppliers. Does NOT inject new parts. If a rule
 * doesn't match the part, qty is left as the LLM produced it.
 */

import type { ProductSpecs } from './spec-extraction'

/** A single quantity override result from `deriveQuantities`. */
export interface QuantityOverride {
  partId: string
  partNumber: string
  partName: string
  oldQty: number
  newQty: number
  rule: string
  confidence: number
  explanation: string
}

/** Minimal shape the BOM stage passes in. Kept loose so test fixtures are easy. */
export interface PartLike {
  id?: string
  partNumber: string
  name: string
  sourceModuleId?: string
}

/** Minimal BomLine shape for lookup. */
export interface BomLineLike {
  childPartId: string
  quantity: number
}

// ───────────────────────────────────────────────────────────────────────
//  Part-classifier helpers — tight regexes on part name / partNumber
// ───────────────────────────────────────────────────────────────────────

function isBessCell(name: string): boolean {
  const n = name.toLowerCase()
  // "LFP prismatic cell", "CATL 280Ah cell", "battery cell", "LFP Prismatic Cells (280Ah)" but NOT
  // "cell module" (that's a higher-level assembly of ~10 cells).
  // 2026-05-06 tighten: also exclude BMS / monitor / slave names that
  // contained "cell" (e.g. "BMS cell monitoring module") — the live
  // BESS run matched PN-BMS-002 against this rule and over-rode its
  // qty with the cell count.
  // 2026-05-09 fix: \bcell\b did not match "cells" (plural). Changed to \bcells?\b.
  if (/cell\s*module/.test(n)) return false
  if (/bms|monitor(?:ing)?|slave|master\s*control|bmu|cmu/.test(n)) return false
  return /\bcells?\b/.test(n) && /(lfp|prismatic|lithium|li-?ion|catl|280\s*ah|battery)/.test(n)
}

function isBessRack(name: string): boolean {
  const n = name.toLowerCase()
  // "battery rack", "rack assembly", but NOT "server rack" etc.
  return (/battery\s*rack/.test(n) || /rack\s*(?:assembly|enclosure|frame)/.test(n)) && !/server/.test(n)
}

function isBessBmsSlave(name: string): boolean {
  const n = name.toLowerCase()
  return /bms\s*slave|slave\s*bms|slave\s*control|module\s*control\s*unit|mcu.*bms/.test(n)
}

function isBessBmsMaster(name: string): boolean {
  const n = name.toLowerCase()
  return /bms\s*master|master\s*bms|battery\s*management\s*system\s*master|pack\s*control\s*unit/.test(n)
}

function isBessPcs(name: string): boolean {
  const n = name.toLowerCase()
  // Power Conversion System — typically one per BESS.
  return /\bpcs\b|power\s*conversion/.test(n) && !/inverter\s*card/.test(n)
}

function isBessContainer(name: string): boolean {
  const n = name.toLowerCase()
  return /\bcontainer\b|iso\s*container|enclosure|cabinet|housing/.test(n) &&
    !/fire/.test(n) && !/sub-?enclosure/.test(n)
}

function isHeatPumpCompressor(name: string): boolean {
  const n = name.toLowerCase()
  return /\bcompressor\b/.test(n) && !/oil\s*separator/.test(n)
}

function isHeatPumpFan(name: string): boolean {
  const n = name.toLowerCase()
  // "axial fan", "coil fan", "evaporator fan". NOT "fan grille" or "fan motor only".
  return /\bfan\b/.test(n) && !/grille|guard/.test(n) && !/\bmotor\b(?!.*fan)/.test(n)
}

function isFarmLedPanel(name: string): boolean {
  const n = name.toLowerCase()
  return /led.*(?:grow|horticultural|panel|array|bar|tube)|grow\s*light|horticultural\s*light/.test(n)
}

function isFarmTray(name: string): boolean {
  const n = name.toLowerCase()
  // "growing tray", "NFT tray", "DWC tray", but NOT "seed tray" if we're
  // looking for canopy trays. Keep loose: any tray in a farm BOM counts.
  return /\btray\b/.test(n)
}

function isFastener(name: string): boolean {
  const n = name.toLowerCase()
  return /\b(?:bolt|nut|screw|washer|rivet|fastener|insert|helicoil)\b/.test(n)
}

function isConnector(name: string): boolean {
  const n = name.toLowerCase()
  return /\bconnector\b|\bheader\b|terminal\s*block|cable\s*gland/.test(n)
}

// ───────────────────────────────────────────────────────────────────────
//  Quantity rules — each returns { qty, rule, confidence, explanation }
// ───────────────────────────────────────────────────────────────────────

interface RuleResult {
  qty: number
  rule: string
  confidence: number
  explanation: string
}

/**
 * BESS cell count. Nominal capacity = usable / DoD. Cell count is the
 * ceiling of nominalKwh × 1000 / (cellV × cellAh).
 *
 * Default cell: 3.2 V × 280 Ah LFP. Default DoD: 0.8 (industry standard
 * for BESS when not stated).
 */
function bessCellCount(specs: ProductSpecs): RuleResult | null {
  if (!specs.capacityKwh || specs.capacityKwh <= 0) return null
  const cellV = specs.cellVoltageV ?? 3.2
  const cellAh = specs.cellCapacityAh ?? 280
  const dod = specs.dod ?? 0.8
  const nominalKwh = specs.capacityKwh / dod
  const perCellWh = cellV * cellAh
  const cells = Math.ceil((nominalKwh * 1000) / perCellWh)
  // Round up to nearest multiple of 16 for string alignment (tiny uplift,
  // keeps rack arithmetic clean).
  const aligned = Math.ceil(cells / 16) * 16
  return {
    qty: aligned,
    rule: 'bess_cell_count',
    confidence: 0.9,
    explanation:
      `${specs.capacityKwh} kWh usable / ${dod} DoD = ${nominalKwh.toFixed(0)} kWh nominal; ` +
      `${nominalKwh.toFixed(0)} × 1000 / (${cellV} V × ${cellAh} Ah) = ${cells} → ${aligned} (16-string aligned)`,
  }
}

/**
 * BESS rack count — Build #18p-fix3 (2026-05-22): voltage-limit-aware
 * pack topology to match the orchestrator's pybamm derive_pack_topology.
 *
 * Prior implementation (`ceil(nominalKwh / 250)`) returned 18 racks for
 * a 4.4 MWh BESS, but pybamm with the same inputs returned 15-16 racks
 * because pybamm searches for integer-clean (series, parallel, racks)
 * triples that also satisfy series × cell_voltage ≤ DC_bus × derating.
 *
 * This mirrors pybamm so BoM line quantities match the design narrative.
 */
function bessRackCount(specs: ProductSpecs): RuleResult | null {
  if (!specs.capacityKwh || specs.capacityKwh <= 0) return null
  const dcBusV = 800       // standard BESS DC bus
  const maxCellV = 3.65    // LFP charge cutoff
  const dcBusDerating = 0.92
  // Use the same cell_count_after_EoL_margin that pybamm uses so the
  // two derivations agree. bessCellCount returns the 16-aligned count;
  // we re-add the 2.5% EoL margin to match pybamm.derive_pack_topology's
  // input.
  const cellCountAligned = bessCellCount(specs)?.qty ?? 0
  const targetCells = Math.ceil(cellCountAligned * 1.025)  // mirror pybamm EoL margin
  const maxSeriesCells = Math.floor((dcBusV * dcBusDerating) / maxCellV)

  type Score = readonly [number, number, number]  // excess, racks-distance, -series
  let best: { score: Score; racks: number; stringsPerRack: number; series: number; total: number } | null = null

  for (let series = Math.max(50, maxSeriesCells - 50); series <= maxSeriesCells; series++) {
    const parallelTotal = Math.ceil(targetCells / series)
    for (let racks = 4; racks <= 32; racks++) {
      if (parallelTotal % racks !== 0) continue
      const stringsPerRack = parallelTotal / racks
      const total = series * parallelTotal
      const excess = total - targetCells
      if (excess < 0) continue
      const score: Score = [excess, Math.abs(racks - 16), -series]
      if (best === null
          || score[0] < best.score[0]
          || (score[0] === best.score[0] && score[1] < best.score[1])
          || (score[0] === best.score[0] && score[1] === best.score[1] && score[2] < best.score[2])
      ) {
        best = { score, racks, stringsPerRack, series, total }
      }
    }
  }

  if (best === null) {
    // Fallback to single rack
    return {
      qty: 1,
      rule: 'bess_rack_count_fallback',
      confidence: 0.5,
      explanation: `voltage-limit-aware search found no integer-clean topology; default to 1 rack`,
    }
  }

  const nominalKwh = (specs.capacityKwh ?? 0) / (specs.dod ?? 0.8)
  return {
    qty: best.racks,
    rule: 'bess_rack_count_voltage_aware',
    confidence: 0.9,
    explanation:
      `${nominalKwh.toFixed(0)} kWh nominal → ${targetCells} cells (after EoL margin); ` +
      `voltage-limit search finds ${best.racks} racks × ${best.stringsPerRack} parallel strings × ${best.series} cells/series = ${best.total} cells ` +
      `(string V_max = ${(best.series * maxCellV).toFixed(1)} ≤ ${dcBusV} × ${dcBusDerating} = ${(dcBusV * dcBusDerating).toFixed(0)})`,
  }
}

/**
 * BESS BMS slave — Build #18p-fix3 (2026-05-22): one slave per 12 cells,
 * not one per rack. Prior formula returned 18 slaves for a 5000-cell
 * design, leaving 4982 cells unmonitored — violated IEC 62619 and was
 * flagged by Loop 22 physics critic.
 *
 * ISL94212-class slaves handle 12 channels each; need ceil(cells/12) boards.
 */
function bessBmsSlaveCount(specs: ProductSpecs): RuleResult | null {
  const cellCount = bessCellCount(specs)
  if (!cellCount) return null
  const channelsPerSlave = 12
  const slaves = Math.ceil(cellCount.qty / channelsPerSlave)
  return {
    qty: slaves,
    rule: 'bess_bms_slave_per_12_cells',
    confidence: 0.9,
    explanation:
      `${cellCount.qty} cells / ${channelsPerSlave} channels per ISL94212 slave = ${slaves} slaves ` +
      `(per IEC 62619 cell-level monitoring requirement)`,
  }
}

/** BESS BMS master — one per system. */
function bessBmsMasterCount(): RuleResult {
  return {
    qty: 1,
    rule: 'bess_bms_master_per_system',
    confidence: 0.95,
    explanation: '1 master BMS per system',
  }
}

/** BESS PCS — one per system. */
function bessPcsCount(): RuleResult {
  return {
    qty: 1,
    rule: 'bess_pcs_per_system',
    confidence: 0.95,
    explanation: '1 PCS per containerised BESS',
  }
}

/** BESS container — one per system. */
function bessContainerCount(): RuleResult {
  return {
    qty: 1,
    rule: 'bess_container_per_system',
    confidence: 0.95,
    explanation: '1 ISO container enclosure per unit',
  }
}

/** Heat-pump compressor — one per monobloc unit. */
function heatPumpCompressorCount(): RuleResult {
  return {
    qty: 1,
    rule: 'heat_pump_compressor_per_unit',
    confidence: 0.95,
    explanation: '1 scroll / rotary compressor per monobloc unit',
  }
}

/**
 * Heat-pump fan count by capacity band:
 *   <15 kW → 1 fan, 15-60 kW → 2 fans, >60 kW → 3 fans.
 */
function heatPumpFanCount(specs: ProductSpecs): RuleResult | null {
  if (!specs.powerKw) return null
  let fans = 1
  if (specs.powerKw >= 15 && specs.powerKw < 60) fans = 2
  else if (specs.powerKw >= 60) fans = 3
  return {
    qty: fans,
    rule: 'heat_pump_fan_by_power',
    confidence: 0.75,
    explanation: `${specs.powerKw} kW → ${fans} fan(s) (bands: <15 kW=1, 15-60=2, >60=3)`,
  }
}

/**
 * Farm LED panels — one per growing tray. If we know trayCount, use it;
 * else compute from tiers and trayAreaM2.
 */
function farmLedPanelCount(specs: ProductSpecs): RuleResult | null {
  if (specs.trayCount && specs.trayCount > 0) {
    return {
      qty: specs.trayCount,
      rule: 'farm_led_one_per_tray',
      confidence: 0.85,
      explanation: `1 LED panel per tray × ${specs.trayCount} trays`,
    }
  }
  // Compute from tiers × (growing area / tray area)
  if (specs.tiers && specs.trayAreaM2 && specs.growingAreaM2) {
    const traysPerTier = Math.round(specs.growingAreaM2 / (specs.trayAreaM2 * specs.tiers))
    const total = Math.max(1, traysPerTier * specs.tiers)
    return {
      qty: total,
      rule: 'farm_led_from_geometry',
      confidence: 0.7,
      explanation:
        `${specs.tiers} tiers × ${traysPerTier} trays/tier = ${total}`,
    }
  }
  return null
}

/** Farm trays — same count as LED panels. */
function farmTrayCount(specs: ProductSpecs): RuleResult | null {
  // Defer to the same computation path.
  const panels = farmLedPanelCount(specs)
  if (!panels) return null
  return {
    qty: panels.qty,
    rule: 'farm_tray_count',
    confidence: 0.9,
    explanation: panels.explanation.replace(/LED panel|panels\//g, 'tray'),
  }
}

// ───────────────────────────────────────────────────────────────────────
//  Main API
// ───────────────────────────────────────────────────────────────────────

/**
 * For each part, detect its role by name pattern and compute deterministic
 * qty. Only returns overrides with confidence ≥ minConfidence.
 *
 * @param specs product specs from extractSpecs()
 * @param productClass e.g. 'battery_energy_storage', 'heat_pump', 'vertical_farm'
 * @param parts BOM parts generated by the LLM
 * @param bomLines BOM lines carrying the original qty
 * @param minConfidence default 0.7 — lower values accept more speculative rules
 */
export function deriveQuantities(
  specs: ProductSpecs,
  productClass: string | undefined,
  parts: PartLike[],
  bomLines: BomLineLike[],
  minConfidence: number = 0.7,
): QuantityOverride[] {
  const overrides: QuantityOverride[] = []
  const pc = (productClass || '').toLowerCase()

  // Cache derived module counts so downstream rules that depend on them
  // (BMS slave → rack count) stay internally consistent.
  const cachedRackCount = pc.includes('battery') ? bessRackCount(specs) : null

  for (const part of parts) {
    const partId = part.partNumber || part.id || ''
    if (!partId) continue

    // Look up the old qty from the BOM line (sum if multiple lines reference
    // the same child, matching cost-model.resolveQuantity behaviour).
    let oldQty = 0
    for (const bl of bomLines) {
      if (bl.childPartId === part.partNumber || bl.childPartId === part.id) {
        oldQty += bl.quantity || 0
      }
    }
    if (oldQty <= 0) oldQty = 1

    let rule: RuleResult | null = null

    // ─── BESS rules (only fire when productClass hints BESS) ────────
    if (pc.includes('battery') || pc.includes('energy_storage')) {
      if (isBessCell(part.name)) rule = bessCellCount(specs)
      else if (isBessRack(part.name)) rule = cachedRackCount
      else if (isBessBmsSlave(part.name)) rule = bessBmsSlaveCount(specs)
      else if (isBessBmsMaster(part.name)) rule = bessBmsMasterCount()
      else if (isBessPcs(part.name)) rule = bessPcsCount()
      else if (isBessContainer(part.name)) rule = bessContainerCount()
    }

    // ─── Heat pump rules ────────────────────────────────────────────
    // productClass from product-classifier.ts is 'thermal_system' for heat
    // pumps, not 'heat_pump'. Accept both to be robust across classifier
    // renames.
    if (!rule && (pc.includes('heat_pump') || pc.includes('thermal'))) {
      if (isHeatPumpCompressor(part.name)) rule = heatPumpCompressorCount()
      else if (isHeatPumpFan(part.name)) rule = heatPumpFanCount(specs)
    }

    // ─── Vertical farm rules ────────────────────────────────────────
    if (!rule && (pc.includes('farm') || pc.includes('vertical'))) {
      if (isFarmLedPanel(part.name)) rule = farmLedPanelCount(specs)
      else if (isFarmTray(part.name)) rule = farmTrayCount(specs)
    }

    // ─── Generic fastener / connector rules ────────────────────────
    // Skipped for now — they need module-count awareness which lives
    // in the caller. Rule-set can grow here over time.
    // isFastener / isConnector are imported & unused to signal intent.

    if (!rule) continue
    if (rule.confidence < minConfidence) continue
    if (rule.qty === oldQty) continue // No change needed

    overrides.push({
      partId,
      partNumber: part.partNumber,
      partName: part.name,
      oldQty,
      newQty: rule.qty,
      rule: rule.rule,
      confidence: rule.confidence,
      explanation: rule.explanation,
    })
  }

  return overrides
}

/**
 * Apply a list of overrides to an existing bomLines array, returning a new
 * array. Lines whose childPartId matches a partNumber get their quantity
 * replaced. Lines with no match are untouched.
 *
 * Also sets `qtySource: 'deterministic'` and `qtyRule` on overridden lines
 * so the PDF renderer can style the cell.
 */
export function applyOverrides<B extends BomLineLike>(
  bomLines: B[],
  overrides: QuantityOverride[],
): B[] {
  const overrideMap = new Map<string, QuantityOverride>()
  for (const ov of overrides) {
    overrideMap.set(ov.partNumber, ov)
    // Also index by partId for robustness — partNumber is usually the key.
    if (ov.partId && ov.partId !== ov.partNumber) {
      overrideMap.set(ov.partId, ov)
    }
  }

  return bomLines.map(bl => {
    const ov = overrideMap.get(bl.childPartId)
    if (!ov) return bl
    return {
      ...bl,
      quantity: ov.newQty,
      qtySource: 'deterministic',
      qtyRule: ov.rule,
      qtyConfidence: ov.confidence,
    } as B
  })
}

// Intentional no-op references — isFastener/isConnector are reserved for
// near-term expansion and kept exported-for-test-intent; we don't want the
// TypeScript unused-imports rule to strip them.
export const _reservedDetectors = { isFastener, isConnector }

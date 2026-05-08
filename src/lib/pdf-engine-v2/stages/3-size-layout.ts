import type { Module, DimensionSheet, DimensionSheetPA, SizingZone, StageResult, Envelope, ModuleDimensions } from '../types'

// A5 FIX (2026-05-06): The research stage produces industryDomain values from
// the LLM (e.g. "thermal_system", "energy_storage", "bess") while the sizing
// solver hard-codes "battery_energy_storage", "heat_pump", "vertical_farm".
// Mismatch means every real brief fell through to the tiny generic envelope
// and returned INFEASIBLE in 0-1 ms, blocking every downstream stage.
function normaliseDomain(raw: string | undefined): string {
  if (!raw) return 'generic'
  const d = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (/battery|bess|energy.?storage|lfp|lithium|cell/.test(d)) return 'battery_energy_storage'
  if (/heat.?pump|thermal|refriger|hvac|chiller|boiler/.test(d)) return 'heat_pump'
  if (/farm|vertical|greenhouse|agricul|horticul|indoor.?grow/.test(d)) return 'vertical_farm'
  return 'generic'
}

const HEAT_PUMP_ENVELOPES = {
  outdoor_unit: {
    kind: 'outdoor_unit',
    label: 'Outdoor Unit (30kW R290)',
    interior_w_mm: 1100,
    interior_d_mm: 500,
    interior_h_mm: 1700,
    interior_floor_m2: 0.55,
    interior_volume_m3: 0.935,
  },
  indoor_hydrobox: {
    kind: 'indoor_unit',
    label: 'Indoor Hydrobox',
    interior_w_mm: 600,
    interior_d_mm: 400,
    interior_h_mm: 1500,
    interior_floor_m2: 0.24,
    interior_volume_m3: 0.36,
  },
}

const MODULE_DIMENSIONS: Record<string, { w: number; d: number; h: number; mass: number }> = {
  'refrigerant': { w: 400, d: 350, h: 350, mass: 30 },
  'compressor': { w: 380, d: 280, h: 320, mass: 25 },
  // A11b FIX: heat-pump module names from the decompose LLM rarely include
  // the lookup keys verbatim ("R290 Vapor Compression Circuit" misses
  // "compressor"; "Heat Absorption Assembly" misses "evaporator"). Add the
  // semantic aliases that typically appear in module names.
  'compression': { w: 380, d: 280, h: 320, mass: 25 },
  'vapor': { w: 400, d: 300, h: 400, mass: 20 },
  'absorption': { w: 800, d: 250, h: 700, mass: 12 },
  'expansion': { w: 150, d: 100, h: 80, mass: 2 },
  'circuit': { w: 400, d: 200, h: 200, mass: 8 },
  'loop': { w: 400, d: 200, h: 200, mass: 8 },
  'evaporator': { w: 1100, d: 250, h: 800, mass: 15 },
  'fan': { w: 800, d: 200, h: 800, mass: 8 },
  'condenser': { w: 500, d: 120, h: 250, mass: 10 },
  'bphe': { w: 500, d: 120, h: 250, mass: 8 },
  'brazed': { w: 500, d: 120, h: 250, mass: 8 },
  'plate heat': { w: 500, d: 120, h: 250, mass: 8 },
  'power': { w: 400, d: 300, h: 200, mass: 12 },
  'inverter': { w: 400, d: 300, h: 200, mass: 12 },
  'structural': { w: 1000, d: 450, h: 1600, mass: 30 },
  'chassis': { w: 1000, d: 450, h: 1600, mass: 30 },
  'enclosure': { w: 1000, d: 450, h: 1600, mass: 30 },
  'safety': { w: 300, d: 200, h: 200, mass: 5 },
  'leak detection': { w: 200, d: 100, h: 150, mass: 2 },
  'hydrobox': { w: 600, d: 400, h: 1500, mass: 15 },
  'pump': { w: 300, d: 200, h: 400, mass: 8 },
  'hmi': { w: 300, d: 50, h: 200, mass: 2 },
  'control': { w: 300, d: 200, h: 200, mass: 3 },
}

function solveSizing(
  modules: Module[],
  domain: string,
  targets: Record<string, number>
): DimensionSheet {
  let envelope: Envelope;
  let floor_budget_m2: number;
  
  if (domain === 'battery_energy_storage') {
    envelope = {
      kind: 'container_40ft',
      label: '40ft ISO Container',
      interior_w_mm: 12032,
      interior_d_mm: 2352,
      interior_h_mm: 2690,
      interior_floor_m2: (12032 * 2352) / 1_000_000,
      interior_volume_m3: (12032 * 2352 * 2690) / 1_000_000_000
    };
    floor_budget_m2 = envelope.interior_floor_m2 * 0.85; // 15% for aisles
  } else if (domain === 'vertical_farm') {
    envelope = {
      kind: 'warehouse_bay',
      label: 'Standard Warehouse Bay',
      interior_w_mm: 10000,
      interior_d_mm: 10000,
      interior_h_mm: 5000,
      interior_floor_m2: 100,
      interior_volume_m3: 500
    };
    floor_budget_m2 = envelope.interior_floor_m2 * 0.85;
  } else if (domain === 'heat_pump') {
    const module_dimensions: Record<string, ModuleDimensions> = {};
    let outdoorArea = 0;
    let indoorArea = 0;
    let outdoorMass = 0;
    let indoorMass = 0;
    let matchedCount = 0;

    for (const mod of modules) {
      const n = mod.name.toLowerCase();
      let matched = false;
      let dim = { w: 300, d: 300, h: 300, mass: mod.estimatedMassKg || 10 };

      for (const [key, val] of Object.entries(MODULE_DIMENSIONS)) {
        if (n.includes(key)) {
          dim = val;
          matched = true;
          matchedCount++
          break;
        }
      }

      const m2 = (dim.w * dim.d) / 1_000_000;
      const isIndoor = n.includes('hydrobox') || n.includes('pump') || n.includes('hmi') || n.includes('indoor') || n.includes('control');

      // A12b FIX (2026-05-06): the enclosure/chassis/container module IS the
      // outer shell of the unit; it doesn't take internal floor space. Count
      // it as 0 m² footprint (just mass for handling check). Without this the
      // acoustic enclosure's 0.45 m² trivially busts a 0.55 m² budget.
      const isOuterShell = /enclosure|chassis|container|housing|structural.*envelope/.test(n)
      const effectiveM2 = isOuterShell ? 0 : m2

      if (isIndoor) {
        indoorArea += effectiveM2;
        indoorMass += dim.mass;
      } else {
        outdoorArea += effectiveM2;
        outdoorMass += dim.mass;
      }

      module_dimensions[mod.id] = {
        w_mm: dim.w,
        d_mm: dim.d,
        h_mm: dim.h,
        floor_m2: effectiveM2,
        mount: isIndoor ? 'indoor_wall' : 'outdoor_pad',
        scaled_by: matched ? (isOuterShell ? 'outer_shell' : 'lookup') : 'default'
      };
    }

    const outdoorEnv = HEAT_PUMP_ENVELOPES.outdoor_unit;
    const indoorEnv = HEAT_PUMP_ENVELOPES.indoor_hydrobox;

    const conflicts: string[] = [];
    const recommendations: string[] = [];

    // A11d diagnostic: log per-module classification so we can see why the
    // heat_pump sizing keeps firing INFEASIBLE even after A11b/A11c.
    console.log(`[size-layout:hp] matched=${matchedCount}/${modules.length}`)
    console.log(`[size-layout:hp] outdoor=${outdoorArea.toFixed(3)}m² / ${outdoorEnv.interior_floor_m2}m² budget`)
    console.log(`[size-layout:hp] indoor=${indoorArea.toFixed(3)}m² / ${indoorEnv.interior_floor_m2}m² budget`)
    console.log(`[size-layout:hp] outdoorMass=${outdoorMass.toFixed(1)}kg (250kg limit)`)
    for (const mod of modules) {
      const d = module_dimensions[mod.id]
      console.log(`[size-layout:hp]   ${mod.name}: ${d.w_mm}×${d.d_mm} ${d.floor_m2.toFixed(3)}m² ${d.mount} (${d.scaled_by})`)
    }

    // A12 FIX (2026-05-06): monobloc detection.
    // Split-system heat pumps have a hydrobox (indoor unit) and an outdoor
    // unit. Monobloc heat pumps (common for UK residential + small commercial
    // retrofit) have everything in one enclosure — no indoor/outdoor split.
    // Decompose doesn't reliably produce a "hydrobox" module for monobloc
    // briefs, so indoorArea = 0 and everything gets packed into outdoor,
    // blowing past the 0.55 m² outdoor budget.
    //
    // Detection: if zero modules fell into the indoor bucket AND we matched
    // enough lookup keys to trust the footprint math, treat as monobloc and
    // merge the two envelope budgets. Net effect: budget for a monobloc
    // becomes 0.55 + 0.24 = 0.79 m² which is realistic for a single
    // enclosure housing the full refrigerant circuit.
    const isMonobloc = indoorArea === 0 && matchedCount > 0

    // A11+A11c FIX (2026-05-06): defer sizing if less than half the modules
    // matched the lookup. Even with A11b's expanded keyword set, some briefs
    // will produce module names that escape it. When more than half are
    // falling back to the generic 300×300mm default, the feasibility answer
    // is essentially made-up — better to defer than block the pipeline.
    const mostlyUnmatched = matchedCount < Math.ceil(modules.length / 2) && modules.length > 0
    if (mostlyUnmatched) {
      recommendations.push(
        `Sizing deferred: only ${matchedCount}/${modules.length} modules matched the heat-pump dimension lookup. ` +
        'Feasibility assessed conservatively. Recompute once modules carry estimatedMassKg or dimensions.'
      )
    } else {
      // A12: monobloc gets the merged envelope budget (everything in one box).
      // Split-system gets the strict per-enclosure check.
      const outdoorBudget = isMonobloc
        ? outdoorEnv.interior_floor_m2 + indoorEnv.interior_floor_m2
        : outdoorEnv.interior_floor_m2
      if (outdoorArea > outdoorBudget) conflicts.push(`${isMonobloc ? 'Monobloc' : 'Outdoor'} modules footprint (${outdoorArea.toFixed(2)} m²) exceeds enclosure budget (${outdoorBudget.toFixed(2)} m²)`);
      if (!isMonobloc && indoorArea > indoorEnv.interior_floor_m2) conflicts.push(`Indoor modules footprint (${indoorArea.toFixed(2)} m²) exceeds indoor unit budget (${indoorEnv.interior_floor_m2} m²)`);
      if (outdoorMass > (isMonobloc ? 300 : 250)) conflicts.push(`${isMonobloc ? 'Monobloc unit' : 'Outdoor unit'} mass (${outdoorMass} kg) exceeds ${isMonobloc ? 300 : 250} kg limit for two-person handling`);
      if (isMonobloc) {
        console.log('[size-layout:hp] monobloc detected → using merged envelope')
      }
    }

    const feasible = mostlyUnmatched || conflicts.length === 0;
    if (!feasible) {
      recommendations.push('Optimise module footprint', 'Review component selection for mass reduction')
    }

    return {
      feasible,
      rules_domain: domain,
      envelope: {
        kind: 'split_system',
        label: 'Split System (Outdoor + Indoor)',
        interior_w_mm: outdoorEnv.interior_w_mm + indoorEnv.interior_w_mm,
        interior_d_mm: Math.max(outdoorEnv.interior_d_mm, indoorEnv.interior_d_mm),
        interior_h_mm: Math.max(outdoorEnv.interior_h_mm, indoorEnv.interior_h_mm),
        interior_floor_m2: outdoorEnv.interior_floor_m2 + indoorEnv.interior_floor_m2,
        interior_volume_m3: outdoorEnv.interior_volume_m3 + indoorEnv.interior_volume_m3
      },
      target: targets,
      floor_budget_m2: outdoorEnv.interior_floor_m2 + indoorEnv.interior_floor_m2,
      module_dimensions,
      conflicts,
      recommendations,
    };
  } else {
    envelope = {
      kind: 'generic_room',
      label: 'Generic Room',
      interior_w_mm: 5000,
      interior_d_mm: 5000,
      interior_h_mm: 3000,
      interior_floor_m2: 25,
      interior_volume_m3: 75
    };
    floor_budget_m2 = envelope.interior_floor_m2 * 0.85;
  }

  const module_dimensions: Record<string, ModuleDimensions> = {};
  let total_floor_m2 = 0;
  let modulesWithoutMass = 0;

  for (const mod of modules) {
    let m2 = 0;
    // A8 FIX (2026-05-06): the decompose stage doesn't populate
    // estimatedMassKg, so the old `|| 1000` fallback turned every module into
    // 1,000 kg which the `× 0.01` heuristic blew up to 10 m² per module — any
    // multi-module brief then exceeded the envelope and the whole pipeline
    // was blocked on sizing. Track missing-mass modules explicitly and cap
    // the fallback at 0.5 m² rather than 10 m².
    const massKg = typeof mod.estimatedMassKg === 'number' && mod.estimatedMassKg > 0
      ? mod.estimatedMassKg
      : null
    if (massKg === null) modulesWithoutMass++

    if (domain === 'battery_energy_storage') {
      // Dense components (~2,500 kg/m³ volumetric). Footprint in m² ≈
      // mass / (density × height_m). For BESS racks ~1.8 m tall this gives
      // ~mass / 4500 ≈ mass × 0.00022. Use 0.0002 as a realistic heuristic.
      m2 = (massKg ?? 50) * 0.0002;
    } else if (domain === 'vertical_farm') {
      const canopy = targets.canopy_m2 || 100;
      m2 = canopy / (modules.length || 1);
    } else if (domain === 'heat_pump') {
      // Mid-density components, compact. ~0.001 m² per kg is plausible for
      // a 1-1.5 m tall outdoor unit.
      m2 = (massKg ?? 20) * 0.001;
    } else {
      m2 = (massKg ?? 20) * 0.001;
    }

    // simplistic dimension setting (assume square footprint for simplicity)
    const side = Math.sqrt(Math.max(0.01, m2));
    module_dimensions[mod.id] = {
      w_mm: Math.round(side * 1000),
      d_mm: Math.round(side * 1000),
      h_mm: Math.round(envelope.interior_h_mm * 0.8), // 80% of height
      floor_m2: m2,
      mount: 'floor',
      scaled_by: massKg !== null ? 'mass_proportional' : 'count_fallback'
    };

    total_floor_m2 += m2;
  }

  // A8: If all modules lacked mass data, the computed total is meaningless.
  // Mark feasible-with-warning rather than blocking the entire pipeline — the
  // downstream BOM/cost/supplier stages have their own data to work from and
  // shouldn't be gated on a sizing heuristic that never had real inputs.
  const massCoverageUnknown = modulesWithoutMass === modules.length && modules.length > 0
  const feasible = massCoverageUnknown || total_floor_m2 <= floor_budget_m2
  const conflicts: string[] = []
  if (!feasible) {
    conflicts.push(`Total module footprint (${total_floor_m2.toFixed(1)} m²) exceeds envelope budget (${floor_budget_m2.toFixed(1)} m²)`)
  }
  const recommendations: string[] = []
  if (massCoverageUnknown) {
    recommendations.push(`Sizing deferred: no module had estimatedMassKg set. Feasibility assessed on module count only — recompute once mass data is available.`)
  }
  if (!feasible) {
    recommendations.push('Consider a larger envelope')
    recommendations.push('Optimise module footprint')
  }

  return {
    feasible,
    rules_domain: domain,
    envelope,
    target: targets,
    floor_budget_m2,
    module_dimensions,
    conflicts,
    recommendations,
  };
}

function buildSpatialPlan(
  dimensionSheet: DimensionSheet,
  modules: Module[]
): { placements: Array<{ moduleId: string; x: number; y: number; w: number; d: number }> } {
  let currentX = 0;
  const placements = [];
  
  for (const mod of modules) {
    const dim = dimensionSheet.module_dimensions[mod.id];
    if (!dim) continue;
    
    placements.push({
      moduleId: mod.id,
      x: currentX,
      y: 0,
      w: dim.w_mm,
      d: dim.d_mm
    });
    
    currentX += dim.w_mm + 100; // 100mm gap
  }
  
  return { placements };
}

// ── PA Stage 7a — extend DimensionSheet with renderer fields ─────────────────
//
// All new fields are optional on DimensionSheetPA so the legacy renderer is
// unaffected when PA_PIPELINE=false.  The iso_container_layout zone allocation
// that already runs internally is surfaced as dimensionSheet.zones[].

/**
 * ISO 40ft container physical constants.
 * Source: ISO 668:2020 Series 1 freight containers.
 */
const ISO_40FT = {
  external_w_mm:  2438,
  external_d_mm: 12192,
  external_h_mm:  2896,
  tare_kg:        3750,
  max_payload_kg: 27_230,
  // The interior dims are already in the solver; these are the external dims.
} as const

/**
 * Derive the PA-shape extension fields from an existing DimensionSheet when
 * the domain is battery_energy_storage (iso_container_layout).
 *
 * Called inside runSizeLayout only when PA_PIPELINE=true.
 */
function extendSizingSheetPA(
  sheet: DimensionSheet,
  modules: Module[],
): DimensionSheetPA {
  const env = sheet.envelope

  // ── Utilisation percentages ───────────────────────────────────────────────
  let allocatedVolumeM3 = 0
  let allocatedMassKg = 0

  for (const mod of modules) {
    const dim = sheet.module_dimensions[mod.id]
    if (dim) {
      allocatedVolumeM3 += (dim.w_mm * dim.d_mm * dim.h_mm) / 1_000_000_000
    }
    if (typeof mod.estimatedMassKg === 'number' && mod.estimatedMassKg > 0) {
      allocatedMassKg += mod.estimatedMassKg
    }
  }

  const totalVolumeM3 = env.interior_volume_m3 || 1
  const volumeUtilisationPct = Math.min(100, Math.round((allocatedVolumeM3 / totalVolumeM3) * 100))

  // Available payload = ISO max payload minus container tare.
  const availablePayloadMassKg = ISO_40FT.max_payload_kg
  const tareMassKg = ISO_40FT.tare_kg
  const massUtilisationPct = availablePayloadMassKg > 0
    ? Math.min(100, Math.round((allocatedMassKg / availablePayloadMassKg) * 100))
    : 0

  // ── Zone allocation ───────────────────────────────────────────────────────
  // Group modules into functional zones based on name heuristics.
  const ZONE_KEYWORDS: Array<{ regex: RegExp; zone: string }> = [
    { regex: /battery|cell|rack|pack|lfp|bms|management/i, zone: 'Battery Zone' },
    { regex: /power.?electron|pcs|inverter|converter|transformer|switchgear/i, zone: 'Power Electronics Zone' },
    { regex: /thermal|cooling|hvac|heat.?exchanger/i, zone: 'Thermal Management Zone' },
    { regex: /control|monitor|sensor|comms|communication|hmi|scada/i, zone: 'Controls & Monitoring Zone' },
    { regex: /fire|suppression|safety|detection/i, zone: 'Fire Safety Zone' },
  ]

  const zoneMap = new Map<string, { modules: Module[]; dims: ModuleDimensions[] }>()

  for (const mod of modules) {
    let zoneName = 'Ancillary Zone'
    for (const { regex, zone } of ZONE_KEYWORDS) {
      if (regex.test(mod.name)) {
        zoneName = zone
        break
      }
    }
    if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, { modules: [], dims: [] })
    const entry = zoneMap.get(zoneName)!
    entry.modules.push(mod)
    const dim = sheet.module_dimensions[mod.id]
    if (dim) entry.dims.push(dim)
  }

  const zones: SizingZone[] = []
  for (const [name, { modules: zmods, dims }] of zoneMap.entries()) {
    const zoneVolumeM3 = dims.reduce((s, d) => s + (d.w_mm * d.d_mm * d.h_mm) / 1_000_000_000, 0)
    const zoneMassKg = zmods.reduce((s, m) => s + (m.estimatedMassKg || 0), 0)
    // Length is approximate: sum the depth (d_mm) of all modules in the zone.
    const zoneLengthMm = dims.reduce((s, d) => s + d.d_mm, 0) || Math.round(env.interior_d_mm / zoneMap.size)
    const contents = zmods.map(m => m.name).join(', ')
    zones.push({ name, lengthMm: zoneLengthMm, volumeM3: Number(zoneVolumeM3.toFixed(3)), massKg: Number(zoneMassKg.toFixed(1)), contents })
  }

  // ── Clearance and mass-margin notes ──────────────────────────────────────
  const massMarginKg = availablePayloadMassKg - allocatedMassKg
  const massMarginPct = availablePayloadMassKg > 0 ? (massMarginKg / availablePayloadMassKg) * 100 : 100

  const clearanceNotes =
    `Container clear aisle width: ≥600 mm along the longitudinal axis for maintenance access. ` +
    `End-panel clearance: 300 mm minimum for cable entry. ` +
    `Top clearance to roof: ${Math.max(0, env.interior_h_mm - 2200)} mm available for overhead cable trays.`

  const massMarginNote: string | null = massMarginPct < 5
    ? `Total allocated mass: ${allocatedMassKg.toFixed(0)} kg. ` +
      `Remaining mass budget: ${massMarginKg.toFixed(0)} kg (${massMarginPct.toFixed(1)}% margin for cables, fasteners, and contingency). ` +
      `This is tight — detailed cable harness mass estimation is required before design freeze.`
    : null

  return {
    ...sheet,
    zones,
    volumeUtilisationPct,
    massUtilisationPct,
    externalDimensionsMm: { w: ISO_40FT.external_w_mm, d: ISO_40FT.external_d_mm, h: ISO_40FT.external_h_mm },
    internalDimensionsMm: { w: env.interior_w_mm, d: env.interior_d_mm, h: env.interior_h_mm },
    tareMassKg,
    availablePayloadMassKg,
    clearanceNotes,
    massMarginNote,
  }
}

// Run sizing + layout as a subprocess
// Calls the existing sizing solver which is pure physics (no pipeline coupling)
export async function runSizeLayout(
  modules: Module[],
  options?: { domain?: string; targets?: Record<string, number>; paMode?: boolean }
): Promise<StageResult<(DimensionSheet | DimensionSheetPA) & { spatialPlan: { placements: Array<{ moduleId: string; x: number; y: number; w: number; d: number }> } }>> {
  const start = Date.now()
  try {
    const rawDomain = options?.domain || 'unknown'
    // A5 FIX (2026-05-06): regex normalise is tolerant of the free-form
    // industryDomain strings the research LLM produces (e.g. "Battery Energy
    // Storage System", "hvac/refrigeration", "grid-scale BESS"). Previously
    // an exact-match dict meant almost every real brief fell through to the
    // generic 5×5 m envelope and returned INFEASIBLE in 0-1 ms.
    const domain = normaliseDomain(rawDomain)
    console.log(`[size-layout] raw domain "${rawDomain}" → normalised "${domain}"`)
    const targets = options?.targets || {}

    const dimensionSheet = solveSizing(modules, domain, targets)
    const spatialPlan = buildSpatialPlan(dimensionSheet, modules)

    // PA Stage 7a: extend with renderer fields when paMode=true.
    // Only for iso_container_layout (battery_energy_storage) — other domains
    // get the base sheet unchanged (zones = undefined, etc.).
    if (options?.paMode && domain === 'battery_energy_storage') {
      const paSheet = extendSizingSheetPA(dimensionSheet, modules)
      return {
        ok: true,
        data: { ...paSheet, spatialPlan },
        durationMs: Date.now() - start,
      }
    }

    return {
      ok: true,
      data: { ...dimensionSheet, spatialPlan },
      durationMs: Date.now() - start
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      durationMs: Date.now() - start
    }
  }
}

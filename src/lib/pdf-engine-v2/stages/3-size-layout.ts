import type { Module, DimensionSheet, StageResult, Envelope, ModuleDimensions } from '../types'

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

      if (isIndoor) {
        indoorArea += m2;
        indoorMass += dim.mass;
      } else {
        outdoorArea += m2;
        outdoorMass += dim.mass;
      }

      module_dimensions[mod.id] = {
        w_mm: dim.w,
        d_mm: dim.d,
        h_mm: dim.h,
        floor_m2: m2,
        mount: isIndoor ? 'indoor_wall' : 'outdoor_pad',
        scaled_by: matched ? 'lookup' : 'default'
      };
    }

    const outdoorEnv = HEAT_PUMP_ENVELOPES.outdoor_unit;
    const indoorEnv = HEAT_PUMP_ENVELOPES.indoor_hydrobox;

    const conflicts: string[] = [];
    const recommendations: string[] = [];

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
      if (outdoorArea > outdoorEnv.interior_floor_m2) conflicts.push(`Outdoor modules footprint (${outdoorArea.toFixed(2)} m²) exceeds outdoor unit budget (${outdoorEnv.interior_floor_m2} m²)`);
      if (indoorArea > indoorEnv.interior_floor_m2) conflicts.push(`Indoor modules footprint (${indoorArea.toFixed(2)} m²) exceeds indoor unit budget (${indoorEnv.interior_floor_m2} m²)`);
      if (outdoorMass > 250) conflicts.push(`Outdoor unit mass (${outdoorMass} kg) exceeds 250 kg limit for two-person handling`);
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

// Run sizing + layout as a subprocess
// Calls the existing sizing solver which is pure physics (no pipeline coupling)
export async function runSizeLayout(
  modules: Module[],
  options?: { domain?: string; targets?: Record<string, number> }
): Promise<StageResult<DimensionSheet & { spatialPlan: { placements: Array<{ moduleId: string; x: number; y: number; w: number; d: number }> } }>> {
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

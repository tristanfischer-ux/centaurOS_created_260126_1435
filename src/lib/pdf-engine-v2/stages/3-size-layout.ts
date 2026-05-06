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
  'evaporator': { w: 1100, d: 250, h: 800, mass: 15 },
  'fan': { w: 800, d: 200, h: 800, mass: 8 },
  'condenser': { w: 500, d: 120, h: 250, mass: 10 },
  'bphe': { w: 500, d: 120, h: 250, mass: 8 },
  'power': { w: 400, d: 300, h: 200, mass: 12 },
  'inverter': { w: 400, d: 300, h: 200, mass: 12 },
  'structural': { w: 1000, d: 450, h: 1600, mass: 30 },
  'chassis': { w: 1000, d: 450, h: 1600, mass: 30 },
  'safety': { w: 300, d: 200, h: 200, mass: 5 },
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

    for (const mod of modules) {
      const n = mod.name.toLowerCase();
      let matched = false;
      let dim = { w: 300, d: 300, h: 300, mass: mod.estimatedMassKg || 10 };
      
      for (const [key, val] of Object.entries(MODULE_DIMENSIONS)) {
        if (n.includes(key)) {
          dim = val;
          matched = true;
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

    const conflicts = [];
    if (outdoorArea > outdoorEnv.interior_floor_m2) conflicts.push(`Outdoor modules footprint (${outdoorArea.toFixed(2)}m²) exceeds outdoor unit budget (${outdoorEnv.interior_floor_m2}m²)`);
    if (indoorArea > indoorEnv.interior_floor_m2) conflicts.push(`Indoor modules footprint (${indoorArea.toFixed(2)}m²) exceeds indoor unit budget (${indoorEnv.interior_floor_m2}m²)`);
    if (outdoorMass > 250) conflicts.push(`Outdoor unit mass (${outdoorMass}kg) exceeds 250kg limit for two-person handling`);

    const feasible = conflicts.length === 0;

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
      recommendations: feasible ? [] : ['Optimize module footprint', 'Review component selection for mass reduction']
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

  for (const mod of modules) {
    let m2 = 0;
    if (domain === 'battery_energy_storage') {
      m2 = (mod.estimatedMassKg || 1000) * 0.01;
    } else if (domain === 'vertical_farm') {
      const canopy = targets.canopy_m2 || 100;
      m2 = canopy / (modules.length || 1);
    } else if (domain === 'heat_pump') {
      m2 = (mod.estimatedMassKg || 500) * 0.005;
    } else {
      m2 = (mod.estimatedMassKg || 500) * 0.01;
    }

    // simplistic dimension setting (assume square footprint for simplicity)
    const side = Math.sqrt(m2);
    module_dimensions[mod.id] = {
      w_mm: Math.round(side * 1000),
      d_mm: Math.round(side * 1000),
      h_mm: Math.round(envelope.interior_h_mm * 0.8), // 80% of height
      floor_m2: m2,
      mount: 'floor',
      scaled_by: 'mass_proportional'
    };
    
    total_floor_m2 += m2;
  }

  const feasible = total_floor_m2 <= floor_budget_m2;
  
  return {
    feasible,
    rules_domain: domain,
    envelope,
    target: targets,
    floor_budget_m2,
    module_dimensions,
    conflicts: feasible ? [] : [`Total module footprint (${total_floor_m2.toFixed(1)}m2) exceeds envelope budget (${floor_budget_m2.toFixed(1)}m2)`],
    recommendations: feasible ? [] : ['Consider a larger envelope', 'Optimize module footprint']
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

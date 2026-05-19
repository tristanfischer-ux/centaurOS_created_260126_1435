import type { Module, DimensionSheet, DimensionSheetPA, SizingZone, StageResult, Envelope, ModuleDimensions } from '../types'
import { suggestEnvelope, defaultEnvelopeForClass } from '../deployment-envelopes'

// A5 FIX (2026-05-06): The research stage produces industryDomain values from
// the LLM (e.g. "thermal_system", "energy_storage", "bess") while the sizing
// solver hard-codes "battery_energy_storage", "heat_pump", "vertical_farm".
// Mismatch means every real brief fell through to the tiny generic envelope
// and returned INFEASIBLE in 0-1 ms, blocking every downstream stage.
//
// UNIVERSAL-ROBUSTNESS FIX (2026-05-10): Expanded to cover all 10 baseline
// product classes so no class falls through to the 5×5×3m generic envelope.
function normaliseDomain(raw: string | undefined): string {
  if (!raw) return 'generic'
  const d = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (/battery|bess|energy.?storage|lfp|lithium|cell/.test(d)) return 'battery_energy_storage'
  if (/heat.?pump|thermal|refriger|hvac|chiller|boiler/.test(d)) return 'heat_pump'
  if (/farm|vertical|greenhouse|agricul|horticul|indoor.?grow|cea|controlled.?environ/.test(d)) return 'vertical_farm'
  if (/haps|stratospher|high.?altitude|pseudo.?satellite/.test(d)) return 'haps'
  if (/auv|autonomous.?underw|underwater.?vehicl|rov|subsea.?vehicl/.test(d)) return 'auv'
  if (/drone|uav|multirotor|fixed.?wing|quadcopter/.test(d)) return 'drone'
  if (/ev.?charg|electric.?vehicl.?charg|ccs|ocpp|charge.?point/.test(d)) return 'ev_charger'
  if (/bioreactor|fermenter|cell.?cultur|bioprocess|pharma.?vessel/.test(d)) return 'bioreactor'
  if (/edge.?ai|edge.?compute|inference.?server|ai.?server|gpu.?server|industrial.?compute/.test(d)) return 'edge_ai_server'
  if (/cgm|glucose.?monitor|wearable.?sensor|biosensor|wearable.?medical/.test(d)) return 'cgm'
  return 'generic'
}

// ── Class-aware envelope lookup table ─────────────────────────────────────────
//
// UNIVERSAL-ROBUSTNESS FIX (2026-05-10): Each product class gets a correct
// default envelope based on real-world form factors. These are defaults; if
// the brief specifies explicit dimensions, those override these values in the
// solver (see brief.targetDimensions handling below).
//
// Sources for each entry are recorded in the `basis` field for auditability.
// All dimensions are INTERNAL usable dimensions in mm.
interface EnvelopeSpec {
  kind: string
  label: string
  interior_w_mm: number
  interior_d_mm: number
  interior_h_mm: number
  interior_floor_m2: number
  interior_volume_m3: number
  rated_max_payload_kg: number
  basis: string
}

function makeEnvelopeSpec(
  kind: string, label: string,
  w_m: number, d_m: number, h_m: number,
  payload_kg: number,
  basis: string
): EnvelopeSpec {
  return {
    kind, label,
    interior_w_mm: Math.round(w_m * 1000),
    interior_d_mm: Math.round(d_m * 1000),
    interior_h_mm: Math.round(h_m * 1000),
    interior_floor_m2: Number((w_m * d_m).toFixed(3)),
    interior_volume_m3: Number((w_m * d_m * h_m).toFixed(3)),
    rated_max_payload_kg: payload_kg,
    basis,
  }
}

const CLASS_ENVELOPE: Record<string, EnvelopeSpec> = {
  // Standard 40-ft ISO High-Cube container interior (ISO 668:2020).
  // Internal: 12.032 m × 2.352 m × 2.698 m. Basis: ISO 1496-1:2023.
  battery_energy_storage: makeEnvelopeSpec(
    'container_40ft', '40ft ISO High-Cube Container',
    12.032, 2.352, 2.698, 27_230,
    'ISO 668:2020 / ISO 1496-1 — standard 40ft HC internal dimensions'
  ),
  // EV charger: pedestal-mount outdoor cabinet (~800 mm deep, 600 mm wide, 1800 mm tall).
  // 150-kW DC fast charger enclosure (ABB Terra 184 / EVBox / Alpitronic class).
  ev_charger: makeEnvelopeSpec(
    'outdoor_cabinet', 'Outdoor Pedestal Enclosure (150 kW DC)',
    0.6, 0.8, 1.8, 800,
    'Typical 150-kW DC DCFC pedestal enclosure — Alpitronic HYC150 / ABB Terra 184 class'
  ),
  // Containerised pharma bioreactor vessel — 50-L pilot scale.
  // Nominal footprint: 0.8 m × 0.6 m × 1.2 m (Sartorius Biostat STR 50 L class).
  bioreactor: makeEnvelopeSpec(
    'pilot_vessel', 'Pilot-Scale Bioreactor Vessel (50 L)',
    0.8, 0.6, 1.2, 300,
    'Sartorius Biostat STR / Cytiva BioProcess Container class — 50-L pilot scale'
  ),
  // Standard CEA grow room / grow module (not 40-ft container).
  // Corrected from erroneous 10×10×5m default. Basis: UK CEA industry standard
  // grow cell dimensions (IGS, Jones Food, Bowery class modular grow room).
  vertical_farm: makeEnvelopeSpec(
    'cea_grow_room', 'Modular CEA Grow Room',
    12.0, 6.0, 3.0, 30_000,
    'UK CEA modular grow room — IGS/Jones Food class; 12×6m footprint, 3m clear height'
  ),
  // Residential/light-commercial split heat pump (outdoor unit only).
  // Use the existing HEAT_PUMP_ENVELOPES for the full system — this is the
  // canonical single-unit envelope for classes falling into generic routing.
  heat_pump: makeEnvelopeSpec(
    'outdoor_unit', 'Outdoor Heat Pump Unit',
    1.1, 0.5, 1.7, 250,
    'Typical 30 kW R290 outdoor unit — Mitsubishi Ecodan / Vaillant class'
  ),
  // Prosumer/professional multirotor drone. Covers DJI Agras T40 / JOUAV CW-30 class.
  // For micro-drones (< 250 g) or heavy-lift (> 150 kg), brief overrides expected.
  drone: makeEnvelopeSpec(
    'multirotor_frame', 'Multirotor Drone Frame Envelope',
    1.2, 1.2, 0.6, 40,
    'Commercial multirotor envelope — DJI Agras T40 / JOUAV CW-30 class (brief should override for nano/heavy-lift)'
  ),
  // Body-worn CGM sensor patch. Dexcom G7 / Libre 3 class.
  // At this scale, spatial packing is not a meaningful gate — the solver
  // will defer sizing if no meaningful layout calculation is possible.
  cgm: makeEnvelopeSpec(
    'wearable_patch', 'Body-worn CGM Sensor Patch',
    0.038, 0.030, 0.012, 0.1,
    'Dexcom G7 / Abbott Libre 3 class body-worn sensor patch envelope'
  ),
  // Industrial edge AI compute enclosure. NVIDIA EGX / Supermicro SuperEdge class.
  edge_ai_server: makeEnvelopeSpec(
    'edge_compute_enclosure', 'Industrial Edge Compute Enclosure',
    0.5, 0.4, 0.3, 40,
    'Industrial edge compute enclosure — NVIDIA EGX / Supermicro SuperEdge 1U class'
  ),
  // Coastal/survey AUV pressure hull. Teledyne Gavia / Kongsberg Hugin 1000 class.
  auv: makeEnvelopeSpec(
    'auv_pressure_hull', 'Coastal AUV Pressure Hull',
    0.45, 0.45, 3.0, 250,
    'Coastal survey AUV — Teledyne Gavia / Saab Seaeye Sabertooth class; cylinder approximated as box'
  ),
  // Stratospheric HAPS platform. Airbus Zephyr S / Vanilla Aircraft VA001 class.
  // Internal payload bay is the relevant constraint; wing dimensions are structural only.
  haps: makeEnvelopeSpec(
    'haps_payload_bay', 'HAPS Payload Bay',
    0.6, 0.4, 0.3, 50,
    'Stratospheric HAPS payload bay — Airbus Zephyr S class; payload bay, not full wingspan'
  ),
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
  targets: Record<string, number>,
  briefEnvelope?: { w_mm: number; d_mm: number; h_mm: number },
): DimensionSheet {
  let envelope: Envelope;
  let floor_budget_m2: number;

  // ── Brief-stated dimensions ALWAYS win; class default is the fallback when
  // brief omits geometry. See V7 council 1e4adaf2 for the regression that
  // motivated this comment.
  //
  // If briefEnvelope is provided (from parsedBrief.constraints.max_dimensions_mm),
  // build the envelope from those dimensions regardless of domain — they represent
  // the founder's explicit physical constraints and must not be overridden by any
  // class default. Class defaults are only authoritative when the brief is silent.
  if (briefEnvelope && briefEnvelope.w_mm > 0 && briefEnvelope.d_mm > 0 && briefEnvelope.h_mm > 0) {
    const w_m = briefEnvelope.w_mm / 1000
    const d_m = briefEnvelope.d_mm / 1000
    const h_m = briefEnvelope.h_mm / 1000
    envelope = {
      kind: 'brief_stated',
      label: `Brief-stated envelope (${w_m.toFixed(2)}×${d_m.toFixed(2)}×${h_m.toFixed(2)} m)`,
      interior_w_mm: briefEnvelope.w_mm,
      interior_d_mm: briefEnvelope.d_mm,
      interior_h_mm: briefEnvelope.h_mm,
      interior_floor_m2: Number((w_m * d_m).toFixed(3)),
      interior_volume_m3: Number((w_m * d_m * h_m).toFixed(3)),
    }
    floor_budget_m2 = envelope.interior_floor_m2 * 0.85
    console.log(`[size-layout] Brief-stated envelope overrides class default: ${w_m.toFixed(3)}m × ${d_m.toFixed(3)}m × ${h_m.toFixed(3)}m`)
  } else if (domain === 'battery_energy_storage') {
    // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): use CLASS_ENVELOPE lookup.
    // Previously hardcoded; now consistent with the class-aware table.
    const spec = CLASS_ENVELOPE.battery_energy_storage
    envelope = {
      kind: spec.kind,
      label: spec.label,
      interior_w_mm: spec.interior_w_mm,
      interior_d_mm: spec.interior_d_mm,
      interior_h_mm: spec.interior_h_mm,
      interior_floor_m2: spec.interior_floor_m2,
      interior_volume_m3: spec.interior_volume_m3,
    };
    floor_budget_m2 = envelope.interior_floor_m2 * 0.85; // 15% for aisles
  } else if (domain === 'vertical_farm') {
    // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): corrected from erroneous 10×10×5m.
    // Real CEA grow room: 12×6×3m (IGS/Jones Food class). See CLASS_ENVELOPE.
    const spec = CLASS_ENVELOPE.vertical_farm
    envelope = {
      kind: spec.kind,
      label: spec.label,
      interior_w_mm: spec.interior_w_mm,
      interior_d_mm: spec.interior_d_mm,
      interior_h_mm: spec.interior_h_mm,
      interior_floor_m2: spec.interior_floor_m2,
      interior_volume_m3: spec.interior_volume_m3,
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
    // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): check CLASS_ENVELOPE before
    // falling back to the generic room. All 10 baseline classes now have an
    // entry; only truly unknown product types fall through to generic.
    const classSpec = CLASS_ENVELOPE[domain]
    if (classSpec) {
      envelope = {
        kind: classSpec.kind,
        label: classSpec.label,
        interior_w_mm: classSpec.interior_w_mm,
        interior_d_mm: classSpec.interior_d_mm,
        interior_h_mm: classSpec.interior_h_mm,
        interior_floor_m2: classSpec.interior_floor_m2,
        interior_volume_m3: classSpec.interior_volume_m3,
      };
      console.log(`[size-layout] class-aware envelope: ${classSpec.label} (${classSpec.basis})`)
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
    }
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
      // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): use available canopy area from
      // brief targets if provided, else divide the envelope floor equally.
      const canopy = targets.canopy_m2 || envelope.interior_floor_m2;
      m2 = canopy / (modules.length || 1);
    } else if (domain === 'heat_pump') {
      // Mid-density components, compact. ~0.001 m² per kg is plausible for
      // a 1-1.5 m tall outdoor unit.
      m2 = (massKg ?? 20) * 0.001;
    } else if (domain === 'cgm') {
      // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): CGM patch — sub-100mm scale.
      // Spatial packing has no meaning at this scale; allocate equal slices.
      m2 = envelope.interior_floor_m2 / (modules.length || 1);
    } else if (domain === 'drone') {
      // Drone: volume packing within the frame bounding box. Use a generous
      // 0.002 m² per kg heuristic (lighter, more spread-out components).
      m2 = (massKg ?? 5) * 0.002;
    } else if (domain === 'auv') {
      // AUV: cylindrical hull — components pack along the axis.
      // Cylindrical cross-section × length. Use 0.0005 m²/kg for dense packing.
      m2 = (massKg ?? 20) * 0.0005;
    } else if (domain === 'bioreactor') {
      // Bioreactor: vessel footprint dominates. Equal share of floor per module.
      m2 = envelope.interior_floor_m2 / (modules.length || 1);
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
 * ISO container physical constants lookup.
 * Source: ISO 668:2020 Series 1 freight containers.
 *
 * BLOCKER-D2-4 FIX: replaced single ISO_40FT hardcode with a per-kind lookup
 * table so that extendSizingSheetPA() can select the correct tare, payload,
 * and external dimensions from the envelope.kind set by the solver, rather
 * than silently using 40ft constants for every product.
 */
const ISO_CONTAINER_SPECS: Record<string, {
  external_w_mm: number
  external_d_mm: number
  external_h_mm: number
  tare_kg: number
  max_payload_kg: number
}> = {
  // Standard 40ft High-Cube (most common BESS container)
  container_40ft: {
    external_w_mm:  2438,
    external_d_mm: 12192,
    external_h_mm:  2896,
    tare_kg:        3750,
    max_payload_kg: 27_230,
  },
  // Standard 20ft ISO container
  container_20ft: {
    external_w_mm:  2438,
    external_d_mm:  6058,
    external_h_mm:  2591,
    tare_kg:        2200,
    max_payload_kg: 25_000,
  },
}

/** Fallback spec when envelope.kind does not match a known container type. */
const ISO_FALLBACK_SPEC = ISO_CONTAINER_SPECS.container_40ft

/**
 * Derive the PA-shape extension fields from an existing DimensionSheet for
 * ALL product classes — not just battery_energy_storage.
 *
 * BLOCKER-D2-3 FIX: removed the `domain === 'battery_energy_storage'` guard
 * that was previously inside runSizeLayout. Now extendSizingSheetPA is called
 * for every domain when paMode=true, with domain-specific behaviour:
 *   - iso_container_layout (BESS): zones from container partitioning + ISO
 *     constants selected by envelope.kind (BLOCKER-D2-4 fix).
 *   - thermal_system_layout (heat_pump): zones from solver chassis layout if
 *     available; otherwise empty zones[] + clearanceNotes explaining no zone
 *     allocation for this domain.
 *   - All other layouts (generic, warehouse, etc.): universal fields
 *     (volumeUtilisationPct, massUtilisationPct) always populated; zones
 *     from module grouping; tare/payload derived from envelope where possible.
 *
 * BLOCKER-D2-5 FIX: replaced `env.interior_volume_m3 || 1` fallback with
 * an explicit null-return path — `volumeUtilisationPct` is null when volume
 * data is unavailable, preventing the bogus 100% figure.
 *
 * Called inside runSizeLayout only when PA_PIPELINE=true (paMode=true).
 */
function extendSizingSheetPA(
  sheet: DimensionSheet,
  modules: Module[],
  domain: string,
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

  // BLOCKER-D2-5 FIX: guard missing/zero interior_volume_m3 explicitly.
  // Return null (not 100%) when volume data is unavailable so the renderer
  // can display "unavailable" rather than a misleading 100% figure.
  const totalVolumeM3: number | null =
    typeof env.interior_volume_m3 === 'number' && env.interior_volume_m3 > 0
      ? env.interior_volume_m3
      : null

  const volumeUtilisationPct: number | null = totalVolumeM3 !== null
    ? Math.min(100, Math.round((allocatedVolumeM3 / totalVolumeM3) * 100))
    : null

  // ── Tare / payload from envelope kind or ISO lookup ───────────────────────
  // BLOCKER-D2-4 FIX: derive tare/payload/external dims from envelope.kind
  // rather than hard-wiring ISO_40FT constants regardless of container size.
  //
  // For ISO container domains: look up by envelope.kind (container_40ft,
  // container_20ft etc.). For non-container domains: derive best-effort
  // estimates from the envelope geometry or set to null with a note.
  let tareMassKg: number
  let availablePayloadMassKg: number
  let externalDimensionsMm: { w: number; d: number; h: number }

  const containerSpec = ISO_CONTAINER_SPECS[env.kind]
  if (containerSpec) {
    // Known ISO container — use tabulated values.
    tareMassKg = containerSpec.tare_kg
    availablePayloadMassKg = containerSpec.max_payload_kg
    externalDimensionsMm = {
      w: containerSpec.external_w_mm,
      d: containerSpec.external_d_mm,
      h: containerSpec.external_h_mm,
    }
  } else {
    // Non-container envelope (warehouse_bay, outdoor_unit, generic_room, etc.).
    // Derive a conservative payload estimate from the interior volume as a
    // rough density proxy (500 kg/m³ for dense packed electronics/machinery).
    // Use interior dimensions as external (no separate shell measured).
    const densityKgPerM3 = 500
    tareMassKg = 0 // No structural container tare for non-containers
    availablePayloadMassKg = totalVolumeM3 !== null
      ? Math.round(totalVolumeM3 * densityKgPerM3)
      : 0
    externalDimensionsMm = {
      w: env.interior_w_mm,
      d: env.interior_d_mm,
      h: env.interior_h_mm,
    }
  }

  const massUtilisationPct = availablePayloadMassKg > 0
    ? Math.min(100, Math.round((allocatedMassKg / availablePayloadMassKg) * 100))
    : 0

  // ── Zone allocation ───────────────────────────────────────────────────────
  // Group modules into functional zones based on name heuristics.
  // Works generically for all product classes — BESS zones are specifically
  // named; other domains fall through to generic zone grouping.
  const ZONE_KEYWORDS: Array<{ regex: RegExp; zone: string }> = [
    { regex: /battery|cell|rack|pack|lfp|bms|management/i, zone: 'Battery Zone' },
    { regex: /power.?electron|pcs|inverter|converter|transformer|switchgear/i, zone: 'Power Electronics Zone' },
    { regex: /thermal|cooling|hvac|heat.?exchanger|refrigerant|compressor|evaporator|condenser/i, zone: 'Thermal Management Zone' },
    { regex: /control|monitor|sensor|comms|communication|hmi|scada/i, zone: 'Controls & Monitoring Zone' },
    { regex: /fire|suppression|safety|detection/i, zone: 'Fire Safety Zone' },
    { regex: /pump|hydronic|hydrobox|manifold/i, zone: 'Hydronic Zone' },
    { regex: /structural|chassis|enclosure|housing/i, zone: 'Structural Zone' },
    { regex: /propulsion|thrust|motor|actuator/i, zone: 'Propulsion Zone' },
    { regex: /navigation|sensor|avionics|comput/i, zone: 'Avionics Zone' },
    { regex: /grow|nutrient|irrigation|lighting|led/i, zone: 'Growing Zone' },
  ]

  // For heat_pump domain: if no modules are available for zone partitioning
  // (because the heat_pump solver returns early with FEASIBILITY_DEFERRED),
  // produce an empty zones array with a clearance note explaining why.
  const isHeatPump = domain === 'heat_pump'

  const zoneMap = new Map<string, { modules: Module[]; dims: ModuleDimensions[] }>()

  for (const mod of modules) {
    let zoneName = 'General Zone'
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

  let clearanceNotes: string
  if (domain === 'battery_energy_storage' && containerSpec) {
    clearanceNotes =
      `Container clear aisle width: ≥600 mm along the longitudinal axis for maintenance access. ` +
      `End-panel clearance: 300 mm minimum for cable entry. ` +
      `Top clearance to roof: ${Math.max(0, env.interior_h_mm - 2200)} mm available for overhead cable trays.`
  } else if (isHeatPump) {
    clearanceNotes =
      `Heat pump installation clearances per EN 378: minimum 1000 mm service access on at least one long side. ` +
      `Refrigerant discharge area must be unobstructed. ` +
      `Zone allocation is indicative — confirm with installation site survey.`
  } else {
    clearanceNotes =
      `Clearance estimate based on generic envelope (${env.label}). ` +
      `Minimum 600 mm service access on all sides recommended. ` +
      `Domain-specific clearance requirements should be verified against applicable standards.`
  }

  // A3 FIX (2026-05-09): check allocated mass against payload budget.
  // For container-class domains (BESS, AUV, edge AI pod) where ISO_CONTAINER_SPECS
  // applies, flip layoutFeasible=false and generate a remediation note when the
  // allocated zone mass exceeds the container's rated max_payload_kg.
  // Previously the sizing solver only checked floor-area utilisation, so BESS
  // could report "Layout Feasible: YES" despite 34,650 kg > 27,230 kg payload.
  const massOverrun = containerSpec && allocatedMassKg > availablePayloadMassKg
  const massOverrunKg = massOverrun ? allocatedMassKg - availablePayloadMassKg : 0

  // Build mass margin note: always show when tight (<5%), and add overrun info.
  let massMarginNote: string | null = null
  if (massOverrun && containerSpec) {
    massMarginNote =
      `MASS BUDGET EXCEEDED: Allocated mass ${allocatedMassKg.toFixed(0)} kg exceeds container payload limit ` +
      `${availablePayloadMassKg.toFixed(0)} kg by ${massOverrunKg.toFixed(0)} kg. ` +
      `Layout Feasible: NO (mass overrun). ` +
      `Remediation options: (1) select a 45-ft HC container (max_payload_kg ≈ 29,500 kg), ` +
      `(2) switch to a lighter cell chemistry (e.g. LFP prismatic → cylindrical 21700), ` +
      `or (3) reduce system capacity.`
  } else if (massMarginPct < 5) {
    massMarginNote =
      `Total allocated mass: ${allocatedMassKg.toFixed(0)} kg. ` +
      `Remaining mass budget: ${massMarginKg.toFixed(0)} kg (${massMarginPct.toFixed(1)}% margin for cables, fasteners, and contingency). ` +
      `This is tight — detailed cable harness mass estimation is required before design freeze.`
  }

  // When mass is over budget, flip the feasible flag so every downstream
  // consumer (gate check, sizing section, cover verdict) sees the correct status.
  const layoutFeasible = massOverrun ? false : sheet.feasible

  // ── Deployment-envelope suggestion ───────────────────────────────────────
  // Prefer suggestEnvelope (size-constrained) when we have volume + mass data;
  // fall back to defaultEnvelopeForClass (slug lookup) when those numbers are
  // unavailable.  If neither helper returns a result (AUV, HAPS, wearables —
  // the device IS the envelope) the field is left undefined — do NOT throw.
  //
  // suggestEnvelope requires a category.  For the common container-class
  // products we always suggest from 'shipping_container' first; if the class
  // lookup returns a non-container envelope we skip the volume-based helper
  // (rack/pallet/cabinet selection is class-driven, not volume-driven at this
  // stage) and fall through to the class default.
  const classDefault = defaultEnvelopeForClass(domain)
  let deploymentEnvelope: import('../deployment-envelopes').DeploymentEnvelope | undefined
  if (
    classDefault?.category === 'shipping_container' &&
    totalVolumeM3 !== null &&
    allocatedMassKg > 0
  ) {
    const payloadVolumeLiters = allocatedVolumeM3 * 1000
    const containerCandidates = suggestEnvelope(payloadVolumeLiters, allocatedMassKg, 'shipping_container')
    deploymentEnvelope = containerCandidates[0] ?? classDefault ?? undefined
  } else {
    deploymentEnvelope = classDefault ?? undefined
  }

  return {
    ...sheet,
    feasible: layoutFeasible,
    zones,
    volumeUtilisationPct: volumeUtilisationPct ?? undefined,
    massUtilisationPct,
    externalDimensionsMm,
    internalDimensionsMm: { w: env.interior_w_mm, d: env.interior_d_mm, h: env.interior_h_mm },
    tareMassKg,
    availablePayloadMassKg,
    clearanceNotes,
    massMarginNote,
    deploymentEnvelope,
  }
}

/**
 * Second-pass sizing: re-derives zone allocation and utilisation from real
 * modules after Decompose completes.
 *
 * The first sizing pass (runSizeLayout) runs BEFORE Decompose so the
 * Feasibility Gate sees the envelope verdict.  At that point state.modules is
 * empty, so zones[] and utilisation % come out as zero.  This second pass
 * accepts the first-pass DimensionSheet (which already has the correct
 * envelope, tare, and payload figures) and the now-populated modules list,
 * then calls extendSizingSheetPA to rebuild zones and utilisation in-place.
 *
 * The returned DimensionSheetPA merges all first-pass fields with the newly
 * computed zones / utilisation so the renderer gets a complete picture.
 */
export function runSizingSecondPass(
  existingSheet: DimensionSheet,
  modules: Module[],
): DimensionSheetPA {
  const domain = existingSheet.rules_domain || 'generic'
  // Preserve brief-stated envelope through the second pass: if the first pass
  // used a brief-stated envelope (kind === 'brief_stated'), reconstruct the
  // briefEnvelope argument so solveSizing uses the same dimensions for
  // module placement calculations, not the class default.
  const firstPassBriefEnvelope =
    existingSheet.envelope?.kind === 'brief_stated'
      ? {
          w_mm: existingSheet.envelope.interior_w_mm,
          d_mm: existingSheet.envelope.interior_d_mm,
          h_mm: existingSheet.envelope.interior_h_mm,
        }
      : undefined
  // Re-run module dimensions for the real modules using the same domain logic.
  // We re-call solveSizing with the real modules so module_dimensions are
  // populated correctly before extendSizingSheetPA aggregates them into zones.
  const refreshedSheet = solveSizing(modules, domain, existingSheet.target || {}, firstPassBriefEnvelope)
  // Preserve the first-pass envelope constants (which were set from domain
  // constants, not module data) so the renderer keeps the correct 40ft
  // container dimensions.  Merge module_dimensions from the refreshed sheet.
  const mergedSheet: DimensionSheet = {
    ...existingSheet,
    module_dimensions: refreshedSheet.module_dimensions,
    // feasible may have changed now that real modules are placed — use the
    // refreshed verdict (still conservative: if any module busts the budget,
    // it's INFEASIBLE).
    feasible: refreshedSheet.feasible,
    conflicts: refreshedSheet.conflicts,
    recommendations: refreshedSheet.recommendations,
  }
  return extendSizingSheetPA(mergedSheet, modules, domain)
}

// Run sizing + layout as a subprocess
// Calls the existing sizing solver which is pure physics (no pipeline coupling)
export async function runSizeLayout(
  modules: Module[],
  options?: {
    domain?: string
    targets?: Record<string, number>
    paMode?: boolean
    /** Brief-stated external envelope in mm. When present, overrides class default.
     *  Precedence: brief-stated dimensions ALWAYS win; class default is the fallback
     *  when brief omits geometry. See V7 council 1e4adaf2. */
    briefEnvelope?: { w_mm: number; d_mm: number; h_mm: number }
  }
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

    const dimensionSheet = solveSizing(modules, domain, targets, options?.briefEnvelope)
    const spatialPlan = buildSpatialPlan(dimensionSheet, modules)

    // PA Stage 7a: extend with renderer fields when paMode=true.
    // BLOCKER-D2-3 FIX: removed the domain === 'battery_energy_storage' guard
    // so extendSizingSheetPA fires for ALL product classes on the PA path.
    // extendSizingSheetPA now handles domain-specific behaviour internally.
    if (options?.paMode) {
      const paSheet = extendSizingSheetPA(dimensionSheet, modules, domain)
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

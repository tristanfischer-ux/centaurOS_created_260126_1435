import type {
  ArchitectureModel,
  EngineeringSanityCheck,
  KeyMetric,
  ProductClass,
  ProvenanceRef,
  RequirementTrace,
  RequirementTraceLink,
} from '../schema/types'
import type { ParsedBrief } from '../pipeline/parse-brief'

interface TraceRule {
  modules: Array<{ id: string; rationale: string }>
  keyMetricIds: string[]
  sanityCheckIds: string[]
  note: string
}

const traceRef = (productClass: ProductClass): ProvenanceRef => ({
  kind: 'model',
  ref: `requirement_trace.${productClass}`,
})

export function buildRequirementTrace(
  productClass: ProductClass,
  parsed: ParsedBrief,
  architecture: ArchitectureModel,
  keyMetrics: KeyMetric[],
  engineeringSanityChecks: EngineeringSanityCheck[],
): RequirementTrace[] {
  const rules = rulesForProductClass(productClass)
  const metricIds = new Set(keyMetrics.map(metric => metric.id))
  const sanityIds = new Set(engineeringSanityChecks.map(check => check.id))

  return parsed.brief.requirements.map(requirement => {
    const rule = rules[requirement.id] ?? fallbackRule(requirement.id)
    const architectureLinks = rule.modules.flatMap(item => linkModule(architecture, item.id, item.rationale))
    const keyMetricIds = rule.keyMetricIds.filter(id => metricIds.has(id))
    const engineeringSanityCheckIds = rule.sanityCheckIds.filter(id => sanityIds.has(id))
    const status = traceStatus(architectureLinks, keyMetricIds, engineeringSanityCheckIds)
    return {
      requirementId: requirement.id,
      label: requirement.label,
      value: requirement.value,
      unit: requirement.unit,
      status,
      architectureLinks,
      keyMetricIds,
      engineeringSanityCheckIds,
      notes: [rule.note, statusNote(status)],
      provenance: [requirement.source, traceRef(productClass)],
    }
  })
}

function rulesForProductClass(productClass: ProductClass): Record<string, TraceRule> {
  if (productClass === 'energy_storage') {
    return {
      capacity_mwh: {
        modules: [
          { id: 'energy_storage_source', rationale: 'Cell strings and rack assemblies carry the requested energy capacity.' },
          { id: 'energy_conversion_transduction', rationale: 'PCS sizing must be compatible with the requested energy capacity.' },
          { id: 'power_distribution', rationale: 'DC bus and switchgear must carry the capacity-scaled pack current.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['bess_c_rate', 'bess_duration', 'bess_container_energy_density'],
        note: 'Energy capacity is traced through storage, conversion, distribution and sanity checks.',
      },
      power_mw: {
        modules: [
          { id: 'energy_conversion_transduction', rationale: 'PCS inverter and transformer stage implement the requested power rating.' },
          { id: 'power_distribution', rationale: 'AC/DC distribution must support rated power current paths.' },
          { id: 'control_compute_communication', rationale: 'EMS and PCS controls must dispatch the rated power safely.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['bess_c_rate', 'bess_duration'],
        note: 'Power rating is traced through PCS, distribution and power-to-energy sanity checks.',
      },
      mass_kg: {
        modules: [
          { id: 'structure_containment', rationale: 'Container structure and rack mounting carry the gross mass constraint.' },
          { id: 'maintenance_serviceability', rationale: 'Lifting and handling features must respect the mass envelope.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['bess_container_energy_density'],
        note: 'Mass is traced through structure and system-level energy-density sanity checks.',
      },
    }
  }

  if (productClass === 'vertical_farm') {
    const footprintRule: TraceRule = {
      modules: [
        { id: 'structure_containment', rationale: 'Growing rack stack and enclosure panels must fit the declared footprint.' },
        { id: 'maintenance_serviceability', rationale: 'Harvest and cleaning access must remain workable inside the envelope.' },
        { id: 'environmental_interface', rationale: 'Lighting, airflow and CO2 modules must fit the growing volume.' },
      ],
      keyMetricIds: [],
      sanityCheckIds: ['farm_footprint', 'farm_wet_electrical_separation', 'farm_process_closure'],
      note: 'Envelope dimensions are traced through rack structure, service access and environmental closure.',
    }
    return {
      envelope_length_m: footprintRule,
      envelope_width_m: footprintRule,
      footprint_m2: footprintRule,
    }
  }

  if (productClass === 'heat_pump') {
    return {
      thermal_output_kw: {
        modules: [
          { id: 'energy_conversion_transduction', rationale: 'Compressor, expansion and refrigerant circuit must support the requested heating output.' },
          { id: 'environmental_interface', rationale: 'Outdoor coil and fan must absorb enough ambient heat for the output target.' },
          { id: 'mass_fluid_transport_process', rationale: 'Hydronic heat exchanger and pump must deliver the output to the water loop.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['heatpump_cop_input_power', 'heatpump_refrigerant_hydronic_closure'],
        note: 'Thermal output is traced through refrigerant conversion, outdoor heat pickup and water-side delivery.',
      },
      cop: {
        modules: [
          { id: 'energy_conversion_transduction', rationale: 'Compressor modulation and refrigerant metering determine heat-pump efficiency.' },
          { id: 'control_compute_communication', rationale: 'Control logic manages compressor, fan, pump and defrost states that affect COP.' },
          { id: 'sensing_instrumentation', rationale: 'Temperature and pressure sensing is required to verify efficient operation.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['heatpump_cop_input_power', 'heatpump_refrigerant_hydronic_closure'],
        note: 'COP is traced through compressor/control behaviour and the sensing needed to validate operating points.',
      },
    }
  }

  if (productClass === 'ev_charger') {
    return {
      dc_power_kw: {
        modules: [
          { id: 'power_distribution', rationale: 'Input switchgear and DC output switching must support the requested charger power.' },
          { id: 'energy_conversion_transduction', rationale: 'Power modules implement the requested AC/DC conversion capacity.' },
          { id: 'charging_connector_interface', rationale: 'Cable, connector and vehicle interface must carry the requested DC output.' },
          { id: 'environmental_interface', rationale: 'Cooling loop must reject power-module and cable heat at the requested output.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['evcharger_power_level', 'evcharger_power_safety_chain', 'evcharger_protocol_closure'],
        note: 'DC power is traced through input/output distribution, conversion stack, connector interface and thermal support.',
      },
    }
  }

  if (productClass === 'bioreactor') {
    return {
      working_volume_l: {
        modules: [
          { id: 'structure_containment', rationale: 'Single-use bag chamber, support frame and sterile connector panel must carry the requested culture volume.' },
          { id: 'mass_fluid_transport_process', rationale: 'Feed, harvest and sparger paths must scale to the requested working volume.' },
          { id: 'actuation_kinematics', rationale: 'Mixing drive must support the requested culture volume without breaking the sterile boundary.' },
          { id: 'environmental_interface', rationale: 'Thermal and exhaust support must maintain the requested culture volume.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['bioreactor_working_volume', 'bioreactor_process_closure', 'bioreactor_aseptic_pressure_safety'],
        note: 'Working volume is traced through sterile containment, transport, mixing, environmental control and sanity checks.',
      },
    }
  }

  if (productClass === 'auv') {
    return {
      depth_rating_m: {
        modules: [
          { id: 'structure_containment', rationale: 'Pressure hull, endcaps and seals must survive the requested depth rating.' },
          { id: 'environmental_interface', rationale: 'Penetrators, pressure compensation and thermal paths must respect the depth-rated pressure boundary.' },
          { id: 'safety_protection', rationale: 'Over-depth abort, leak detection and recovery actions depend on the pressure boundary limit.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['auv_depth_rating', 'auv_pressure_power_recovery_safety'],
        note: 'Depth rating is traced through the pressure hull, boundary support hardware and pressure-related safety checks.',
      },
      endurance_hours: {
        modules: [
          { id: 'energy_storage_source', rationale: 'Battery pack and reserve monitoring carry the survey endurance target.' },
          { id: 'power_distribution', rationale: 'Power distribution losses and load branches affect endurance.' },
          { id: 'actuation_kinematics', rationale: 'Thruster power draw and trim determine the mission energy budget.' },
          { id: 'control_compute_communication', rationale: 'Mission software must enforce reserve energy and abort decisions.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['auv_endurance_target', 'auv_navigation_control_closure', 'auv_pressure_power_recovery_safety'],
        note: 'Endurance is traced through battery, power distribution, propulsion and the autonomy logic that preserves reserve energy.',
      },
    }
  }

  if (productClass === 'edge_ai') {
    const rackRule: TraceRule = {
      modules: [
        { id: 'structure_containment', rationale: 'Rack chassis and airflow boundaries must fit the requested rack height.' },
        { id: 'environmental_interface', rationale: 'Cooling path and fan wall must respect the rack envelope.' },
        { id: 'maintenance_serviceability', rationale: 'Rail, cable and FRU access must remain serviceable inside the rack envelope.' },
      ],
      keyMetricIds: [],
      sanityCheckIds: ['edgeai_power_density', 'edgeai_thermal_power_safety'],
      note: 'Rack height is traced through enclosure, airflow and serviceability constraints.',
    }
    return {
      compute_tops: {
        modules: [
          { id: 'compute_acceleration', rationale: 'Accelerator module, host CPU and memory implement the requested inference throughput.' },
          { id: 'environmental_interface', rationale: 'Thermal derating determines sustained accelerator throughput.' },
          { id: 'control_compute_communication', rationale: 'Runtime and driver software determine delivered model throughput.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['edgeai_compute_throughput', 'edgeai_data_compute_closure', 'edgeai_thermal_power_safety'],
        note: 'Throughput is traced through accelerator hardware, runtime control and thermal closure.',
      },
      rack_units: rackRule,
      power_budget_w: {
        modules: [
          { id: 'power_distribution', rationale: 'Redundant PSU and rail distribution must support the requested power budget.' },
          { id: 'environmental_interface', rationale: 'Cooling must reject the heat implied by the power budget.' },
          { id: 'safety_protection', rationale: 'Thermal and hardwired trip paths must protect high-power rack operation.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['edgeai_power_density', 'edgeai_thermal_power_safety'],
        note: 'Power budget is traced through PSU conversion, thermal rejection and hardware shutdown protection.',
      },
    }
  }

  if (productClass === 'haps') {
    return {
      altitude_km: {
        modules: [
          { id: 'environmental_interface', rationale: 'Thermal, UV and low-pressure protection must support the requested stratospheric operating altitude.' },
          { id: 'sensing_instrumentation', rationale: 'Airdata, weather and navigation sensing must remain credible at the requested altitude.' },
          { id: 'control_compute_communication', rationale: 'Autonomy and ground-command links must manage flight modes at the requested altitude.' },
          { id: 'safety_protection', rationale: 'Recovery and airspace-safety actions depend on the altitude operating band.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['haps_altitude_band', 'haps_energy_flight_closure', 'haps_payload_comms_safety'],
        note: 'Altitude is traced through environmental protection, sensing, autonomy and flight-safety closure.',
      },
      endurance_days: {
        modules: [
          { id: 'energy_harvesting', rationale: 'Solar array and MPPT conversion define the day-side energy budget for station keeping.' },
          { id: 'energy_storage_source', rationale: 'Stratospheric battery and reserve monitoring carry night-side operation and endurance reserve.' },
          { id: 'power_distribution', rationale: 'Power management and load shedding determine usable endurance under payload and propulsion loads.' },
          { id: 'actuation_kinematics', rationale: 'Propulsion pod efficiency and trim behaviour drive the endurance energy draw.' },
          { id: 'control_compute_communication', rationale: 'Energy-aware autonomy must enforce reserve margins across the endurance target.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['haps_endurance_target', 'haps_energy_flight_closure'],
        note: 'Endurance is traced through solar harvesting, storage, distribution, propulsion and autonomy reserve logic.',
      },
      wingspan_m: {
        modules: [
          { id: 'structure_containment', rationale: 'Wing spar, ribs and payload bay must carry the requested span and bending loads.' },
          { id: 'energy_harvesting', rationale: 'The solar skin area depends directly on the available wing span.' },
          { id: 'actuation_kinematics', rationale: 'Control surface actuation and trim must remain compatible with the span.' },
          { id: 'maintenance_serviceability', rationale: 'Wing assembly and launch/recovery equipment must handle the span envelope.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['haps_wingspan_envelope', 'haps_energy_flight_closure'],
        note: 'Wingspan is traced through structure, solar area, actuation and ground-handling serviceability.',
      },
    }
  }

  if (productClass === 'cgm') {
    return {
      wear_days: {
        modules: [
          { id: 'skin_patient_interface', rationale: 'Adhesive wear, skin contact and sterile boundary must survive the declared wear duration.' },
          { id: 'energy_storage_source', rationale: 'Battery and shelf activation must support the declared wear period.' },
          { id: 'environmental_interface', rationale: 'Sweat, water and temperature exposure affect wear reliability.' },
          { id: 'safety_protection', rationale: 'Patient-contact and stale-data controls depend on the wear-duration claim.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['cgm_wear_duration', 'cgm_patch_power_comms_safety'],
        note: 'Wear duration is traced through adhesive skin interface, energy source, environment and patient safety controls.',
      },
      reading_interval_minutes: {
        modules: [
          { id: 'sensing_instrumentation', rationale: 'Sensor chemistry and analog readout must support the requested measurement cadence.' },
          { id: 'control_compute_communication', rationale: 'Firmware, buffering and BLE telemetry must process readings at the requested interval.' },
          { id: 'power_distribution', rationale: 'Duty-cycled rails must support sampling and radio bursts at the requested interval.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['cgm_reading_interval', 'cgm_biofluid_signal_closure', 'cgm_patch_power_comms_safety'],
        note: 'Reading interval is traced through sensing, low-power electronics, buffering and telemetry.',
      },
      mard_percent: {
        modules: [
          { id: 'sensing_instrumentation', rationale: 'Sensor chemistry, reference electrode and analog front-end determine measurement error.' },
          { id: 'environmental_interface', rationale: 'Temperature, sweat, ingress and motion compensation affect accuracy.' },
          { id: 'control_compute_communication', rationale: 'Calibration, filtering and stale-data logic determine delivered glucose estimates.' },
        ],
        keyMetricIds: [],
        sanityCheckIds: ['cgm_accuracy_target', 'cgm_biofluid_signal_closure'],
        note: 'MARD is traced through chemistry, environmental compensation and signal-processing logic; clinical evidence is still required.',
      },
    }
  }

  if (productClass === 'drone') {
    return {
      duration_minutes: {
        modules: [
          { id: 'energy_storage_source', rationale: 'Flight battery pack supplies mission energy for the endurance target.' },
          { id: 'actuation_kinematics', rationale: 'Propulsion efficiency determines whether the endurance target is credible.' },
          { id: 'control_compute_communication', rationale: 'Flight control and failsafe logic manage reserve energy and mission profile.' },
        ],
        keyMetricIds: ['headline_output'],
        sanityCheckIds: ['drone_endurance_target', 'drone_propulsion_quads', 'drone_control_power_chain'],
        note: 'Endurance is traced through battery, propulsion, controls and sanity checks.',
      },
    }
  }

  return {}
}

function fallbackRule(requirementId: string): TraceRule {
  return {
    modules: [{ id: 'core_system', rationale: `Generic fallback coverage for ${requirementId}.` }],
    keyMetricIds: ['headline_output'],
    sanityCheckIds: [],
    note: 'No class-specific requirement trace rule exists yet.',
  }
}

function linkModule(architecture: ArchitectureModel, moduleId: string, rationale: string): RequirementTraceLink[] {
  const module = architecture.modules.find(candidate => candidate.id === moduleId)
  if (!module) return []
  const firstSubModule = module.subModules[0]
  const firstWord = firstSubModule?.words[0]
  return [{
    moduleId: module.id,
    moduleName: module.displayName,
    subModuleId: firstSubModule?.id,
    subModuleName: firstSubModule?.name,
    componentWordId: firstWord?.id,
    componentName: firstWord?.name,
    rationale,
  }]
}

function traceStatus(
  architectureLinks: RequirementTraceLink[],
  keyMetricIds: string[],
  engineeringSanityCheckIds: string[],
): RequirementTrace['status'] {
  if (architectureLinks.length === 0) return 'uncovered'
  if (keyMetricIds.length === 0 && engineeringSanityCheckIds.length === 0) return 'partial'
  return 'covered'
}

function statusNote(status: RequirementTrace['status']): string {
  if (status === 'covered') return 'Requirement has architecture coverage plus metric or engineering sanity coverage.'
  if (status === 'partial') return 'Requirement has architecture coverage but lacks metric or sanity-check coverage.'
  return 'Requirement has no architecture coverage in the current model.'
}

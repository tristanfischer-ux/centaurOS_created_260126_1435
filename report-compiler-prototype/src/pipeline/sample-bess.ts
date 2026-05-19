import type { ProductDossier, ReportInput } from '../schema/types'

const briefRef = { kind: 'brief' as const, ref: 'input.brief' }
const classPackRef = { kind: 'class_pack' as const, ref: 'energy_storage.required_parts' }
const formulaRef = { kind: 'formula' as const, ref: 'capacity_mwh * cycles_per_year * efficiency' }
const benchmarkRef = { kind: 'class_pack' as const, ref: 'energy_storage.benchmark' }
const supplierRef = { kind: 'source' as const, ref: 'energy_storage.vendor_catalog' }
const assumptionRef = { kind: 'assumption' as const, ref: 'one_cycle_per_day' }

export function buildSampleBessDossier(input: ReportInput): ProductDossier {
  const lines = [
    {
      id: 'lfp-cells',
      componentWordId: 'lfp_prismatic_cells',
      description: '3.2 V 280 Ah LFP prismatic battery cells',
      quantity: { value: 3920, unit: 'each', provenance: [briefRef, formulaRef] },
      unitCostGbp: 75,
      totalCostGbp: 294000,
      sourceGrade: 'estimate' as const,
      supplier: 'CATL / EVE Energy',
      leadTimeWeeks: 12,
      provenance: [classPackRef],
      critical: true,
    },
    {
      id: 'bms-master',
      componentWordId: 'bms_master_controller',
      description: 'BMS master controller and rack communication gateway',
      quantity: { value: 1, unit: 'each', provenance: [classPackRef] },
      unitCostGbp: 4500,
      totalCostGbp: 4500,
      sourceGrade: 'estimate' as const,
      supplier: 'Nuvation Energy',
      leadTimeWeeks: 8,
      provenance: [classPackRef],
      critical: true,
    },
    {
      id: 'pcs-inverter',
      componentWordId: 'pcs_inverter',
      description: '1 MW bidirectional PCS inverter',
      quantity: { value: 1, unit: 'each', provenance: [briefRef] },
      unitCostGbp: 95000,
      totalCostGbp: 95000,
      sourceGrade: 'catalogue' as const,
      supplier: 'Sungrow / SMA',
      leadTimeWeeks: 16,
      provenance: [classPackRef],
      critical: true,
    },
    {
      id: 'thermal-loop',
      componentWordId: 'thermal_management_loop',
      description: 'Glycol thermal management loop with chiller, pump and manifold',
      quantity: { value: 1, unit: 'system', provenance: [classPackRef] },
      unitCostGbp: 28000,
      totalCostGbp: 28000,
      sourceGrade: 'estimate' as const,
      supplier: 'Boyd / Pfannenberg',
      leadTimeWeeks: 10,
      provenance: [classPackRef],
      critical: true,
    },
    {
      id: 'fire-suppression',
      componentWordId: 'fire_detection_suppression',
      description: 'Smoke detection and clean-agent fire suppression system',
      quantity: { value: 1, unit: 'system', provenance: [classPackRef] },
      unitCostGbp: 18000,
      totalCostGbp: 18000,
      sourceGrade: 'estimate' as const,
      supplier: 'Johnson Controls / Honeywell',
      leadTimeWeeks: 8,
      provenance: [classPackRef],
      critical: true,
    },
    {
      id: 'dc-contactor',
      componentWordId: 'dc_contactor',
      description: 'High-voltage DC contactor and pre-charge breaker set',
      quantity: { value: 2, unit: 'each', provenance: [classPackRef] },
      unitCostGbp: 1200,
      totalCostGbp: 2400,
      sourceGrade: 'priced' as const,
      supplier: 'TE Connectivity / Sensata',
      leadTimeWeeks: 6,
      provenance: [classPackRef],
      critical: true,
    },
  ]
  const total = lines.reduce((sum, line) => sum + (line.totalCostGbp ?? 0), 0)

  return {
    id: input.id,
    productClass: input.productClass ?? 'energy_storage',
    brief: {
      originalText: input.briefText,
      productName: 'Containerised 3.5 MWh Battery Energy Storage System',
      requirements: [
        { id: 'usable_energy', label: 'Usable energy', value: 3.5, unit: 'MWh', source: briefRef },
        { id: 'continuous_power', label: 'Continuous power', value: 1, unit: 'MW', source: briefRef },
        { id: 'max_mass', label: 'Maximum gross mass', value: 28000, unit: 'kg', source: briefRef },
      ],
      assumptions: ['One equivalent full cycle per day for headline annual throughput.'],
    },
    requirementTrace: [
      {
        requirementId: 'usable_energy',
        label: 'Usable energy',
        value: 3.5,
        unit: 'MWh',
        status: 'covered',
        architectureLinks: [
          {
            moduleId: 'energy_storage_source',
            moduleName: 'Energy Storage Source',
            subModuleId: 'cell_racks',
            subModuleName: 'Cell racks',
            componentWordId: 'lfp_prismatic_cells',
            componentName: 'LFP prismatic cells',
            rationale: 'Cell racks carry the requested usable energy.',
          },
        ],
        keyMetricIds: ['headline_output'],
        engineeringSanityCheckIds: ['bess_c_rate', 'bess_duration'],
        notes: ['Sample trace row retained for legacy dossier compatibility.'],
        provenance: [briefRef, formulaRef],
      },
      {
        requirementId: 'continuous_power',
        label: 'Continuous power',
        value: 1,
        unit: 'MW',
        status: 'covered',
        architectureLinks: [
          {
            moduleId: 'energy_conversion_transduction',
            moduleName: 'Energy Conversion Transduction',
            subModuleId: 'pcs_stack',
            subModuleName: 'PCS inverter stack',
            componentWordId: 'pcs_inverter',
            componentName: 'PCS inverter',
            rationale: 'PCS stack implements the requested power rating.',
          },
        ],
        keyMetricIds: [],
        engineeringSanityCheckIds: ['bess_c_rate', 'bess_duration'],
        notes: ['Sample trace row retained for legacy dossier compatibility.'],
        provenance: [briefRef, formulaRef],
      },
      {
        requirementId: 'max_mass',
        label: 'Maximum gross mass',
        value: 28000,
        unit: 'kg',
        status: 'covered',
        architectureLinks: [
          {
            moduleId: 'structure_containment',
            moduleName: 'Structure Containment',
            subModuleId: 'container_shell',
            subModuleName: 'Container shell',
            rationale: 'Container structure carries the gross mass constraint.',
          },
        ],
        keyMetricIds: [],
        engineeringSanityCheckIds: ['bess_container_energy_density'],
        notes: ['Sample trace row retained for legacy dossier compatibility.'],
        provenance: [briefRef, formulaRef],
      },
    ],
    keyMetrics: [
      {
        id: 'headline_output',
        label: 'Annual MWh delivered',
        value: 1277.5,
        unit: 'MWh/year',
        formula: 'capacity_mwh * cycles_per_year * efficiency',
        inputs: { capacity_mwh: 3.5, cycles_per_year: 365, efficiency: 1 },
        notes: 'Throughput at one full equivalent cycle per day before degradation reserve.',
        provenance: [briefRef, formulaRef],
        confidence: 'medium',
      },
      {
        id: 'capex_gbp',
        label: 'Estimated CAPEX',
        value: total,
        unit: 'GBP',
        notes: 'Summed from priced and estimated BoM lines.',
        provenance: [classPackRef],
        confidence: 'medium',
      },
    ],
    architecture: {
      modules: [
        {
          id: 'energy_storage_source',
          displayName: 'Energy Storage Source',
          purpose: 'Stores usable grid energy in LFP cell racks.',
          interfaces: ['dc_bus', 'thermal_loop', 'bms_network'],
          subModules: [
            {
              id: 'cell_racks',
              name: 'Cell racks',
              purpose: 'Holds LFP cells, busbars and thermal interfaces.',
              interfaces: ['dc_bus', 'thermal_loop'],
              words: [
                {
                  id: 'lfp_prismatic_cells',
                  name: 'LFP prismatic cells',
                  quantity: { value: 3920, unit: 'each', provenance: [formulaRef] },
                  role: 'energy storage element',
                  sourceGrade: 'estimate',
                  provenance: [classPackRef],
                },
              ],
            },
          ],
        },
        {
          id: 'energy_conversion_transduction',
          displayName: 'Energy Conversion Transduction',
          purpose: 'Converts DC pack energy into grid-compatible AC power through the PCS inverter.',
          interfaces: ['dc_bus', 'ac_grid_connection', 'control_network'],
          subModules: [
            {
              id: 'pcs_stack',
              name: 'PCS inverter stack',
              purpose: 'Provides bidirectional conversion between battery DC bus and grid AC bus.',
              interfaces: ['dc_bus', 'ac_grid_connection'],
              words: [],
            },
          ],
        },
        {
          id: 'structure_containment',
          displayName: 'Structure Containment',
          purpose: 'Carries rack loads and protects equipment inside the ISO container envelope.',
          interfaces: ['lifting_points', 'cable_entries', 'thermal_boundary'],
          subModules: [
            {
              id: 'container_shell',
              name: 'Container shell and rack foundations',
              purpose: 'Provides transportable structure, rack anchoring and service access.',
              interfaces: ['lifting_points', 'cable_entries'],
              words: [],
            },
          ],
        },
        {
          id: 'control_compute_communication',
          displayName: 'Control Compute Communication',
          purpose: 'Supervises BMS, PCS, alarms and site-level dispatch communications.',
          interfaces: ['bms_network', 'pcs_control', 'site_scada'],
          subModules: [
            {
              id: 'ems_controller',
              name: 'EMS controller and SCADA gateway',
              purpose: 'Coordinates dispatch, alarm handling and external communications.',
              interfaces: ['site_scada', 'bms_network'],
              words: [],
            },
          ],
        },
        {
          id: 'power_distribution',
          displayName: 'Power Distribution',
          purpose: 'Routes high-voltage DC and auxiliary AC/DC power through protected conductors.',
          interfaces: ['dc_bus', 'auxiliary_power', 'earthing'],
          subModules: [
            {
              id: 'main_dc_bus',
              name: 'Main DC bus and protection routing',
              purpose: 'Carries pack current through busbars, contactors and service disconnects.',
              interfaces: ['dc_bus'],
              words: [],
            },
          ],
        },
        {
          id: 'safety_protection',
          displayName: 'Safety Protection',
          purpose: 'Detects electrical and fire hazards and places the system into a safe state.',
          interfaces: ['alarm_bus', 'hardwired_trip'],
          subModules: [
            {
              id: 'fire_detection',
              name: 'Fire detection and suppression',
              purpose: 'Detects smoke and actuates clean-agent suppression.',
              interfaces: ['alarm_bus'],
              words: [],
            },
          ],
        },
      ],
      crossModuleInterfaces: ['dc_bus', 'thermal_loop', 'bms_network', 'alarm_bus'],
    },
    bom: {
      lines,
      totalCostGbp: total,
      coverage: {
        requiredPartsPresent: 6,
        requiredPartsTotal: 6,
        pricedLines: lines.filter(line => line.unitCostGbp !== null).length,
        totalLines: lines.length,
      },
    },
    cost: {
      capexGbp: total,
      opexAnnualGbp: 18000,
      nreGbp: 260000,
      benchmarkGbp: { low: 350000, high: 1200000, source: classPackRef },
      sensitivity: [
        { driver: 'Battery cells', deltaPct: 10, impactGbp: 29400 },
        { driver: 'PCS inverter', deltaPct: 10, impactGbp: 9500 },
      ],
    },
    sourcing: {
      primarySuppliers: [
        { name: 'CATL / EVE Energy', spendGbp: 294000, risk: 'medium' },
        { name: 'Sungrow / SMA', spendGbp: 95000, risk: 'medium' },
      ],
      singleSourceRisks: ['Cell supply concentration should be dual-sourced.'],
      fallbackSuppliers: ['Samsung SDI', 'ABB', 'Schneider Electric'],
      admission: {
        status: 'partial',
        candidateLines: lines.length,
        admittedLines: lines.filter(line => line.unitCostGbp !== null).length,
        unpricedLines: lines.filter(line => line.unitCostGbp === null).length,
        unpricedCriticalLines: lines.filter(line => line.critical && line.unitCostGbp === null).length,
        rejectedRecords: [],
      },
    },
    regulatory: {
      standards: [
        {
          id: 'IEC-62619',
          title: 'Industrial lithium battery safety',
          jurisdiction: 'Global / UK-adopted',
          evidenceRequired: 'Cell certificates and pack-level safety validation.',
          provenance: [classPackRef],
        },
      ],
    },
    risks: {
      fmea: [
        { hazard: 'Thermal runaway propagation', severity: 10, occurrence: 3, detection: 4, mitigation: 'Cell spacing, detection and suppression.' },
        { hazard: 'DC arc fault', severity: 9, occurrence: 3, detection: 4, mitigation: 'Arc detection and fast isolation.' },
      ],
    },
    feasibility: {
      verdict: 'conditional',
      blockers: [],
      warnings: ['CAPEX is likely above the declared £180k target.'],
      mitigationPlan: ['Challenge target cost against market benchmark and present staged cost-down routes.'],
      engineeringSanityChecks: [
        {
          id: 'bess_c_rate',
          label: 'BESS C-Rate',
          status: 'pass',
          value: 0.29,
          unit: 'C',
          expectedRange: '0.1C to 1.0C for typical grid-storage duration systems',
          interpretation: 'Power-to-energy ratio implies 0.29C, equivalent to roughly 3.5 hours at rated power.',
          provenance: [briefRef, formulaRef],
        },
        {
          id: 'bess_duration',
          label: 'Rated Duration',
          status: 'pass',
          value: 3.5,
          unit: 'hours',
          expectedRange: '1 to 6 hours for common containerised BESS applications',
          interpretation: '3.5 hours is plausible for a containerised grid-support BESS before detailed cell count and PCS sizing.',
          provenance: [briefRef, formulaRef],
        },
      ],
    },
    sources: {
      refs: [briefRef, classPackRef, formulaRef, benchmarkRef, supplierRef, assumptionRef],
      sourcingEvidence: [],
      verificationEvidence: [],
    },
    audit: [{ timestamp: new Date(0).toISOString(), stage: 'sample', message: 'Sample BESS dossier built.' }],
  }
}

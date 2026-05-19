/**
 * class-suppliers.ts — per-product-class supplier archetype registry.
 *
 * Each product class has N supplier archetypes (flexible per class per Tristan
 * 2026-05-17, not rigid 3). For each archetype, the cascade tries:
 *   1. forge-truth.db `companies` table filtered by `search_profile_id` in
 *      `search_profiles` (highest priority first)
 *   2. Web search using `search_keywords` if DB returns < N matches
 *   3. Flash-Lite judge for novel candidates
 *
 * Each archetype recommends up to 3 candidates in the rendered PDF. Tristan:
 * "we want to have choice about who we are recommending... for each category
 * there should be three choices".
 *
 * BESS fully populated. Other 9 classes scaffolded with placeholder profile
 * fallback (`manufacturing` is the big general-purpose profile, 10,291 pushed
 * + 382 enriched rows in forge-truth.db).
 */

export interface SupplierArchetype {
  id: string
  label: string
  function_description: string
  capabilities: string[]
  /** forge-truth.db search_profile_id values to query, in priority order. */
  search_profiles: string[]
  /** keywords for web fallback search when DB returns insufficient matches. */
  search_keywords: string[]
  /** ISO country codes preferred, in priority order. */
  preferred_regions: string[]
}

export interface ClassSuppliers {
  product_class: string
  archetypes: SupplierArchetype[]
}

const MANUFACTURING_FALLBACK = ['cleantech-uk', 'manufacturing']

export const CLASS_SUPPLIERS: Record<string, ClassSuppliers> = {
  bess: {
    product_class: 'bess',
    archetypes: [
      {
        id: 'principal_integrator',
        label: 'Principal contractor — turnkey systems integrator',
        function_description:
          'Delivers the complete BESS turnkey — container fit-out, battery racks, BMS, PCS, EMS, fire suppression, commissioning. The customer signs one contract; the integrator manages the entire build.',
        capabilities: ['BESS systems integration', 'turnkey EPC', 'site commissioning', 'grid-code compliance'],
        search_profiles: ['bess-supplier-discovery-20260422', 'cleantech-uk', 'manufacturing'],
        search_keywords: ['BESS systems integrator UK', 'battery energy storage turnkey EPC', 'grid-scale BESS integrator'],
        preferred_regions: ['GB', 'IE', 'NL', 'DE', 'FR', 'US'],
      },
      {
        id: 'cell_pack_supplier',
        label: 'Subcontractor — battery cell & pack supplier',
        function_description:
          'Supplies lithium-ion (LFP or NMC) cells, or assembled battery packs ready for rack mounting. Most BESS integrators source cells from one of a small number of tier-1 cell manufacturers, then assemble into packs in-house or via a pack assembler.',
        capabilities: ['Li-ion cell manufacturing', 'battery pack assembly', 'BMS integration', 'UN 38.3 transport certification'],
        search_profiles: ['bess-supplier-discovery-20260422', 'manufacturing'],
        search_keywords: ['LFP cell supplier', 'lithium battery pack manufacturer UK', 'BESS cell vendor LFP NMC'],
        preferred_regions: ['GB', 'KR', 'CN', 'DE', 'US'],
      },
      {
        id: 'enclosure_fabricator',
        label: 'Subcontractor — container / enclosure fabricator',
        function_description:
          'Fabricates or modifies 20ft / 40ft ISO containers: HVAC, fire-rated partitioning, electrical fit, weather sealing, IP-rating. Some integrators self-build; many subcontract this to a specialist sheet-metal shop.',
        capabilities: ['ISO container modification', 'fire-rated partition fabrication', 'HVAC integration', 'IP-rated enclosure'],
        search_profiles: ['cleantech-uk', 'manufacturing'],
        search_keywords: ['ISO container fit-out manufacturer UK', 'BESS enclosure shop', 'shipping container conversion UK'],
        preferred_regions: ['GB', 'NL', 'DE'],
      },
    ],
  },

  consumer_cinematography_drone: {
    product_class: 'consumer_cinematography_drone',
    archetypes: [
      {
        id: 'principal_emss',
        label: 'Principal contractor — electronics manufacturing services (EMS)',
        function_description:
          'Delivers PCBA assembly + final box-build + functional test. Most consumer drones are designed by the brand and contract-manufactured at an EMS partner with drone-specific QA experience.',
        capabilities: ['drone PCBA', 'final assembly', 'functional test', 'FCC/CE pre-compliance'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['drone contract manufacturer UK', 'UAV electronics manufacturing services', 'consumer drone EMS partner'],
        preferred_regions: ['GB', 'PL', 'TW', 'CN', 'US'],
      },
      {
        id: 'frame_supplier',
        label: 'Subcontractor — carbon-fibre frame & airframe',
        function_description:
          'Moulds the folding carbon-fibre airframe, arms, and structural shells. UK has strong carbon-fibre shops feeding motorsport + aerospace markets.',
        capabilities: ['carbon-fibre layup', 'composite moulding', 'machining', 'CNC'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['carbon fibre frame supplier UK', 'composite drone airframe manufacturer', 'CFRP moulding shop'],
        preferred_regions: ['GB', 'DE', 'IT', 'CN'],
      },
      {
        id: 'final_qa',
        label: 'Subcontractor — flight test & calibration partner',
        function_description:
          'Performs final gimbal calibration, IMU alignment, vision-sensor calibration, and a brief test flight before shipment. Some EMS partners do this in-house; some don\'t.',
        capabilities: ['IMU calibration', 'gimbal tuning', 'vision sensor calibration', 'flight test'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: [
          'drone calibration service UK',
          'UAV flight test partner',
          'commercial drone QA service',
          'UAV airworthiness testing UK',
          'drone CAA test house',
          'consumer drone EMC certification UK',
        ],
        preferred_regions: ['GB', 'IE', 'DE'],
      },
    ],
  },

  heatpump: {
    product_class: 'heatpump',
    archetypes: [
      {
        id: 'principal_oem',
        label: 'Principal contractor — heat pump OEM',
        function_description: 'Designs, manufactures, and warranties the complete monobloc unit including refrigerant cycle, controls, and field commissioning.',
        capabilities: ['heat pump manufacturing', 'refrigeration cycle design', 'MCS certification', 'F-gas compliance'],
        search_profiles: ['cleantech-uk', 'manufacturing'],
        search_keywords: ['heat pump manufacturer UK', 'air source heat pump OEM', 'monobloc heat pump UK'],
        preferred_regions: ['GB', 'IE', 'DE', 'NL', 'IT'],
      },
      {
        id: 'compressor_supplier',
        label: 'Subcontractor — compressor + refrigeration components',
        function_description: 'Supplies scroll/rotary compressors, BPHE condensers, expansion valves, and refrigerant pipework rated for R290.',
        capabilities: ['scroll compressor', 'rotary compressor', 'BPHE', 'R290 components', 'refrigeration'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['scroll compressor supplier', 'brazed plate heat exchanger', 'R290 refrigerant components'],
        preferred_regions: ['GB', 'DE', 'IT', 'CN', 'KR'],
      },
      {
        id: 'sheet_metal_enclosure',
        label: 'Subcontractor — sheet-metal enclosure + acoustic',
        function_description: 'Fabricates the outer cabinet, fan grilles, acoustic insulation, and weather-sealing gaskets.',
        capabilities: ['sheet metal fabrication', 'acoustic insulation', 'powder coating', 'IP54 enclosure'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['sheet metal fabrication UK', 'HVAC enclosure manufacturer', 'acoustic insulation supplier'],
        preferred_regions: ['GB', 'PL', 'CZ', 'DE'],
      },
    ],
  },

  ev_charger: {
    product_class: 'ev_charger',
    archetypes: [
      {
        id: 'principal_charger_oem',
        label: 'Principal contractor — DC fast charger OEM',
        function_description: 'Designs and manufactures the complete charging cabinet with PCS, controls, OCPP compliance, and CCS2 dispensing.',
        capabilities: ['DC fast charger', 'OCPP 2.0.1', 'CCS2', 'liquid-cooled cable', 'grid-tied power conversion'],
        search_profiles: ['cleantech-uk', 'manufacturing'],
        search_keywords: [
          'EV charger manufacturer UK',
          'DC fast charger OEM',
          'OCPP charging system',
          'DC fast charger manufacturer UK',
          '150kW EV charging station OEM',
          'CCS2 rapid charger',
        ],
        preferred_regions: ['GB', 'DE', 'NL', 'IE'],
      },
      {
        id: 'power_electronics_supplier',
        label: 'Subcontractor — power electronics modules',
        function_description: 'Supplies PFC rectifier + DC-DC converter modules (typically 30-50 kW each, stacked for fast-charger duty).',
        capabilities: ['SiC power electronics', 'PFC rectifier', 'DC-DC converter', '30-50kW modules'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['DC-DC power module', 'PFC rectifier manufacturer', 'EV charging power electronics'],
        preferred_regions: ['GB', 'DE', 'IT', 'CN'],
      },
      {
        id: 'cabinet_fabricator',
        label: 'Subcontractor — outdoor cabinet + cable management',
        function_description: 'Fabricates the IP54 outdoor steel cabinet, cable management arms, dispenser holsters.',
        capabilities: ['outdoor IP54 enclosure', 'sheet metal fabrication', 'cable management hardware'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['outdoor cabinet manufacturer', 'EV charger enclosure fabricator', 'street furniture manufacturer'],
        preferred_regions: ['GB', 'PL', 'DE'],
      },
    ],
  },

  edge_ai: {
    product_class: 'edge_ai',
    archetypes: [
      {
        id: 'principal_ems',
        label: 'Principal contractor — server EMS / contract manufacturer',
        function_description: 'Builds the complete 1U appliance from board-up: PCBA, chassis, thermal, final test, packaging.',
        capabilities: ['server PCBA', '1U rack-mount chassis', 'box-build', 'functional test', 'firmware flash'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['server contract manufacturer UK', '1U chassis box-build', 'edge appliance EMS'],
        preferred_regions: ['GB', 'TW', 'PL', 'CZ'],
      },
      {
        id: 'motherboard_supplier',
        label: 'Subcontractor — x86 motherboard / SBC',
        function_description: 'Supplies the x86 server-grade motherboard with sockets for compute + memory + storage + NIC + AI accelerator slot.',
        capabilities: ['x86 server motherboard', 'PCIe Gen5', 'DDR5 ECC', 'OCP NIC'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['server motherboard supplier', 'x86 industrial SBC', 'edge server platform'],
        preferred_regions: ['TW', 'CN', 'US'],
      },
      {
        id: 'accelerator_supplier',
        label: 'Subcontractor — AI accelerator card',
        function_description: 'Supplies the inference accelerator (PCIe GPU or ASIC) that does the heavy lifting on vision + LLM workloads.',
        capabilities: ['AI inference accelerator', 'PCIe Gen5', 'NVIDIA / AMD / Habana / Tenstorrent'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['AI inference card', 'edge GPU supplier', 'PCIe accelerator manufacturer'],
        preferred_regions: ['US', 'TW', 'GB'],
      },
    ],
  },

  bioreactor: {
    product_class: 'bioreactor',
    archetypes: [
      {
        id: 'principal_bioreactor_oem',
        label: 'Principal contractor — single-use bioreactor OEM',
        function_description: 'Builds the complete skid: vessel, agitation, controls, single-use bag interface, validation documentation for GMP use.',
        capabilities: ['single-use bioreactor', 'GMP-grade manufacturing', 'cleanroom integration', 'IQ/OQ documentation'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['single-use bioreactor manufacturer', 'mammalian cell culture bioreactor', 'GMP bioreactor OEM'],
        preferred_regions: ['GB', 'DE', 'CH', 'US'],
      },
      {
        id: 'stainless_fabricator',
        label: 'Subcontractor — stainless skid + vessel fabrication',
        function_description: 'Fabricates the pharma-grade stainless frame, vessel body, jacket, and 316L piping with electropolished finish.',
        capabilities: ['316L stainless fabrication', 'electropolish finish', 'BPE-compliant welds', 'pressure vessel'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['pharma stainless fabricator UK', '316L vessel manufacturer', 'BPE pipework supplier'],
        preferred_regions: ['GB', 'IE', 'DE', 'IT'],
      },
      {
        id: 'instrumentation_integrator',
        label: 'Subcontractor — instrumentation + controls integrator',
        function_description: 'Integrates the PLC, HMI, MFCs, optical DO/pH probes, and SCADA backhaul; commissions the control system.',
        capabilities: ['PLC programming', 'process instrumentation', 'GAMP5 validation', 'SCADA integration'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['process control integrator UK', 'GAMP5 systems integrator', 'pharma PLC programmer'],
        preferred_regions: ['GB', 'IE', 'DE'],
      },
    ],
  },

  vertical_farm: {
    product_class: 'vertical_farm',
    archetypes: [
      {
        id: 'principal_vf_oem',
        label: 'Principal contractor — vertical farm system integrator',
        function_description: 'Delivers the complete modular grow unit: rack, LED lighting, HVAC, fertigation plumbing, controls.',
        capabilities: ['vertical farm systems integration', 'controlled environment agriculture', 'fertigation', 'LED lighting design'],
        search_profiles: ['vertical-farming-infrastructure-20260422', 'cleantech-uk', 'manufacturing'],
        search_keywords: ['vertical farm manufacturer UK', 'CEA systems integrator', 'indoor farming equipment'],
        preferred_regions: ['GB', 'NL', 'IE', 'DE'],
      },
      {
        id: 'led_supplier',
        label: 'Subcontractor — horticultural LED supplier',
        function_description: 'Supplies full-spectrum horticultural LED panels with PPFD tuning and driver electronics.',
        capabilities: ['horticultural LED', 'PPFD tuning', 'LED driver electronics'],
        search_profiles: ['vertical-farming-infrastructure-20260422', 'manufacturing'],
        search_keywords: ['horticultural LED manufacturer', 'grow light supplier', 'full spectrum LED'],
        preferred_regions: ['GB', 'NL', 'DE', 'CN'],
      },
      {
        id: 'hvac_integrator',
        label: 'Subcontractor — HVAC + dehumidification integrator',
        function_description: 'Supplies and commissions the HVAC + dehumidification system tuned for high-RH growing environment.',
        capabilities: ['precision HVAC', 'dehumidification', 'controlled environment HVAC'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['precision HVAC manufacturer UK', 'dehumidifier OEM', 'controlled environment HVAC'],
        preferred_regions: ['GB', 'NL', 'DE'],
      },
    ],
  },

  cgm: {
    product_class: 'cgm',
    archetypes: [
      {
        id: 'principal_medical_cm',
        label: 'Principal contractor — medical device contract manufacturer',
        function_description: 'ISO 13485 / FDA-registered CM that builds the disposable patch + reusable bridge with full traceability and sterile packaging.',
        capabilities: ['ISO 13485 manufacturing', 'sterile packaging', 'FDA Class II device', 'medical device assembly'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['medical device contract manufacturer UK', 'ISO 13485 CM', 'wearable medical CM'],
        preferred_regions: ['GB', 'IE', 'DE', 'US'],
      },
      {
        id: 'microneedle_supplier',
        label: 'Subcontractor — microneedle / sensor electrode supplier',
        function_description: 'Supplies the working electrode + microneedle array + GOx enzyme membrane chemistry.',
        capabilities: ['microneedle fabrication', 'electrochemical biosensor', 'enzyme membrane chemistry'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: [
          'microneedle manufacturer',
          'electrochemical biosensor supplier',
          'GOx enzyme electrode',
          'transdermal patch manufacturer UK',
          'hollow microneedle array',
          'wearable biosensor contract manufacturer',
        ],
        preferred_regions: ['GB', 'IE', 'US', 'CH'],
      },
      {
        id: 'sterile_packaging_cm',
        label: 'Subcontractor — sterile packaging + retail carton',
        function_description: 'Performs EtO sterilisation, sterile-barrier pouch sealing, and retail-ready carton finishing.',
        capabilities: ['EtO sterilisation', 'medical pouch sealing', 'sterile packaging', 'retail carton printing'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['medical device sterile packaging UK', 'EtO sterilisation service', 'medical pouch sealer'],
        preferred_regions: ['GB', 'IE', 'DE'],
      },
    ],
  },

  auv: {
    product_class: 'auv',
    archetypes: [
      {
        id: 'principal_auv_oem',
        label: 'Principal contractor — AUV systems integrator',
        function_description: 'Designs and builds the complete vehicle: pressure hull, navigation, propulsion, payload integration, sea-trial commissioning.',
        capabilities: ['AUV systems integration', 'subsea engineering', 'pressure hull design', 'sea-trial commissioning'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['AUV manufacturer UK', 'autonomous underwater vehicle integrator', 'subsea vehicle OEM'],
        preferred_regions: ['GB', 'NO', 'NL', 'US'],
      },
      {
        id: 'pressure_hull_fabricator',
        label: 'Subcontractor — titanium pressure hull fabricator',
        function_description: 'Machines and tests the titanium / composite pressure hull cylinder + end caps + O-ring sealing system.',
        capabilities: ['titanium pressure hull', 'subsea pressure testing', 'O-ring seal design', 'CNC titanium machining'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['titanium fabricator UK', 'subsea pressure vessel', 'pressure hull manufacturer'],
        preferred_regions: ['GB', 'NO', 'NL', 'DE'],
      },
      {
        id: 'subsea_electronics_cm',
        label: 'Subcontractor — subsea electronics + sensors',
        function_description: 'Supplies the navigation (INS, DVL), sonar, acoustic modem, and wet-mate connector electronics rated for ocean depth.',
        capabilities: ['INS / DVL', 'subsea sonar', 'acoustic modem', 'wet-mate connectors'],
        search_profiles: [...MANUFACTURING_FALLBACK],
        search_keywords: ['subsea electronics supplier', 'AUV navigation system', 'underwater sonar manufacturer'],
        preferred_regions: ['GB', 'NO', 'US'],
      },
    ],
  },

  haps: {
    product_class: 'haps',
    archetypes: [
      {
        id: 'principal_haps_oem',
        label: 'Principal contractor — HAPS airframe + flight system OEM',
        function_description: 'Builds the complete HAPS: wing, fuselage pod, avionics, propulsion, flight controls. Holds the Type Certificate / experimental.',
        capabilities: ['HAPS airframe design', 'high-altitude flight systems', 'CAA-experimental certification', 'composite wing manufacture'],
        search_profiles: ['space-components-uk', 'manufacturing'],
        search_keywords: ['HAPS manufacturer UK', 'high altitude pseudo satellite OEM', 'stratospheric drone manufacturer'],
        preferred_regions: ['GB', 'US', 'DE'],
      },
      {
        id: 'composite_wing_supplier',
        label: 'Subcontractor — composite wing fabricator',
        function_description: 'Lays up the ultra-light CFRP/foam-core wing structure with embedded solar array substrate.',
        capabilities: ['carbon-fibre layup', 'large composite structures', 'low-mass aerospace composites'],
        search_profiles: ['space-components-uk', 'manufacturing'],
        search_keywords: ['carbon fibre aerospace composite UK', 'CFRP wing manufacturer', 'aerospace composite supplier'],
        preferred_regions: ['GB', 'DE', 'IT', 'FR'],
      },
      {
        id: 'solar_panel_supplier',
        label: 'Subcontractor — flexible solar panel supplier',
        function_description: 'Supplies space-grade flexible thin-film GaAs or III-V multi-junction solar cells qualified for stratospheric UV + thermal cycling.',
        capabilities: ['flexible solar', 'III-V multi-junction', 'GaAs solar', 'space-qualified PV'],
        search_profiles: ['space-components-uk', 'manufacturing'],
        search_keywords: ['flexible space solar cell', 'GaAs solar manufacturer', 'space-qualified PV'],
        preferred_regions: ['GB', 'DE', 'US'],
      },
    ],
  },
}

export function getClassSuppliers(productClass: string): ClassSuppliers | null {
  return CLASS_SUPPLIERS[productClass] ?? null
}

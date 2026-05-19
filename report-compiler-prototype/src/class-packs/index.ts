import type { ProductClass } from '../schema/types'

export interface RequiredPartSpec {
  label: string
  match: string[]
  critical: boolean
  qty: number
  unit: string
  defaultUnitCostGbp: number
  supplier: string
  leadTimeWeeks: number
  role: string
}

export interface ModuleTemplate {
  id: string
  displayName: string
  purpose: string
  interfaces: string[]
  subModules: Array<{
    id: string
    name: string
    purpose: string
    partLabels: string[]
    interfaces: string[]
  }>
}

export interface StandardTemplate {
  id: string
  title: string
  jurisdiction: string
  evidenceRequired: string
}

export interface RiskTemplate {
  hazard: string
  severity: number
  occurrence: number
  detection: number
  mitigation: string
}

export interface HeadlineMetricTemplate {
  id: string
  label: string
  unit: string
  defaultValue: number
  notes: string
}

export interface InterfaceLinkRule {
  fromModuleId: string
  toModuleId: string
  via: string
  reason: string
}

export interface ClassPack {
  productClass: ProductClass
  label: string
  requiredParts: RequiredPartSpec[]
  modules: ModuleTemplate[]
  interfaceLinks: InterfaceLinkRule[]
  standards: StandardTemplate[]
  risks: RiskTemplate[]
  headlineMetric: HeadlineMetricTemplate
  prohibitedTerms: string[]
  minCriticalUnitCostGbp: number
  benchmark?: { lowGbp: number; highGbp: number; basis: string }
}

const GENERIC_PACK: ClassPack = {
  productClass: 'unknown',
  label: 'Generic Hardware Product',
  requiredParts: [],
  modules: [
    {
      id: 'core_system',
      displayName: 'Core System',
      purpose: 'Houses the primary product function and supporting components.',
      interfaces: ['power', 'control', 'service_access'],
      subModules: [
        { id: 'primary_assembly', name: 'Primary assembly', purpose: 'Implements the main product function.', partLabels: [], interfaces: ['power', 'control'] },
      ],
    },
  ],
  interfaceLinks: [],
  standards: [
    { id: 'CE-UKCA', title: 'CE / UKCA technical file', jurisdiction: 'UK/EU', evidenceRequired: 'Risk assessment, drawings, BoM, declarations and test evidence.' },
  ],
  risks: [
    { hazard: 'Incomplete requirements', severity: 7, occurrence: 5, detection: 5, mitigation: 'Capture constraints, standards and operating envelope before committing to procurement.' },
  ],
  headlineMetric: { id: 'headline_output', label: 'Primary output', unit: 'unit/year', defaultValue: 1, notes: 'Generic placeholder until a product-class-specific metric exists.' },
  prohibitedTerms: [],
  minCriticalUnitCostGbp: 50,
}

const ENERGY_STORAGE_PACK: ClassPack = {
  productClass: 'energy_storage',
  label: 'Containerised Battery Energy Storage System',
  minCriticalUnitCostGbp: 50,
  benchmark: { lowGbp: 350000, highGbp: 1200000, basis: '3.5 MWh containerised BESS rough order of magnitude' },
  prohibitedTerms: ['hydronic crop', 'leafy greens', 'biocompatible skin patch'],
  headlineMetric: { id: 'annual_mwh_throughput', label: 'Annual MWh delivered', unit: 'MWh/year', defaultValue: 1277.5, notes: 'Usable energy cycled once per day, adjusted for system efficiency.' },
  requiredParts: [
    { label: 'LFP prismatic cells', match: ['lfp', 'prismatic cell', 'battery cell'], critical: true, qty: 3920, unit: 'each', defaultUnitCostGbp: 75, supplier: 'CATL / EVE Energy', leadTimeWeeks: 12, role: 'energy storage element' },
    { label: 'BMS master controller', match: ['bms master', 'battery management'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 4500, supplier: 'Nuvation Energy', leadTimeWeeks: 8, role: 'pack supervision and protection' },
    { label: 'PCS inverter', match: ['pcs', 'inverter'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 95000, supplier: 'Sungrow / SMA', leadTimeWeeks: 16, role: 'DC/AC conversion' },
    { label: 'Thermal management loop', match: ['thermal', 'cooling', 'glycol'], critical: true, qty: 1, unit: 'system', defaultUnitCostGbp: 28000, supplier: 'Boyd / Pfannenberg', leadTimeWeeks: 10, role: 'cell temperature control' },
    { label: 'Fire detection/suppression', match: ['fire', 'suppression', 'smoke detection'], critical: true, qty: 1, unit: 'system', defaultUnitCostGbp: 18000, supplier: 'Johnson Controls / Honeywell', leadTimeWeeks: 8, role: 'hazard detection and mitigation' },
    { label: 'DC contactor or breaker', match: ['dc contactor', 'breaker'], critical: true, qty: 2, unit: 'each', defaultUnitCostGbp: 1200, supplier: 'TE Connectivity / Sensata', leadTimeWeeks: 6, role: 'high-voltage isolation' },
  ],
  modules: [
    { id: 'energy_storage_source', displayName: 'Energy Storage Source', purpose: 'Stores usable grid energy in LFP cell racks.', interfaces: ['dc_bus', 'thermal_loop', 'bms_network'], subModules: [{ id: 'cell_racks', name: 'Cell racks', purpose: 'Holds LFP cells, busbars and thermal interfaces.', partLabels: ['LFP prismatic cells'], interfaces: ['dc_bus', 'thermal_loop'] }] },
    { id: 'energy_conversion_transduction', displayName: 'Energy Conversion Transduction', purpose: 'Converts DC pack energy into grid-compatible AC power.', interfaces: ['dc_bus', 'ac_grid_connection'], subModules: [{ id: 'pcs_stack', name: 'PCS inverter stack', purpose: 'Provides bidirectional DC/AC conversion.', partLabels: ['PCS inverter'], interfaces: ['dc_bus', 'ac_grid_connection'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Supervises BMS, PCS and site-level dispatch.', interfaces: ['bms_network', 'site_scada'], subModules: [{ id: 'bms_control', name: 'BMS and EMS controllers', purpose: 'Coordinates cell safety and grid dispatch.', partLabels: ['BMS master controller'], interfaces: ['bms_network', 'site_scada'] }] },
    { id: 'environmental_interface', displayName: 'Environmental Interface', purpose: 'Controls thermal and environmental conditions inside the container.', interfaces: ['thermal_loop'], subModules: [{ id: 'thermal_loop', name: 'Thermal management loop', purpose: 'Rejects cell and PCS heat.', partLabels: ['Thermal management loop'], interfaces: ['thermal_loop'] }] },
    { id: 'safety_protection', displayName: 'Safety Protection', purpose: 'Detects and mitigates electrical and fire hazards.', interfaces: ['alarm_bus', 'hardwired_trip'], subModules: [{ id: 'fire_detection', name: 'Fire detection and suppression', purpose: 'Detects smoke and actuates suppression.', partLabels: ['Fire detection/suppression', 'DC contactor or breaker'], interfaces: ['alarm_bus', 'hardwired_trip'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'energy_storage_source', toModuleId: 'energy_conversion_transduction', via: 'dc_bus', reason: 'Battery racks must feed the PCS over a declared DC bus.' },
    { fromModuleId: 'energy_storage_source', toModuleId: 'environmental_interface', via: 'thermal_loop', reason: 'Cell heat must be coupled to the thermal management loop.' },
    { fromModuleId: 'energy_storage_source', toModuleId: 'control_compute_communication', via: 'bms_network', reason: 'Cell/rack state must be visible to BMS and EMS supervision.' },
  ],
  standards: [
    { id: 'IEC-62619', title: 'Industrial lithium battery safety', jurisdiction: 'Global / UK-adopted', evidenceRequired: 'Cell certificates and pack-level safety validation.' },
    { id: 'UL-9540A', title: 'Thermal runaway fire propagation test', jurisdiction: 'US / investor diligence', evidenceRequired: 'Cell, module and unit-level propagation evidence.' },
    { id: 'G99', title: 'UK grid connection requirements', jurisdiction: 'UK', evidenceRequired: 'Protection settings, relay test certificates and commissioning records.' },
  ],
  risks: [
    { hazard: 'Thermal runaway propagation', severity: 10, occurrence: 3, detection: 4, mitigation: 'Cell spacing, thermal monitoring and clean-agent suppression.' },
    { hazard: 'DC arc fault', severity: 9, occurrence: 3, detection: 4, mitigation: 'Arc detection, contactor isolation and maintenance access controls.' },
  ],
}

const HEAT_PUMP_PACK: ClassPack = {
  productClass: 'heat_pump',
  label: 'Air-Source Heat Pump',
  minCriticalUnitCostGbp: 50,
  prohibitedTerms: ['lfp prismatic', 'flight controller', 'leafy greens'],
  headlineMetric: { id: 'annual_heat_output', label: 'Annual useful heat output', unit: 'kWh/year', defaultValue: 16000, notes: 'Thermal output multiplied by assumed annual full-load hours until project load profile is known.' },
  requiredParts: [
    { label: 'Inverter scroll compressor', match: ['compressor', 'inverter compressor', 'scroll'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 950, supplier: 'Danfoss / Copeland', leadTimeWeeks: 8, role: 'refrigerant compression' },
    { label: 'Outdoor finned evaporator coil', match: ['evaporator', 'outdoor coil'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 420, supplier: 'LU-VE / Kelvion', leadTimeWeeks: 7, role: 'ambient heat absorption' },
    { label: 'Brazed plate heat exchanger', match: ['plate heat exchanger', 'condenser'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 360, supplier: 'SWEP / Alfa Laval', leadTimeWeeks: 6, role: 'water-side heat delivery' },
    { label: 'Electronic expansion valve', match: ['expansion valve', 'eev'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 140, supplier: 'Carel / Danfoss', leadTimeWeeks: 5, role: 'refrigerant metering' },
    { label: 'Variable-speed fan assembly', match: ['fan', 'ec fan'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 260, supplier: 'ebm-papst / Ziehl-Abegg', leadTimeWeeks: 6, role: 'outdoor airflow' },
    { label: 'Hydronic circulation pump', match: ['circulation pump', 'hydronic pump'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 180, supplier: 'Grundfos / Wilo', leadTimeWeeks: 4, role: 'water-loop circulation' },
    { label: 'Refrigerant sensor and pressure transducers', match: ['pressure transducer', 'refrigerant sensor'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 190, supplier: 'Danfoss / Sensata', leadTimeWeeks: 5, role: 'refrigerant protection feedback' },
    { label: 'Heat pump controller PCB', match: ['controller', 'pcb', 'control board'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 220, supplier: 'Carel / Eliwell', leadTimeWeeks: 6, role: 'compressor, fan and valve control' },
    { label: 'Hydronic safety valve kit', match: ['safety valve', 'expansion vessel'], critical: true, qty: 1, unit: 'kit', defaultUnitCostGbp: 120, supplier: 'Caleffi / Altecnic', leadTimeWeeks: 4, role: 'water-side pressure protection' },
  ],
  modules: [
    { id: 'energy_conversion_transduction', displayName: 'Refrigerant Energy Conversion', purpose: 'Compresses and expands refrigerant to move heat from ambient air to the hydronic loop.', interfaces: ['refrigerant_loop', 'control_bus', 'protective_earth'], subModules: [{ id: 'compressor_circuit', name: 'Compressor and expansion circuit', purpose: 'Raises refrigerant pressure and meters flow through the heat exchangers.', partLabels: ['Inverter scroll compressor', 'Electronic expansion valve'], interfaces: ['refrigerant_loop', 'control_bus', 'protective_earth'] }] },
    { id: 'environmental_interface', displayName: 'Outdoor Air Interface', purpose: 'Extracts heat from ambient air and manages frost, drainage and airflow.', interfaces: ['refrigerant_loop', 'airflow_path', 'condensate_drain'], subModules: [{ id: 'outdoor_coil_fan', name: 'Outdoor coil and fan', purpose: 'Moves ambient air across the evaporator coil.', partLabels: ['Outdoor finned evaporator coil', 'Variable-speed fan assembly'], interfaces: ['refrigerant_loop', 'airflow_path', 'condensate_drain'] }] },
    { id: 'mass_fluid_transport_process', displayName: 'Hydronic Heat Delivery', purpose: 'Transfers condenser heat into the building water loop.', interfaces: ['hydronic_loop', 'pressure_relief', 'service_access'], subModules: [{ id: 'water_heat_exchanger_loop', name: 'Water-side heat exchanger loop', purpose: 'Circulates heating water through the condenser and protection hardware.', partLabels: ['Brazed plate heat exchanger', 'Hydronic circulation pump', 'Hydronic safety valve kit'], interfaces: ['hydronic_loop', 'pressure_relief', 'service_access'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Coordinates compressor speed, fan speed, expansion valve position and defrost logic.', interfaces: ['control_bus', 'sensor_bus', 'service_port'], subModules: [{ id: 'heat_pump_controller', name: 'Heat pump controller', purpose: 'Runs heating, DHW, defrost and fault-handling state machines.', partLabels: ['Heat pump controller PCB'], interfaces: ['control_bus', 'sensor_bus', 'service_port'] }] },
    { id: 'sensing_instrumentation', displayName: 'Sensing Instrumentation', purpose: 'Measures refrigerant, water and ambient conditions for protection and efficiency.', interfaces: ['sensor_bus', 'refrigerant_loop', 'hydronic_loop'], subModules: [{ id: 'pressure_temperature_sensing', name: 'Pressure and temperature sensing', purpose: 'Feeds controller decisions and safety limits.', partLabels: ['Refrigerant sensor and pressure transducers'], interfaces: ['sensor_bus', 'refrigerant_loop', 'hydronic_loop'] }] },
    { id: 'safety_protection', displayName: 'Safety Protection', purpose: 'Limits pressure, refrigerant and electrical hazards for the monobloc unit.', interfaces: ['pressure_relief', 'protective_earth', 'alarm_bus'], subModules: [{ id: 'pressure_electrical_safety', name: 'Pressure and electrical safety', purpose: 'Protects water loop, refrigerant circuit and service personnel.', partLabels: ['Hydronic safety valve kit', 'Refrigerant sensor and pressure transducers'], interfaces: ['pressure_relief', 'protective_earth', 'alarm_bus'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'environmental_interface', toModuleId: 'energy_conversion_transduction', via: 'refrigerant_loop', reason: 'Outdoor evaporator must connect to compressor and expansion circuit over a closed refrigerant loop.' },
    { fromModuleId: 'energy_conversion_transduction', toModuleId: 'mass_fluid_transport_process', via: 'hydronic_loop', reason: 'Condenser heat must transfer into the hydronic delivery loop.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'energy_conversion_transduction', via: 'control_bus', reason: 'Controller must command compressor and expansion valve operation.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'sensor_bus', reason: 'Controller must receive pressure and temperature feedback for protection and efficiency.' },
  ],
  standards: [
    { id: 'EN-14511', title: 'Heat pump performance test conditions', jurisdiction: 'UK/EU', evidenceRequired: 'Capacity, COP and operating-point test evidence.' },
    { id: 'EN-378', title: 'Refrigerating systems and heat pumps safety', jurisdiction: 'UK/EU', evidenceRequired: 'Refrigerant charge, pressure protection and safety assessment.' },
    { id: 'EN-60335-2-40', title: 'Electrical safety for heat pumps and air conditioners', jurisdiction: 'UK/EU', evidenceRequired: 'Electrical safety, leakage, temperature and abnormal-operation evidence.' },
  ],
  risks: [
    { hazard: 'Refrigerant leak or flammability hazard', severity: 9, occurrence: 3, detection: 4, mitigation: 'Charge limit review, leak detection, ventilation path and ignition-source control.' },
    { hazard: 'Frozen outdoor coil reduces capacity', severity: 6, occurrence: 5, detection: 4, mitigation: 'Defrost control, coil temperature sensing and condensate drainage.' },
    { hazard: 'Hydronic overpressure or low flow', severity: 7, occurrence: 3, detection: 4, mitigation: 'Flow proving, safety valve, expansion volume and pump feedback.' },
  ],
}

const EV_CHARGER_PACK: ClassPack = {
  productClass: 'ev_charger',
  label: 'DC Fast EV Charger',
  minCriticalUnitCostGbp: 25,
  prohibitedTerms: ['lfp prismatic', 'leafy greens', 'compressor refrigerant'],
  headlineMetric: { id: 'annual_energy_dispensed', label: 'Annual energy dispensed', unit: 'kWh/year', defaultValue: 219000, notes: 'DC output power multiplied by assumed equivalent full-power charging hours.' },
  requiredParts: [
    { label: 'Power module stack', match: ['power module', 'rectifier', 'dc charger module'], critical: true, qty: 1, unit: 'stack', defaultUnitCostGbp: 14000, supplier: 'Delta / InfyPower', leadTimeWeeks: 12, role: 'AC/DC conversion' },
    { label: 'CCS2 liquid-cooled cable and connector', match: ['ccs2', 'charging cable', 'connector'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 1800, supplier: 'Phoenix Contact / Huber+Suhner', leadTimeWeeks: 10, role: 'vehicle charging interface' },
    { label: 'DC output contactor set', match: ['dc contactor', 'output contactor'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 650, supplier: 'TE Connectivity / Sensata', leadTimeWeeks: 8, role: 'output isolation' },
    { label: 'Insulation monitoring device', match: ['insulation monitor', 'imd'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 320, supplier: 'Bender / Dold', leadTimeWeeks: 6, role: 'DC fault detection' },
    { label: 'MID energy meter', match: ['mid meter', 'energy meter'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 260, supplier: 'Carlo Gavazzi / Iskraemeco', leadTimeWeeks: 6, role: 'billable energy measurement' },
    { label: 'OCPP communications gateway', match: ['ocpp', 'gateway'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 380, supplier: 'Teltonika / Advantech', leadTimeWeeks: 5, role: 'backend connectivity' },
    { label: 'ISO 15118 PLC modem', match: ['iso 15118', 'plc modem'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 420, supplier: 'Vector / Chargebyte', leadTimeWeeks: 8, role: 'vehicle communication' },
    { label: 'AC input breaker and SPD', match: ['ac input breaker', 'spd', 'surge'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 750, supplier: 'ABB / Schneider Electric', leadTimeWeeks: 6, role: 'input protection' },
    { label: 'Cooling loop assembly', match: ['cooling loop', 'liquid cooling'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 2200, supplier: 'Boyd / Pfannenberg', leadTimeWeeks: 10, role: 'power electronics cooling' },
    { label: 'Emergency stop and safety interlock set', match: ['emergency stop', 'interlock'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 180, supplier: 'Eaton / Schneider Electric', leadTimeWeeks: 4, role: 'user and service safety' },
  ],
  modules: [
    { id: 'power_distribution', displayName: 'AC Input And DC Output Distribution', purpose: 'Protects grid input and charger DC output paths.', interfaces: ['ac_input_bus', 'dc_output_bus', 'protective_earth', 'metering_bus'], subModules: [{ id: 'input_output_switchgear', name: 'Input and output switchgear', purpose: 'Protects input supply and isolates charging output.', partLabels: ['AC input breaker and SPD', 'DC output contactor set', 'MID energy meter'], interfaces: ['ac_input_bus', 'dc_output_bus', 'protective_earth', 'metering_bus'] }] },
    { id: 'energy_conversion_transduction', displayName: 'Power Conversion Stack', purpose: 'Converts protected AC input into regulated DC charging output.', interfaces: ['ac_input_bus', 'dc_output_bus', 'coolant_loop', 'control_bus', 'protective_earth'], subModules: [{ id: 'power_module_stack', name: 'Power module stack', purpose: 'Provides modular AC/DC conversion.', partLabels: ['Power module stack'], interfaces: ['ac_input_bus', 'dc_output_bus', 'coolant_loop', 'control_bus'] }] },
    { id: 'charging_connector_interface', displayName: 'Vehicle Charging Interface', purpose: 'Presents the CCS2 physical and communication interface to the vehicle.', interfaces: ['dc_output_bus', 'ccs2_vehicle_interface', 'iso15118_plc', 'protective_earth'], subModules: [{ id: 'ccs2_cable_connector', name: 'CCS2 cable and connector', purpose: 'Routes charging current and pilot communication to the vehicle.', partLabels: ['CCS2 liquid-cooled cable and connector', 'ISO 15118 PLC modem'], interfaces: ['dc_output_bus', 'ccs2_vehicle_interface', 'iso15118_plc', 'protective_earth'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Coordinates power modules, vehicle handshake, backend sessions and alarms.', interfaces: ['control_bus', 'iso15118_plc', 'ocpp_network', 'metering_bus', 'alarm_bus'], subModules: [{ id: 'charging_controller', name: 'Charging controller and backend gateway', purpose: 'Runs charge session state machine and network connectivity.', partLabels: ['OCPP communications gateway'], interfaces: ['control_bus', 'iso15118_plc', 'ocpp_network', 'metering_bus', 'alarm_bus'] }] },
    { id: 'sensing_instrumentation', displayName: 'Metering And Electrical Sensing', purpose: 'Measures energy, isolation, voltage, current and cable state.', interfaces: ['metering_bus', 'dc_output_bus', 'insulation_monitoring', 'sensor_bus'], subModules: [{ id: 'metering_safety_sensors', name: 'Metering and insulation sensing', purpose: 'Provides billing and electrical fault evidence.', partLabels: ['MID energy meter', 'Insulation monitoring device'], interfaces: ['metering_bus', 'dc_output_bus', 'insulation_monitoring', 'sensor_bus'] }] },
    { id: 'environmental_interface', displayName: 'Thermal And Environmental Interface', purpose: 'Rejects power-electronics and cable heat while protecting outdoor electronics.', interfaces: ['coolant_loop', 'airflow_path', 'condensate_drain', 'service_access'], subModules: [{ id: 'charger_cooling_loop', name: 'Charger cooling loop', purpose: 'Controls heat from power modules and high-current cable.', partLabels: ['Cooling loop assembly'], interfaces: ['coolant_loop', 'airflow_path', 'condensate_drain', 'service_access'] }] },
    { id: 'safety_protection', displayName: 'Safety Protection', purpose: 'Protects users, vehicles and service engineers from electrical and thermal hazards.', interfaces: ['emergency_stop', 'insulation_monitoring', 'protective_earth', 'alarm_bus'], subModules: [{ id: 'user_service_safety_chain', name: 'User and service safety chain', purpose: 'Trips charging output and reports safety faults.', partLabels: ['Emergency stop and safety interlock set', 'Insulation monitoring device'], interfaces: ['emergency_stop', 'insulation_monitoring', 'protective_earth', 'alarm_bus'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'power_distribution', toModuleId: 'energy_conversion_transduction', via: 'ac_input_bus', reason: 'Grid input switchgear must feed the power-conversion stack over a protected AC bus.' },
    { fromModuleId: 'energy_conversion_transduction', toModuleId: 'charging_connector_interface', via: 'dc_output_bus', reason: 'Power modules must feed the CCS2 connector over a protected DC output bus.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'charging_connector_interface', via: 'iso15118_plc', reason: 'Charge controller must communicate with the vehicle for ISO 15118 / PLC handshakes.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'energy_conversion_transduction', via: 'control_bus', reason: 'Charge controller must command power module output states.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'metering_bus', reason: 'Energy and safety measurements must feed session control and billing.' },
    { fromModuleId: 'environmental_interface', toModuleId: 'energy_conversion_transduction', via: 'coolant_loop', reason: 'Power conversion heat must couple into the charger cooling loop.' },
  ],
  standards: [
    { id: 'IEC-61851', title: 'Conductive charging system requirements', jurisdiction: 'UK/EU', evidenceRequired: 'Charging modes, control pilot and safety-function evidence.' },
    { id: 'IEC-62196-3', title: 'DC vehicle connector requirements', jurisdiction: 'UK/EU', evidenceRequired: 'CCS2 connector rating, cable assembly and temperature evidence.' },
    { id: 'ISO-15118', title: 'Vehicle-to-grid communication interface', jurisdiction: 'Global / EU', evidenceRequired: 'PLC communication, Plug and Charge and session-state evidence where applicable.' },
    { id: 'OCPP-1.6J/2.0.1', title: 'Charge point backend protocol', jurisdiction: 'Operator requirement', evidenceRequired: 'Backend session, metering, fault and firmware-management evidence.' },
  ],
  risks: [
    { hazard: 'DC output fault or insulation failure', severity: 10, occurrence: 3, detection: 3, mitigation: 'Insulation monitoring, contactor isolation and fault-state logging.' },
    { hazard: 'Connector overheating at high current', severity: 8, occurrence: 4, detection: 4, mitigation: 'Temperature sensing, derating and liquid-cooled cable verification.' },
    { hazard: 'Backend or payment outage stops sessions', severity: 5, occurrence: 4, detection: 4, mitigation: 'Offline policy, local fault handling and backend retry logic.' },
  ],
}

const BIOREACTOR_PACK: ClassPack = {
  productClass: 'bioreactor',
  label: 'Single-Use Mammalian-Cell Bioreactor',
  minCriticalUnitCostGbp: 25,
  benchmark: { lowGbp: 40000, highGbp: 250000, basis: 'bench-to-pilot single-use mammalian-cell bioreactor rough order of magnitude' },
  prohibitedTerms: ['lfp prismatic', 'ccs2', 'flight controller', 'leafy greens'],
  headlineMetric: { id: 'annual_culture_volume', label: 'Annual culture volume', unit: 'L/year', defaultValue: 2000, notes: 'Working volume multiplied by assumed annual batch count until process recipe is known.' },
  requiredParts: [
    { label: 'Single-use bioreactor bag', match: ['single-use bag', 'bioreactor bag'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 850, supplier: 'Cytiva / Sartorius', leadTimeWeeks: 8, role: 'sterile culture containment' },
    { label: 'Agitation drive', match: ['agitation drive', 'agitator', 'rocking drive', 'impeller drive'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 4800, supplier: 'Sartorius / Applikon', leadTimeWeeks: 10, role: 'culture mixing and mass transfer' },
    { label: 'Peristaltic feed pump', match: ['peristaltic', 'feed pump'], critical: true, qty: 3, unit: 'each', defaultUnitCostGbp: 780, supplier: 'Watson-Marlow / Masterflex', leadTimeWeeks: 6, role: 'media, feed and harvest movement' },
    { label: 'Sparger and gas-mix manifold', match: ['sparger', 'gas manifold'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 1600, supplier: 'Parker / SMC', leadTimeWeeks: 8, role: 'oxygen and CO2 transfer' },
    { label: 'Dissolved oxygen optical sensor', match: ['dissolved oxygen', 'do sensor'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 950, supplier: 'Hamilton / Mettler Toledo', leadTimeWeeks: 8, role: 'oxygen control feedback' },
    { label: 'Single-use pH sensor', match: ['ph sensor', 'single-use ph'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 520, supplier: 'Hamilton / Mettler Toledo', leadTimeWeeks: 8, role: 'pH control feedback' },
    { label: 'Temperature control loop', match: ['temperature control', 'jacket', 'heater'], critical: true, qty: 1, unit: 'loop', defaultUnitCostGbp: 2800, supplier: 'Julabo / Lauda', leadTimeWeeks: 8, role: 'culture temperature control' },
    { label: 'Bioreactor controller', match: ['controller', 'plc', 'bioreactor control'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 5200, supplier: 'Sartorius / Eppendorf', leadTimeWeeks: 10, role: 'process control and batch record' },
    { label: 'Sterile tubing and connector set', match: ['sterile connector', 'tubing set'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 620, supplier: 'CPC / Saint-Gobain', leadTimeWeeks: 6, role: 'aseptic fluid path' },
    { label: 'Exhaust filter and pressure relief set', match: ['exhaust filter', 'pressure relief'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 420, supplier: 'Pall / Merck Millipore', leadTimeWeeks: 6, role: 'sterile venting and overpressure protection' },
    { label: 'Load cell set', match: ['load cell', 'weighing'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 1200, supplier: 'HBK / Mettler Toledo', leadTimeWeeks: 7, role: 'mass and fill-state measurement' },
  ],
  modules: [
    { id: 'structure_containment', displayName: 'Sterile Structure Containment', purpose: 'Carries and protects the sterile single-use culture boundary.', interfaces: ['sterile_boundary', 'sterile_fluid_path', 'mechanical_mounts', 'service_access'], subModules: [{ id: 'bag_chamber', name: 'Bag chamber and support', purpose: 'Supports the disposable bag and sterile connection envelope.', partLabels: ['Single-use bioreactor bag', 'Sterile tubing and connector set'], interfaces: ['sterile_boundary', 'sterile_fluid_path', 'mechanical_mounts', 'service_access'] }] },
    { id: 'actuation_kinematics', displayName: 'Mixing And Agitation', purpose: 'Transfers drive energy into culture mixing without breaking the sterile boundary.', interfaces: ['mixing_drive', 'control_bus', 'sterile_boundary'], subModules: [{ id: 'agitation_drive_train', name: 'Agitation drive train', purpose: 'Provides controllable mixing for suspension culture and gas transfer.', partLabels: ['Agitation drive'], interfaces: ['mixing_drive', 'control_bus', 'sterile_boundary'] }] },
    { id: 'mass_fluid_transport_process', displayName: 'Media Gas And Harvest Transport', purpose: 'Moves sterile media, feeds, harvest and process gas through validated paths.', interfaces: ['sterile_fluid_path', 'gas_path', 'pump_control', 'sensor_bus'], subModules: [{ id: 'feed_harvest_pumps', name: 'Feed and harvest pumps', purpose: 'Feeds media and removes harvest through peristaltic pump channels.', partLabels: ['Peristaltic feed pump', 'Sterile tubing and connector set'], interfaces: ['sterile_fluid_path', 'pump_control', 'sensor_bus'] }, { id: 'sparger_gas_manifold', name: 'Sparger gas manifold', purpose: 'Meters oxygen, air, nitrogen and CO2 into the disposable sparger path.', partLabels: ['Sparger and gas-mix manifold'], interfaces: ['gas_path', 'sterile_fluid_path', 'control_bus'] }] },
    { id: 'environmental_interface', displayName: 'Thermal Gas Exhaust Interface', purpose: 'Maintains culture temperature and sterile gas exhaust conditions.', interfaces: ['thermal_loop', 'gas_path', 'exhaust_path', 'sensor_bus'], subModules: [{ id: 'temperature_loop', name: 'Temperature control loop', purpose: 'Controls jacket, plate or blanket heat transfer around the culture bag.', partLabels: ['Temperature control loop'], interfaces: ['thermal_loop', 'sensor_bus', 'control_bus'] }, { id: 'exhaust_conditioning', name: 'Exhaust conditioning', purpose: 'Filters exhaust and keeps condensate away from sterile vent filters.', partLabels: ['Exhaust filter and pressure relief set'], interfaces: ['exhaust_path', 'gas_path', 'sterile_boundary'] }] },
    { id: 'sensing_instrumentation', displayName: 'Process Sensing Instrumentation', purpose: 'Measures viable process state for closed-loop culture control.', interfaces: ['sensor_bus', 'sterile_fluid_path', 'gas_path', 'thermal_loop'], subModules: [{ id: 'do_ph_sensing', name: 'DO and pH sensing', purpose: 'Measures dissolved oxygen and pH through single-use or aseptic sensor paths.', partLabels: ['Dissolved oxygen optical sensor', 'Single-use pH sensor'], interfaces: ['sensor_bus', 'sterile_fluid_path'] }, { id: 'mass_temperature_sensing', name: 'Mass and temperature sensing', purpose: 'Tracks working volume, fill state and culture temperature.', partLabels: ['Load cell set'], interfaces: ['sensor_bus', 'thermal_loop', 'mechanical_mounts'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Runs batch recipe, gas, pump, agitation and alarm control loops.', interfaces: ['control_bus', 'sensor_bus', 'pump_control', 'batch_record_network', 'alarm_bus'], subModules: [{ id: 'process_controller', name: 'Process controller', purpose: 'Coordinates culture recipe, pump schedules, gas control and alarms.', partLabels: ['Bioreactor controller'], interfaces: ['control_bus', 'sensor_bus', 'pump_control', 'batch_record_network', 'alarm_bus'] }] },
    { id: 'power_distribution', displayName: 'Power Distribution', purpose: 'Supplies protected power to controller, pumps, agitation and thermal units.', interfaces: ['mains_supply', 'protective_earth', 'control_bus', 'service_access'], subModules: [{ id: 'control_power_panel', name: 'Control power panel', purpose: 'Distributes mains and low-voltage power to wet-process equipment.', partLabels: ['Bioreactor controller'], interfaces: ['mains_supply', 'protective_earth', 'control_bus', 'service_access'] }] },
    { id: 'safety_protection', displayName: 'Aseptic And Pressure Safety', purpose: 'Protects operators, culture sterility and disposable bag pressure limits.', interfaces: ['sterile_boundary', 'pressure_relief', 'exhaust_path', 'alarm_bus'], subModules: [{ id: 'sterile_pressure_safety', name: 'Sterile pressure safety', purpose: 'Prevents overpressure and contamination ingress at sterile vent paths.', partLabels: ['Exhaust filter and pressure relief set'], interfaces: ['sterile_boundary', 'pressure_relief', 'exhaust_path', 'alarm_bus'] }] },
    { id: 'maintenance_serviceability', displayName: 'Setup Calibration And Service', purpose: 'Supports bag loading, sterile connection, sensor calibration and batch turnaround.', interfaces: ['service_access', 'sterile_fluid_path', 'sensor_bus', 'batch_record_network'], subModules: [{ id: 'single_use_setup', name: 'Single-use setup and calibration', purpose: 'Guides sterile bag loading, connector management and pre-batch sensor checks.', partLabels: ['Sterile tubing and connector set'], interfaces: ['service_access', 'sterile_fluid_path', 'sensor_bus'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'structure_containment', toModuleId: 'mass_fluid_transport_process', via: 'sterile_fluid_path', reason: 'The sterile bag must connect to feed, harvest and sampling fluid paths.' },
    { fromModuleId: 'actuation_kinematics', toModuleId: 'structure_containment', via: 'sterile_boundary', reason: 'Mixing drive must couple into the disposable culture boundary without breaking sterility.' },
    { fromModuleId: 'mass_fluid_transport_process', toModuleId: 'environmental_interface', via: 'gas_path', reason: 'Sparging and exhaust conditioning must share a declared gas path.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'sensor_bus', reason: 'DO, pH, mass and temperature measurements must feed process control.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'mass_fluid_transport_process', via: 'pump_control', reason: 'Controller must command feed, harvest and gas-flow actuators.' },
    { fromModuleId: 'safety_protection', toModuleId: 'structure_containment', via: 'pressure_relief', reason: 'Disposable culture containment must connect to pressure relief and sterile exhaust protection.' },
  ],
  standards: [
    { id: 'ISO-13485', title: 'Quality management for medical-device-adjacent manufacturing systems', jurisdiction: 'Global / supplier quality', evidenceRequired: 'Supplier quality evidence, change control and traceability where applicable.' },
    { id: 'USP-CLASS-VI', title: 'Biocompatibility for polymer contact materials', jurisdiction: 'US / global supplier evidence', evidenceRequired: 'Material certificates for single-use bag and tubing contact surfaces.' },
    { id: 'IEC-61010', title: 'Electrical safety for laboratory control equipment', jurisdiction: 'UK/EU/global', evidenceRequired: 'Electrical safety design, protective earth and abnormal operation evidence.' },
    { id: 'EU-GMP-ANNEX-11', title: 'Computerised systems for GMP records', jurisdiction: 'EU / pharma operations', evidenceRequired: 'Batch record integrity, audit trail and access-control evidence.' },
  ],
  risks: [
    { hazard: 'Loss of sterility through connector or bag handling', severity: 9, occurrence: 4, detection: 5, mitigation: 'Closed sterile connectors, pre-use integrity checks and operator setup checklist.' },
    { hazard: 'Cell culture loss from DO or pH control failure', severity: 8, occurrence: 4, detection: 4, mitigation: 'Redundant alarming, sensor calibration and conservative gas/feed control limits.' },
    { hazard: 'Disposable bag overpressure', severity: 8, occurrence: 3, detection: 3, mitigation: 'Pressure relief, vent filter monitoring and pump/gas interlocks.' },
  ],
}

const AUV_PACK: ClassPack = {
  productClass: 'auv',
  label: 'Inspection Autonomous Underwater Vehicle',
  minCriticalUnitCostGbp: 25,
  prohibitedTerms: ['leafy greens', 'mammalian-cell', 'ccs2', 'flight propeller'],
  headlineMetric: { id: 'survey_endurance', label: 'Survey endurance', unit: 'hours', defaultValue: 6, notes: 'Mission endurance target from the brief, before hydrodynamic drag, hotel-load and reserve-energy calculations.' },
  requiredParts: [
    { label: 'Pressure hull', match: ['pressure hull', 'hull shell'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'depth-rated dry electronics containment' },
    { label: 'Thruster set', match: ['thruster set', 'thruster array', 'subsea thruster'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'propulsion and manoeuvre authority' },
    { label: 'DVL', match: ['dvl', 'doppler velocity log'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'bottom-track navigation velocity' },
    { label: 'Battery pack', match: ['battery pack', 'subsea battery'], critical: true, qty: 1, unit: 'pack', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'mission energy storage' },
    { label: 'Acoustic modem', match: ['acoustic modem', 'acoustic communications'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'underwater command and telemetry link' },
    { label: 'Inertial navigation unit', match: ['inertial navigation', 'ins'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'dead-reckoning attitude and position estimate' },
    { label: 'Depth and pressure sensor', match: ['depth and pressure sensor', 'pressure sensor'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'depth feedback and over-depth protection' },
    { label: 'Leak detection sensor', match: ['leak detection sensor', 'leak detection'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'water ingress detection' },
    { label: 'Mission computer', match: ['mission computer', 'autonomy computer'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'autonomy, navigation and payload coordination' },
    { label: 'Forward sonar payload', match: ['forward sonar', 'sonar payload'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'inspection and obstacle sensing payload' },
    { label: 'Recovery beacon', match: ['recovery beacon', 'locator beacon'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'surface recovery aid after abort or mission completion' },
    { label: 'Wet-mate connector set', match: ['wet-mate connector', 'subsea connector'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'pressure-rated power and signal service interface' },
  ],
  modules: [
    { id: 'structure_containment', displayName: 'Pressure Structure Containment', purpose: 'Carries the dry pressure boundary, payload mounts and hydrodynamic form.', interfaces: ['pressure_boundary', 'mechanical_mounts', 'service_access'], subModules: [{ id: 'pressure_hull', name: 'Pressure hull', purpose: 'Houses dry electronics and batteries within the depth-rated boundary.', partLabels: ['Pressure hull'], interfaces: ['pressure_boundary', 'mechanical_mounts', 'service_access'] }] },
    { id: 'energy_storage_source', displayName: 'Subsea Energy Storage', purpose: 'Stores mission energy and monitors reserve margin.', interfaces: ['dc_power_bus', 'battery_monitor_bus', 'service_access'], subModules: [{ id: 'battery_pack', name: 'Battery pack', purpose: 'Supplies endurance energy under pressure-rated protection.', partLabels: ['Battery pack'], interfaces: ['dc_power_bus', 'battery_monitor_bus', 'service_access'] }] },
    { id: 'power_distribution', displayName: 'Subsea Power Distribution', purpose: 'Routes protected battery power to thrusters, avionics and payloads.', interfaces: ['dc_power_bus', 'thruster_power_bus', 'payload_power_bus', 'service_access'], subModules: [{ id: 'dc_distribution', name: 'DC distribution', purpose: 'Protects and switches mission power rails.', partLabels: ['Wet-mate connector set'], interfaces: ['dc_power_bus', 'thruster_power_bus', 'payload_power_bus', 'service_access'] }] },
    { id: 'actuation_kinematics', displayName: 'Thruster Actuation Kinematics', purpose: 'Generates surge, heave, yaw and trim authority underwater.', interfaces: ['thruster_power_bus', 'thrust_command_bus', 'mechanical_mounts'], subModules: [{ id: 'thruster_array', name: 'Thruster array', purpose: 'Provides controllable propulsion for survey and station-keeping.', partLabels: ['Thruster set'], interfaces: ['thruster_power_bus', 'thrust_command_bus', 'mechanical_mounts'] }] },
    { id: 'control_compute_communication', displayName: 'Autonomy Compute Communication', purpose: 'Runs mission autonomy, navigation fusion, acoustic messaging and fail-safe states.', interfaces: ['navigation_sensor_bus', 'payload_data_bus', 'thrust_command_bus', 'acoustic_link', 'alarm_bus'], subModules: [{ id: 'mission_stack', name: 'Mission computer and acoustic link', purpose: 'Coordinates navigation, payload logging and underwater communications.', partLabels: ['Mission computer', 'Acoustic modem'], interfaces: ['navigation_sensor_bus', 'payload_data_bus', 'thrust_command_bus', 'acoustic_link', 'alarm_bus'] }] },
    { id: 'sensing_instrumentation', displayName: 'Navigation And Payload Sensing', purpose: 'Measures navigation state, depth, environment and inspection payload data.', interfaces: ['navigation_sensor_bus', 'payload_data_bus', 'pressure_boundary'], subModules: [{ id: 'nav_payload_sensors', name: 'Navigation and payload sensors', purpose: 'Combines bottom-track velocity, inertial state, depth and forward sonar payload data.', partLabels: ['DVL', 'Inertial navigation unit', 'Depth and pressure sensor', 'Forward sonar payload'], interfaces: ['navigation_sensor_bus', 'payload_data_bus', 'pressure_boundary'] }] },
    { id: 'environmental_interface', displayName: 'Pressure Thermal Buoyancy Interface', purpose: 'Manages external pressure, heat rejection, buoyancy and underwater cable penetrations.', interfaces: ['pressure_boundary', 'thermal_path', 'buoyancy_trim', 'service_access'], subModules: [{ id: 'pressure_buoyancy_interface', name: 'Pressure and buoyancy interface', purpose: 'Connects the hull boundary to penetrators, thermal paths and trim hardware.', partLabels: ['Wet-mate connector set'], interfaces: ['pressure_boundary', 'thermal_path', 'buoyancy_trim', 'service_access'] }] },
    { id: 'safety_protection', displayName: 'Leak Abort And Recovery Safety', purpose: 'Detects flooding or over-depth conditions and supports abort, isolation and recovery.', interfaces: ['leak_alarm_bus', 'alarm_bus', 'pressure_boundary', 'service_access'], subModules: [{ id: 'leak_abort_recovery', name: 'Leak, abort and recovery', purpose: 'Detects water ingress, triggers abort states and helps locate the vehicle.', partLabels: ['Leak detection sensor', 'Recovery beacon'], interfaces: ['leak_alarm_bus', 'alarm_bus', 'pressure_boundary', 'service_access'] }] },
    { id: 'maintenance_serviceability', displayName: 'Deck Recovery And Service', purpose: 'Supports launch, recovery, leak testing, charging and field service between missions.', interfaces: ['service_access', 'mechanical_mounts', 'pressure_boundary'], subModules: [{ id: 'deck_service', name: 'Deck service access', purpose: 'Provides handling and inspection features for field turnaround.', partLabels: ['Wet-mate connector set'], interfaces: ['service_access', 'mechanical_mounts', 'pressure_boundary'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'energy_storage_source', toModuleId: 'power_distribution', via: 'dc_power_bus', reason: 'Battery energy must enter protected DC distribution through an explicit bus.' },
    { fromModuleId: 'power_distribution', toModuleId: 'actuation_kinematics', via: 'thruster_power_bus', reason: 'Thrusters must receive protected power separately from avionics and payload rails.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'actuation_kinematics', via: 'thrust_command_bus', reason: 'Mission control must command thruster drive states over a declared control interface.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'navigation_sensor_bus', reason: 'DVL, INS and depth data must feed navigation fusion before mission autonomy is credible.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'payload_data_bus', reason: 'Inspection payload data must be logged or acted on by the mission computer.' },
    { fromModuleId: 'environmental_interface', toModuleId: 'structure_containment', via: 'pressure_boundary', reason: 'Hull, penetrators, thermal path and buoyancy hardware must share one depth-rated boundary model.' },
    { fromModuleId: 'safety_protection', toModuleId: 'control_compute_communication', via: 'alarm_bus', reason: 'Leak, over-depth and recovery alarms must drive fail-safe mission states.' },
    { fromModuleId: 'safety_protection', toModuleId: 'structure_containment', via: 'pressure_boundary', reason: 'Leak and over-depth protection must reference the same pressure boundary as the hull design.' },
  ],
  standards: [
    { id: 'PRESSURE-BOUNDARY-REVIEW', title: 'Depth-rated pressure boundary review', jurisdiction: 'Project engineering gate', evidenceRequired: 'Depth rating calculation, hull material allowables, endcap seal design and proof-pressure plan.' },
    { id: 'SUBSEA-LEAK-ABORT-REVIEW', title: 'Leak detection and abort-state review', jurisdiction: 'Project engineering gate', evidenceRequired: 'Leak sensor placement, abort state machine, battery isolation and recovery procedure.' },
    { id: 'EMC-MARINE-COMMS-REVIEW', title: 'Marine communications and EMC review', jurisdiction: 'Project engineering gate', evidenceRequired: 'Acoustic modem integration, antenna/transducer mounting, cable shielding and data-loss behaviour.' },
  ],
  risks: [
    { hazard: 'Pressure hull or seal failure at depth', severity: 10, occurrence: 3, detection: 4, mitigation: 'Depth-rated pressure calculation, hydrostatic proof test, leak test and seal inspection workflow.' },
    { hazard: 'Loss of navigation or communications underwater', severity: 8, occurrence: 4, detection: 5, mitigation: 'DVL/INS/depth fusion, acoustic link health monitoring and timed abort behaviour.' },
    { hazard: 'Unable to recover vehicle after abort', severity: 8, occurrence: 3, detection: 4, mitigation: 'Recovery beacon, drop-weight/recovery procedure, deck handling points and mission reserve energy.' },
  ],
}

const EDGE_AI_PACK: ClassPack = {
  productClass: 'edge_ai',
  label: 'Rack-Mount Edge AI Inference Appliance',
  minCriticalUnitCostGbp: 25,
  prohibitedTerms: ['leafy greens', 'mammalian-cell', 'pressure hull', 'ccs2', 'propeller'],
  headlineMetric: { id: 'inference_throughput', label: 'Inference throughput', unit: 'TOPS', defaultValue: 200, notes: 'Accelerator throughput requested in the brief before model, batch-size, latency and thermal derating evidence.' },
  requiredParts: [
    { label: 'AI accelerator module', match: ['ai accelerator', 'gpu module', 'inference accelerator'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'neural-network inference acceleration' },
    { label: 'CPU module', match: ['cpu module', 'server cpu', 'processor module'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'host control and preprocessing compute' },
    { label: 'System motherboard', match: ['system motherboard', 'baseboard', 'server board'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'PCIe, memory and management interconnect' },
    { label: 'ECC memory', match: ['ecc memory', 'server memory', 'ddr'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'reliable model and runtime memory' },
    { label: 'NVMe SSD', match: ['nvme ssd', 'solid state drive'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'model cache, logs and local data buffer' },
    { label: 'Redundant power supply', match: ['redundant power supply', 'hot-swap psu'], critical: true, qty: 2, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'fault-tolerant AC/DC input conversion' },
    { label: 'Fan wall assembly', match: ['fan wall', 'fan tray', 'cooling fan'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'rack airflow and thermal control' },
    { label: 'Heatsink cold plate', match: ['heatsink', 'cold plate', 'thermal module'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'accelerator heat transfer path' },
    { label: 'High-speed NIC', match: ['high-speed nic', 'network adapter', 'ethernet adapter'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'inference input/output network interface' },
    { label: 'BMC management controller', match: ['bmc', 'management controller', 'ipmi'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'out-of-band health and fleet management' },
    { label: 'TPM security module', match: ['tpm', 'security module', 'secure boot'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'measured boot and key protection' },
    { label: '1U rack chassis', match: ['1u rack chassis', 'rack chassis', '1u enclosure'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'rack-mount structure and airflow envelope' },
  ],
  modules: [
    { id: 'structure_containment', displayName: 'Rack Structure Containment', purpose: 'Provides the 1U enclosure, card retention and serviceable rack fit.', interfaces: ['rack_mount', 'airflow_path', 'service_access', 'protective_earth'], subModules: [{ id: 'rack_chassis', name: 'Rack chassis', purpose: 'Carries boards, power supplies and airflow features.', partLabels: ['1U rack chassis'], interfaces: ['rack_mount', 'airflow_path', 'service_access', 'protective_earth'] }] },
    { id: 'compute_acceleration', displayName: 'Compute Acceleration', purpose: 'Hosts accelerator, CPU and memory resources for inference workloads.', interfaces: ['pcie_fabric', 'memory_bus', 'gpu_power_bus', 'thermal_path'], subModules: [{ id: 'accelerator_complex', name: 'Accelerator complex', purpose: 'Runs neural-network inference workloads.', partLabels: ['AI accelerator module', 'CPU module', 'System motherboard', 'ECC memory'], interfaces: ['pcie_fabric', 'memory_bus', 'gpu_power_bus', 'thermal_path'] }] },
    { id: 'network_io', displayName: 'Network IO', purpose: 'Moves inference requests, responses and timing data into and out of the appliance.', interfaces: ['inference_network', 'management_network', 'pcie_fabric', 'service_access'], subModules: [{ id: 'network_adapter', name: 'Network adapter', purpose: 'Terminates high-speed network traffic.', partLabels: ['High-speed NIC'], interfaces: ['inference_network', 'management_network', 'pcie_fabric', 'service_access'] }] },
    { id: 'data_storage', displayName: 'Data Storage', purpose: 'Stores models, logs and local inference buffers.', interfaces: ['storage_bus', 'pcie_fabric', 'service_access'], subModules: [{ id: 'nvme_storage', name: 'NVMe storage', purpose: 'Caches models and records operational evidence.', partLabels: ['NVMe SSD'], interfaces: ['storage_bus', 'pcie_fabric', 'service_access'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Runs host firmware, orchestration, BMC management and secure remote operation.', interfaces: ['pcie_fabric', 'storage_bus', 'management_network', 'inference_network', 'sensor_bus', 'thermal_alarm_bus'], subModules: [{ id: 'host_management', name: 'Host and management control', purpose: 'Coordinates runtime, monitoring and out-of-band management.', partLabels: ['BMC management controller'], interfaces: ['pcie_fabric', 'storage_bus', 'management_network', 'inference_network', 'sensor_bus', 'thermal_alarm_bus'] }] },
    { id: 'power_distribution', displayName: 'Power Distribution', purpose: 'Converts and distributes protected power to accelerator, motherboard, fans and storage.', interfaces: ['ac_input_bus', 'low_voltage_rail', 'gpu_power_bus', 'protective_earth', 'hardwired_trip'], subModules: [{ id: 'redundant_power', name: 'Redundant power conversion', purpose: 'Converts AC input into protected appliance rails.', partLabels: ['Redundant power supply'], interfaces: ['ac_input_bus', 'low_voltage_rail', 'gpu_power_bus', 'protective_earth', 'hardwired_trip'] }] },
    { id: 'environmental_interface', displayName: 'Thermal Airflow Interface', purpose: 'Controls front-to-back airflow and accelerator heat transfer.', interfaces: ['airflow_path', 'thermal_path', 'fan_control_bus', 'sensor_bus', 'service_access'], subModules: [{ id: 'cooling_path', name: 'Cooling path', purpose: 'Moves heat from accelerator and CPU into rack exhaust airflow.', partLabels: ['Fan wall assembly', 'Heatsink cold plate'], interfaces: ['airflow_path', 'thermal_path', 'fan_control_bus', 'sensor_bus', 'service_access'] }] },
    { id: 'sensing_instrumentation', displayName: 'Telemetry Instrumentation', purpose: 'Measures temperature, fan, power, intrusion and health state.', interfaces: ['sensor_bus', 'management_network', 'thermal_alarm_bus'], subModules: [{ id: 'health_sensors', name: 'Health sensors', purpose: 'Feeds thermal, power and service-state telemetry into management control.', partLabels: [], interfaces: ['sensor_bus', 'management_network', 'thermal_alarm_bus'] }] },
    { id: 'safety_protection', displayName: 'Security And Safety Protection', purpose: 'Protects boot integrity, operator safety and thermal shutdown paths.', interfaces: ['secure_boot_chain', 'thermal_alarm_bus', 'hardwired_trip', 'protective_earth'], subModules: [{ id: 'secure_safety_chain', name: 'Secure boot and safety chain', purpose: 'Provides measured boot and thermal/electrical shutdown paths.', partLabels: ['TPM security module'], interfaces: ['secure_boot_chain', 'thermal_alarm_bus', 'hardwired_trip', 'protective_earth'] }] },
    { id: 'maintenance_serviceability', displayName: 'Field Maintenance Serviceability', purpose: 'Supports rack installation, hot-swap FRUs, diagnostics and firmware recovery.', interfaces: ['service_access', 'rack_mount', 'management_network'], subModules: [{ id: 'field_service', name: 'Field service access', purpose: 'Makes fans, drives, power supplies and diagnostics serviceable.', partLabels: [], interfaces: ['service_access', 'rack_mount', 'management_network'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'control_compute_communication', toModuleId: 'compute_acceleration', via: 'pcie_fabric', reason: 'Host control must enumerate and command the accelerator over a declared PCIe fabric.' },
    { fromModuleId: 'power_distribution', toModuleId: 'compute_acceleration', via: 'gpu_power_bus', reason: 'Accelerator power must be isolated from lower-power appliance rails.' },
    { fromModuleId: 'network_io', toModuleId: 'control_compute_communication', via: 'inference_network', reason: 'Inference traffic must reach host software and runtime orchestration.' },
    { fromModuleId: 'data_storage', toModuleId: 'control_compute_communication', via: 'storage_bus', reason: 'Model cache and logs must be visible to host software.' },
    { fromModuleId: 'environmental_interface', toModuleId: 'compute_acceleration', via: 'thermal_path', reason: 'Accelerator and CPU heat must couple into the cooling path.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'sensor_bus', reason: 'Thermal and power telemetry must feed management control.' },
    { fromModuleId: 'safety_protection', toModuleId: 'power_distribution', via: 'hardwired_trip', reason: 'Thermal and electrical safety faults must force power shutdown.' },
    { fromModuleId: 'structure_containment', toModuleId: 'environmental_interface', via: 'airflow_path', reason: 'The rack chassis must preserve the front-to-back airflow path used by cooling.' },
  ],
  standards: [
    { id: 'IEC-62368-1', title: 'Audio/video, ICT and communication equipment safety', jurisdiction: 'UK/EU/global', evidenceRequired: 'Electrical safety, enclosure, temperature and abnormal-operation evidence.' },
    { id: 'CE-EMC', title: 'Electromagnetic compatibility technical file', jurisdiction: 'UK/EU', evidenceRequired: 'EMC design review, pre-compliance or test evidence for rack appliance.' },
    { id: 'SECURE-BOOT-REVIEW', title: 'Secure boot and fleet-management review', jurisdiction: 'Project security gate', evidenceRequired: 'TPM, measured boot, firmware signing, recovery and management-access evidence.' },
  ],
  risks: [
    { hazard: 'Accelerator thermal throttling or shutdown under rack inlet conditions', severity: 8, occurrence: 4, detection: 4, mitigation: 'Thermal path sizing, inlet derating, fan redundancy and telemetry alarms.' },
    { hazard: 'Insecure firmware or management interface compromise', severity: 9, occurrence: 3, detection: 5, mitigation: 'TPM measured boot, signed firmware, locked debug access and management-network controls.' },
    { hazard: 'Inference outage from PSU, fan or SSD failure', severity: 7, occurrence: 4, detection: 4, mitigation: 'Redundant PSU path, hot-swap fans, storage health monitoring and runtime failover policy.' },
  ],
}

const HAPS_PACK: ClassPack = {
  productClass: 'haps',
  label: 'Solar-Electric High-Altitude Pseudo-Satellite',
  minCriticalUnitCostGbp: 25,
  prohibitedTerms: ['leafy greens', 'mammalian-cell', 'ccs2', 'pressure hull', 'rack chassis'],
  headlineMetric: { id: 'station_keeping_endurance', label: 'Station-keeping endurance', unit: 'days', defaultValue: 30, notes: 'Mission endurance requested in the brief before solar energy balance, battery night-cycle and stratospheric wind validation.' },
  requiredParts: [
    { label: 'High-aspect-ratio wing structure', match: ['wing structure', 'high-aspect-ratio wing'], critical: true, qty: 1, unit: 'assembly', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'primary lift and solar-array support' },
    { label: 'Solar cell array', match: ['solar cell array', 'solar array'], critical: true, qty: 1, unit: 'array', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'daytime energy harvesting' },
    { label: 'MPPT power tracker', match: ['mppt', 'power tracker'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'solar maximum-power-point conversion' },
    { label: 'Stratospheric battery pack', match: ['stratospheric battery', 'battery pack'], critical: true, qty: 1, unit: 'pack', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'night-cycle energy storage' },
    { label: 'Electric propulsion pod', match: ['electric propulsion pod', 'propulsion pod'], critical: true, qty: 4, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'station-keeping thrust' },
    { label: 'Flight control computer', match: ['flight control computer', 'autopilot'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'autonomous flight control and station keeping' },
    { label: 'GNSS INS navigation unit', match: ['gnss ins', 'navigation unit'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'navigation and attitude reference' },
    { label: 'Stratospheric communications payload', match: ['communications payload', 'stratospheric communications'], critical: true, qty: 1, unit: 'payload', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'service payload relay' },
    { label: 'Payload antenna array', match: ['payload antenna', 'antenna array'], critical: true, qty: 1, unit: 'array', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'payload RF aperture' },
    { label: 'Thermal insulation blanket', match: ['thermal insulation', 'insulation blanket'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'stratospheric thermal protection' },
    { label: 'Recovery parachute system', match: ['recovery parachute', 'parachute system'], critical: true, qty: 1, unit: 'system', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'controlled descent after abort' },
    { label: 'Ground control link', match: ['ground control link', 'telemetry link'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'command, telemetry and recovery coordination' },
  ],
  modules: [
    { id: 'structure_containment', displayName: 'Ultra-Light Wing Structure', purpose: 'Carries solar, propulsion, battery and payload loads across the high-aspect-ratio airframe.', interfaces: ['aero_load_path', 'solar_mount', 'propulsion_mounts', 'service_access'], subModules: [{ id: 'wing_structure', name: 'High-aspect-ratio wing structure', purpose: 'Provides lift and distributed mounting points for the HAPS system.', partLabels: ['High-aspect-ratio wing structure'], interfaces: ['aero_load_path', 'solar_mount', 'propulsion_mounts', 'service_access'] }] },
    { id: 'energy_harvesting', displayName: 'Solar Energy Harvesting', purpose: 'Converts stratospheric sunlight into a regulated daytime DC source.', interfaces: ['solar_dc_bus', 'solar_mount', 'sensor_bus'], subModules: [{ id: 'solar_array', name: 'Solar cell array', purpose: 'Harvests solar energy across wing surfaces.', partLabels: ['Solar cell array', 'MPPT power tracker'], interfaces: ['solar_dc_bus', 'solar_mount', 'sensor_bus'] }] },
    { id: 'energy_storage_source', displayName: 'Night-Cycle Energy Storage', purpose: 'Stores solar energy for night endurance and transient propulsion loads.', interfaces: ['battery_dc_bus', 'thermal_path', 'battery_monitor_bus', 'service_access'], subModules: [{ id: 'battery_pack', name: 'Stratospheric battery pack', purpose: 'Stores and monitors night-cycle mission energy.', partLabels: ['Stratospheric battery pack'], interfaces: ['battery_dc_bus', 'thermal_path', 'battery_monitor_bus', 'service_access'] }] },
    { id: 'power_distribution', displayName: 'Flight Power Distribution', purpose: 'Routes harvested and stored energy to propulsion, avionics and payload loads.', interfaces: ['solar_dc_bus', 'battery_dc_bus', 'propulsion_power_bus', 'payload_power_bus', 'hardwired_trip'], subModules: [{ id: 'power_management', name: 'Solar and battery power management', purpose: 'Balances solar input, battery charge and load distribution.', partLabels: ['MPPT power tracker'], interfaces: ['solar_dc_bus', 'battery_dc_bus', 'propulsion_power_bus', 'payload_power_bus', 'hardwired_trip'] }] },
    { id: 'actuation_kinematics', displayName: 'Propulsion And Control Surfaces', purpose: 'Provides station-keeping thrust and trim authority in thin stratospheric air.', interfaces: ['propulsion_power_bus', 'flight_control_bus', 'propulsion_mounts', 'aero_load_path'], subModules: [{ id: 'propulsion_pods', name: 'Electric propulsion pods', purpose: 'Generates distributed station-keeping thrust.', partLabels: ['Electric propulsion pod'], interfaces: ['propulsion_power_bus', 'flight_control_bus', 'propulsion_mounts', 'aero_load_path'] }] },
    { id: 'control_compute_communication', displayName: 'Autonomy Control Communication', purpose: 'Runs flight control, station keeping, energy management and ground command links.', interfaces: ['flight_control_bus', 'sensor_bus', 'telemetry_link', 'battery_monitor_bus', 'payload_data_link'], subModules: [{ id: 'flight_control', name: 'Flight control and telemetry', purpose: 'Coordinates flight control, navigation, energy and ground communications.', partLabels: ['Flight control computer', 'Ground control link'], interfaces: ['flight_control_bus', 'sensor_bus', 'telemetry_link', 'battery_monitor_bus', 'payload_data_link'] }] },
    { id: 'sensing_instrumentation', displayName: 'Navigation And Airdata Sensing', purpose: 'Measures navigation, attitude, airdata and structural state for autonomous station keeping.', interfaces: ['sensor_bus', 'flight_control_bus', 'aero_load_path'], subModules: [{ id: 'nav_airdata', name: 'Navigation and airdata suite', purpose: 'Feeds flight controller with position, attitude and atmospheric state.', partLabels: ['GNSS INS navigation unit'], interfaces: ['sensor_bus', 'flight_control_bus', 'aero_load_path'] }] },
    { id: 'payload_communication', displayName: 'Communications Payload', purpose: 'Provides payload relay services independent from the command and control link.', interfaces: ['payload_data_link', 'payload_power_bus', 'rf_aperture', 'thermal_path'], subModules: [{ id: 'payload_comms', name: 'Payload communications', purpose: 'Carries relay payload electronics and RF aperture.', partLabels: ['Stratospheric communications payload', 'Payload antenna array'], interfaces: ['payload_data_link', 'payload_power_bus', 'rf_aperture', 'thermal_path'] }] },
    { id: 'environmental_interface', displayName: 'Stratospheric Environmental Interface', purpose: 'Protects batteries, avionics and payloads from low pressure, cold soak and UV exposure.', interfaces: ['thermal_path', 'solar_mount', 'service_access', 'rf_aperture'], subModules: [{ id: 'thermal_environment', name: 'Thermal and UV protection', purpose: 'Manages cold-soak, heat rejection and stratospheric surface exposure.', partLabels: ['Thermal insulation blanket'], interfaces: ['thermal_path', 'solar_mount', 'service_access', 'rf_aperture'] }] },
    { id: 'safety_protection', displayName: 'Flight Safety And Recovery', purpose: 'Protects people, airspace and vehicle hardware during abort, descent and energy faults.', interfaces: ['hardwired_trip', 'telemetry_link', 'flight_control_bus', 'service_access'], subModules: [{ id: 'abort_recovery', name: 'Abort and recovery', purpose: 'Provides controlled descent and fault-state protection.', partLabels: ['Recovery parachute system'], interfaces: ['hardwired_trip', 'telemetry_link', 'flight_control_bus', 'service_access'] }] },
    { id: 'maintenance_serviceability', displayName: 'Ground Handling Serviceability', purpose: 'Supports wing assembly, launch preparation, battery service and payload checkout.', interfaces: ['service_access', 'aero_load_path', 'telemetry_link'], subModules: [{ id: 'ground_handling', name: 'Ground handling and launch prep', purpose: 'Provides preflight assembly, launch and service evidence paths.', partLabels: ['Ground control link'], interfaces: ['service_access', 'aero_load_path', 'telemetry_link'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'energy_harvesting', toModuleId: 'power_distribution', via: 'solar_dc_bus', reason: 'Solar array output must feed power management over a declared DC bus.' },
    { fromModuleId: 'energy_storage_source', toModuleId: 'power_distribution', via: 'battery_dc_bus', reason: 'Night-cycle battery energy must connect into load distribution.' },
    { fromModuleId: 'power_distribution', toModuleId: 'actuation_kinematics', via: 'propulsion_power_bus', reason: 'Propulsion loads must receive protected high-current power.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'actuation_kinematics', via: 'flight_control_bus', reason: 'Flight controller must command propulsion and trim actuators.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'sensor_bus', reason: 'Navigation, airdata and structural state must feed autonomy decisions.' },
    { fromModuleId: 'payload_communication', toModuleId: 'control_compute_communication', via: 'payload_data_link', reason: 'Payload state must be visible to vehicle autonomy and telemetry.' },
    { fromModuleId: 'environmental_interface', toModuleId: 'energy_storage_source', via: 'thermal_path', reason: 'Battery survival and night-cycle capacity depend on a declared thermal path.' },
    { fromModuleId: 'safety_protection', toModuleId: 'control_compute_communication', via: 'telemetry_link', reason: 'Abort, descent and recovery state must remain visible to ground operators.' },
  ],
  standards: [
    { id: 'CAA-UAS-OPS', title: 'High-altitude unmanned aircraft operational safety case', jurisdiction: 'UK / aviation authority review', evidenceRequired: 'Airspace concept of operations, detect-and-avoid assumptions, command link and recovery evidence.' },
    { id: 'DO-160-ENV', title: 'Airborne equipment environmental conditions', jurisdiction: 'Aviation engineering reference', evidenceRequired: 'Temperature, vibration, electrical power and EMC environmental evidence tailored to stratospheric operation.' },
    { id: 'SOLAR-ENERGY-BALANCE-REVIEW', title: 'Solar day/night energy balance review', jurisdiction: 'Project engineering gate', evidenceRequired: 'Solar collection, battery night-cycle, propulsion load and station-keeping wind model evidence.' },
  ],
  risks: [
    { hazard: 'Energy-negative overnight operation', severity: 10, occurrence: 4, detection: 5, mitigation: 'Solar/battery energy balance, night-cycle reserve and wind-aware station-keeping plan.' },
    { hazard: 'Wing structural failure in gust or launch handling', severity: 9, occurrence: 3, detection: 5, mitigation: 'Aeroelastic analysis, ground load test and launch/recovery handling limits.' },
    { hazard: 'Lost command link or uncontrolled descent', severity: 10, occurrence: 3, detection: 4, mitigation: 'Redundant telemetry, autonomous return/loiter logic, geofence and recovery parachute.' },
  ],
}

const CGM_PACK: ClassPack = {
  productClass: 'cgm',
  label: 'Continuous Glucose Monitor Wearable Patch',
  minCriticalUnitCostGbp: 5,
  prohibitedTerms: ['lfp prismatic', 'hydronic circuit', 'propulsion motor', 'stratospheric'],
  headlineMetric: { id: 'sensor_wear_duration', label: 'Sensor wear duration', unit: 'days', defaultValue: 14, notes: 'Target on-body wear period before replacement; accuracy, adhesive and biocompatibility evidence are still required.' },
  requiredParts: [
    { label: 'Glucose sensing filament', match: ['glucose sensing filament', 'sensor filament'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'interstitial glucose measurement element' },
    { label: 'Enzyme reagent membrane', match: ['enzyme reagent membrane', 'enzyme membrane'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'glucose-selective chemistry layer' },
    { label: 'Reference electrode', match: ['reference electrode'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'electrochemical reference path' },
    { label: 'Adhesive skin patch', match: ['adhesive skin patch', 'adhesive patch'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'wearable skin attachment' },
    { label: 'Protective transmitter housing', match: ['protective transmitter housing', 'transmitter housing'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'electronics enclosure and ingress boundary' },
    { label: 'Disposable applicator', match: ['disposable applicator', 'applicator'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'controlled sensor insertion' },
    { label: 'Low-power microcontroller', match: ['low-power microcontroller', 'microcontroller'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'signal processing and device control' },
    { label: 'BLE radio module', match: ['ble radio module', 'ble radio'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'phone and reader telemetry' },
    { label: 'Thin-film battery', match: ['thin-film battery', 'battery'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'wear-period energy source' },
    { label: 'Temperature sensor', match: ['temperature sensor'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'temperature compensation for sensor chemistry' },
    { label: 'Sterile barrier pouch', match: ['sterile barrier pouch', 'sterile pouch'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'sterility and shelf-life protection' },
    { label: 'UDI label set', match: ['udi label', 'label set'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 0, supplier: 'source required', leadTimeWeeks: 0, role: 'regulated traceability and user identification' },
  ],
  modules: [
    { id: 'skin_patient_interface', displayName: 'Skin Patient Interface', purpose: 'Maintains safe adhesive wear, sterile skin contact and sensor access to interstitial fluid.', interfaces: ['adhesive_skin_boundary', 'interstitial_fluid_path', 'sterile_boundary', 'insertion_path', 'service_access'], subModules: [{ id: 'adhesive_skin_patch', name: 'Adhesive skin patch', purpose: 'Carries the wearable sensor on skin for the declared wear duration.', partLabels: ['Adhesive skin patch'], interfaces: ['adhesive_skin_boundary', 'interstitial_fluid_path', 'sterile_boundary', 'insertion_path'] }] },
    { id: 'sensing_instrumentation', displayName: 'Glucose Sensing Instrumentation', purpose: 'Converts interstitial glucose chemistry into a compensated electrical signal.', interfaces: ['interstitial_fluid_path', 'electrode_signal_path', 'sensor_signal_bus', 'calibration_data_bus', 'analog_power_rail', 'temperature_compensation_bus'], subModules: [{ id: 'glucose_sensor_stack', name: 'Glucose sensor stack', purpose: 'Combines filament, reagent membrane and reference path for electrochemical sensing.', partLabels: ['Glucose sensing filament', 'Enzyme reagent membrane', 'Reference electrode'], interfaces: ['interstitial_fluid_path', 'electrode_signal_path', 'sensor_signal_bus', 'calibration_data_bus', 'analog_power_rail', 'temperature_compensation_bus'] }] },
    { id: 'actuation_kinematics', displayName: 'Applicator Insertion Mechanism', purpose: 'Inserts the sensor filament repeatably while controlling post-use sharps risk.', interfaces: ['insertion_path', 'sterile_boundary', 'user_trigger', 'service_access'], subModules: [{ id: 'disposable_applicator', name: 'Disposable applicator', purpose: 'Provides user-triggered insertion and post-use lockout.', partLabels: ['Disposable applicator'], interfaces: ['insertion_path', 'sterile_boundary', 'user_trigger', 'service_access'] }] },
    { id: 'structure_containment', displayName: 'Transmitter Housing Structure', purpose: 'Protects electronics, antenna and battery while maintaining a wearable low-profile form.', interfaces: ['electronics_mount', 'ingress_boundary', 'adhesive_skin_boundary', 'service_access'], subModules: [{ id: 'transmitter_housing', name: 'Protective transmitter housing', purpose: 'Holds electronics and forms the splash/ingress boundary.', partLabels: ['Protective transmitter housing'], interfaces: ['electronics_mount', 'ingress_boundary', 'adhesive_skin_boundary'] }] },
    { id: 'energy_storage_source', displayName: 'Wearable Energy Source', purpose: 'Stores enough energy for the declared wear period and shelf activation state.', interfaces: ['cell_power_bus', 'service_access', 'lot_traceability'], subModules: [{ id: 'thin_film_battery', name: 'Thin-film battery', purpose: 'Feeds the patch during the full wear period.', partLabels: ['Thin-film battery'], interfaces: ['cell_power_bus', 'service_access', 'lot_traceability'] }] },
    { id: 'power_distribution', displayName: 'Low-Power Distribution', purpose: 'Generates protected analog and digital rails for sensing, control and radio bursts.', interfaces: ['cell_power_bus', 'low_power_rail', 'analog_power_rail', 'hardwired_trip', 'sensor_signal_bus'], subModules: [{ id: 'low_power_rails', name: 'Low-power rails', purpose: 'Routes battery power to analog sensing and digital telemetry electronics.', partLabels: [], interfaces: ['cell_power_bus', 'low_power_rail', 'analog_power_rail', 'hardwired_trip', 'sensor_signal_bus'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Processes readings, stores trend history and transmits encrypted glucose data.', interfaces: ['sensor_signal_bus', 'calibration_data_bus', 'ble_link', 'alarm_state_bus', 'low_power_rail', 'temperature_compensation_bus'], subModules: [{ id: 'mcu_ble_stack', name: 'MCU and BLE stack', purpose: 'Runs sampling, filtering, pairing and data transmission.', partLabels: ['Low-power microcontroller', 'BLE radio module'], interfaces: ['sensor_signal_bus', 'calibration_data_bus', 'ble_link', 'alarm_state_bus', 'low_power_rail', 'temperature_compensation_bus'] }] },
    { id: 'environmental_interface', displayName: 'Wear Environment Compensation', purpose: 'Accounts for body temperature, sweat, water ingress and motion artefacts.', interfaces: ['temperature_compensation_bus', 'ingress_boundary', 'adhesive_skin_boundary', 'sensor_signal_bus'], subModules: [{ id: 'temperature_ingress_compensation', name: 'Temperature and ingress compensation', purpose: 'Measures local temperature and exposure conditions around the worn patch.', partLabels: ['Temperature sensor'], interfaces: ['temperature_compensation_bus', 'ingress_boundary', 'adhesive_skin_boundary', 'sensor_signal_bus'] }] },
    { id: 'safety_protection', displayName: 'Patient Safety Protection', purpose: 'Controls alarm states, biocompatibility evidence, sterile boundary and sharps safety.', interfaces: ['alarm_state_bus', 'sterile_boundary', 'adhesive_skin_boundary', 'hardwired_trip', 'service_access'], subModules: [{ id: 'patient_safety_controls', name: 'Patient safety controls', purpose: 'Manages patient alarms, stale data lockout and sterile/sharps warnings.', partLabels: [], interfaces: ['alarm_state_bus', 'sterile_boundary', 'adhesive_skin_boundary', 'hardwired_trip', 'service_access'] }] },
    { id: 'maintenance_serviceability', displayName: 'Packaging Traceability Serviceability', purpose: 'Maintains sterile packaging, UDI traceability, setup instructions and shelf-life evidence.', interfaces: ['sterile_boundary', 'lot_traceability', 'service_access', 'ble_link'], subModules: [{ id: 'sterile_packaging_traceability', name: 'Sterile packaging and traceability', purpose: 'Protects the device until use and exposes regulated traceability records.', partLabels: ['Sterile barrier pouch', 'UDI label set'], interfaces: ['sterile_boundary', 'lot_traceability', 'service_access', 'ble_link'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'skin_patient_interface', toModuleId: 'sensing_instrumentation', via: 'interstitial_fluid_path', reason: 'Sensor chemistry must access interstitial fluid through a declared patient interface.' },
    { fromModuleId: 'actuation_kinematics', toModuleId: 'skin_patient_interface', via: 'insertion_path', reason: 'Applicator insertion path must align with the adhesive patch and skin boundary.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'sensor_signal_bus', reason: 'Analog sensing output must feed the processing and telemetry stack.' },
    { fromModuleId: 'sensing_instrumentation', toModuleId: 'control_compute_communication', via: 'calibration_data_bus', reason: 'Factory calibration and drift state must be visible to the reader algorithm.' },
    { fromModuleId: 'energy_storage_source', toModuleId: 'power_distribution', via: 'cell_power_bus', reason: 'Battery output must feed protected low-power rails.' },
    { fromModuleId: 'power_distribution', toModuleId: 'sensing_instrumentation', via: 'analog_power_rail', reason: 'Electrochemical analog front-end needs a low-noise supply path.' },
    { fromModuleId: 'power_distribution', toModuleId: 'control_compute_communication', via: 'low_power_rail', reason: 'MCU and BLE telemetry need duty-cycled digital power.' },
    { fromModuleId: 'environmental_interface', toModuleId: 'control_compute_communication', via: 'temperature_compensation_bus', reason: 'Body-temperature context must feed the glucose compensation algorithm.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'safety_protection', via: 'alarm_state_bus', reason: 'Patient alarm and stale-data states must route through safety logic.' },
    { fromModuleId: 'maintenance_serviceability', toModuleId: 'skin_patient_interface', via: 'sterile_boundary', reason: 'Sterile packaging evidence must connect to the patient-contact boundary.' },
  ],
  standards: [
    { id: 'ISO-10993', title: 'Biological evaluation of patient-contacting materials', jurisdiction: 'Global / medical device', evidenceRequired: 'Skin-contact material, adhesive and wear-duration biocompatibility evidence.' },
    { id: 'ISO-14971', title: 'Medical-device risk management', jurisdiction: 'Global / medical device', evidenceRequired: 'Hazard analysis, risk controls and residual-risk acceptability.' },
    { id: 'IEC-62304', title: 'Medical-device software lifecycle', jurisdiction: 'Global / medical device', evidenceRequired: 'Software architecture, risk class, verification and release evidence.' },
    { id: 'IEC-60601-1', title: 'Medical electrical equipment safety reference', jurisdiction: 'Global / medical device', evidenceRequired: 'Electrical safety, leakage, power source and abnormal-operation evidence tailored to wearable use.' },
  ],
  risks: [
    { hazard: 'Incorrect glucose reading drives unsafe therapy decision', severity: 10, occurrence: 4, detection: 5, mitigation: 'Sensor chemistry validation, calibration evidence, trend confidence and stale-data lockout.' },
    { hazard: 'Skin irritation or adhesive injury during extended wear', severity: 7, occurrence: 4, detection: 4, mitigation: 'Biocompatibility testing, adhesive edge design and user removal guidance.' },
    { hazard: 'Applicator needle or filament insertion injury', severity: 8, occurrence: 3, detection: 4, mitigation: 'Insertion depth stop, post-use lockout, sterile barrier and sharps warnings.' },
    { hazard: 'Telemetry or battery failure hides a clinically relevant trend', severity: 8, occurrence: 4, detection: 4, mitigation: 'Battery reserve margin, local buffering, alarm-state telemetry and phone-link monitoring.' },
  ],
}

const VERTICAL_FARM_PACK: ClassPack = {
  productClass: 'vertical_farm',
  label: 'Indoor Vertical Farm',
  minCriticalUnitCostGbp: 50,
  prohibitedTerms: ['lfp prismatic', 'battery rack', 'pcs inverter'],
  headlineMetric: { id: 'annual_leafy_green_yield', label: 'Annual leafy-green yield', unit: 'kg/year', defaultValue: 1800, notes: 'Class-pack estimate for compact indoor leafy-green unit.' },
  requiredParts: [
    { label: 'LED grow lights', match: ['led grow', 'horticultural lighting'], critical: true, qty: 12, unit: 'bar', defaultUnitCostGbp: 180, supplier: 'Signify / Fluence', leadTimeWeeks: 6, role: 'photosynthetic lighting' },
    { label: 'Nutrient pump', match: ['nutrient pump', 'fertigation'], critical: true, qty: 2, unit: 'each', defaultUnitCostGbp: 220, supplier: 'Grundfos / Watson-Marlow', leadTimeWeeks: 4, role: 'nutrient circulation' },
    { label: 'CO2 sensor or dosing', match: ['co2', 'ndir'], critical: true, qty: 1, unit: 'system', defaultUnitCostGbp: 650, supplier: 'Vaisala / Senseair', leadTimeWeeks: 4, role: 'CO2 monitoring and enrichment' },
    { label: 'Growing rack structure', match: ['rack', 'growing tray'], critical: true, qty: 1, unit: 'system', defaultUnitCostGbp: 2500, supplier: 'item / Bosch Rexroth', leadTimeWeeks: 5, role: 'plant support structure' },
    { label: 'Air circulation fans', match: ['circulation fan', 'airflow fan'], critical: true, qty: 4, unit: 'each', defaultUnitCostGbp: 120, supplier: 'ebm-papst / S&P', leadTimeWeeks: 4, role: 'air movement and canopy mixing' },
    { label: 'Environmental controller', match: ['environmental controller', 'plc', 'control panel'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 850, supplier: 'WAGO / Siemens', leadTimeWeeks: 5, role: 'climate and irrigation control' },
    { label: 'Reservoir and plumbing set', match: ['reservoir', 'plumbing', 'nutrient tank'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 900, supplier: 'Georg Fischer / John Guest', leadTimeWeeks: 4, role: 'nutrient containment and distribution' },
    { label: 'RCD isolator panel', match: ['rcd', 'isolator', 'electrical panel'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 750, supplier: 'Schneider Electric / ABB', leadTimeWeeks: 4, role: 'humid-area electrical protection' },
  ],
  modules: [
    { id: 'structure_containment', displayName: 'Structure Containment', purpose: 'Carries trays, lights and service access within the farm unit.', interfaces: ['service_access'], subModules: [{ id: 'growing_racks', name: 'Growing rack structure', purpose: 'Supports trays and lighting at fixed spacing.', partLabels: ['Growing rack structure'], interfaces: ['service_access'] }] },
    { id: 'environmental_interface', displayName: 'Environmental Interface', purpose: 'Maintains light, air and CO2 conditions for crop growth.', interfaces: ['airflow', 'lighting_control', 'sensor_bus', 'actuator_bus'], subModules: [{ id: 'lighting', name: 'Horticultural lighting', purpose: 'Provides crop-specific photosynthetic photon flux.', partLabels: ['LED grow lights'], interfaces: ['lighting_control', 'actuator_bus'] }, { id: 'co2_control', name: 'CO2 monitoring and dosing', purpose: 'Maintains CO2 concentration inside the grow envelope.', partLabels: ['CO2 sensor or dosing'], interfaces: ['airflow', 'sensor_bus', 'actuator_bus'] }, { id: 'canopy_airflow', name: 'Canopy air circulation', purpose: 'Moves air through stacked trays to reduce humidity pockets.', partLabels: ['Air circulation fans'], interfaces: ['airflow', 'actuator_bus'] }] },
    { id: 'mass_fluid_transport_process', displayName: 'Mass Fluid Transport Process', purpose: 'Circulates nutrient solution through trays and reservoirs.', interfaces: ['nutrient_loop', 'sensor_bus', 'actuator_bus'], subModules: [{ id: 'fertigation_loop', name: 'Fertigation loop', purpose: 'Pumps nutrient solution through the growing channels.', partLabels: ['Nutrient pump', 'Reservoir and plumbing set'], interfaces: ['nutrient_loop', 'sensor_bus', 'actuator_bus'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Runs recipes, dosing schedules and alarm handling.', interfaces: ['sensor_bus', 'actuator_bus'], subModules: [{ id: 'farm_controller', name: 'Environmental controller', purpose: 'Coordinates lighting, fertigation and CO2 set-points.', partLabels: ['Environmental controller'], interfaces: ['sensor_bus', 'actuator_bus'] }] },
    { id: 'safety_protection', displayName: 'Safety Protection', purpose: 'Separates humid cultivation zones from electrical hazards.', interfaces: ['mains_supply', 'service_access'], subModules: [{ id: 'humid_zone_electrical_protection', name: 'Humid-zone electrical protection', purpose: 'Provides isolation, RCD protection and lockable service switching.', partLabels: ['RCD isolator panel'], interfaces: ['mains_supply', 'service_access'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'control_compute_communication', toModuleId: 'environmental_interface', via: 'actuator_bus', reason: 'Farm controller must command lighting, CO2 dosing and airflow.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'mass_fluid_transport_process', via: 'actuator_bus', reason: 'Farm controller must command fertigation pumps and nutrient circulation.' },
    { fromModuleId: 'environmental_interface', toModuleId: 'mass_fluid_transport_process', via: 'sensor_bus', reason: 'Climate and fertigation state must be observable by the same control layer.' },
  ],
  standards: [
    { id: 'CE-UKCA', title: 'Electrical safety and UKCA/CE file', jurisdiction: 'UK/EU', evidenceRequired: 'Technical file, electrical risk assessment and declarations.' },
    { id: 'WRAS', title: 'Water fittings compliance', jurisdiction: 'UK', evidenceRequired: 'Approved fittings or evidence for water-contact components.' },
  ],
  risks: [
    { hazard: 'Crop loss from pump failure', severity: 7, occurrence: 4, detection: 4, mitigation: 'Dual pumps, flow monitoring and low-level alarms.' },
    { hazard: 'Electrical fault in humid grow area', severity: 8, occurrence: 3, detection: 4, mitigation: 'Ingress-rated drivers, RCD protection and cable separation.' },
  ],
}

const DRONE_PACK: ClassPack = {
  productClass: 'drone',
  label: 'Prosumer Cinematography Drone',
  minCriticalUnitCostGbp: 25,
  prohibitedTerms: ['lfp prismatic', 'hydronic circuit', 'leafy greens'],
  headlineMetric: { id: 'flight_endurance', label: 'Flight endurance', unit: 'minutes', defaultValue: 40, notes: 'Target endurance for prosumer cinematography flight profile.' },
  requiredParts: [
    { label: 'Flight controller', match: ['flight controller', 'pixhawk'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 220, supplier: 'Holybro / CubePilot', leadTimeWeeks: 2, role: 'flight stabilisation and control' },
    { label: 'Brushless motors', match: ['brushless motor', 'propulsion motor'], critical: true, qty: 4, unit: 'each', defaultUnitCostGbp: 85, supplier: 'T-Motor / KDE Direct', leadTimeWeeks: 3, role: 'propulsion' },
    { label: 'ESC', match: ['esc', 'electronic speed controller'], critical: true, qty: 4, unit: 'each', defaultUnitCostGbp: 45, supplier: 'Hobbywing / VESC', leadTimeWeeks: 2, role: 'motor drive' },
    { label: '4K camera payload', match: ['4k camera', 'camera payload'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 380, supplier: 'Sony / DJI equivalent', leadTimeWeeks: 4, role: 'image capture' },
    { label: 'Carbon airframe', match: ['airframe', 'carbon frame'], critical: true, qty: 1, unit: 'each', defaultUnitCostGbp: 300, supplier: 'Tarot / T-Motor', leadTimeWeeks: 3, role: 'load-bearing structure' },
    { label: 'Flight battery pack', match: ['battery pack', 'lipo', 'li-ion pack'], critical: true, qty: 2, unit: 'each', defaultUnitCostGbp: 160, supplier: 'Tattu / Molicel pack builder', leadTimeWeeks: 3, role: 'flight energy storage' },
    { label: 'Propeller set', match: ['propeller', 'props'], critical: true, qty: 2, unit: 'set', defaultUnitCostGbp: 30, supplier: 'APC / T-Motor', leadTimeWeeks: 2, role: 'lift generation interface' },
    { label: 'Radio and GNSS link', match: ['radio link', 'gnss', 'gps'], critical: true, qty: 1, unit: 'set', defaultUnitCostGbp: 140, supplier: 'u-blox / Holybro', leadTimeWeeks: 3, role: 'command link and positioning' },
  ],
  modules: [
    { id: 'structure_containment', displayName: 'Structure Containment', purpose: 'Carries propulsion, battery and payload loads with serviceable mounting points.', interfaces: ['payload_mount', 'motor_mounts'], subModules: [{ id: 'airframe', name: 'Carbon airframe', purpose: 'Provides rigid arms, centre plates and payload mounting structure.', partLabels: ['Carbon airframe'], interfaces: ['payload_mount', 'motor_mounts'] }] },
    { id: 'energy_storage_source', displayName: 'Energy Storage Source', purpose: 'Stores flight energy and supplies high-current propulsion loads.', interfaces: ['power_bus', 'charger_interface'], subModules: [{ id: 'flight_battery', name: 'Flight battery pack', purpose: 'Supplies mission energy with pack-level protection and service rotation.', partLabels: ['Flight battery pack'], interfaces: ['power_bus', 'charger_interface'] }] },
    { id: 'actuation_kinematics', displayName: 'Actuation Kinematics', purpose: 'Generates lift and manoeuvre authority through motor-propeller groups.', interfaces: ['power_bus', 'motor_drive', 'motor_mounts'], subModules: [{ id: 'propulsion_set', name: 'Propulsion set', purpose: 'Four motor, ESC and propeller groups.', partLabels: ['Brushless motors', 'ESC', 'Propeller set'], interfaces: ['power_bus', 'motor_drive', 'motor_mounts'] }] },
    { id: 'control_compute_communication', displayName: 'Control Compute Communication', purpose: 'Runs flight control, navigation and command links.', interfaces: ['radio_link', 'sensor_bus', 'motor_drive'], subModules: [{ id: 'flight_stack', name: 'Flight controller stack', purpose: 'Stabilises aircraft and executes flight modes.', partLabels: ['Flight controller', 'Radio and GNSS link'], interfaces: ['sensor_bus', 'radio_link', 'motor_drive'] }] },
    { id: 'sensing_instrumentation', displayName: 'Sensing Instrumentation', purpose: 'Captures cinematography data and navigation state.', interfaces: ['video_link', 'sensor_bus'], subModules: [{ id: 'camera_payload', name: 'Camera payload', purpose: 'Captures 4K video with stabilised mounting.', partLabels: ['4K camera payload'], interfaces: ['video_link', 'sensor_bus'] }] },
  ],
  interfaceLinks: [
    { fromModuleId: 'energy_storage_source', toModuleId: 'actuation_kinematics', via: 'power_bus', reason: 'Flight battery must feed propulsion loads through an explicit power bus.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'actuation_kinematics', via: 'motor_drive', reason: 'Flight controller must command ESC/motor drive outputs.' },
    { fromModuleId: 'control_compute_communication', toModuleId: 'sensing_instrumentation', via: 'sensor_bus', reason: 'Flight controller must receive navigation and payload state.' },
  ],
  standards: [
    { id: 'UK-UAS', title: 'UK unmanned aircraft operating rules', jurisdiction: 'UK', evidenceRequired: 'Mass, geofencing and operating-category evidence.' },
    { id: 'CE-EMC', title: 'CE electromagnetic compatibility', jurisdiction: 'UK/EU', evidenceRequired: 'EMC test plan and declarations.' },
  ],
  risks: [
    { hazard: 'Loss of propulsion', severity: 9, occurrence: 3, detection: 5, mitigation: 'Motor health monitoring and conservative payload limits.' },
    { hazard: 'Battery thermal event', severity: 8, occurrence: 3, detection: 4, mitigation: 'Pack protection, charging limits and enclosure venting.' },
  ],
}

const PACKS: Partial<Record<ProductClass, ClassPack>> = {
  energy_storage: ENERGY_STORAGE_PACK,
  heat_pump: HEAT_PUMP_PACK,
  ev_charger: EV_CHARGER_PACK,
  bioreactor: BIOREACTOR_PACK,
  auv: AUV_PACK,
  edge_ai: EDGE_AI_PACK,
  haps: HAPS_PACK,
  cgm: CGM_PACK,
  vertical_farm: VERTICAL_FARM_PACK,
  drone: DRONE_PACK,
}

export function getClassPack(productClass: ProductClass): ClassPack {
  return PACKS[productClass] ?? { ...GENERIC_PACK, productClass }
}

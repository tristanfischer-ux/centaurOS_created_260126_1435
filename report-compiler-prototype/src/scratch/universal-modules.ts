import type { ArchitectureModel, ComponentWord, ProductClass, ProvenanceRef } from '../schema/types'
import type { ParsedBrief } from '../pipeline/parse-brief'

interface ScratchComponentSpec {
  name: string
  role: string
  quantity?: number
  unit?: string
}

interface ScratchSubModuleSpec {
  id: string
  name: string
  purpose: string
  interfaces: string[]
  components: ScratchComponentSpec[]
}

interface ScratchModuleSpec {
  id: string
  displayName: string
  purpose: string
  interfaces: string[]
  subModules: ScratchSubModuleSpec[]
}

const scratchRef = (productClass: ProductClass): ProvenanceRef => ({
  kind: 'model',
  ref: `scratch_universal_architecture.${productClass}`,
})

export function buildScratchArchitecture(productClass: ProductClass, parsed: ParsedBrief): ArchitectureModel {
  const specs = productClass === 'energy_storage'
    ? energyStorageArchitecture(parsed)
    : productClass === 'heat_pump'
      ? heatPumpArchitecture(parsed)
      : productClass === 'ev_charger'
        ? evChargerArchitecture(parsed)
        : productClass === 'bioreactor'
          ? bioreactorArchitecture(parsed)
          : productClass === 'auv'
            ? auvArchitecture(parsed)
            : productClass === 'edge_ai'
              ? edgeAiArchitecture(parsed)
              : productClass === 'haps'
                ? hapsArchitecture(parsed)
                : productClass === 'cgm'
                  ? cgmArchitecture(parsed)
                  : productClass === 'vertical_farm'
                    ? verticalFarmArchitecture(parsed)
                    : productClass === 'drone'
                      ? droneArchitecture(parsed)
                      : genericArchitecture(productClass)

  return {
    modules: specs.map(module => ({
      id: module.id,
      displayName: module.displayName,
      purpose: module.purpose,
      interfaces: module.interfaces,
      subModules: module.subModules.map(sub => ({
        id: sub.id,
        name: sub.name,
        purpose: sub.purpose,
        interfaces: sub.interfaces,
        words: sub.components.map(component => componentWord(productClass, component)),
      })),
    })),
    crossModuleInterfaces: Array.from(new Set(specs.flatMap(module => module.interfaces))),
  }
}

export function isScratchArchitectureSupported(productClass: ProductClass): boolean {
  return productClass === 'energy_storage' || productClass === 'heat_pump' || productClass === 'ev_charger' || productClass === 'bioreactor' || productClass === 'auv' || productClass === 'edge_ai' || productClass === 'haps' || productClass === 'cgm' || productClass === 'vertical_farm' || productClass === 'drone'
}

function componentWord(productClass: ProductClass, component: ScratchComponentSpec): ComponentWord {
  return {
    id: normaliseId(component.name),
    name: component.name,
    quantity: {
      value: component.quantity ?? 1,
      unit: component.unit ?? 'candidate',
      provenance: [scratchRef(productClass)],
    },
    role: component.role,
    sourceGrade: 'assumption',
    provenance: [scratchRef(productClass)],
  }
}

function energyStorageArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const capacity = parsed.numericFacts.capacity_mwh ?? 3.5
  const power = parsed.numericFacts.power_mw ?? 1
  return [
    {
      id: 'energy_storage_source',
      displayName: 'Energy Storage Source',
      purpose: `Stores roughly ${capacity} MWh usable energy in rack-mounted LFP cell assemblies.`,
      interfaces: ['dc_bus', 'thermal_loop', 'bms_network', 'mechanical_mounts'],
      subModules: [
        sub('cell_string', 'Cell string', 'Electrochemical storage path assembled from series/parallel LFP cells.', ['dc_bus', 'thermal_loop', 'bms_tap_harness'], [
          c('LFP prismatic cells', 'Store electrochemical energy'),
          c('cell-to-cell busbar', 'Conducts current between cell terminals'),
          c('cell terminal hardware set', 'Applies bolted terminal compression'),
          c('cell insulation pad', 'Separates cell cases and terminal hardware'),
          c('module fuse', 'Interrupts string fault current'),
        ]),
        sub('rack_structure', 'Rack structure', 'Constrains cell modules during transport, vibration and cycling expansion.', ['mechanical_mounts', 'service_access'], [
          c('module steel frame', 'Carries cell mass and compression hardware'),
          c('compression plate', 'Applies cell stack preload'),
          c('compression tie rod set', 'Maintains cell compression force'),
          c('module top cover', 'Protects live cell terminals'),
          c('rack label plate', 'Identifies rack and isolation state'),
        ]),
        sub('bms_slave', 'BMS slave board', 'Measures cell voltage and temperature at rack level.', ['bms_network', 'sensor_harness'], [
          c('BMS slave PCB', 'Reads local cell voltages'),
          c('AFE monitor IC', 'Performs precision cell measurement'),
          c('NTC thermistor harness', 'Measures cell temperatures'),
          c('isolated CAN transceiver', 'Reports rack state to master BMS'),
          c('conformal coating', 'Protects PCB in container environment'),
        ]),
        sub('dc_string_output', 'DC string output', 'Combines rack outputs into a protected high-voltage DC path.', ['dc_bus', 'hardwired_trip'], [
          c('DC contactor or breaker', 'Connects and isolates pack output'),
          c('precharge resistor', 'Limits inverter DC-link inrush'),
          c('HV fuse holder', 'Holds string-level protection fuse'),
          c('pack current sensor', 'Measures DC current'),
          c('service disconnect', 'Provides manual isolation'),
        ]),
        sub('module_interconnect_harness', 'Module interconnect harness', 'Routes low-voltage sensing, communications and temperature signals across rack assemblies.', ['bms_tap_harness', 'sensor_harness', 'service_access'], [
          c('cell voltage sense loom', 'Routes cell tap measurements'),
          c('rack CAN drop cable', 'Connects rack BMS communications'),
          c('harness strain relief rail', 'Controls cable bend radius'),
          c('low-smoke cable sleeve', 'Protects low-voltage harnessing'),
        ]),
        sub('rack_thermal_interface', 'Rack thermal interface', 'Couples cell modules to the container thermal loop while preserving service replacement access.', ['thermal_loop', 'mechanical_mounts', 'service_access'], [
          c('rack cold plate manifold', 'Distributes coolant across rack rows'),
          c('thermally conductive gap pad', 'Couples cells to cold surfaces'),
          c('coolant quick connector pair', 'Supports rack replacement'),
          c('rack drip tray', 'Captures service drips'),
          c('leak detection rope', 'Detects coolant leakage below racks'),
        ]),
      ],
    },
    {
      id: 'energy_conversion_transduction',
      displayName: 'Power Conversion System',
      purpose: `Converts the battery DC bus into ${power} MW grid-compatible AC output.`,
      interfaces: ['dc_bus', 'ac_bus', 'modbus_tcp', 'thermal_path', 'hardwired_trip', 'protective_earth'],
      subModules: [
        sub('pcs_inverter', 'PCS inverter bridge', 'Performs bidirectional DC/AC conversion.', ['dc_bus', 'ac_bus', 'modbus_tcp'], [
          c('PCS inverter', 'Performs grid-scale bidirectional power conversion'),
          c('IGBT power module', 'Switches inverter phase legs'),
          c('DC link capacitor bank', 'Buffers DC ripple energy'),
          c('gate driver board', 'Drives semiconductor gates'),
          c('inverter control board', 'Runs conversion control loops'),
          c('liquid-cooled heatsink', 'Rejects switching losses'),
        ]),
        sub('transformer_stage', 'Transformer stage', 'Adapts PCS output voltage to site connection voltage.', ['ac_bus', 'thermal_path'], [
          c('cast resin transformer', 'Transforms AC voltage'),
          c('HV winding', 'Carries high-voltage side current'),
          c('LV winding', 'Carries low-voltage PCS current'),
          c('temperature probe', 'Monitors winding temperature'),
          c('anti-vibration mount', 'Restrains transformer mass'),
        ]),
        sub('grid_filter', 'Grid filter', 'Controls harmonics and conducted emissions.', ['ac_bus', 'protective_earth'], [
          c('grid filter choke', 'Filters inverter switching ripple'),
          c('AC filter capacitor', 'Completes harmonic filter network'),
          c('EMI filter assembly', 'Suppresses conducted noise'),
          c('protective earth bar', 'Bonds filter and enclosure'),
        ]),
        sub('grid_protection_relay', 'Grid protection relay', 'Supervises grid voltage, frequency and trip settings at the point of connection.', ['ac_bus', 'modbus_tcp', 'hardwired_trip', 'protective_earth'], [
          c('grid protection relay', 'Runs grid-code protection logic'),
          c('voltage sensing fuse set', 'Protects relay sensing inputs'),
          c('relay test block', 'Supports injection testing'),
          c('trip circuit monitor', 'Confirms breaker trip path continuity'),
          c('G99 settings label', 'Records commissioned grid settings'),
        ]),
      ],
    },
    {
      id: 'structure_containment',
      displayName: 'Container Structure And Fit-Out',
      purpose: 'Provides weatherproof containment, transport structure and internal segregation.',
      interfaces: ['mechanical_mounts', 'service_access', 'fire_boundary', 'lifting_points', 'protective_earth'],
      subModules: [
        sub('container_shell', 'ISO container shell', 'Forms the weather-tight transportable enclosure.', ['lifting_points', 'service_access'], [
          c('corten steel side panel', 'Forms weather shell'),
          c('corner casting', 'Transfers lifting and transport loads'),
          c('marine plywood floor', 'Supports internal equipment'),
          c('roof panel', 'Closes weather envelope'),
        ]),
        sub('internal_partitions', 'Internal partitions', 'Separates battery, PCS, controls and service zones.', ['fire_boundary', 'service_access'], [
          c('steel stud frame', 'Supports internal walls'),
          c('fire-rated board', 'Provides fire separation'),
          c('mineral wool insulation', 'Improves fire and thermal barrier'),
          c('intumescent sealant', 'Seals penetrations'),
        ]),
        sub('rack_mounting', 'Rack mounting rails', 'Anchors battery racks against transport and seismic loads.', ['mechanical_mounts'], [
          c('floor reinforcement plate', 'Spreads rack loads'),
          c('rack mounting rail', 'Locates battery racks'),
          c('vibration isolator', 'Reduces transport shock'),
          c('anchor bolt set', 'Fastens rack to floor'),
        ]),
        sub('cable_penetration_sealing', 'Cable penetration sealing', 'Seals power, control and auxiliary cable entries through container fire and weather boundaries.', ['fire_boundary', 'service_access', 'protective_earth'], [
          c('gland plate assembly', 'Terminates external cable entries'),
          c('firestop collar set', 'Maintains fire separation at penetrations'),
          c('EMC cable gland', 'Controls shield termination'),
          c('rain drip shield', 'Diverts water from cable entries'),
          c('penetration schedule label', 'Identifies sealed service openings'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Sensing And Instrumentation',
      purpose: 'Measures electrical, thermal and environmental state for operation and safety.',
      interfaces: ['sensor_bus', 'alarm_bus', 'bms_network', 'site_scada'],
      subModules: [
        sub('electrical_measurement', 'Electrical measurement', 'Measures voltage, current and insulation state.', ['sensor_bus', 'dc_bus'], [
          c('DC voltage transducer', 'Measures pack voltage'),
          c('Hall current sensor', 'Measures pack current'),
          c('insulation monitoring device', 'Detects ground faults'),
          c('auxiliary metering transducer', 'Measures auxiliary loads'),
        ]),
        sub('environmental_sensors', 'Environmental sensors', 'Measures container air conditions and gas hazards.', ['sensor_bus', 'alarm_bus'], [
          c('temperature humidity sensor', 'Measures container climate'),
          c('hydrogen detector', 'Detects off-gas hazard'),
          c('smoke aspirating detector', 'Detects early fire signatures'),
          c('door position switch', 'Detects access state'),
        ]),
        sub('thermal_sensors', 'Thermal sensors', 'Tracks coolant and heat exchanger temperatures.', ['sensor_bus', 'thermal_loop'], [
          c('coolant inlet thermistor', 'Measures coolant inlet temperature'),
          c('coolant outlet thermistor', 'Measures coolant outlet temperature'),
          c('flow meter', 'Measures coolant flow'),
          c('pressure transducer', 'Detects loop blockage or leak'),
        ]),
        sub('event_recording', 'Event recording', 'Captures timestamped trips, alarms and measurements for engineering review.', ['sensor_bus', 'alarm_bus', 'site_scada'], [
          c('fault recorder module', 'Records transient events'),
          c('event timestamp logger', 'Maintains chronological alarm records'),
          c('digital input card', 'Captures hardwired alarm states'),
          c('local historian buffer', 'Stores recent operating data'),
          c('calibration certificate holder', 'Keeps sensor evidence with the system'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Control Compute And Communication',
      purpose: 'Coordinates BMS, PCS, auxiliaries and site-level dispatch.',
      interfaces: ['bms_network', 'modbus_tcp', 'sensor_bus', 'alarm_bus', 'site_scada', 'service_access'],
      subModules: [
        sub('bms_master', 'BMS master controller', 'Supervises pack state and protective limits.', ['bms_network', 'hardwired_trip'], [
          c('BMS master controller', 'Runs pack supervisory logic'),
          c('isolation interface', 'Separates high-voltage measurements'),
          c('contactor driver output', 'Commands main contactors'),
          c('SOC estimation firmware', 'Estimates pack state of charge'),
        ]),
        sub('ems_controller', 'EMS controller', 'Dispatches power and monitors system state.', ['modbus_tcp', 'site_scada'], [
          c('industrial controller', 'Runs energy management logic'),
          c('I/O expansion module', 'Collects field signals'),
          c('network switch', 'Connects PCS, BMS and HMI'),
          c('cellular router', 'Provides remote telemetry path'),
        ]),
        sub('communications_gateway', 'Communications gateway', 'Bridges local controls to site and remote systems.', ['site_scada', 'modbus_tcp'], [
          c('Modbus TCP gateway', 'Translates equipment data'),
          c('SCADA protocol adapter', 'Exposes plant data'),
          c('time synchronisation module', 'Maintains event timestamping'),
          c('cybersecurity firewall', 'Separates remote and local networks'),
        ]),
        sub('cybersecurity_monitoring', 'Cybersecurity monitoring', 'Manages secure access, logging and recovery data for remote operation.', ['site_scada', 'modbus_tcp', 'service_access'], [
          c('VPN access appliance', 'Controls secure remote access'),
          c('syslog collector', 'Stores control-network security logs'),
          c('account key switch', 'Enables local maintenance access'),
          c('firmware escrow tag', 'Records approved firmware baseline'),
          c('configuration backup module', 'Stores recoverable controller settings'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Safety Protection And Interlocks',
      purpose: 'Detects unsafe conditions and forces the system into a protected state.',
      interfaces: ['alarm_bus', 'hardwired_trip', 'fire_boundary', 'dc_bus', 'ac_bus', 'service_access'],
      subModules: [
        sub('fire_suppression', 'Fire suppression system', 'Detects and suppresses incipient battery-container fire.', ['alarm_bus', 'fire_boundary'], [
          c('Fire detection/suppression', 'Detects and suppresses battery-container fire events'),
          c('clean-agent cylinder', 'Stores suppression agent'),
          c('release solenoid', 'Triggers agent discharge'),
          c('nozzle pipework', 'Distributes suppression agent'),
          c('pressure switch', 'Confirms bottle pressure'),
        ]),
        sub('emergency_stop', 'Emergency stop chain', 'Trips high-energy paths through hardwired safety logic.', ['hardwired_trip', 'dc_bus', 'ac_bus'], [
          c('E-stop mushroom button', 'Provides local emergency stop'),
          c('safety relay', 'Monitors stop circuit'),
          c('DC shunt trip output', 'Trips DC isolation'),
          c('AC breaker trip coil', 'Trips AC output'),
        ]),
        sub('surge_fault_protection', 'Surge and fault protection', 'Limits transient and overcurrent damage.', ['dc_bus', 'ac_bus', 'protective_earth'], [
          c('DC surge protection device', 'Clamps DC transient voltage'),
          c('AC surge protection device', 'Clamps AC transient voltage'),
          c('arc flash label set', 'Communicates fault energy risk'),
          c('protective earth bonding kit', 'Maintains fault return path'),
        ]),
        sub('deflagration_venting', 'Deflagration venting', 'Provides a controlled pressure relief path if battery off-gas ignition occurs.', ['fire_boundary', 'alarm_bus', 'service_access'], [
          c('pressure relief vent panel', 'Relieves overpressure'),
          c('vent microswitch', 'Reports vent deployment'),
          c('flame arrestor mesh', 'Reduces flame propagation risk'),
          c('vent weather hood', 'Protects vent opening from rain'),
          c('post-event inspection tag', 'Marks required inspection state'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Environmental Interface',
      purpose: 'Maintains the container operating envelope across weather and heat loads.',
      interfaces: ['thermal_loop', 'thermal_path', 'electrical_power', 'sensor_bus', 'service_access'],
      subModules: [
        sub('hvac_unit', 'HVAC unit', 'Controls air temperature and humidity inside compartments.', ['electrical_power', 'thermal_loop', 'thermal_path', 'sensor_bus'], [
          c('container HVAC unit', 'Conditions container air'),
          c('air filter element', 'Filters inlet air'),
          c('condensate drain kit', 'Removes condensate'),
          c('HVAC controller', 'Controls compressor and fans'),
        ]),
        sub('ventilation_path', 'Ventilation path', 'Directs airflow around PCS, controls and service areas.', ['thermal_loop', 'thermal_path', 'service_access'], [
          c('intake louvre', 'Admits controlled airflow'),
          c('exhaust louvre', 'Exhausts warm air'),
          c('EC fan assembly', 'Moves compartment air'),
          c('airflow baffle', 'Directs cooling air'),
        ]),
        sub('thermal_insulation', 'Thermal insulation', 'Reduces ambient heat transfer into the container.', ['fire_boundary', 'thermal_path'], [
          c('insulation panel', 'Reduces heat ingress'),
          c('vapour barrier film', 'Controls moisture ingress'),
          c('thermal break strip', 'Reduces cold bridge'),
          c('seal gasket set', 'Maintains enclosure sealing'),
        ]),
        sub('heat_rejection_coil', 'Heat rejection coil', 'Rejects battery and PCS heat from the coolant loop to outdoor air.', ['thermal_loop', 'thermal_path', 'electrical_power', 'service_access'], [
          c('dry cooler coil', 'Rejects coolant heat'),
          c('EC condenser fan', 'Moves outdoor air across coil'),
          c('fan contactor', 'Switches heat rejection fans'),
          c('coil guard grille', 'Protects heat exchanger fins'),
          c('drain-safe condensate pan', 'Routes moisture away from electrics'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'DC And AC Power Distribution',
      purpose: 'Routes high-voltage DC, grid AC and auxiliary power through protected paths.',
      interfaces: ['dc_bus', 'ac_bus', 'electrical_power', 'protective_earth', 'hardwired_trip'],
      subModules: [
        sub('dc_busbars', 'Main DC busbars', 'Carries pack current from racks to PCS.', ['dc_bus', 'service_access'], [
          c('copper DC busbar', 'Carries high-current DC'),
          c('busbar support insulator', 'Supports live busbars'),
          c('busbar shroud', 'Protects against accidental touch'),
          c('torque witness marker', 'Shows bolted-joint verification'),
        ]),
        sub('ac_switchgear', 'AC switchgear', 'Connects PCS output to site AC connection.', ['ac_bus', 'protective_earth', 'hardwired_trip'], [
          c('moulded-case circuit breaker', 'Protects AC output'),
          c('AC contactor', 'Connects output under command'),
          c('metering CT set', 'Measures AC current'),
          c('terminal block assembly', 'Terminates field wiring'),
        ]),
        sub('auxiliary_power', 'Auxiliary power distribution', 'Supplies controls, HVAC, pumps and service loads.', ['electrical_power', 'protective_earth'], [
          c('auxiliary transformer', 'Steps down service voltage'),
          c('24 V DC power supply', 'Feeds controls'),
          c('miniature circuit breaker bank', 'Protects auxiliary circuits'),
          c('UPS module', 'Maintains controls during ride-through'),
        ]),
        sub('earthing_lightning', 'Earthing and lightning protection', 'Bonds exposed metalwork and surge devices to a verifiable protective-earth network.', ['protective_earth', 'service_access'], [
          c('main earth bar', 'Collects protective conductors'),
          c('earth stud array', 'Bonds removable panels'),
          c('lightning surge counter', 'Records surge events'),
          c('equipotential bonding strap', 'Bonds doors and covers'),
          c('earth continuity test point', 'Supports commissioning checks'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Maintenance And Serviceability',
      purpose: 'Lets technicians inspect, isolate, lift and replace internal assemblies safely.',
      interfaces: ['service_access', 'lifting_points', 'protective_earth', 'sensor_bus', 'dc_bus'],
      subModules: [
        sub('access_doors', 'Access doors and hardware', 'Provides controlled entry to service zones.', ['service_access'], [
          c('lockable access door', 'Controls service entry'),
          c('door seal gasket', 'Maintains IP rating'),
          c('panic release latch', 'Allows emergency exit'),
          c('door stay arm', 'Holds door open during service'),
        ]),
        sub('service_lighting', 'Service lighting', 'Illuminates work zones during inspection.', ['electrical_power', 'service_access'], [
          c('LED service luminaire', 'Lights service aisle'),
          c('emergency light fitting', 'Provides backup lighting'),
          c('maintenance receptacle', 'Powers service tools'),
          c('lighting switchgear', 'Controls service lighting'),
        ]),
        sub('lifting_handling', 'Lifting and handling points', 'Supports transport, installation and module replacement.', ['lifting_points', 'mechanical_mounts'], [
          c('certified lifting lug', 'Provides lifting attachment'),
          c('forklift pocket reinforcement', 'Accepts forklift loads'),
          c('removable rack guide', 'Guides rack replacement'),
          c('service trolley interface', 'Supports module extraction'),
        ]),
        sub('commissioning_ports', 'Commissioning ports', 'Provides controlled access points for electrical, coolant and controller commissioning checks.', ['service_access', 'sensor_bus', 'dc_bus'], [
          c('insulated test socket', 'Supports safe voltage checks'),
          c('coolant sampling port', 'Allows coolant quality sampling'),
          c('laptop service port', 'Connects commissioning tools'),
          c('lockout hasp rail', 'Supports isolation lockout'),
          c('commissioning torque log plate', 'Records critical joint checks'),
        ]),
      ],
    },
    {
      id: 'mass_fluid_transport_process',
      displayName: 'Coolant Circulation Process',
      purpose: 'Moves coolant through battery racks, heat exchangers and serviceable filters.',
      interfaces: ['thermal_loop', 'sensor_bus', 'service_access', 'electrical_power'],
      subModules: [
        sub('pump_station', 'Coolant pump station', 'Circulates coolant through rack cold plates.', ['thermal_loop', 'electrical_power', 'sensor_bus'], [
          c('Thermal management loop', 'Moves heat from battery racks to heat rejection equipment'),
          c('coolant circulation pump', 'Moves coolant'),
          c('pump VFD', 'Controls pump speed'),
          c('check valve', 'Prevents reverse flow'),
          c('isolation valve', 'Allows service isolation'),
        ]),
        sub('filtration_treatment', 'Filtration and treatment', 'Maintains coolant cleanliness and chemistry.', ['thermal_loop', 'service_access'], [
          c('coolant filter housing', 'Captures particulates'),
          c('replaceable filter cartridge', 'Filters coolant'),
          c('glycol concentration sensor', 'Monitors coolant mix'),
          c('fill and drain manifold', 'Supports commissioning and service'),
        ]),
        sub('expansion_air_removal', 'Expansion and air removal', 'Accommodates fluid expansion and removes trapped air.', ['thermal_loop', 'sensor_bus'], [
          c('expansion vessel', 'Absorbs coolant expansion'),
          c('automatic air vent', 'Removes entrained air'),
          c('pressure relief valve', 'Protects loop from overpressure'),
          c('low pressure switch', 'Detects coolant loss'),
        ]),
        sub('heat_exchanger_manifold', 'Heat exchanger manifold', 'Transfers rack heat into the outdoor heat rejection path while preserving service bypass options.', ['thermal_loop', 'service_access', 'sensor_bus'], [
          c('plate heat exchanger', 'Transfers heat between coolant circuits'),
          c('temperature balancing valve', 'Controls heat exchanger flow split'),
          c('purge valve set', 'Supports air removal and draining'),
          c('service bypass loop', 'Allows heat exchanger isolation'),
          c('insulated hose set', 'Connects thermal loop branches'),
        ]),
      ],
    },
    {
      id: 'hmi_ergonomics',
      displayName: 'Operator HMI And Labelling',
      purpose: 'Presents system status, controls access and communicates hazards to operators.',
      interfaces: ['site_scada', 'service_access', 'alarm_bus'],
      subModules: [
        sub('local_hmi', 'Local HMI panel', 'Provides local status, alarms and manual controls.', ['site_scada', 'service_access'], [
          c('industrial touchscreen', 'Displays system state'),
          c('panel PC', 'Hosts local HMI runtime'),
          c('key switch', 'Controls operating mode'),
          c('alarm buzzer beacon', 'Announces local alarms'),
        ]),
        sub('external_labelling', 'External labelling', 'Communicates hazards and service instructions.', ['service_access'], [
          c('high voltage warning label', 'Marks hazardous voltage'),
          c('arc flash boundary label', 'Marks approach boundary'),
          c('fire suppression instruction placard', 'Explains suppression response'),
          c('asset QR label', 'Links asset record'),
        ]),
        sub('operator_workflow', 'Operator workflow aids', 'Supports safe inspection and reset actions.', ['service_access', 'alarm_bus'], [
          c('laminated isolation checklist', 'Guides isolation sequence'),
          c('inspection log holder', 'Stores service records'),
          c('status stack light', 'Shows operating state'),
          c('manual reset station', 'Resets safety chain after inspection'),
        ]),
        sub('remote_notification', 'Remote notification interface', 'Routes actionable alarms to the site operator while preventing unsafe remote reset.', ['site_scada', 'alarm_bus', 'service_access'], [
          c('operator notification relay', 'Publishes priority alarms'),
          c('SMS alarm output module', 'Sends fallback alarm messages'),
          c('alarm acknowledgement button', 'Records local acknowledgement'),
          c('escalation contact label', 'Lists response contacts'),
          c('remote reset inhibit relay', 'Blocks unsafe remote reset'),
        ]),
      ],
    },
  ]
}

function heatPumpArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const thermalOutput = parsed.numericFacts.thermal_output_kw ?? 8
  const cop = parsed.numericFacts.cop ?? 3.5
  return [
    {
      id: 'energy_conversion_transduction',
      displayName: 'Refrigerant Energy Conversion',
      purpose: `Moves roughly ${thermalOutput} kW of useful heat with a target COP near ${cop}.`,
      interfaces: ['refrigerant_loop', 'hydronic_loop', 'control_bus', 'protective_earth', 'service_access'],
      subModules: [
        sub('compressor_inverter_stage', 'Compressor inverter stage', 'Raises refrigerant pressure while modulating thermal output.', ['refrigerant_loop', 'control_bus', 'protective_earth'], [
          c('Inverter scroll compressor', 'Compresses refrigerant vapour'),
          c('compressor inverter drive', 'Modulates compressor speed'),
          c('compressor mounting grommet set', 'Isolates vibration'),
          c('crankcase heater band', 'Manages refrigerant migration'),
        ]),
        sub('expansion_metering_stage', 'Expansion metering stage', 'Meters refrigerant into the outdoor coil across operating conditions.', ['refrigerant_loop', 'control_bus', 'service_access'], [
          c('Electronic expansion valve', 'Meters refrigerant flow'),
          c('EEV stepper harness', 'Connects expansion valve command'),
          c('liquid-line filter drier', 'Removes moisture and debris'),
          c('sight glass indicator', 'Supports service diagnosis'),
        ]),
        sub('refrigerant_manifold', 'Refrigerant manifold', 'Routes refrigerant between compressor, evaporator, condenser and service points.', ['refrigerant_loop', 'service_access'], [
          c('copper refrigerant tube set', 'Routes refrigerant'),
          c('service valve pair', 'Supports evacuation and charging'),
          c('brazed joint sleeve set', 'Protects tube joints'),
          c('refrigerant charge label', 'Records charge and refrigerant type'),
        ]),
        sub('condenser_coupling_boundary', 'Condenser coupling boundary', 'Defines the refrigerant-to-water handoff into the hydronic heat-delivery module.', ['refrigerant_loop', 'hydronic_loop', 'sensor_bus', 'service_access'], [
          c('refrigerant stub-out pair', 'Terminates refrigerant side of condenser handoff'),
          c('hydronic stub-out pair', 'Terminates water side of condenser handoff'),
          c('plate heat exchanger mounting bracket', 'Holds condenser interface in service position'),
          c('condenser insulation sleeve', 'Reduces heat loss at the handoff'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Outdoor Air Interface',
      purpose: 'Extracts ambient heat while managing airflow, frost and condensate.',
      interfaces: ['refrigerant_loop', 'airflow_path', 'condensate_drain', 'sensor_bus'],
      subModules: [
        sub('outdoor_evaporator', 'Outdoor evaporator', 'Transfers ambient heat into the refrigerant loop.', ['refrigerant_loop', 'airflow_path', 'sensor_bus'], [
          c('Outdoor finned evaporator coil', 'Absorbs ambient heat'),
          c('coil temperature sensor', 'Detects frost conditions'),
          c('coil guard grille', 'Protects finned coil'),
          c('hydrophilic fin coating', 'Improves condensate shedding'),
        ]),
        sub('fan_air_path', 'Fan air path', 'Drives controlled airflow through the coil face.', ['airflow_path', 'control_bus', 'protective_earth'], [
          c('Variable-speed fan assembly', 'Moves outdoor air'),
          c('EC fan motor controller', 'Controls fan speed'),
          c('fan shroud', 'Controls air recirculation'),
          c('inlet debris screen', 'Blocks leaves and debris'),
        ]),
        sub('defrost_condensate', 'Defrost and condensate path', 'Controls frost meltwater and drainage away from the outdoor unit.', ['condensate_drain', 'sensor_bus', 'service_access'], [
          c('condensate drain tray', 'Collects meltwater'),
          c('trace heater cable', 'Prevents drain ice blockage'),
          c('defrost temperature probe', 'Triggers defrost decisions'),
          c('drain hose barb', 'Connects condensate line'),
        ]),
      ],
    },
    {
      id: 'mass_fluid_transport_process',
      displayName: 'Hydronic Heat Delivery',
      purpose: 'Transfers condenser heat into the building water circuit with protected flow.',
      interfaces: ['hydronic_loop', 'pressure_relief', 'sensor_bus', 'service_access'],
      subModules: [
        sub('condenser_heat_exchanger', 'Condenser heat exchanger', 'Transfers refrigerant heat to the water loop.', ['refrigerant_loop', 'hydronic_loop', 'sensor_bus'], [
          c('Brazed plate heat exchanger', 'Transfers heat to water'),
          c('plate exchanger insulation jacket', 'Reduces standby losses'),
          c('water outlet temperature sensor', 'Measures delivered heat'),
          c('refrigerant outlet temperature sensor', 'Supports superheat/subcooling checks'),
        ]),
        sub('circulation_pump_group', 'Circulation pump group', 'Maintains water flow through the condenser and heating circuit.', ['hydronic_loop', 'control_bus', 'protective_earth'], [
          c('Hydronic circulation pump', 'Circulates heating water'),
          c('pump isolation valve pair', 'Supports service removal'),
          c('flow proving switch', 'Confirms water movement'),
          c('strainer filter', 'Protects heat exchanger passages'),
        ]),
        sub('hydronic_safety_group', 'Hydronic safety group', 'Limits water pressure and allows commissioning service.', ['hydronic_loop', 'pressure_relief', 'service_access'], [
          c('Hydronic safety valve kit', 'Protects water loop pressure'),
          c('expansion vessel', 'Absorbs water expansion'),
          c('automatic air vent', 'Purges trapped air'),
          c('fill and drain valve set', 'Supports commissioning'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Control Compute Communication',
      purpose: 'Coordinates refrigerant, fan, pump, defrost and user-demand states.',
      interfaces: ['control_bus', 'sensor_bus', 'service_port', 'alarm_bus'],
      subModules: [
        sub('main_controller', 'Main controller', 'Runs heating, hot-water, anti-freeze and defrost state machines.', ['control_bus', 'sensor_bus', 'service_port'], [
          c('Heat pump controller PCB', 'Runs control logic'),
          c('controller enclosure', 'Protects control board'),
          c('real-time clock module', 'Schedules heat and defrost logic'),
          c('non-volatile fault memory', 'Stores fault history'),
        ]),
        sub('power_driver_io', 'Power driver IO', 'Switches controlled loads and reads discrete safety inputs.', ['control_bus', 'protective_earth', 'alarm_bus'], [
          c('compressor contactor', 'Switches compressor supply'),
          c('pump relay output', 'Switches hydronic pump'),
          c('fan PWM output board', 'Commands EC fan speed'),
          c('safety chain input terminal', 'Reads cut-outs and interlocks'),
        ]),
        sub('service_communications', 'Service communications', 'Exposes commissioning and diagnostics to installers.', ['service_port', 'sensor_bus'], [
          c('Modbus service port', 'Exposes operating data'),
          c('USB commissioning adapter', 'Supports setup'),
          c('fault LED stack', 'Shows alarm state'),
          c('installer QR code label', 'Links service documentation'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Sensing Instrumentation',
      purpose: 'Measures refrigerant, water and ambient state for safety and efficiency.',
      interfaces: ['sensor_bus', 'refrigerant_loop', 'hydronic_loop', 'airflow_path'],
      subModules: [
        sub('refrigerant_sensing', 'Refrigerant sensing', 'Measures pressure and temperature around the refrigerant circuit.', ['sensor_bus', 'refrigerant_loop'], [
          c('Refrigerant sensor and pressure transducers', 'Measures refrigerant pressure'),
          c('suction temperature probe', 'Measures compressor inlet temperature'),
          c('discharge temperature probe', 'Protects compressor outlet'),
          c('refrigerant leak sensor', 'Detects refrigerant release'),
        ]),
        sub('water_sensing', 'Water sensing', 'Measures water-loop temperatures and flow evidence.', ['sensor_bus', 'hydronic_loop'], [
          c('flow temperature sensor', 'Measures leaving water temperature'),
          c('return temperature sensor', 'Measures entering water temperature'),
          c('flow meter cartridge', 'Measures hydronic flow'),
          c('water pressure transducer', 'Measures system pressure'),
        ]),
        sub('ambient_sensing', 'Ambient sensing', 'Measures external conditions that affect capacity and defrost.', ['sensor_bus', 'airflow_path'], [
          c('ambient temperature sensor', 'Measures outdoor temperature'),
          c('ambient humidity sensor', 'Estimates frost risk'),
          c('air pressure switch', 'Detects blocked airflow'),
          c('rain ingress sensor', 'Detects enclosure water ingress'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Electrical Power Distribution',
      purpose: 'Distributes mains power to compressor, fan, pump, controller and auxiliaries.',
      interfaces: ['mains_supply', 'protective_earth', 'control_bus', 'service_access'],
      subModules: [
        sub('mains_input_protection', 'Mains input protection', 'Provides isolation and over-current protection at the unit boundary.', ['mains_supply', 'protective_earth', 'service_access'], [
          c('lockable isolator switch', 'Disconnects mains input'),
          c('MCB breaker set', 'Protects branch circuits'),
          c('RCD protection device', 'Protects against earth leakage'),
          c('surge protection device', 'Limits transient voltage'),
        ]),
        sub('internal_power_rails', 'Internal power rails', 'Creates protected rails for control and auxiliary loads.', ['mains_supply', 'control_bus', 'protective_earth'], [
          c('24 V DC power supply', 'Feeds controller inputs'),
          c('terminal rail assembly', 'Distributes power wiring'),
          c('fused auxiliary terminal', 'Protects auxiliary outputs'),
          c('protective earth bar', 'Bonds conductive parts'),
        ]),
        sub('cable_management', 'Cable management', 'Separates mains, sensor and refrigerant-adjacent wiring.', ['service_access', 'sensor_bus', 'control_bus'], [
          c('segregated cable duct', 'Separates voltage classes'),
          c('IP-rated cable gland set', 'Seals cable entries'),
          c('EMC ferrite clamp set', 'Reduces conducted noise'),
          c('wiring diagram label', 'Supports field service'),
        ]),
      ],
    },
    {
      id: 'structure_containment',
      displayName: 'Monobloc Structure And Containment',
      purpose: 'Contains the refrigeration system, controls airflow and supports outdoor mounting.',
      interfaces: ['airflow_path', 'condensate_drain', 'service_access', 'mechanical_mounts'],
      subModules: [
        sub('weatherproof_cabinet', 'Weatherproof cabinet', 'Protects refrigerant, electrical and hydronic assemblies outdoors.', ['airflow_path', 'service_access', 'protective_earth'], [
          c('galvanised steel cabinet', 'Houses assemblies'),
          c('powder-coated access panel', 'Provides service opening'),
          c('EPDM door gasket', 'Seals enclosure'),
          c('IP-rated fastener set', 'Secures panels'),
        ]),
        sub('mounting_base', 'Mounting base', 'Carries compressor mass and isolates installation vibration.', ['mechanical_mounts', 'condensate_drain'], [
          c('anti-vibration foot set', 'Isolates unit vibration'),
          c('base rail pair', 'Supports outdoor unit'),
          c('condensate fall spacer', 'Maintains drain slope'),
          c('lifting lug set', 'Supports handling'),
        ]),
        sub('service_access_panels', 'Service access panels', 'Creates access for commissioning and repair without dismantling the unit.', ['service_access'], [
          c('removable service panel', 'Opens refrigerant bay'),
          c('hinged controller cover', 'Opens electrical bay'),
          c('quarter-turn latch set', 'Secures panels'),
          c('service clearance label', 'Marks required clearances'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Safety Protection',
      purpose: 'Protects against refrigerant, pressure, electrical and freeze hazards.',
      interfaces: ['pressure_relief', 'alarm_bus', 'protective_earth', 'sensor_bus'],
      subModules: [
        sub('refrigerant_safety', 'Refrigerant safety', 'Detects abnormal refrigerant conditions and defines response paths.', ['refrigerant_loop', 'sensor_bus', 'alarm_bus'], [
          c('high-pressure cut-out switch', 'Trips unsafe pressure'),
          c('low-pressure cut-out switch', 'Detects loss of charge'),
          c('refrigerant leak alarm output', 'Signals leak condition'),
          c('refrigerant warning label', 'Communicates refrigerant hazard'),
        ]),
        sub('hydronic_freeze_protection', 'Hydronic freeze protection', 'Prevents water-loop freeze damage in low ambient conditions.', ['hydronic_loop', 'sensor_bus', 'control_bus'], [
          c('anti-freeze thermostat', 'Detects freeze risk'),
          c('backup immersion heater relay', 'Commands freeze protection heat'),
          c('drain-down instruction label', 'Guides winter service'),
          c('glycol compatibility tag', 'Records fluid constraints'),
        ]),
        sub('electrical_safety', 'Electrical safety', 'Maintains protection and earthing integrity.', ['protective_earth', 'mains_supply', 'alarm_bus'], [
          c('earth continuity test point', 'Supports verification'),
          c('touch-safe terminal cover', 'Protects service personnel'),
          c('over-temperature cut-out', 'Trips overheated circuits'),
          c('safety compliance label', 'Records ratings and approvals'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Maintenance And Commissioning',
      purpose: 'Supports installation, refrigerant service, hydronic flushing and periodic inspection.',
      interfaces: ['service_access', 'service_port', 'refrigerant_loop', 'hydronic_loop'],
      subModules: [
        sub('commissioning_ports', 'Commissioning ports', 'Provides controlled access to refrigerant and water commissioning points.', ['service_access', 'refrigerant_loop', 'hydronic_loop'], [
          c('refrigerant service port cap set', 'Protects service valves'),
          c('hydronic drain cock', 'Supports filling and flushing'),
          c('pressure gauge pocket', 'Supports temporary measurement'),
          c('commissioning checklist card', 'Guides setup'),
        ]),
        sub('filter_service', 'Filter service', 'Keeps hydronic and air paths maintainable.', ['service_access', 'hydronic_loop', 'airflow_path'], [
          c('cleanable Y-strainer basket', 'Captures water debris'),
          c('coil cleaning access cover', 'Opens coil face'),
          c('service interval label', 'Marks inspection cadence'),
          c('spare gasket kit', 'Supports service reseal'),
        ]),
        sub('diagnostic_access', 'Diagnostic access', 'Lets technicians verify states without dismantling assemblies.', ['service_port', 'sensor_bus', 'control_bus'], [
          c('diagnostic test header', 'Exposes sensor and IO checks'),
          c('fault code label', 'Explains service faults'),
          c('data log export button', 'Downloads history'),
          c('installer handover record', 'Captures commissioning values'),
        ]),
      ],
    },
    {
      id: 'hmi_ergonomics',
      displayName: 'User And Installer Interface',
      purpose: 'Presents operating mode, alarms and service instructions to users and installers.',
      interfaces: ['service_port', 'alarm_bus', 'control_bus'],
      subModules: [
        sub('local_display', 'Local display', 'Shows heat-pump status and permits basic configuration.', ['control_bus', 'service_port'], [
          c('LCD status display', 'Shows operating state'),
          c('menu button membrane', 'Allows local setup'),
          c('weatherproof display window', 'Protects display'),
          c('mode indicator LED set', 'Shows heat/DHW/defrost state'),
        ]),
        sub('remote_thermostat_interface', 'Remote thermostat interface', 'Connects building demand to heat pump control.', ['control_bus', 'service_port'], [
          c('thermostat input terminal', 'Receives heat demand'),
          c('Modbus room controller link', 'Connects remote controller'),
          c('demand signal opto-isolator', 'Protects controller input'),
          c('installer wiring label', 'Shows field terminals'),
        ]),
        sub('alarm_and_user_guidance', 'Alarm and user guidance', 'Communicates faults and safe user actions.', ['alarm_bus', 'service_access'], [
          c('alarm relay output', 'Signals external faults'),
          c('user quick-start label', 'Explains operation'),
          c('fault reset button', 'Allows controlled reset'),
          c('QR service documentation label', 'Links user/service docs'),
        ]),
      ],
    },
  ]
}

function evChargerArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const dcPowerKw = parsed.numericFacts.dc_power_kw ?? 150
  return [
    {
      id: 'power_distribution',
      displayName: 'AC Input And DC Output Distribution',
      purpose: `Protects the incoming supply and DC output path for a roughly ${dcPowerKw} kW charger.`,
      interfaces: ['ac_input_bus', 'dc_output_bus', 'protective_earth', 'metering_bus', 'service_access'],
      subModules: [
        sub('ac_input_switchgear', 'AC input switchgear', 'Protects and isolates the grid connection before conversion.', ['ac_input_bus', 'protective_earth', 'service_access'], [
          c('AC input breaker and SPD', 'Protects charger input'),
          c('lockable AC isolator', 'Supports service isolation'),
          c('surge arrestor cartridge', 'Limits transients'),
          c('input terminal shroud', 'Covers live terminals'),
        ]),
        sub('dc_output_switchgear', 'DC output switchgear', 'Connects and isolates the charging output path.', ['dc_output_bus', 'control_bus', 'protective_earth'], [
          c('DC output contactor set', 'Isolates charging output'),
          c('precharge resistor module', 'Limits DC-link inrush'),
          c('DC output fuse carrier', 'Protects output faults'),
          c('output polarity label', 'Marks DC terminals'),
        ]),
        sub('billing_metering_branch', 'Billing metering branch', 'Measures delivered energy and exposes metering data to control.', ['metering_bus', 'dc_output_bus', 'service_access'], [
          c('MID energy meter', 'Measures billable energy'),
          c('meter CT shunt set', 'Measures charging current'),
          c('meter seal kit', 'Supports tamper evidence'),
          c('meter calibration label', 'Records calibration status'),
        ]),
      ],
    },
    {
      id: 'energy_conversion_transduction',
      displayName: 'Power Conversion Stack',
      purpose: 'Converts protected AC input into controlled high-power DC output.',
      interfaces: ['ac_input_bus', 'dc_output_bus', 'coolant_loop', 'control_bus', 'protective_earth'],
      subModules: [
        sub('rectifier_power_modules', 'Rectifier power modules', 'Performs modular AC/DC conversion.', ['ac_input_bus', 'dc_output_bus', 'coolant_loop', 'control_bus'], [
          c('Power module stack', 'Converts AC to regulated DC'),
          c('power module backplane', 'Connects modules to busbars'),
          c('module locking rail', 'Retains pluggable modules'),
          c('DC-link capacitor bank', 'Stabilises DC output'),
        ]),
        sub('output_filtering', 'Output filtering', 'Reduces ripple and conducted emissions on charging output.', ['dc_output_bus', 'protective_earth'], [
          c('DC output choke', 'Filters output ripple'),
          c('EMI filter assembly', 'Reduces conducted noise'),
          c('snubber network board', 'Limits switching transients'),
          c('thermal interface pad set', 'Couples heat to cold plate'),
        ]),
        sub('converter_supervision', 'Converter supervision', 'Monitors module health and coordinates derating.', ['control_bus', 'sensor_bus', 'coolant_loop'], [
          c('module health monitor board', 'Reads converter status'),
          c('heatsink temperature probe', 'Measures converter temperature'),
          c('fan/coolant derating table', 'Defines thermal derating'),
          c('firmware recovery jumper', 'Supports service recovery'),
        ]),
      ],
    },
    {
      id: 'charging_connector_interface',
      displayName: 'Vehicle Charging Interface',
      purpose: 'Presents the CCS2 conductive and communication interface to the vehicle.',
      interfaces: ['dc_output_bus', 'ccs2_vehicle_interface', 'iso15118_plc', 'control_pilot', 'protective_earth'],
      subModules: [
        sub('ccs2_cable_connector', 'CCS2 cable connector', 'Routes high-current DC and proximity/pilot connections.', ['dc_output_bus', 'ccs2_vehicle_interface', 'control_pilot', 'protective_earth'], [
          c('CCS2 liquid-cooled cable and connector', 'Connects charger to vehicle'),
          c('connector temperature sensor pair', 'Measures plug heating'),
          c('proximity pilot resistor set', 'Signals cable capability'),
          c('cable strain relief boot', 'Controls cable bending'),
        ]),
        sub('connector_cooling_coupling', 'Connector cooling coupling', 'Connects high-current cable cooling to the charger thermal loop.', ['coolant_loop', 'ccs2_vehicle_interface', 'service_access'], [
          c('liquid-cooled cable manifold', 'Feeds connector coolant'),
          c('quick-connect coolant coupler', 'Supports cable service'),
          c('coolant leak catch tray', 'Contains connector leaks'),
          c('cable coolant temperature probe', 'Monitors connector cooling'),
        ]),
        sub('vehicle_communication_frontend', 'Vehicle communication frontend', 'Handles control pilot and PLC communication with the vehicle.', ['iso15118_plc', 'control_pilot', 'control_bus'], [
          c('ISO 15118 PLC modem', 'Handles vehicle PLC communication'),
          c('control pilot interface board', 'Generates pilot signalling'),
          c('proximity detection input', 'Detects connector latch state'),
          c('vehicle comms isolation transformer', 'Isolates PLC path'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Control Compute Communication',
      purpose: 'Coordinates charge sessions, power-module commands, backend state and safety reactions.',
      interfaces: ['control_bus', 'iso15118_plc', 'ocpp_network', 'metering_bus', 'alarm_bus', 'service_port'],
      subModules: [
        sub('charge_controller', 'Charge controller', 'Runs session state, output limits and fault transitions.', ['control_bus', 'metering_bus', 'alarm_bus'], [
          c('charge controller PCB', 'Runs charger state machine'),
          c('safety IO terminal block', 'Reads interlock states'),
          c('real-time clock module', 'Timestamps sessions'),
          c('nonvolatile event log memory', 'Stores faults and sessions'),
        ]),
        sub('backend_gateway', 'Backend gateway', 'Connects the charge point to operator systems.', ['ocpp_network', 'service_port'], [
          c('OCPP communications gateway', 'Connects backend protocol'),
          c('LTE router module', 'Provides cellular backhaul'),
          c('ethernet surge protector', 'Protects wired network'),
          c('secure element module', 'Stores certificates'),
        ]),
        sub('protocol_stack', 'Vehicle protocol stack', 'Coordinates ISO 15118, cable limits and metering sessions.', ['iso15118_plc', 'control_bus', 'metering_bus'], [
          c('ISO 15118 PLC modem', 'Talks to vehicle'),
          c('Plug and Charge certificate store', 'Stores contract certificates'),
          c('charging session firmware image', 'Implements session logic'),
          c('protocol debug header', 'Supports commissioning'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Metering And Electrical Sensing',
      purpose: 'Measures billing energy, voltage, current, insulation and connector state.',
      interfaces: ['metering_bus', 'dc_output_bus', 'insulation_monitoring', 'sensor_bus', 'control_bus'],
      subModules: [
        sub('energy_metering', 'Energy metering', 'Measures energy delivered to the vehicle.', ['metering_bus', 'dc_output_bus'], [
          c('MID energy meter', 'Measures billable kWh'),
          c('DC voltage transducer', 'Measures charger output voltage'),
          c('DC current shunt', 'Measures charger output current'),
          c('meter pulse output isolator', 'Isolates meter pulses'),
        ]),
        sub('insulation_fault_detection', 'Insulation fault detection', 'Detects loss of isolation on the DC charging path.', ['insulation_monitoring', 'dc_output_bus', 'alarm_bus'], [
          c('Insulation monitoring device', 'Detects DC insulation faults'),
          c('IMD coupling network', 'Connects monitor to DC bus'),
          c('fault status relay', 'Reports insulation faults'),
          c('test resistor plug', 'Supports IMD commissioning'),
        ]),
        sub('connector_sensing', 'Connector sensing', 'Monitors cable, latch and temperature states.', ['sensor_bus', 'ccs2_vehicle_interface', 'control_pilot'], [
          c('connector latch microswitch', 'Detects latch engagement'),
          c('handle temperature sensor', 'Monitors connector heating'),
          c('cable identification resistor reader', 'Reads cable rating'),
          c('holster presence switch', 'Detects parked connector'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Thermal And Environmental Interface',
      purpose: 'Rejects power-electronics and cable heat while protecting outdoor electronics.',
      interfaces: ['coolant_loop', 'airflow_path', 'condensate_drain', 'service_access', 'protective_earth'],
      subModules: [
        sub('liquid_cooling_loop', 'Liquid cooling loop', 'Circulates coolant through power modules and liquid-cooled cable.', ['coolant_loop', 'sensor_bus', 'service_access'], [
          c('Cooling loop assembly', 'Controls charger heat'),
          c('coolant pump', 'Moves coolant'),
          c('plate radiator', 'Rejects coolant heat'),
          c('coolant reservoir', 'Stores expansion volume'),
        ]),
        sub('thermal_air_path', 'Thermal air path', 'Moves air through cabinet heat exchangers and filters.', ['airflow_path', 'coolant_loop', 'protective_earth'], [
          c('cabinet fan tray', 'Moves cooling air'),
          c('inlet filter mat', 'Protects electronics from dust'),
          c('exhaust louvre assembly', 'Controls discharge path'),
          c('airflow proving switch', 'Detects fan failure'),
        ]),
        sub('weatherproofing', 'Weatherproofing', 'Protects the charger from rain, condensation and UV exposure.', ['condensate_drain', 'service_access'], [
          c('cabinet drain grommet', 'Routes condensate'),
          c('door gasket set', 'Seals cabinet doors'),
          c('anti-condensation heater', 'Reduces internal moisture'),
          c('UV-rated cable cover', 'Protects exposed cable'),
        ]),
      ],
    },
    {
      id: 'structure_containment',
      displayName: 'Cabinet Structure And Containment',
      purpose: 'Houses high-power electronics, cable management and outdoor installation features.',
      interfaces: ['mechanical_mounts', 'service_access', 'protective_earth', 'ccs2_vehicle_interface'],
      subModules: [
        sub('outdoor_cabinet', 'Outdoor cabinet', 'Carries power electronics and protects against weather and impact.', ['mechanical_mounts', 'service_access', 'protective_earth'], [
          c('powder-coated steel cabinet', 'Houses charger assemblies'),
          c('front service door', 'Opens maintenance access'),
          c('anti-vandal hinge set', 'Protects door fixings'),
          c('plinth mounting kit', 'Anchors charger to foundation'),
        ]),
        sub('cable_holster_boom', 'Cable holster and boom', 'Manages heavy high-current cable during user operation.', ['ccs2_vehicle_interface', 'mechanical_mounts'], [
          c('connector holster', 'Parks CCS2 plug'),
          c('cable retractor arm', 'Supports cable weight'),
          c('cable bend limiter', 'Protects cable jacket'),
          c('parking status flag', 'Shows connector home position'),
        ]),
        sub('internal_compartmentation', 'Internal compartmentation', 'Separates AC input, DC output, control and user zones.', ['service_access', 'protective_earth'], [
          c('segregated AC/DC barrier', 'Separates voltage zones'),
          c('control compartment shield', 'Protects low-voltage controls'),
          c('service warning placard', 'Labels hazardous zones'),
          c('earthing braid set', 'Bonds moving panels'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Safety Protection',
      purpose: 'Protects users, vehicles and service personnel from high-power charging hazards.',
      interfaces: ['emergency_stop', 'insulation_monitoring', 'protective_earth', 'alarm_bus', 'dc_output_bus'],
      subModules: [
        sub('emergency_stop_chain', 'Emergency stop chain', 'Trips output contactors and records user/service stop events.', ['emergency_stop', 'alarm_bus', 'control_bus'], [
          c('Emergency stop and safety interlock set', 'Trips unsafe sessions'),
          c('E-stop mushroom button', 'Provides visible user stop'),
          c('door interlock switch', 'Stops service exposure'),
          c('safety relay module', 'Supervises safety chain'),
        ]),
        sub('dc_fault_protection', 'DC fault protection', 'Detects and interrupts DC-side electrical faults.', ['dc_output_bus', 'insulation_monitoring', 'alarm_bus'], [
          c('Insulation monitoring device', 'Detects isolation loss'),
          c('DC arc detection board', 'Detects abnormal arcing'),
          c('output contactor weld check circuit', 'Verifies contactor state'),
          c('fault discharge resistor', 'Discharges DC link'),
        ]),
        sub('user_access_protection', 'User access protection', 'Prevents user contact with live parts and communicates safe operation.', ['protective_earth', 'ccs2_vehicle_interface'], [
          c('touch-safe connector shutter', 'Limits finger access'),
          c('protective earth continuity strap', 'Bonds user-accessible metal'),
          c('charging status beacon', 'Shows active session'),
          c('safety instruction label', 'Guides user behaviour'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Maintenance And Commissioning',
      purpose: 'Supports installation, commissioning, remote diagnosis and field replacement.',
      interfaces: ['service_access', 'service_port', 'ocpp_network', 'metering_bus', 'coolant_loop'],
      subModules: [
        sub('commissioning_access', 'Commissioning access', 'Exposes safe setup and verification points.', ['service_access', 'service_port', 'metering_bus'], [
          c('commissioning terminal block', 'Supports field checks'),
          c('meter test port', 'Supports metering verification'),
          c('output test socket cover', 'Protects DC test access'),
          c('commissioning checklist card', 'Guides setup sequence'),
        ]),
        sub('replaceable_modules', 'Replaceable modules', 'Makes high-failure assemblies field swappable.', ['service_access', 'control_bus', 'coolant_loop'], [
          c('slide-out power module rail', 'Supports module replacement'),
          c('quick-disconnect coolant fitting', 'Supports cooling service'),
          c('gateway DIN rail carrier', 'Supports comms replacement'),
          c('spare fuse and link kit', 'Supports field repair'),
        ]),
        sub('remote_diagnostics', 'Remote diagnostics', 'Collects and exports health data for service teams.', ['ocpp_network', 'service_port', 'control_bus'], [
          c('diagnostic log exporter', 'Exports charger logs'),
          c('remote firmware update agent', 'Updates charger firmware'),
          c('health telemetry packet schema', 'Structures monitoring data'),
          c('service VPN profile', 'Secures remote access'),
        ]),
      ],
    },
    {
      id: 'hmi_ergonomics',
      displayName: 'User Payment And HMI',
      purpose: 'Guides charging sessions, payment, status and accessibility at the charger front end.',
      interfaces: ['ocpp_network', 'control_bus', 'ccs2_vehicle_interface', 'service_access'],
      subModules: [
        sub('user_display_panel', 'User display panel', 'Presents session state, price, energy and fault messages.', ['control_bus', 'ocpp_network'], [
          c('touchscreen HMI panel', 'Displays session UI'),
          c('status LED light bar', 'Shows charger state'),
          c('audio buzzer', 'Provides accessible feedback'),
          c('sunlight-readable display cover', 'Protects HMI'),
        ]),
        sub('payment_identity', 'Payment and identity', 'Supports card, RFID or app-based authorisation.', ['ocpp_network', 'control_bus'], [
          c('RFID reader module', 'Authorises users'),
          c('contactless payment terminal', 'Takes card payment'),
          c('receipt QR code generator', 'Links session receipt'),
          c('privacy label', 'Communicates data handling'),
        ]),
        sub('user_cable_guidance', 'User cable guidance', 'Helps users lift, park and confirm the heavy CCS2 connector.', ['ccs2_vehicle_interface', 'service_access'], [
          c('connector instruction graphic', 'Shows plug operation'),
          c('cable park indicator', 'Shows holster status'),
          c('accessibility reach label', 'Marks operating zone'),
          c('session stop button', 'Ends charge session'),
        ]),
      ],
    },
  ]
}

function bioreactorArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const workingVolume = parsed.numericFacts.working_volume_l ?? 50
  return [
    {
      id: 'structure_containment',
      displayName: 'Sterile Structure Containment',
      purpose: `Supports a ${workingVolume} L single-use culture volume while preserving the sterile disposable boundary.`,
      interfaces: ['sterile_boundary', 'sterile_fluid_path', 'mechanical_mounts', 'service_access', 'pressure_relief'],
      subModules: [
        sub('single_use_bag_chamber', 'Single-use bag chamber', 'Carries the disposable culture bag and keeps ports accessible for sterile setup.', ['sterile_boundary', 'sterile_fluid_path', 'mechanical_mounts', 'service_access', 'pressure_relief'], [
          c('Single-use bioreactor bag', 'Contains sterile mammalian-cell culture'),
          c('bag support tray', 'Holds disposable bag geometry'),
          c('port clamp set', 'Secures aseptic bag ports'),
          c('bag integrity test label', 'Records pre-use bag inspection'),
        ]),
        sub('support_frame_load_path', 'Support frame and load path', 'Carries fluid mass, agitation loads and service handling forces.', ['mechanical_mounts', 'service_access'], [
          c('stainless support frame', 'Carries bag chamber and equipment'),
          c('load cell mounting bracket set', 'Mounts fill-state weighing hardware'),
          c('levelling foot set', 'Sets stable frame position'),
          c('lifting eye kit', 'Supports controlled handling'),
        ]),
        sub('sterile_connector_panel', 'Sterile connector panel', 'Organises aseptic feed, harvest, sampling and gas connections.', ['sterile_boundary', 'sterile_fluid_path', 'service_access'], [
          c('Sterile tubing and connector set', 'Provides aseptic fluid connections'),
          c('aseptic sampling port', 'Supports sterile sample draw'),
          c('clamp rail', 'Manages tubing closure points'),
          c('connector parking bracket', 'Holds capped sterile connectors'),
        ]),
      ],
    },
    {
      id: 'actuation_kinematics',
      displayName: 'Mixing And Agitation',
      purpose: 'Transfers controllable mixing energy into the culture without compromising the disposable boundary.',
      interfaces: ['mixing_drive', 'control_bus', 'sterile_boundary', 'sensor_bus'],
      subModules: [
        sub('agitation_drive_train', 'Agitation drive train', 'Controls impeller or rocking motion for suspension culture.', ['mixing_drive', 'control_bus', 'sterile_boundary'], [
          c('Agitation drive', 'Provides culture mixing motion'),
          c('magnetic coupling hub', 'Transfers torque across sterile boundary'),
          c('drive encoder', 'Reports agitation speed'),
          c('motor mounting plate', 'Aligns drive to bag chamber'),
        ]),
        sub('mixing_impeller_interface', 'Mixing impeller interface', 'Keeps the disposable impeller or rocker coupling aligned to the bag.', ['mixing_drive', 'sterile_boundary', 'service_access'], [
          c('single-use impeller coupling', 'Connects disposable mixer to drive'),
          c('impeller guard insert', 'Prevents bag damage near moving coupling'),
          c('rocker angle stop', 'Limits motion envelope'),
          c('mixing validation coupon', 'Supports setup verification'),
        ]),
        sub('agitation_safety_feedback', 'Agitation safety feedback', 'Detects stalled or excessive mixing conditions.', ['mixing_drive', 'sensor_bus', 'alarm_bus'], [
          c('motor current sensor', 'Detects drive load abnormality'),
          c('overspeed interlock input', 'Stops unsafe agitation'),
          c('drive fault relay', 'Reports agitation faults'),
          c('emergency drive stop contactor', 'Removes drive power on safety trip'),
        ]),
      ],
    },
    {
      id: 'mass_fluid_transport_process',
      displayName: 'Media Gas And Harvest Transport',
      purpose: 'Moves sterile media, feeds, harvest and process gases through controlled disposable paths.',
      interfaces: ['sterile_fluid_path', 'gas_path', 'pump_control', 'control_bus', 'sensor_bus'],
      subModules: [
        sub('feed_pump_manifold', 'Feed pump manifold', 'Meters media, nutrient and base additions into the culture.', ['sterile_fluid_path', 'pump_control', 'sensor_bus'], [
          c('Peristaltic feed pump', 'Drives sterile feed addition', 3, 'each'),
          c('pump tubing cassette set', 'Defines pumpable sterile tubing path'),
          c('media bag hanger', 'Supports feed bag connection'),
          c('feed line pinch clamp', 'Provides manual isolation'),
        ]),
        sub('harvest_sampling_path', 'Harvest and sampling path', 'Routes harvest and samples without opening the culture boundary.', ['sterile_fluid_path', 'service_access', 'sensor_bus'], [
          c('harvest transfer tubing set', 'Routes product harvest'),
          c('single-use sample valve', 'Provides aseptic sampling'),
          c('waste collection bag', 'Collects purge and sample waste'),
          c('low-hold-up connector', 'Reduces product loss'),
        ]),
        sub('sparger_gas_mixing', 'Sparger gas mixing', 'Meters air, oxygen, nitrogen and CO2 into the disposable sparger path.', ['gas_path', 'sterile_fluid_path', 'control_bus'], [
          c('Sparger and gas-mix manifold', 'Controls gas flow to culture'),
          c('mass-flow controller bank', 'Meters process gases'),
          c('sterile gas filter capsule', 'Keeps inlet gas sterile'),
          c('sparger check valve', 'Prevents liquid backflow into gas train'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Thermal Gas Exhaust Interface',
      purpose: 'Controls culture temperature and sterile exhaust conditions.',
      interfaces: ['thermal_loop', 'gas_path', 'exhaust_path', 'sterile_boundary', 'sensor_bus'],
      subModules: [
        sub('temperature_control_loop', 'Temperature control loop', 'Transfers heat into or out of the disposable culture vessel.', ['thermal_loop', 'control_bus', 'sensor_bus'], [
          c('Temperature control loop', 'Controls culture temperature'),
          c('heater blanket', 'Adds heat during warm-up'),
          c('cooling plate', 'Removes excess metabolic heat'),
          c('thermal interface mat', 'Couples bag chamber to thermal surface'),
        ]),
        sub('exhaust_filter_train', 'Exhaust filter train', 'Maintains sterile exhaust and overpressure relief path.', ['exhaust_path', 'gas_path', 'sterile_boundary', 'pressure_relief'], [
          c('Exhaust filter and pressure relief set', 'Provides sterile venting and relief'),
          c('condensate knock-out bottle', 'Protects vent filter from liquid'),
          c('exhaust heater sleeve', 'Reduces filter wetting'),
          c('pressure relief indicator', 'Shows relief event history'),
        ]),
        sub('ambient_enclosure_conditions', 'Ambient enclosure conditions', 'Manages local clean-bench or enclosure support conditions.', ['service_access', 'sensor_bus', 'alarm_bus'], [
          c('ambient temperature probe', 'Tracks room conditions'),
          c('clean-zone status beacon', 'Communicates setup state'),
          c('splash guard panel', 'Separates operator from wet process'),
          c('wipe-down surface kit', 'Supports cleaning between batches'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Process Sensing Instrumentation',
      purpose: 'Measures culture and equipment state needed for closed-loop control and batch release evidence.',
      interfaces: ['sensor_bus', 'sterile_fluid_path', 'gas_path', 'thermal_loop'],
      subModules: [
        sub('do_ph_sensing', 'DO and pH sensing', 'Measures dissolved oxygen and pH through aseptic or single-use sensor paths.', ['sensor_bus', 'sterile_fluid_path'], [
          c('Dissolved oxygen optical sensor', 'Measures culture oxygen state'),
          c('Single-use pH sensor', 'Measures culture acidity'),
          c('sensor patch reader', 'Reads optical sensor patches'),
          c('sensor calibration record card', 'Captures pre-batch calibration status'),
        ]),
        sub('pressure_mass_temperature_sensing', 'Pressure, mass and temperature sensing', 'Tracks working volume, pressure and thermal state.', ['sensor_bus', 'thermal_loop', 'pressure_relief', 'mechanical_mounts'], [
          c('Load cell set', 'Measures culture and feed mass'),
          c('bag pressure transducer', 'Detects overpressure trend'),
          c('culture temperature probe', 'Feeds temperature control'),
          c('foam detection probe', 'Warns of foam carryover risk'),
        ]),
        sub('gas_flow_sensing', 'Gas flow sensing', 'Verifies inlet gas delivery and exhaust path condition.', ['sensor_bus', 'gas_path', 'exhaust_path'], [
          c('gas flow sensor set', 'Measures inlet gas flow'),
          c('exhaust pressure sensor', 'Detects blocked vent path'),
          c('oxygen analyser cell', 'Checks gas blend'),
          c('CO2 analyser cell', 'Checks gas blend'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Control Compute Communication',
      purpose: 'Runs recipe, process control, alarms, historian and batch-record communication.',
      interfaces: ['control_bus', 'sensor_bus', 'pump_control', 'batch_record_network', 'alarm_bus', 'service_port'],
      subModules: [
        sub('process_controller', 'Process controller', 'Coordinates agitation, gas, pH, DO, temperature and pump loops.', ['control_bus', 'sensor_bus', 'pump_control', 'alarm_bus'], [
          c('Bioreactor controller', 'Runs process control logic'),
          c('I/O terminal slice set', 'Connects sensors and actuators'),
          c('control enclosure', 'Protects controller electronics'),
          c('recipe execution firmware', 'Executes batch sequence'),
        ]),
        sub('batch_record_gateway', 'Batch record gateway', 'Exports process history and audit data.', ['batch_record_network', 'service_port', 'sensor_bus'], [
          c('batch historian module', 'Records time-series process data'),
          c('audit trail storage', 'Stores user and alarm events'),
          c('ethernet switch', 'Connects controller and HMI'),
          c('secure time source', 'Timestamps batch records'),
        ]),
        sub('operator_alarm_logic', 'Operator and alarm logic', 'Presents alarms and controlled operator actions.', ['alarm_bus', 'control_bus', 'service_port'], [
          c('alarm annunciator', 'Signals process alarms'),
          c('operator HMI panel', 'Displays recipe and status'),
          c('role access key switch', 'Controls privileged actions'),
          c('batch acknowledge button', 'Records operator acknowledgement'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Power Distribution',
      purpose: 'Supplies protected mains and low-voltage power to pumps, controller, agitation and thermal hardware.',
      interfaces: ['mains_supply', 'protective_earth', 'control_bus', 'service_access'],
      subModules: [
        sub('control_power_panel', 'Control power panel', 'Distributes mains and DC control power to the bioreactor skid.', ['mains_supply', 'protective_earth', 'control_bus', 'service_access'], [
          c('RCD mains isolator', 'Protects wet-process electrical supply'),
          c('24 V DC power supply', 'Feeds controls and sensors'),
          c('terminal block rail', 'Organises field wiring'),
          c('panel earth bar', 'Bonds protective earth'),
        ]),
        sub('actuator_power_feeds', 'Actuator power feeds', 'Feeds agitation, pumps and thermal actuators.', ['mains_supply', 'control_bus', 'protective_earth'], [
          c('pump power distribution loom', 'Feeds pump channels'),
          c('agitation drive breaker', 'Protects mixer drive'),
          c('heater output relay', 'Switches temperature loop heat'),
          c('cable gland plate', 'Separates wet-zone cabling'),
        ]),
        sub('backup_power_and_shutdown', 'Backup power and shutdown', 'Keeps control alive long enough for safe process stop.', ['mains_supply', 'alarm_bus', 'control_bus'], [
          c('UPS buffer module', 'Maintains controller during ride-through'),
          c('safe shutdown relay', 'Coordinates power loss response'),
          c('power-fail input module', 'Detects mains loss'),
          c('shutdown status lamp', 'Shows safe-stop state'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Aseptic And Pressure Safety',
      purpose: 'Protects culture sterility, disposable pressure limits and operator exposure.',
      interfaces: ['sterile_boundary', 'pressure_relief', 'exhaust_path', 'alarm_bus', 'protective_earth'],
      subModules: [
        sub('sterile_pressure_safety', 'Sterile pressure safety', 'Prevents bag overpressure and sterile vent blockage.', ['sterile_boundary', 'pressure_relief', 'exhaust_path', 'alarm_bus'], [
          c('single-use pressure relief valve', 'Relieves disposable bag overpressure'),
          c('vent filter integrity tag', 'Records vent filter setup'),
          c('pressure alarm relay', 'Trips pump/gas on high pressure'),
          c('bag burst shield', 'Protects operator from disposable failure'),
        ]),
        sub('aseptic_setup_controls', 'Aseptic setup controls', 'Reduces setup contamination risk.', ['sterile_boundary', 'service_access', 'alarm_bus'], [
          c('sterile connection checklist card', 'Guides aseptic setup'),
          c('connector tamper seal set', 'Shows disturbed sterile connectors'),
          c('pre-use integrity test kit', 'Checks disposable path before inoculation'),
          c('operator gowning placard', 'Communicates setup discipline'),
        ]),
        sub('operator_electrical_safety', 'Operator electrical safety', 'Keeps wet-process electrical risks controlled.', ['protective_earth', 'mains_supply', 'service_access'], [
          c('emergency stop button', 'Stops powered actuators'),
          c('door interlock switch', 'Prevents panel access under power'),
          c('leak tray float switch', 'Detects liquid spill'),
          c('protective earth test point', 'Supports commissioning checks'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Setup Calibration And Service',
      purpose: 'Supports bag loading, sensor calibration, sterile turnaround and controlled service access.',
      interfaces: ['service_access', 'sterile_fluid_path', 'sensor_bus', 'batch_record_network'],
      subModules: [
        sub('single_use_setup', 'Single-use setup', 'Guides bag installation and sterile connector management.', ['service_access', 'sterile_fluid_path', 'sterile_boundary'], [
          c('bag loading fixture', 'Helps install disposable bag'),
          c('tube routing template', 'Prevents tubing crossovers'),
          c('connector cap organiser', 'Stores sterile caps'),
          c('setup verification barcode sheet', 'Links disposable lot to batch record'),
        ]),
        sub('sensor_calibration_access', 'Sensor calibration access', 'Makes pre-batch sensor checks repeatable.', ['service_access', 'sensor_bus', 'sterile_fluid_path'], [
          c('pH calibration buffer holder', 'Supports pH calibration'),
          c('DO zero span adapter', 'Supports DO sensor check'),
          c('calibration data entry HMI page', 'Records calibration values'),
          c('sensor replacement guide label', 'Reduces setup errors'),
        ]),
        sub('cleaning_turnaround', 'Cleaning and turnaround', 'Supports non-product-contact cleaning and post-batch reset.', ['service_access', 'batch_record_network'], [
          c('wipe-down kit holder', 'Stores cleaning tools'),
          c('spill tray liner', 'Catches non-sterile drips'),
          c('spent bag removal cart interface', 'Supports waste handling'),
          c('turnaround checklist card', 'Tracks post-batch reset'),
        ]),
      ],
    },
  ]
}

function verticalFarmArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const footprint = parsed.numericFacts.footprint_m2 ?? 3.36
  return [
    {
      id: 'structure_containment',
      displayName: 'Growing Structure And Containment',
      purpose: `Carries stacked crop trays, lighting and service access within a compact ${footprint} m2 footprint.`,
      interfaces: ['service_access', 'tray_support', 'washdown_boundary', 'mains_supply'],
      subModules: [
        sub('growing_rack_stack', 'Growing rack stack', 'Supports stacked trays, lighting bars and plant mass.', ['tray_support', 'service_access'], [
          c('Growing rack structure', 'Carries crop trays and lighting assemblies'),
          c('aluminium extrusion upright', 'Forms modular rack columns'),
          c('cross brace set', 'Controls rack sway'),
          c('adjustable levelling foot', 'Levels the farm on uneven floors'),
          c('tray slide rail', 'Supports removable crop trays'),
        ]),
        sub('crop_tray_carriers', 'Crop tray carriers', 'Holds channels, mats and seedlings at controlled spacing.', ['tray_support', 'nutrient_loop'], [
          c('food-safe grow tray', 'Holds crop root zone'),
          c('NFT channel insert', 'Guides nutrient film'),
          c('seedling raft', 'Locates plant plugs'),
          c('root-zone cover', 'Blocks algae-forming light'),
          c('tray drain fitting', 'Returns nutrient solution'),
        ]),
        sub('enclosure_panels', 'Enclosure panels', 'Separates humid grow volume from room air and service zones.', ['washdown_boundary', 'airflow'], [
          c('washdown side panel', 'Closes humid grow chamber'),
          c('clear inspection door', 'Allows visual crop inspection'),
          c('EPDM door gasket', 'Limits moisture escape'),
          c('condensate drip channel', 'Collects water from panels'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Light Climate And Gas Environment',
      purpose: 'Controls photons, airflow, humidity and CO2 around the crop canopy.',
      interfaces: ['lighting_control', 'airflow', 'sensor_bus', 'actuator_bus', 'mains_supply'],
      subModules: [
        sub('horticultural_lighting', 'Horticultural lighting', 'Delivers crop-specific photosynthetic photon flux to each shelf.', ['lighting_control', 'mains_supply', 'service_access'], [
          c('LED grow lights', 'Provide photosynthetic lighting'),
          c('dimmable LED driver', 'Controls lighting current'),
          c('lighting suspension bracket', 'Positions light bars'),
          c('PPFD calibration target', 'Supports lighting commissioning'),
          c('glare shield', 'Protects operator sightline'),
        ]),
        sub('canopy_air_mixing', 'Canopy air mixing', 'Moves air across leaves to reduce stagnant humidity pockets.', ['airflow', 'actuator_bus'], [
          c('Air circulation fans', 'Move air through crop canopy'),
          c('fan guard grille', 'Protects operators from fan blades'),
          c('airflow baffle plate', 'Balances shelf airflow'),
          c('replaceable intake filter', 'Reduces dust loading'),
        ]),
        sub('humidity_temperature_control', 'Humidity and temperature control', 'Maintains crop vapor-pressure deficit and sensible heat balance.', ['airflow', 'sensor_bus', 'actuator_bus'], [
          c('dehumidifier module', 'Removes transpiration moisture'),
          c('heat exchanger coil', 'Transfers heat to room loop'),
          c('condensate pump', 'Removes collected water'),
          c('supply air temperature probe', 'Measures conditioned air temperature'),
          c('humidity control relay', 'Switches humidity equipment'),
        ]),
        sub('co2_enrichment', 'CO2 enrichment', 'Measures and doses CO2 when the growing chamber is closed.', ['airflow', 'sensor_bus', 'actuator_bus'], [
          c('CO2 sensor or dosing', 'Monitors or doses crop CO2'),
          c('NDIR CO2 sensor head', 'Measures chamber CO2 concentration'),
          c('CO2 solenoid valve', 'Opens dosing path'),
          c('gas regulator', 'Controls bottle pressure'),
          c('CO2 distribution tube', 'Distributes gas along canopy'),
        ]),
      ],
    },
    {
      id: 'mass_fluid_transport_process',
      displayName: 'Nutrient And Water Transport Process',
      purpose: 'Stores, doses, filters and circulates nutrient solution through crop trays.',
      interfaces: ['nutrient_loop', 'sensor_bus', 'actuator_bus', 'service_access', 'washdown_boundary'],
      subModules: [
        sub('reservoir_plumbing', 'Reservoir and plumbing', 'Contains nutrient solution and routes it to shelves.', ['nutrient_loop', 'service_access'], [
          c('Reservoir and plumbing set', 'Contains and distributes nutrient solution'),
          c('opaque nutrient reservoir', 'Stores mixed nutrient solution'),
          c('bulkhead fitting set', 'Passes plumbing through tank walls'),
          c('PVC-U manifold', 'Distributes solution to shelves'),
          c('return drain header', 'Collects solution from trays'),
        ]),
        sub('fertigation_pumping', 'Fertigation pumping', 'Moves nutrient solution at controlled flow rate.', ['nutrient_loop', 'actuator_bus', 'sensor_bus'], [
          c('Nutrient pump', 'Circulates nutrient solution'),
          c('pump isolation valve', 'Allows pump service'),
          c('check valve', 'Prevents reverse siphon'),
          c('flow meter', 'Confirms circulation'),
          c('pump vibration mount', 'Reduces transmitted noise'),
        ]),
        sub('nutrient_dosing', 'Nutrient dosing', 'Adds nutrient concentrates and pH correction to the reservoir.', ['nutrient_loop', 'actuator_bus', 'sensor_bus'], [
          c('peristaltic dosing pump', 'Doses nutrient concentrate'),
          c('pH dosing pump', 'Doses pH correction fluid'),
          c('chemical suction lance', 'Draws concentrate safely'),
          c('anti-siphon valve', 'Prevents unintended dosing'),
          c('mixing eductor', 'Improves reservoir mixing'),
        ]),
        sub('filtration_sanitation', 'Filtration and sanitation', 'Keeps the nutrient loop clean and serviceable.', ['nutrient_loop', 'service_access'], [
          c('inline mesh filter', 'Captures root debris'),
          c('UV steriliser', 'Reduces biological load'),
          c('drain valve', 'Allows nutrient changeover'),
          c('sample port', 'Supports nutrient testing'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Crop And Process Instrumentation',
      purpose: 'Measures climate, nutrient chemistry and crop state for control and review.',
      interfaces: ['sensor_bus', 'video_link', 'nutrient_loop', 'airflow'],
      subModules: [
        sub('climate_sensors', 'Climate sensors', 'Measures canopy temperature, humidity and light level.', ['sensor_bus', 'airflow'], [
          c('temperature humidity probe', 'Measures air state near canopy'),
          c('PAR light sensor', 'Measures photosynthetic light level'),
          c('leaf temperature sensor', 'Estimates canopy stress'),
          c('differential pressure switch', 'Detects filter blockage'),
        ]),
        sub('nutrient_sensors', 'Nutrient sensors', 'Measures solution chemistry and reservoir level.', ['sensor_bus', 'nutrient_loop'], [
          c('pH probe', 'Measures acidity'),
          c('EC probe', 'Measures nutrient conductivity'),
          c('reservoir level sensor', 'Detects low nutrient volume'),
          c('solution temperature probe', 'Measures reservoir temperature'),
        ]),
        sub('crop_observation', 'Crop observation', 'Captures visual crop evidence and growth state.', ['video_link', 'sensor_bus'], [
          c('RGB crop camera', 'Captures growth images'),
          c('camera light shield', 'Improves image repeatability'),
          c('time-lapse controller', 'Schedules image capture'),
          c('calibration colour card', 'Supports image consistency'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Recipe Control And Communications',
      purpose: 'Runs crop recipes, controls actuators and records operating history.',
      interfaces: ['sensor_bus', 'actuator_bus', 'lighting_control', 'video_link', 'operator_network'],
      subModules: [
        sub('environmental_controller', 'Environmental controller', 'Coordinates lighting, fertigation, climate and alarms.', ['sensor_bus', 'actuator_bus', 'lighting_control'], [
          c('Environmental controller', 'Runs crop-control recipes'),
          c('DIN-rail PLC', 'Executes control logic'),
          c('analog input module', 'Reads probes and transducers'),
          c('relay output module', 'Switches pumps and fans'),
          c('real-time clock module', 'Keeps lighting and dosing schedules'),
        ]),
        sub('recipe_management', 'Recipe management', 'Stores crop recipes and set-point schedules.', ['operator_network', 'lighting_control'], [
          c('recipe database', 'Stores crop profiles'),
          c('set-point scheduler', 'Times lighting and dosing stages'),
          c('alarm historian', 'Records deviations'),
          c('data export module', 'Exports grow history'),
        ]),
        sub('remote_monitoring', 'Remote monitoring', 'Provides operator status and alerts outside the unit.', ['operator_network', 'video_link'], [
          c('industrial Ethernet switch', 'Connects controller, HMI and cameras'),
          c('Wi-Fi gateway', 'Provides local monitoring path'),
          c('MQTT telemetry bridge', 'Publishes sensor state'),
          c('SMS alarm modem', 'Sends critical alerts'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Wet-Zone Power Distribution',
      purpose: 'Distributes mains and low-voltage power to lighting, pumps, controls and safety devices.',
      interfaces: ['mains_supply', 'lighting_control', 'actuator_bus', 'protective_earth'],
      subModules: [
        sub('mains_panel', 'Mains isolation panel', 'Provides incoming isolation and branch protection.', ['mains_supply', 'protective_earth', 'service_access'], [
          c('RCD isolator panel', 'Protects humid-area electrical circuits'),
          c('lockable main isolator', 'Provides service isolation'),
          c('RCBO breaker bank', 'Protects branch circuits'),
          c('protective earth bar', 'Bonds metalwork'),
          c('surge protection device', 'Protects electronics from transients'),
        ]),
        sub('lighting_power', 'Lighting power distribution', 'Feeds and switches LED drivers by shelf.', ['mains_supply', 'lighting_control'], [
          c('lighting bus trunk', 'Feeds grow-light shelves'),
          c('IP65 cable gland set', 'Seals wet-zone cable entries'),
          c('driver mounting rail', 'Carries LED drivers'),
          c('fused spur module', 'Protects lighting branch'),
        ]),
        sub('low_voltage_power', 'Low-voltage control power', 'Feeds sensors, controller and communication devices.', ['actuator_bus', 'sensor_bus'], [
          c('24 V DC power supply', 'Feeds controls and sensors'),
          c('DC distribution terminal', 'Distributes low-voltage circuits'),
          c('UPS buffer module', 'Keeps controller alive during short outages'),
          c('control cabinet heater', 'Prevents condensation in panel'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Food-Safe Safety And Protection',
      purpose: 'Controls electrical, water, chemical and operator risks in a humid cultivation unit.',
      interfaces: ['mains_supply', 'washdown_boundary', 'service_access', 'alarm_bus'],
      subModules: [
        sub('leak_containment', 'Leak containment', 'Detects and contains nutrient leaks before they reach electrical zones.', ['washdown_boundary', 'alarm_bus'], [
          c('leak detection rope', 'Detects liquid on base tray'),
          c('bunded base tray', 'Contains spills'),
          c('overflow standpipe', 'Limits tank overfill'),
          c('floor drain adapter', 'Routes controlled discharge'),
        ]),
        sub('operator_interlocks', 'Operator interlocks', 'Reduces exposure to bright light, moving fans and chemicals during service.', ['service_access', 'alarm_bus'], [
          c('door interlock switch', 'Pauses risky actuators when opened'),
          c('lighting inhibit relay', 'Dims lights on service access'),
          c('chemical storage latch', 'Controls dosing-fluid access'),
          c('emergency stop button', 'Stops pumps and fans'),
        ]),
        sub('food_contact_controls', 'Food contact controls', 'Keeps crop-facing components cleanable and traceable.', ['washdown_boundary', 'service_access'], [
          c('food-grade tubing set', 'Contacts nutrient solution safely'),
          c('cleaning validation swab kit', 'Supports sanitation checks'),
          c('material traceability label', 'Records contact-material identity'),
          c('washdown SOP placard', 'Guides cleaning sequence'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Harvest Cleaning And Serviceability',
      purpose: 'Supports tray removal, cleaning, filter changes and routine crop operations.',
      interfaces: ['service_access', 'washdown_boundary', 'nutrient_loop'],
      subModules: [
        sub('harvest_access', 'Harvest access', 'Allows ergonomic crop removal and replanting.', ['service_access', 'tray_support'], [
          c('slide-out tray handle', 'Improves tray removal'),
          c('shelf stop latch', 'Prevents accidental tray drop'),
          c('harvest work ledge', 'Supports crop handling'),
          c('removable seedling cassette', 'Speeds crop changeover'),
        ]),
        sub('cleaning_access', 'Cleaning access', 'Allows sanitation of wet and crop-contact areas.', ['washdown_boundary', 'service_access'], [
          c('quick-release manifold union', 'Allows plumbing removal'),
          c('removable sump screen', 'Captures debris during cleaning'),
          c('washdown hose connection', 'Supports rinsing'),
          c('drying fan mode switch', 'Assists post-clean drying'),
        ]),
        sub('consumable_service', 'Consumable service', 'Makes filters, probes and dosing consumables replaceable.', ['service_access', 'nutrient_loop'], [
          c('filter service hatch', 'Provides filter access'),
          c('probe calibration cup', 'Supports pH and EC calibration'),
          c('dosing bottle tray', 'Holds nutrient concentrates'),
          c('spare gasket kit', 'Restores seals during service'),
        ]),
      ],
    },
    {
      id: 'hmi_ergonomics',
      displayName: 'Operator HMI And Labelling',
      purpose: 'Shows grow state, alarms, recipes and safe operating instructions.',
      interfaces: ['operator_network', 'service_access', 'alarm_bus'],
      subModules: [
        sub('local_hmi', 'Local HMI', 'Provides local status, recipe selection and alarm acknowledgement.', ['operator_network', 'service_access'], [
          c('touchscreen HMI', 'Displays farm state'),
          c('recipe selector control', 'Selects crop program'),
          c('alarm buzzer beacon', 'Announces failures'),
          c('USB data export port', 'Exports grow logs'),
        ]),
        sub('labelling_workflows', 'Labelling and workflows', 'Communicates hazards, cleaning steps and crop lot identity.', ['service_access'], [
          c('crop lot label holder', 'Identifies active tray lot'),
          c('chemical hazard label set', 'Marks dosing fluids'),
          c('cleaning checklist card', 'Guides sanitation'),
          c('electrical isolation placard', 'Guides safe service isolation'),
        ]),
      ],
    },
  ]
}

function droneArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const endurance = parsed.numericFacts.duration_minutes ?? 40
  return [
    {
      id: 'structure_containment',
      displayName: 'Airframe Structure And Payload Mounting',
      purpose: `Carries propulsion, battery and camera payload while targeting roughly ${endurance} minutes of flight endurance.`,
      interfaces: ['motor_mounts', 'payload_mount', 'battery_mount', 'service_access'],
      subModules: [
        sub('carbon_airframe', 'Carbon airframe', 'Provides rigid arms, centre plates and landing structure.', ['motor_mounts', 'payload_mount', 'battery_mount'], [
          c('Carbon airframe', 'Carries flight loads'),
          c('carbon fibre arm tube', 'Carries motor bending loads'),
          c('centre plate pair', 'Holds avionics and battery'),
          c('arm folding hinge', 'Allows transport folding'),
          c('landing gear strut', 'Protects payload on landing'),
        ]),
        sub('payload_mounting', 'Payload mounting', 'Supports vibration-isolated camera payload attachment.', ['payload_mount', 'video_link'], [
          c('camera gimbal mount plate', 'Locates camera gimbal'),
          c('rubber vibration damper', 'Reduces camera vibration'),
          c('payload quick-release latch', 'Supports payload swap'),
          c('payload CG adjustment rail', 'Tunes centre of gravity'),
        ]),
        sub('battery_mounting', 'Battery mounting', 'Secures removable packs against manoeuvre loads.', ['battery_mount', 'power_bus'], [
          c('battery tray', 'Supports battery pack'),
          c('battery retention strap', 'Restrains battery'),
          c('anti-slip battery pad', 'Prevents pack movement'),
          c('pack latch sensor', 'Detects pack engagement'),
        ]),
      ],
    },
    {
      id: 'energy_storage_source',
      displayName: 'Flight Energy Storage',
      purpose: 'Stores mission energy and supplies high-current propulsion and avionics loads.',
      interfaces: ['power_bus', 'charger_interface', 'battery_mount', 'sensor_bus'],
      subModules: [
        sub('flight_battery_pack', 'Flight battery pack', 'Provides swappable energy storage for flight operations.', ['power_bus', 'charger_interface', 'battery_mount'], [
          c('Flight battery pack', 'Stores flight energy'),
          c('high-discharge cell group', 'Delivers propulsion current'),
          c('battery management PCB', 'Monitors pack voltage and temperature'),
          c('XT90 anti-spark connector', 'Connects pack to power bus'),
          c('pack temperature sensor', 'Detects thermal stress'),
        ]),
        sub('power_monitoring', 'Power monitoring', 'Measures pack current and voltage for endurance management.', ['power_bus', 'sensor_bus'], [
          c('power module shunt', 'Measures battery current'),
          c('voltage divider board', 'Measures pack voltage'),
          c('low-voltage alarm output', 'Warns before reserve depletion'),
          c('battery telemetry connector', 'Carries pack telemetry'),
        ]),
        sub('charging_interface', 'Charging interface', 'Supports safe pack charging and fleet rotation.', ['charger_interface', 'service_access'], [
          c('balance charge harness', 'Connects cell balance leads'),
          c('charging cradle', 'Holds pack during charging'),
          c('pack ID label', 'Tracks pack cycles'),
          c('transport storage case insert', 'Protects spare packs'),
        ]),
      ],
    },
    {
      id: 'actuation_kinematics',
      displayName: 'Propulsion And Flight Actuation',
      purpose: 'Generates lift, yaw and manoeuvre authority through motor, ESC and propeller groups.',
      interfaces: ['power_bus', 'motor_drive', 'motor_mounts', 'sensor_bus'],
      subModules: [
        sub('motor_sets', 'Motor sets', 'Convert electrical power into shaft torque.', ['power_bus', 'motor_drive', 'motor_mounts'], [
          c('Brushless motors', 'Generate propeller torque', 4, 'each'),
          c('motor mounting screw set', 'Fastens motors to arms'),
          c('motor phase lead set', 'Connects ESC output'),
          c('motor bearing shield', 'Protects rotating assembly'),
        ]),
        sub('esc_stack', 'ESC stack', 'Drives motors from flight-controller commands.', ['power_bus', 'motor_drive', 'sensor_bus'], [
          c('ESC', 'Controls motor phase current', 4, 'each'),
          c('ESC cooling plate', 'Spreads switching heat'),
          c('PWM signal harness', 'Carries flight-control commands'),
          c('current telemetry line', 'Reports ESC load'),
          c('ESC conformal coating', 'Protects electronics'),
        ]),
        sub('propeller_sets', 'Propeller sets', 'Generate thrust and set acoustic/efficiency envelope.', ['motor_mounts'], [
          c('Propeller set', 'Generates thrust'),
          c('propeller hub adapter', 'Matches propeller to motor shaft'),
          c('propeller lock nut', 'Secures propeller'),
          c('spare propeller pouch', 'Stores field spares'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Flight Control Compute And Communications',
      purpose: 'Runs stabilisation, navigation, command link and failsafe behaviours.',
      interfaces: ['sensor_bus', 'motor_drive', 'radio_link', 'video_link', 'power_bus'],
      subModules: [
        sub('flight_controller_stack', 'Flight controller stack', 'Stabilises aircraft and executes flight modes.', ['sensor_bus', 'motor_drive', 'power_bus'], [
          c('Flight controller', 'Runs flight stabilisation'),
          c('IMU vibration isolation mount', 'Improves inertial readings'),
          c('barometer foam cover', 'Reduces pressure noise'),
          c('SD card flight logger', 'Records flight data'),
          c('failsafe firmware profile', 'Defines loss-link behaviour'),
        ]),
        sub('radio_navigation_link', 'Radio and navigation link', 'Provides pilot command, telemetry and positioning.', ['radio_link', 'sensor_bus'], [
          c('Radio and GNSS link', 'Provides command and positioning'),
          c('GNSS antenna mast', 'Separates GNSS antenna from noise'),
          c('RC receiver', 'Receives pilot command'),
          c('telemetry radio module', 'Sends flight data to ground station'),
          c('antenna diversity mount', 'Improves link orientation'),
        ]),
        sub('video_downlink', 'Video downlink', 'Streams camera status and framing view to operator.', ['video_link', 'power_bus'], [
          c('low-latency video transmitter', 'Sends framing video'),
          c('video antenna pair', 'Radiates video link'),
          c('HDMI micro cable', 'Connects camera payload'),
          c('video power filter', 'Reduces image noise'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Navigation And Cinematography Sensing',
      purpose: 'Captures video, inertial state and environmental data needed for controlled flight.',
      interfaces: ['sensor_bus', 'video_link', 'payload_mount'],
      subModules: [
        sub('camera_payload', 'Camera payload', 'Captures stabilised 4K imagery.', ['video_link', 'payload_mount'], [
          c('4K camera payload', 'Captures cinematography video'),
          c('three-axis gimbal', 'Stabilises camera'),
          c('camera control cable', 'Triggers recording'),
          c('lens protection hood', 'Protects optics'),
          c('microSD media card', 'Stores video'),
        ]),
        sub('navigation_sensors', 'Navigation sensors', 'Measures orientation, height and heading.', ['sensor_bus'], [
          c('magnetometer module', 'Measures heading'),
          c('rangefinder altimeter', 'Measures low-altitude distance'),
          c('optical flow sensor', 'Measures ground-relative motion'),
          c('airspeed estimate port', 'Supports wind assessment'),
        ]),
        sub('health_sensing', 'Health sensing', 'Monitors vibration, temperature and payload state.', ['sensor_bus', 'payload_mount'], [
          c('vibration monitor pad', 'Tracks airframe vibration'),
          c('payload presence switch', 'Confirms camera mount state'),
          c('avionics temperature probe', 'Measures electronics temperature'),
          c('landing contact switch', 'Detects touchdown'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Aircraft Power Distribution',
      purpose: 'Routes battery power to propulsion, avionics and payload through protected low-mass paths.',
      interfaces: ['power_bus', 'protective_earth', 'motor_drive', 'video_link'],
      subModules: [
        sub('main_power_bus', 'Main power bus', 'Distributes pack current to ESCs and avionics converters.', ['power_bus', 'motor_drive'], [
          c('power distribution PCB', 'Distributes battery current'),
          c('copper bus plane', 'Carries high current'),
          c('main fuse link', 'Protects against short circuit'),
          c('anti-spark loop key', 'Arms high-current path'),
        ]),
        sub('voltage_regulation', 'Voltage regulation', 'Creates stable rails for flight controller, radio and payload.', ['power_bus', 'video_link'], [
          c('5 V BEC regulator', 'Feeds flight controller'),
          c('12 V payload regulator', 'Feeds camera and video transmitter'),
          c('LC noise filter', 'Reduces regulator noise'),
          c('rail status LED', 'Shows power state'),
        ]),
        sub('wiring_harness', 'Wiring harness', 'Connects avionics with strain relief and field-service routing.', ['power_bus', 'sensor_bus', 'video_link'], [
          c('silicone power lead set', 'Routes battery current'),
          c('JST signal harness', 'Routes low-current signals'),
          c('braided cable sleeve', 'Protects wiring'),
          c('strain relief clip set', 'Prevents connector fatigue'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Flight Safety And Containment',
      purpose: 'Reduces injury, runaway, battery and lost-link risks before and during flight.',
      interfaces: ['radio_link', 'power_bus', 'service_access', 'alarm_bus'],
      subModules: [
        sub('arming_interlocks', 'Arming interlocks', 'Prevents unintended motor start during handling.', ['power_bus', 'alarm_bus'], [
          c('arming switch', 'Controls propulsion arming'),
          c('status buzzer', 'Announces armed state'),
          c('motor inhibit logic', 'Blocks ESC command before arming'),
          c('preflight checklist tag', 'Guides operator arming steps'),
        ]),
        sub('lost_link_response', 'Lost-link response', 'Defines recovery path when command link degrades.', ['radio_link', 'sensor_bus'], [
          c('return-to-home failsafe', 'Commands autonomous recovery'),
          c('geofence configuration', 'Limits operating volume'),
          c('low battery landing logic', 'Commands reserve landing'),
          c('flight termination setting', 'Defines emergency stop behaviour'),
        ]),
        sub('battery_safety', 'Battery safety', 'Manages pack handling, thermal and transport risks.', ['power_bus', 'service_access'], [
          c('fire-resistant battery pouch', 'Contains pack during transport'),
          c('pack swelling gauge', 'Screens damaged packs'),
          c('charge log sheet', 'Records battery service history'),
          c('thermal warning label', 'Communicates battery hazard'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Field Maintenance And Serviceability',
      purpose: 'Supports rapid propeller, arm, battery and payload service between flights.',
      interfaces: ['service_access', 'motor_mounts', 'payload_mount'],
      subModules: [
        sub('field_repair_access', 'Field repair access', 'Makes high-wear flight parts replaceable.', ['service_access', 'motor_mounts'], [
          c('spare arm clamp', 'Restores damaged arm joint'),
          c('motor alignment gauge', 'Checks thrust axis'),
          c('propeller torque tool', 'Sets propeller nuts'),
          c('field fastener kit', 'Replaces lost hardware'),
        ]),
        sub('inspection_points', 'Inspection points', 'Provides visible checks before launch.', ['service_access'], [
          c('crack inspection marker', 'Highlights arm damage'),
          c('fastener witness paint', 'Shows bolt movement'),
          c('battery cycle counter label', 'Tracks pack use'),
          c('payload latch witness mark', 'Confirms payload lock'),
        ]),
        sub('transport_storage', 'Transport and storage', 'Protects aircraft between missions.', ['service_access', 'payload_mount'], [
          c('foam transport case', 'Protects assembled aircraft'),
          c('propeller guard sleeve', 'Protects propellers'),
          c('gimbal transport lock', 'Protects camera gimbal'),
          c('desiccant storage pouch', 'Reduces moisture during storage'),
        ]),
      ],
    },
    {
      id: 'hmi_ergonomics',
      displayName: 'Ground Operator Interface',
      purpose: 'Presents mission status, camera framing and preflight instructions to the operator.',
      interfaces: ['radio_link', 'video_link', 'service_access'],
      subModules: [
        sub('ground_controller', 'Ground controller', 'Gives pilot manual control and flight status.', ['radio_link', 'video_link'], [
          c('handheld transmitter', 'Provides pilot inputs'),
          c('ground-station tablet', 'Displays mission and map state'),
          c('sun hood', 'Improves screen readability'),
          c('controller neck strap', 'Improves operator ergonomics'),
        ]),
        sub('mission_labelling', 'Mission labelling', 'Communicates safe setup, IDs and payload status.', ['service_access'], [
          c('aircraft ID label', 'Identifies aircraft'),
          c('propeller rotation label', 'Shows correct propeller direction'),
          c('payload mass placard', 'Communicates payload limit'),
          c('preflight checklist card', 'Guides launch readiness'),
        ]),
      ],
    },
  ]
}

function auvArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const depthRating = parsed.numericFacts.depth_rating_m ?? 300
  const enduranceHours = parsed.numericFacts.endurance_hours ?? 8
  return [
    {
      id: 'structure_containment',
      displayName: 'Pressure Structure Containment',
      purpose: `Maintains a dry electronics and battery envelope for a ${depthRating} m underwater operating target.`,
      interfaces: ['pressure_boundary', 'mechanical_mounts', 'service_access', 'hydrodynamic_shell'],
      subModules: [
        sub('pressure_hull_shell', 'Pressure hull shell', 'Forms the dry pressure boundary and endcap sealing envelope.', ['pressure_boundary', 'mechanical_mounts', 'service_access'], [
          c('Pressure hull', 'Contains dry electronics and batteries under external pressure'),
          c('endcap clamp ring', 'Compresses the endcap seal stack'),
          c('double O-ring gland set', 'Seals removable pressure boundary joints'),
          c('hull proof-test port', 'Supports pressure and leak-test setup'),
        ]),
        sub('internal_mounting_frame', 'Internal mounting frame', 'Locates dry electronics, batteries and payload interface hardware.', ['mechanical_mounts', 'service_access'], [
          c('electronics tray rail', 'Supports control and payload electronics'),
          c('battery cradle frame', 'Restrains pack mass during launch and recovery'),
          c('payload mounting rail', 'Locates sonar and camera payload modules'),
          c('trim weight pocket', 'Allows static balance adjustment'),
        ]),
        sub('hydrodynamic_fairing', 'Hydrodynamic fairing', 'Reduces drag and protects external appendages during survey runs.', ['hydrodynamic_shell', 'mechanical_mounts', 'service_access'], [
          c('nose fairing', 'Reduces forward drag and protects sensors'),
          c('tail cone fairing', 'Cleans wake into aft thrusters'),
          c('stabilising fin set', 'Improves directional stability'),
          c('access hatch latch set', 'Allows fairing removal without disturbing the pressure hull'),
        ]),
      ],
    },
    {
      id: 'energy_storage_source',
      displayName: 'Subsea Energy Storage',
      purpose: `Stores enough mission energy for roughly ${enduranceHours} hours before detailed drag, hotel-load and reserve calculations.`,
      interfaces: ['dc_power_bus', 'battery_monitor_bus', 'service_access', 'thermal_path'],
      subModules: [
        sub('subsea_battery_pack', 'Subsea battery pack', 'Supplies mission energy with reserve margin and pressure-rated containment.', ['dc_power_bus', 'battery_monitor_bus', 'thermal_path'], [
          c('Battery pack', 'Stores mission energy for propulsion and hotel loads'),
          c('battery management board', 'Monitors pack voltage, current and temperature'),
          c('pack isolation fuse', 'Interrupts high-current pack faults'),
          c('pressure-rated battery enclosure', 'Separates battery hazards from dry electronics'),
        ]),
        sub('charging_interface', 'Charging interface', 'Enables deck charging and state verification without compromising the pressure boundary.', ['service_access', 'dc_power_bus', 'battery_monitor_bus'], [
          c('charge interlock plug', 'Prevents launch with charge circuit connected'),
          c('shore charger adapter', 'Connects deck charger to the pack'),
          c('state-of-charge display puck', 'Shows pack readiness during field turnaround'),
          c('battery vent inspection plug', 'Supports inspection of pack safety features'),
        ]),
        sub('energy_monitoring', 'Energy monitoring', 'Tracks reserve energy and supports abort decisions.', ['battery_monitor_bus', 'alarm_bus'], [
          c('coulomb counter module', 'Estimates consumed mission energy'),
          c('pack temperature sensor strip', 'Detects battery thermal stress'),
          c('energy reserve indicator', 'Reports usable reserve to mission computer'),
          c('battery telemetry isolator', 'Protects control electronics from pack faults'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Subsea Power Distribution',
      purpose: 'Routes protected power to thrusters, mission computer, navigation sensors and payloads.',
      interfaces: ['dc_power_bus', 'thruster_power_bus', 'payload_power_bus', 'low_voltage_rail', 'service_access'],
      subModules: [
        sub('dc_distribution', 'DC distribution', 'Switches and protects the main battery bus before branch loads.', ['dc_power_bus', 'thruster_power_bus', 'payload_power_bus'], [
          c('fused DC distribution board', 'Splits pack output into protected load branches'),
          c('Wet-mate connector set', 'Provides pressure-rated field-service power and signal connections'),
          c('main power enable relay', 'Enables mission power under control logic'),
          c('bus voltage monitor', 'Reports high-level power state'),
        ]),
        sub('low_voltage_rails', 'Low-voltage rails', 'Creates stable avionics and payload supply rails.', ['low_voltage_rail', 'payload_power_bus', 'service_access'], [
          c('24 V DC converter', 'Feeds thruster controls and payload support loads'),
          c('12 V payload converter', 'Feeds sonar and camera payload electronics'),
          c('5 V avionics converter', 'Feeds mission computer and sensor interfaces'),
          c('EMI power filter', 'Reduces conducted noise into navigation sensors'),
        ]),
        sub('isolation_grounding', 'Isolation and grounding', 'Controls leakage, bonding and service isolation paths in a flooded environment.', ['dc_power_bus', 'alarm_bus', 'service_access'], [
          c('ground fault monitor', 'Detects insulation breakdown to hull or seawater'),
          c('chassis bonding strap', 'Maintains controlled bonding of structure and shields'),
          c('service isolation key', 'Locks out power during deck maintenance'),
          c('fault annunciator module', 'Reports distribution faults to the mission computer'),
        ]),
      ],
    },
    {
      id: 'actuation_kinematics',
      displayName: 'Thruster Actuation Kinematics',
      purpose: 'Generates controlled surge, heave, yaw and station-keeping authority underwater.',
      interfaces: ['thruster_power_bus', 'thrust_command_bus', 'mechanical_mounts', 'hydrodynamic_shell'],
      subModules: [
        sub('thruster_array', 'Thruster array', 'Provides vectored propulsion channels for survey and manoeuvre control.', ['thruster_power_bus', 'thrust_command_bus', 'mechanical_mounts'], [
          c('Thruster set', 'Generates underwater propulsion and manoeuvre force', 6, 'each'),
          c('thruster nozzle guard', 'Protects propulsors during launch and recovery'),
          c('thruster mounting bracket', 'Transfers thrust loads into the frame'),
          c('motor phase harness', 'Routes drive power to sealed thruster pods'),
        ]),
        sub('drive_electronics', 'Drive electronics', 'Converts command inputs into motor phase drive while reporting current and faults.', ['thruster_power_bus', 'thrust_command_bus', 'alarm_bus'], [
          c('thruster motor controller stack', 'Drives sealed thruster motors'),
          c('current sensor channel set', 'Measures drive current per propulsion branch'),
          c('controller heat spreader', 'Conducts drive heat to the structure'),
          c('thrust calibration table', 'Maps command to thrust for the control loop'),
        ]),
        sub('trim_surfaces', 'Trim and stability surfaces', 'Improves passive stability and reduces control effort.', ['hydrodynamic_shell', 'mechanical_mounts', 'service_access'], [
          c('adjustable trim fin', 'Tunes passive pitch and yaw stability'),
          c('ballast trim block', 'Sets static buoyancy and pitch'),
          c('roll trim screw set', 'Fine-tunes lateral trim'),
          c('tow-tank trim mark', 'Records verified neutral trim position'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Autonomy Compute Communication',
      purpose: 'Runs mission autonomy, navigation fusion, acoustic messaging, payload logging and fail-safe states.',
      interfaces: ['navigation_sensor_bus', 'payload_data_bus', 'thrust_command_bus', 'acoustic_link', 'alarm_bus', 'service_access'],
      subModules: [
        sub('mission_computer_stack', 'Mission computer stack', 'Executes mission state machine, vehicle control and payload logging.', ['navigation_sensor_bus', 'payload_data_bus', 'thrust_command_bus', 'alarm_bus'], [
          c('Mission computer', 'Runs autonomy, navigation and payload coordination'),
          c('real-time control board', 'Runs deterministic thruster and safety control loops'),
          c('watchdog supervisor module', 'Forces fail-safe state when control software stalls'),
          c('mission data recorder', 'Stores navigation, payload and fault logs'),
        ]),
        sub('acoustic_communications', 'Acoustic communications', 'Provides low-bandwidth underwater command, health and recovery messaging.', ['acoustic_link', 'service_access', 'alarm_bus'], [
          c('Acoustic modem', 'Transmits underwater command and telemetry messages'),
          c('acoustic transducer mount', 'Locates modem transducer outside the pressure hull'),
          c('acoustic isolation pad', 'Reduces structure-borne noise into the transducer'),
          c('surface command protocol adapter', 'Bridges topside messages into vehicle command states'),
        ]),
        sub('software_health_management', 'Software health management', 'Defines safe modes, reserve-energy logic and post-mission evidence.', ['alarm_bus', 'battery_monitor_bus', 'service_access'], [
          c('failsafe state machine', 'Defines abort, hold-depth and surface behaviours'),
          c('time sync module', 'Synchronises navigation and payload evidence'),
          c('configuration backup storage', 'Restores mission and control parameters'),
          c('debug service port', 'Supports controlled deck diagnostics'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Navigation And Payload Sensing',
      purpose: 'Measures vehicle state, seabed-relative movement, depth and inspection payload data.',
      interfaces: ['navigation_sensor_bus', 'payload_data_bus', 'pressure_boundary', 'acoustic_link'],
      subModules: [
        sub('navigation_sensor_suite', 'Navigation sensor suite', 'Combines bottom-track velocity, inertial attitude and surface fixes.', ['navigation_sensor_bus', 'service_access'], [
          c('DVL', 'Measures seabed-relative velocity for underwater navigation'),
          c('Inertial navigation unit', 'Estimates attitude and dead-reckoned motion'),
          c('magnetic compass module', 'Provides heading reference when calibrated'),
          c('GNSS surface receiver', 'Updates position at surface before and after mission'),
        ]),
        sub('depth_environment_sensors', 'Depth and environment sensors', 'Measures depth, water conditions and pressure-boundary state.', ['navigation_sensor_bus', 'pressure_boundary', 'alarm_bus'], [
          c('Depth and pressure sensor', 'Measures depth feedback and over-depth risk'),
          c('water temperature probe', 'Measures ambient water temperature'),
          c('conductivity sensor', 'Reports seawater condition for mission context'),
          c('internal humidity sensor', 'Detects early pressure-boundary moisture changes'),
        ]),
        sub('payload_sensor_bay', 'Payload sensor bay', 'Carries inspection payloads and synchronises payload data with navigation state.', ['payload_data_bus', 'navigation_sensor_bus', 'pressure_boundary'], [
          c('Forward sonar payload', 'Provides forward inspection and obstacle sensing'),
          c('camera viewport window', 'Maintains optical path through the pressure boundary'),
          c('payload sync trigger', 'Time-aligns payload and navigation evidence'),
          c('payload data link module', 'Moves payload data to mission storage'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Pressure Thermal Buoyancy Interface',
      purpose: 'Manages pressure boundary support, heat rejection, buoyancy and trim interactions with seawater.',
      interfaces: ['pressure_boundary', 'thermal_path', 'buoyancy_trim', 'service_access', 'hydrodynamic_shell'],
      subModules: [
        sub('pressure_boundary_management', 'Pressure boundary management', 'Handles penetrators, pressure compensation and pressure-test interfaces.', ['pressure_boundary', 'service_access'], [
          c('cable penetrator seal', 'Carries cables through pressure boundary without leaks'),
          c('pressure compensation bladder', 'Balances pressure for selected wet-side volumes'),
          c('oil-fill service port', 'Supports compensated volume filling'),
          c('pressure equalisation valve', 'Controls safe service pressure release'),
        ]),
        sub('thermal_path', 'Thermal path', 'Conducts electronics and battery heat into the hull and surrounding seawater.', ['thermal_path', 'pressure_boundary', 'mechanical_mounts'], [
          c('electronics thermal bridge', 'Conducts heat from dry electronics to hull'),
          c('hull heat spreader plate', 'Spreads heat into the pressure shell'),
          c('battery thermal pad', 'Couples pack heat into the cradle'),
          c('thruster heat sink collar', 'Transfers drive heat away from sealed motors'),
        ]),
        sub('buoyancy_trim', 'Buoyancy and trim', 'Sets neutral buoyancy, trim and recoverable mass distribution.', ['buoyancy_trim', 'hydrodynamic_shell', 'service_access'], [
          c('syntactic foam block set', 'Provides pressure-rated buoyancy'),
          c('ballast rail', 'Supports trim and mission payload adjustment'),
          c('buoyancy calibration tag', 'Records verified buoyancy setup'),
          c('field trim worksheet', 'Captures final ballast settings'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Leak Abort And Recovery Safety',
      purpose: 'Detects water ingress, over-depth risk and lost-vehicle states, then drives abort and recovery behaviour.',
      interfaces: ['leak_alarm_bus', 'alarm_bus', 'pressure_boundary', 'dc_power_bus', 'service_access'],
      subModules: [
        sub('leak_detection', 'Leak detection', 'Detects internal water ingress before catastrophic electronics damage.', ['leak_alarm_bus', 'alarm_bus', 'pressure_boundary'], [
          c('Leak detection sensor', 'Detects conductive water ingress inside the hull'),
          c('bilge moisture strip', 'Extends leak detection along the low point'),
          c('leak alarm relay', 'Reports leak signal into mission safety logic'),
          c('absorbent witness pad', 'Captures minor ingress evidence after recovery'),
        ]),
        sub('abort_recovery', 'Abort and recovery', 'Supports vehicle location and recovery after fault or mission completion.', ['alarm_bus', 'service_access', 'acoustic_link'], [
          c('Recovery beacon', 'Helps locate the vehicle during recovery'),
          c('drop-weight release', 'Creates positive buoyancy during abort'),
          c('emergency strobe', 'Marks vehicle position at surface'),
          c('surface flag float', 'Improves visual recovery cue'),
        ]),
        sub('pressure_fail_safe', 'Pressure fail-safe', 'Prevents over-depth operation and isolates hazardous energy under fault.', ['pressure_boundary', 'dc_power_bus', 'alarm_bus'], [
          c('over-depth abort switch', 'Triggers abort when pressure exceeds mission limit'),
          c('watchdog kill relay', 'Cuts propulsion command after safety timeout'),
          c('battery isolation contactor', 'Isolates pack after critical water ingress'),
          c('pressure relief service plug', 'Supports safe deck-side depressurisation'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Deck Recovery And Service',
      purpose: 'Supports launch, recovery, charging, leak testing and field service without disturbing verified settings unnecessarily.',
      interfaces: ['service_access', 'mechanical_mounts', 'pressure_boundary', 'dc_power_bus'],
      subModules: [
        sub('deck_recovery', 'Deck recovery', 'Provides safe handling points for launch and retrieval operations.', ['mechanical_mounts', 'service_access'], [
          c('lifting bridle', 'Transfers recovery loads to the vehicle frame'),
          c('deck recovery handle', 'Provides controlled manual handling point'),
          c('launch cradle interface', 'Locates the vehicle in a deployment cradle'),
          c('tow point fitting', 'Supports controlled handling in water'),
        ]),
        sub('service_access', 'Service access', 'Enables repeatable checks for seals, charging and diagnostics.', ['service_access', 'pressure_boundary', 'dc_power_bus'], [
          c('O-ring grease kit', 'Supports pressure seal maintenance'),
          c('vacuum leak test port', 'Allows deck-side leak testing'),
          c('diagnostic connector', 'Connects field service tools'),
          c('service checklist card', 'Captures pre-dive and post-dive inspections'),
        ]),
        sub('field_transport', 'Field transport', 'Protects the vehicle and records environmental exposure between missions.', ['service_access', 'hydrodynamic_shell'], [
          c('transport cradle', 'Protects hull and appendages during transit'),
          c('protective nose cover', 'Protects forward sensors and fairing'),
          c('desiccant cartridge', 'Controls humidity inside storage case'),
          c('maintenance log tag', 'Records mission and service history'),
        ]),
      ],
    },
  ]
}

function edgeAiArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const computeTops = parsed.numericFacts.compute_tops ?? 200
  const rackUnits = parsed.numericFacts.rack_units ?? 1
  const powerBudget = parsed.numericFacts.power_budget_w ?? 700
  return [
    {
      id: 'structure_containment',
      displayName: 'Rack Structure Containment',
      purpose: `Provides a ${rackUnits}U rack envelope with controlled airflow, card retention and service access.`,
      interfaces: ['rack_mount', 'airflow_path', 'service_access', 'protective_earth'],
      subModules: [
        sub('rack_chassis', 'Rack chassis', 'Carries appliance boards, power supplies and front-to-back airflow features.', ['rack_mount', 'airflow_path', 'service_access', 'protective_earth'], [
          c('1U rack chassis', 'Defines rack-mount enclosure and airflow envelope'),
          c('slide rail kit', 'Supports rack installation and service pull-out'),
          c('internal divider panel', 'Separates PSU, compute and airflow zones'),
          c('front bezel assembly', 'Protects intake and exposes service indicators'),
        ]),
        sub('accelerator_mounting', 'Accelerator mounting', 'Restrains high-power cards and maintains airflow clearance.', ['rack_mount', 'airflow_path', 'service_access'], [
          c('accelerator retention bracket', 'Locks accelerator card against vibration and service movement'),
          c('PCIe riser support', 'Supports riser and accelerator connector load'),
          c('card stiffener rail', 'Prevents accelerator PCB sag'),
          c('GPU airflow baffle', 'Forces inlet air through accelerator heat sink path'),
        ]),
        sub('service_labelling', 'Service labelling', 'Marks rack identity, airflow direction and field-replaceable units.', ['service_access', 'rack_mount'], [
          c('asset label plate', 'Identifies appliance for fleet management'),
          c('airflow direction label', 'Prevents reversed rack installation'),
          c('rack ear set', 'Fastens chassis to rack posts'),
          c('cable management arm', 'Protects network and power cables during service'),
        ]),
      ],
    },
    {
      id: 'compute_acceleration',
      displayName: 'Compute Acceleration',
      purpose: `Provides roughly ${computeTops} TOPS of accelerator throughput before model and thermal derating evidence.`,
      interfaces: ['pcie_fabric', 'memory_bus', 'gpu_power_bus', 'thermal_path', 'sensor_bus'],
      subModules: [
        sub('accelerator_module', 'Accelerator module', 'Runs neural-network inference workloads at the edge.', ['pcie_fabric', 'gpu_power_bus', 'thermal_path', 'sensor_bus'], [
          c('AI accelerator module', 'Accelerates neural-network inference workloads'),
          c('accelerator carrier board', 'Adapts accelerator module into server PCIe fabric'),
          c('PCIe edge connector', 'Carries high-speed accelerator data lanes'),
          c('accelerator retention latch', 'Locks accelerator card for service and transport'),
        ]),
        sub('cpu_memory_complex', 'CPU and memory complex', 'Hosts preprocessing, runtime orchestration and memory-resident model state.', ['memory_bus', 'pcie_fabric', 'low_voltage_rail', 'sensor_bus'], [
          c('CPU module', 'Runs host operating system and preprocessing work'),
          c('ECC memory', 'Stores model state and runtime buffers with error correction'),
          c('System motherboard', 'Carries CPU, memory, PCIe and management interconnect'),
          c('boot flash device', 'Stores trusted platform firmware baseline'),
        ]),
        sub('signal_power_integrity', 'Signal and power integrity', 'Stabilises accelerator clocks, high-speed lanes and transient power demand.', ['pcie_fabric', 'gpu_power_bus', 'thermal_path'], [
          c('high-current VRM module', 'Regulates accelerator supply rails'),
          c('PCIe retimer set', 'Maintains high-speed lane margin'),
          c('clock distribution device', 'Distributes timing to accelerator and host interfaces'),
          c('power integrity capacitor bank', 'Buffers accelerator transient current'),
        ]),
      ],
    },
    {
      id: 'network_io',
      displayName: 'Network IO',
      purpose: 'Moves inference requests, responses and timing data through the appliance boundary.',
      interfaces: ['inference_network', 'management_network', 'pcie_fabric', 'service_access'],
      subModules: [
        sub('high_speed_network', 'High-speed network', 'Terminates production inference traffic.', ['inference_network', 'pcie_fabric', 'service_access'], [
          c('High-speed NIC', 'Provides production inference network interface'),
          c('optical transceiver cage', 'Accepts fibre or copper network modules'),
          c('NIC heatsink', 'Rejects network-adapter heat into chassis airflow'),
          c('network link LED board', 'Exposes physical link status at the front panel'),
        ]),
        sub('timing_ingest', 'Timing and ingest', 'Synchronises inference streams and accepts trigger inputs where needed.', ['inference_network', 'management_network', 'service_access'], [
          c('PTP timing module', 'Synchronises inference timestamps to network time'),
          c('GPIO trigger input', 'Accepts deterministic external event triggers'),
          c('data ingest connector', 'Provides local data input for commissioning'),
          c('network bypass relay', 'Preserves link path during selected service states'),
        ]),
        sub('io_isolation_routing', 'IO isolation and routing', 'Controls EMC, strain relief and service routing at high-speed ports.', ['inference_network', 'service_access', 'protective_earth'], [
          c('EMI gasket strip', 'Seals I/O opening against emissions'),
          c('shielded IO bracket', 'Terminates cable shields at chassis boundary'),
          c('cable strain relief comb', 'Protects network cable bend radius'),
          c('service loop tie set', 'Organises field cable loops during rack service'),
        ]),
      ],
    },
    {
      id: 'data_storage',
      displayName: 'Data Storage',
      purpose: 'Stores models, runtime images, logs and local inference buffers.',
      interfaces: ['storage_bus', 'pcie_fabric', 'service_access', 'secure_boot_chain'],
      subModules: [
        sub('nvme_storage', 'NVMe storage', 'Provides local high-throughput storage for models and telemetry.', ['storage_bus', 'pcie_fabric', 'service_access'], [
          c('NVMe SSD', 'Stores model cache and local inference data'),
          c('M.2 carrier tray', 'Makes storage device serviceable'),
          c('drive thermal pad', 'Couples storage heat into chassis airflow'),
          c('drive retention screw set', 'Secures storage during rack vibration'),
        ]),
        sub('model_cache', 'Model cache and recovery', 'Keeps model versions, rollback images and erase functions controlled.', ['storage_bus', 'secure_boot_chain', 'management_network'], [
          c('model cache partition', 'Stores deployed model artifacts'),
          c('storage health monitor', 'Reports wear and error statistics'),
          c('secure erase controller', 'Supports controlled data wipe'),
          c('firmware recovery image', 'Restores appliance software baseline'),
        ]),
        sub('log_buffer', 'Log and evidence buffer', 'Captures operational evidence for debugging and compliance review.', ['storage_bus', 'management_network', 'service_access'], [
          c('event log partition', 'Stores timestamped runtime events'),
          c('write endurance counter', 'Tracks drive lifetime consumption'),
          c('crash dump region', 'Captures failure-state evidence'),
          c('log export port', 'Allows controlled export during service'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Control Compute Communication',
      purpose: 'Runs host firmware, inference orchestration, management control and secure remote operation.',
      interfaces: ['pcie_fabric', 'storage_bus', 'management_network', 'inference_network', 'sensor_bus', 'thermal_alarm_bus', 'secure_boot_chain'],
      subModules: [
        sub('host_control', 'Host control', 'Coordinates CPU, accelerator, storage and management functions.', ['pcie_fabric', 'storage_bus', 'management_network', 'sensor_bus'], [
          c('BMC management controller', 'Provides out-of-band platform management'),
          c('management Ethernet PHY', 'Connects BMC to management network'),
          c('BIOS firmware image', 'Initialises platform hardware'),
          c('platform configuration EEPROM', 'Stores board identity and configuration'),
        ]),
        sub('runtime_orchestration', 'Runtime orchestration', 'Loads inference runtime, accelerator drivers and service policy.', ['pcie_fabric', 'storage_bus', 'inference_network', 'secure_boot_chain'], [
          c('inference runtime image', 'Runs model serving process'),
          c('accelerator driver bundle', 'Binds host runtime to accelerator module'),
          c('watchdog service', 'Restarts failed runtime processes'),
          c('configuration manifest', 'Defines deployed model and service policy'),
        ]),
        sub('remote_management', 'Remote management', 'Supports controlled diagnostics and firmware maintenance.', ['management_network', 'service_access', 'secure_boot_chain'], [
          c('out-of-band management port', 'Provides BMC network access'),
          c('serial console header', 'Supports local service diagnostics'),
          c('debug access lockout', 'Prevents unauthorised debug enablement'),
          c('firmware signing key slot', 'Stores key reference for update validation'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Power Distribution',
      purpose: `Converts AC input into protected appliance rails for a ${powerBudget} W power-budget target.`,
      interfaces: ['ac_input_bus', 'low_voltage_rail', 'gpu_power_bus', 'protective_earth', 'hardwired_trip', 'sensor_bus'],
      subModules: [
        sub('ac_input_conversion', 'AC input conversion', 'Accepts rack AC input and provides redundant conversion.', ['ac_input_bus', 'protective_earth', 'sensor_bus'], [
          c('Redundant power supply', 'Converts AC input with redundant hot-swap path', 2, 'each'),
          c('AC inlet filter', 'Suppresses input conducted noise'),
          c('input fuse holder', 'Protects input branch wiring'),
          c('power-good signal harness', 'Reports PSU state to management control'),
        ]),
        sub('dc_rail_distribution', 'DC rail distribution', 'Distributes 12 V and accelerator rails to boards and fans.', ['low_voltage_rail', 'gpu_power_bus', 'service_access'], [
          c('12 V busbar', 'Carries main low-voltage appliance rail'),
          c('accelerator power harness', 'Feeds high-current accelerator inputs'),
          c('hot-swap controller', 'Controls inrush and service insertion'),
          c('fan power distribution loom', 'Feeds fan wall branches'),
        ]),
        sub('hold_up_protection', 'Hold-up and protection', 'Survives short dips and trips unsafe rail faults.', ['low_voltage_rail', 'hardwired_trip', 'sensor_bus'], [
          c('hold-up capacitor module', 'Maintains rail during brief input interruption'),
          c('brownout detector', 'Reports low input or rail collapse'),
          c('current shunt module', 'Measures rail current'),
          c('eFuse channel set', 'Limits branch overloads'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Thermal Airflow Interface',
      purpose: 'Controls front-to-back airflow and heat transfer from accelerator, CPU, NIC and storage.',
      interfaces: ['airflow_path', 'thermal_path', 'fan_control_bus', 'sensor_bus', 'service_access'],
      subModules: [
        sub('forced_air_cooling', 'Forced-air cooling', 'Maintains rack airflow through compute and power zones.', ['airflow_path', 'fan_control_bus', 'sensor_bus'], [
          c('Fan wall assembly', 'Moves cooling air through the 1U chassis'),
          c('PWM fan controller', 'Commands fan speed from thermal telemetry'),
          c('airflow straightener', 'Reduces turbulence at accelerator inlet'),
          c('replaceable dust filter', 'Protects heat sinks in dusty edge sites'),
        ]),
        sub('heat_transfer', 'Heat transfer path', 'Couples accelerator and CPU losses into chassis airflow.', ['thermal_path', 'airflow_path', 'service_access'], [
          c('Heatsink cold plate', 'Transfers accelerator heat into forced airflow path'),
          c('thermal interface material set', 'Improves contact from silicon packages to heat spreader'),
          c('heatpipe assembly', 'Spreads CPU and accelerator heat'),
          c('rear exhaust duct', 'Guides hot air out of rack space'),
        ]),
        sub('inlet_outlet_management', 'Inlet and outlet management', 'Protects rack pressure and prevents hot-air recirculation.', ['airflow_path', 'service_access'], [
          c('front inlet grille', 'Protects intake while preserving airflow'),
          c('rear exhaust grille', 'Protects exhaust opening'),
          c('air seal foam kit', 'Blocks bypass leakage around boards'),
          c('rack pressure map label', 'Records validated inlet pressure assumptions'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Telemetry Instrumentation',
      purpose: 'Measures temperature, fan, power, intrusion and service state for health management.',
      interfaces: ['sensor_bus', 'management_network', 'thermal_alarm_bus', 'fan_control_bus'],
      subModules: [
        sub('thermal_sensors', 'Thermal sensors', 'Measures inlet, accelerator, exhaust and board climate state.', ['sensor_bus', 'thermal_alarm_bus'], [
          c('inlet temperature sensor', 'Measures rack inlet temperature'),
          c('accelerator hotspot sensor', 'Measures accelerator thermal margin'),
          c('exhaust temperature sensor', 'Measures outlet air temperature'),
          c('board humidity sensor', 'Detects condensation risk in edge deployments'),
        ]),
        sub('power_fan_telemetry', 'Power and fan telemetry', 'Feeds PSU, rail and airflow state into BMC management.', ['sensor_bus', 'fan_control_bus', 'management_network'], [
          c('PSU PMBus monitor', 'Reports power supply health and loading'),
          c('rail current monitor', 'Measures appliance branch current'),
          c('fan tachometer hub', 'Reports fan speed and failure state'),
          c('chassis intrusion switch', 'Detects unauthorised opening'),
        ]),
        sub('front_panel_status', 'Front panel status', 'Exposes health and service state to rack technicians.', ['sensor_bus', 'management_network', 'service_access'], [
          c('front status LED board', 'Shows health, fault and activity state'),
          c('UID button', 'Identifies appliance in a rack'),
          c('alarm buzzer', 'Announces local critical faults'),
          c('LCD status panel', 'Displays short diagnostic codes'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Security And Safety Protection',
      purpose: 'Protects boot integrity, operator safety and thermal shutdown paths.',
      interfaces: ['secure_boot_chain', 'thermal_alarm_bus', 'hardwired_trip', 'protective_earth', 'service_access'],
      subModules: [
        sub('secure_boot', 'Secure boot', 'Anchors platform identity and firmware trust.', ['secure_boot_chain', 'management_network', 'service_access'], [
          c('TPM security module', 'Stores measured-boot and key-protection material'),
          c('secure boot policy', 'Defines trusted firmware and runtime chain'),
          c('chassis tamper switch', 'Reports physical access events'),
          c('recovery jumper cover', 'Protects recovery mode from casual access'),
        ]),
        sub('thermal_shutdown', 'Thermal shutdown', 'Trips unsafe thermal or fan-failure states.', ['thermal_alarm_bus', 'hardwired_trip', 'fan_control_bus'], [
          c('thermal trip relay', 'Forces hardware shutdown on overtemperature'),
          c('overtemperature latch', 'Preserves fault state for service review'),
          c('fan failure interlock', 'Blocks high-load operation after fan loss'),
          c('hardwired shutdown line', 'Connects safety chain to power distribution'),
        ]),
        sub('electrical_safety', 'Electrical safety', 'Maintains operator protection and safe service boundaries.', ['protective_earth', 'service_access', 'hardwired_trip'], [
          c('protective earth stud', 'Bonds chassis to rack earth'),
          c('insulation barrier sheet', 'Separates live PSU areas from serviceable zones'),
          c('finger-safe PSU cover', 'Prevents accidental contact during service'),
          c('warning label set', 'Communicates hot-surface and electrical hazards'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Field Maintenance Serviceability',
      purpose: 'Supports rack installation, hot-swap FRUs, diagnostics and firmware recovery.',
      interfaces: ['service_access', 'rack_mount', 'management_network', 'airflow_path'],
      subModules: [
        sub('field_replaceable_units', 'Field-replaceable units', 'Makes high-wear parts replaceable without removing the whole appliance.', ['service_access', 'airflow_path'], [
          c('hot-swap fan carrier', 'Allows failed fan replacement'),
          c('drive service handle', 'Allows NVMe carrier removal'),
          c('PSU latch mechanism', 'Allows redundant PSU replacement'),
          c('accelerator extraction handle', 'Supports controlled accelerator removal'),
        ]),
        sub('rack_installation', 'Rack installation', 'Maintains mechanical support and cabling in edge racks.', ['rack_mount', 'service_access'], [
          c('rack rail kit', 'Supports appliance in two-post or four-post rack'),
          c('rear support bracket', 'Prevents rear chassis sag'),
          c('cable retention comb', 'Keeps management and inference cables ordered'),
          c('airflow blanking panel', 'Prevents rack recirculation around empty space'),
        ]),
        sub('service_workflow', 'Service workflow', 'Captures field diagnostics and controlled recovery evidence.', ['service_access', 'management_network', 'secure_boot_chain'], [
          c('service checklist card', 'Guides safe rack-side service'),
          c('firmware version label', 'Records shipped firmware baseline'),
          c('spare screw kit', 'Maintains service fastener availability'),
          c('diagnostics USB key', 'Bootstraps controlled service diagnostics'),
        ]),
      ],
    },
  ]
}

function hapsArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const altitudeKm = parsed.numericFacts.altitude_km ?? 20
  const enduranceDays = parsed.numericFacts.endurance_days ?? 30
  const wingspanM = parsed.numericFacts.wingspan_m ?? 35
  return [
    {
      id: 'structure_containment',
      displayName: 'Ultra-Light Wing Structure',
      purpose: `Carries a roughly ${wingspanM} m high-aspect-ratio wing, solar skin, propulsion pods and payload loads.`,
      interfaces: ['aero_load_path', 'solar_mount', 'propulsion_mounts', 'service_access', 'payload_mount'],
      subModules: [
        sub('wing_primary_structure', 'Wing primary structure', 'Provides the long-span lift structure and distributed payload mounting.', ['aero_load_path', 'solar_mount', 'propulsion_mounts'], [
          c('High-aspect-ratio wing structure', 'Provides primary lift and structural span for HAPS operation'),
          c('carbon spar cap set', 'Carries bending loads across the wing'),
          c('foam rib set', 'Maintains airfoil shape with low mass'),
          c('wing joiner sleeve', 'Transfers loads across transportable wing sections'),
        ]),
        sub('tail_control_structure', 'Tail and control structure', 'Provides static stability and trim surfaces.', ['aero_load_path', 'flight_control_bus', 'service_access'], [
          c('tail boom assembly', 'Carries tail surfaces and control routing'),
          c('elevator surface', 'Provides pitch trim and control'),
          c('rudder surface', 'Provides yaw trim and control'),
          c('control hinge set', 'Transfers servo motion into aerodynamic surfaces'),
        ]),
        sub('payload_bay_structure', 'Payload bay structure', 'Supports payload, avionics and access panels while preserving aerodynamic form.', ['payload_mount', 'service_access', 'aero_load_path'], [
          c('payload bay frame', 'Carries relay payload and avionics'),
          c('avionics tray', 'Mounts flight computer and power electronics'),
          c('access panel latch set', 'Allows payload and avionics service'),
          c('mass balance bracket', 'Supports centre-of-gravity adjustment'),
        ]),
      ],
    },
    {
      id: 'energy_harvesting',
      displayName: 'Solar Energy Harvesting',
      purpose: 'Converts daytime stratospheric sunlight into regulated electrical energy.',
      interfaces: ['solar_dc_bus', 'solar_mount', 'sensor_bus', 'thermal_path'],
      subModules: [
        sub('solar_skin_array', 'Solar skin array', 'Distributes photovoltaic cells over wing surfaces.', ['solar_dc_bus', 'solar_mount', 'thermal_path'], [
          c('Solar cell array', 'Harvests solar energy across wing surfaces'),
          c('cell interconnect ribbon', 'Connects thin photovoltaic cell strings'),
          c('transparent encapsulation film', 'Protects cells from UV and abrasion'),
          c('solar string bypass diode', 'Limits shaded or failed string losses'),
        ]),
        sub('mppt_conversion', 'MPPT conversion', 'Tracks photovoltaic maximum power and feeds the flight DC bus.', ['solar_dc_bus', 'sensor_bus', 'service_access'], [
          c('MPPT power tracker', 'Converts solar array output at maximum power point'),
          c('solar input current sensor', 'Measures harvested current'),
          c('solar voltage tap loom', 'Measures string voltage balance'),
          c('MPPT heat spreader', 'Conducts converter losses into thermal path'),
        ]),
        sub('solar_health_monitoring', 'Solar health monitoring', 'Detects string degradation and weathering across long endurance missions.', ['solar_dc_bus', 'sensor_bus', 'service_access'], [
          c('solar string monitor board', 'Reports per-string voltage and current'),
          c('UV exposure witness coupon', 'Records surface exposure history'),
          c('wing surface temperature sensor', 'Measures solar skin temperature'),
          c('solar inspection connector', 'Supports ground checkout of string health'),
        ]),
      ],
    },
    {
      id: 'energy_storage_source',
      displayName: 'Night-Cycle Energy Storage',
      purpose: `Stores enough solar energy for night operation during a ${enduranceDays} day station-keeping target.`,
      interfaces: ['battery_dc_bus', 'thermal_path', 'battery_monitor_bus', 'service_access'],
      subModules: [
        sub('stratospheric_battery_pack', 'Stratospheric battery pack', 'Stores night-cycle and transient propulsion energy.', ['battery_dc_bus', 'thermal_path', 'battery_monitor_bus'], [
          c('Stratospheric battery pack', 'Stores night-cycle mission energy'),
          c('battery management board', 'Monitors cell state and protection limits'),
          c('lightweight battery enclosure', 'Restrains cells with minimum structural mass'),
          c('cell heater film', 'Maintains battery temperature during cold soak'),
        ]),
        sub('battery_thermal_zone', 'Battery thermal zone', 'Protects battery capacity in low-pressure, cold stratospheric conditions.', ['thermal_path', 'battery_monitor_bus', 'sensor_bus'], [
          c('battery insulation sleeve', 'Reduces night cold-soak losses'),
          c('phase-change thermal buffer', 'Stabilises battery temperature swing'),
          c('battery temperature sensor harness', 'Reports cell temperature distribution'),
          c('battery vent path', 'Routes abnormal gas away from avionics'),
        ]),
        sub('energy_reserve_monitoring', 'Energy reserve monitoring', 'Tracks day/night balance and mission abort reserve.', ['battery_monitor_bus', 'sensor_bus', 'telemetry_link'], [
          c('coulomb counter module', 'Tracks net energy through charge and discharge'),
          c('reserve energy estimator', 'Calculates mission energy margin'),
          c('battery isolation contactor', 'Disconnects pack during critical fault'),
          c('night-cycle test connector', 'Supports ground simulation of overnight load'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Flight Power Distribution',
      purpose: 'Balances solar input, battery storage and protected load rails for propulsion, avionics and payload.',
      interfaces: ['solar_dc_bus', 'battery_dc_bus', 'propulsion_power_bus', 'payload_power_bus', 'low_voltage_rail', 'hardwired_trip'],
      subModules: [
        sub('solar_battery_power_management', 'Solar and battery power management', 'Combines harvested and stored energy into mission load rails.', ['solar_dc_bus', 'battery_dc_bus', 'propulsion_power_bus', 'payload_power_bus'], [
          c('solar battery charge controller', 'Manages charge from solar array into battery pack'),
          c('main DC bus board', 'Routes energy between solar, battery and loads'),
          c('payload power switch', 'Controls payload load shedding'),
          c('propulsion bus fuse set', 'Protects distributed propulsion branches'),
        ]),
        sub('low_voltage_distribution', 'Low-voltage distribution', 'Feeds avionics, sensors, servos and communications loads.', ['low_voltage_rail', 'payload_power_bus', 'service_access'], [
          c('avionics DC converter', 'Creates regulated avionics rail'),
          c('servo power rail', 'Feeds control surface servos'),
          c('communications DC converter', 'Feeds payload and telemetry electronics'),
          c('low-voltage harness loom', 'Routes power to distributed avionics'),
        ]),
        sub('load_shed_protection', 'Load-shed protection', 'Protects mission reserve during energy-negative conditions.', ['hardwired_trip', 'payload_power_bus', 'battery_monitor_bus'], [
          c('load shed relay set', 'Disconnects payload or noncritical loads'),
          c('brownout supervisor', 'Detects rail collapse risk'),
          c('energy priority controller', 'Ranks loads during low-energy operation'),
          c('fault latch indicator', 'Captures power fault state for recovery'),
        ]),
      ],
    },
    {
      id: 'actuation_kinematics',
      displayName: 'Propulsion And Control Surfaces',
      purpose: 'Generates efficient station-keeping thrust and aerodynamic trim in thin stratospheric air.',
      interfaces: ['propulsion_power_bus', 'flight_control_bus', 'propulsion_mounts', 'aero_load_path'],
      subModules: [
        sub('electric_propulsion_pods', 'Electric propulsion pods', 'Provides distributed propulsive thrust along the wing.', ['propulsion_power_bus', 'flight_control_bus', 'propulsion_mounts'], [
          c('Electric propulsion pod', 'Generates station-keeping thrust in thin air', 4, 'each'),
          c('high-altitude propeller set', 'Converts motor torque into efficient low-density-air thrust'),
          c('motor controller module', 'Commands propulsion motor speed'),
          c('propulsion pod fairing', 'Reduces drag around motor and wiring'),
        ]),
        sub('control_surface_actuation', 'Control surface actuation', 'Moves trim surfaces with low power and reliable feedback.', ['flight_control_bus', 'aero_load_path', 'low_voltage_rail'], [
          c('low-temperature servo actuator', 'Moves elevator and rudder surfaces'),
          c('control linkage rod set', 'Transfers servo force to surfaces'),
          c('surface position sensor', 'Reports actuator position to flight controller'),
          c('servo heater trace', 'Maintains actuator operation in cold conditions'),
        ]),
        sub('station_keeping_trim', 'Station-keeping trim', 'Supports efficient loiter in variable stratospheric winds.', ['flight_control_bus', 'sensor_bus', 'aero_load_path'], [
          c('trim schedule table', 'Defines energy-efficient loiter trim states'),
          c('gust load estimator', 'Feeds flight controller with structural load estimate'),
          c('airspeed setpoint manager', 'Maintains efficient station-keeping speed'),
          c('propulsion calibration record', 'Maps throttle to thrust under low-density conditions'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Autonomy Control Communication',
      purpose: 'Runs autonomous station keeping, energy management, payload coordination and ground command links.',
      interfaces: ['flight_control_bus', 'sensor_bus', 'telemetry_link', 'battery_monitor_bus', 'payload_data_link', 'hardwired_trip'],
      subModules: [
        sub('flight_control_computer', 'Flight control computer', 'Executes flight stabilisation, energy-aware routing and station keeping.', ['flight_control_bus', 'sensor_bus', 'battery_monitor_bus', 'hardwired_trip'], [
          c('Flight control computer', 'Runs autonomous flight control and station keeping'),
          c('autopilot IO board', 'Interfaces with sensors, servos and propulsion controllers'),
          c('flight software image', 'Defines autonomous flight and energy states'),
          c('watchdog supervisor', 'Forces safe mode when flight software stalls'),
        ]),
        sub('ground_command_link', 'Ground command link', 'Maintains command, telemetry and mission supervision.', ['telemetry_link', 'payload_data_link', 'service_access'], [
          c('Ground control link', 'Carries command, telemetry and recovery coordination'),
          c('telemetry transceiver', 'Transmits flight health and state'),
          c('command authentication module', 'Controls command acceptance'),
          c('mission log recorder', 'Stores command and telemetry history'),
        ]),
        sub('energy_aware_autonomy', 'Energy-aware autonomy', 'Coordinates route, payload duty cycle and energy reserve.', ['battery_monitor_bus', 'payload_data_link', 'flight_control_bus'], [
          c('solar forecast model', 'Estimates future solar energy availability'),
          c('wind field route planner', 'Plans station-keeping path against winds'),
          c('payload duty-cycle controller', 'Limits payload energy consumption'),
          c('return corridor manager', 'Maintains route to recovery zone'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Navigation And Airdata Sensing',
      purpose: 'Measures navigation, airdata, structural loads and energy state for closed-loop autonomy.',
      interfaces: ['sensor_bus', 'flight_control_bus', 'aero_load_path', 'telemetry_link'],
      subModules: [
        sub('navigation_suite', 'Navigation suite', 'Provides position, attitude and timing references.', ['sensor_bus', 'flight_control_bus', 'telemetry_link'], [
          c('GNSS INS navigation unit', 'Provides navigation and attitude reference'),
          c('barometric altitude sensor', 'Measures pressure altitude'),
          c('sun sensor pair', 'Reports sun angle for energy model'),
          c('precision timebase module', 'Synchronises flight and payload records'),
        ]),
        sub('airdata_weather_sensors', 'Airdata and weather sensors', 'Measures local atmosphere and flight condition.', ['sensor_bus', 'flight_control_bus'], [
          c('pitot static probe', 'Measures airspeed and static pressure'),
          c('outside air temperature probe', 'Measures stratospheric ambient temperature'),
          c('wind estimation filter', 'Estimates winds from navigation and airdata'),
          c('humidity frost sensor', 'Detects icing or frost risk during climb/descent'),
        ]),
        sub('structural_health_sensing', 'Structural health sensing', 'Tracks load and deformation over long-span flight.', ['sensor_bus', 'aero_load_path', 'telemetry_link'], [
          c('wing strain gauge strip', 'Measures wing bending loads'),
          c('spar temperature sensor', 'Measures structural thermal gradients'),
          c('vibration accelerometer', 'Detects aeroelastic excitation'),
          c('structural health recorder', 'Stores load history for post-flight review'),
        ]),
      ],
    },
    {
      id: 'payload_communication',
      displayName: 'Communications Payload',
      purpose: 'Provides relay or observation service payload with controlled power, RF and data interfaces.',
      interfaces: ['payload_data_link', 'payload_power_bus', 'rf_aperture', 'thermal_path', 'service_access'],
      subModules: [
        sub('payload_radio', 'Payload radio', 'Carries communications relay payload electronics.', ['payload_data_link', 'payload_power_bus', 'thermal_path'], [
          c('Stratospheric communications payload', 'Provides service payload relay'),
          c('payload modem board', 'Processes relay waveform and data interface'),
          c('payload RF power amplifier', 'Drives payload antenna signal'),
          c('payload processor module', 'Coordinates payload traffic and telemetry'),
        ]),
        sub('antenna_aperture', 'Antenna aperture', 'Provides RF aperture and beam orientation support.', ['rf_aperture', 'payload_data_link', 'aero_load_path'], [
          c('Payload antenna array', 'Provides payload RF aperture'),
          c('antenna ground plane film', 'Improves RF efficiency on lightweight structure'),
          c('antenna feed harness', 'Routes RF signals to payload electronics'),
          c('beam pointing calibration target', 'Supports antenna alignment checks'),
        ]),
        sub('payload_integration', 'Payload integration', 'Controls payload mounting, thermal coupling and service access.', ['payload_power_bus', 'thermal_path', 'service_access'], [
          c('payload isolation mount', 'Reduces vibration transfer into payload electronics'),
          c('payload thermal strap', 'Conducts payload heat to structure'),
          c('payload access hatch', 'Allows field payload service'),
          c('payload configuration tag', 'Records payload version and allowed duty cycle'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Stratospheric Environmental Interface',
      purpose: `Protects systems from low pressure, cold soak, UV exposure and thermal cycling near ${altitudeKm} km altitude.`,
      interfaces: ['thermal_path', 'solar_mount', 'service_access', 'rf_aperture', 'aero_load_path'],
      subModules: [
        sub('thermal_protection', 'Thermal protection', 'Controls cold-soak and daytime heating across batteries, avionics and payload.', ['thermal_path', 'service_access'], [
          c('Thermal insulation blanket', 'Protects systems from stratospheric cold soak'),
          c('multi-layer insulation patch', 'Reduces radiative heat loss'),
          c('lightweight thermal strap', 'Conducts local heat to controlled zones'),
          c('thermal witness label', 'Records exposure during ground and flight operations'),
        ]),
        sub('uv_surface_protection', 'UV and surface protection', 'Protects solar skin and airframe surface from UV, ozone and abrasion.', ['solar_mount', 'aero_load_path', 'service_access'], [
          c('UV protective film', 'Protects wing skin and solar encapsulation'),
          c('leading edge erosion tape', 'Protects wing leading edge'),
          c('surface contamination wipe kit', 'Supports solar surface cleaning'),
          c('coating inspection marker', 'Records surface protection condition'),
        ]),
        sub('low_pressure_management', 'Low-pressure electronics management', 'Accounts for low pressure cooling and electrical spacing.', ['thermal_path', 'payload_power_bus', 'service_access'], [
          c('low-pressure vent path', 'Prevents trapped pressure in enclosures'),
          c('conformal coating set', 'Protects avionics from condensation and corona risk'),
          c('high-altitude creepage spacer', 'Maintains electrical spacing margin'),
          c('desiccant cartridge', 'Controls moisture during climb and descent'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Flight Safety And Recovery',
      purpose: 'Protects airspace, ground risk and vehicle hardware during energy faults, lost-link and descent.',
      interfaces: ['hardwired_trip', 'telemetry_link', 'flight_control_bus', 'service_access', 'aero_load_path'],
      subModules: [
        sub('abort_recovery', 'Abort and recovery', 'Provides controlled descent and recovery location after mission abort.', ['hardwired_trip', 'telemetry_link', 'flight_control_bus'], [
          c('Recovery parachute system', 'Provides controlled descent after abort'),
          c('parachute deployment controller', 'Commands recovery system release'),
          c('recovery beacon', 'Transmits location after descent'),
          c('safe descent mode logic', 'Coordinates energy and flight state for descent'),
        ]),
        sub('airspace_safety', 'Airspace safety', 'Maintains geofence, lost-link and flight termination policies.', ['flight_control_bus', 'telemetry_link', 'hardwired_trip'], [
          c('geofence database', 'Defines allowed operating volume'),
          c('lost-link failsafe', 'Commands safe behaviour after telemetry loss'),
          c('flight termination relay', 'Cuts critical loads under commanded termination'),
          c('airspace transponder module', 'Reports aircraft identity and position'),
        ]),
        sub('ground_handling_safety', 'Ground handling safety', 'Controls launch, recovery and battery handling hazards.', ['service_access', 'aero_load_path', 'battery_monitor_bus'], [
          c('launch arming interlock', 'Prevents unintended propulsion during handling'),
          c('propulsion safety pin set', 'Physically safes propulsion pods'),
          c('battery handling placard', 'Communicates pack service limits'),
          c('recovery inspection checklist', 'Captures post-flight safety status'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Ground Handling Serviceability',
      purpose: 'Supports wing assembly, launch preparation, payload checkout and recovery inspection.',
      interfaces: ['service_access', 'aero_load_path', 'telemetry_link', 'solar_mount'],
      subModules: [
        sub('wing_assembly_service', 'Wing assembly service', 'Makes distributed wing sections inspectable and assembled repeatably.', ['service_access', 'aero_load_path', 'solar_mount'], [
          c('wing assembly jig', 'Aligns span sections during setup'),
          c('spar pin torque tool', 'Sets wing joiner fastener preload'),
          c('solar skin protection mat', 'Protects solar cells during assembly'),
          c('assembly witness mark set', 'Shows correct fastener and connector state'),
        ]),
        sub('launch_recovery_equipment', 'Launch and recovery equipment', 'Supports low-speed launch and controlled recovery handling.', ['service_access', 'aero_load_path', 'telemetry_link'], [
          c('launch dolly interface', 'Locates airframe during launch roll'),
          c('wingtip handling fixture', 'Supports long-span ground handling'),
          c('recovery cradle', 'Protects airframe after descent'),
          c('ground wind limit placard', 'Communicates launch and handling limits'),
        ]),
        sub('payload_checkout', 'Payload checkout', 'Verifies communications payload and telemetry before launch.', ['service_access', 'payload_data_link', 'telemetry_link'], [
          c('payload checkout cable', 'Connects payload to ground test equipment'),
          c('RF load test adapter', 'Tests payload radio without radiating'),
          c('telemetry ground terminal', 'Verifies ground control link before launch'),
          c('preflight log card', 'Captures payload, energy and flight readiness'),
        ]),
      ],
    },
  ]
}

function cgmArchitecture(parsed: ParsedBrief): ScratchModuleSpec[] {
  const wearDays = parsed.numericFacts.wear_days ?? 14
  const intervalMinutes = parsed.numericFacts.reading_interval_minutes ?? 5
  const mard = parsed.numericFacts.mard_percent ?? 9
  return [
    {
      id: 'skin_patient_interface',
      displayName: 'Skin Patient Interface',
      purpose: `Maintains adhesive, sterile and comfort boundaries for roughly ${wearDays} days of continuous wear.`,
      interfaces: ['adhesive_skin_boundary', 'interstitial_fluid_path', 'sterile_boundary', 'insertion_path', 'service_access'],
      subModules: [
        sub('adhesive_patch_stack', 'Adhesive patch stack', 'Keeps the patch attached while preserving skin comfort and fluid access.', ['adhesive_skin_boundary', 'interstitial_fluid_path', 'sterile_boundary'], [
          c('Adhesive skin patch', 'Bonds the wearable device to skin'),
          c('hydrocolloid edge seal', 'Reduces edge lift during wear'),
          c('breathable backing film', 'Limits moisture buildup under the patch'),
          c('pull tab liner', 'Supports controlled patch removal'),
        ]),
        sub('cannula_skin_contact', 'Sensor skin contact', 'Positions the filament entry site and protects the skin boundary.', ['interstitial_fluid_path', 'insertion_path', 'sterile_boundary'], [
          c('skin contact gasket', 'Seals around the sensor entry site'),
          c('filament entry seal', 'Limits contamination and fluid migration'),
          c('antimicrobial contact pad', 'Reduces contamination risk at insertion site'),
          c('insertion site spacing ring', 'Controls local pressure around the filament'),
        ]),
        sub('wear_comfort_retention', 'Wear comfort and retention', 'Controls patch flex, sweat movement and user removal.', ['adhesive_skin_boundary', 'service_access'], [
          c('flex relief bridge', 'Lets the patch move with skin'),
          c('sweat channel texture', 'Routes perspiration away from electronics'),
          c('patch stretch zone', 'Reduces peel force during movement'),
          c('removal aid tab', 'Helps the user remove the worn patch'),
        ]),
      ],
    },
    {
      id: 'sensing_instrumentation',
      displayName: 'Glucose Sensing Instrumentation',
      purpose: `Measures interstitial glucose and supports a target MARD near ${mard}% before clinical validation.`,
      interfaces: ['interstitial_fluid_path', 'electrode_signal_path', 'sensor_signal_bus', 'calibration_data_bus', 'analog_power_rail', 'temperature_compensation_bus'],
      subModules: [
        sub('glucose_filament_stack', 'Glucose filament stack', 'Combines electrochemical layers into the patient-contact sensing path.', ['interstitial_fluid_path', 'electrode_signal_path', 'analog_power_rail'], [
          c('Glucose sensing filament', 'Contacts interstitial fluid for glucose measurement'),
          c('Enzyme reagent membrane', 'Provides glucose-selective chemistry'),
          c('Reference electrode', 'Provides electrochemical reference potential'),
          c('diffusion limiting membrane', 'Controls analyte transport to the reagent layer'),
        ]),
        sub('analog_front_end', 'Analog front end', 'Biases, reads and filters the electrochemical sensor signal.', ['electrode_signal_path', 'sensor_signal_bus', 'analog_power_rail'], [
          c('potentiostat AFE', 'Measures electrochemical current'),
          c('low-leakage input guard', 'Reduces measurement leakage errors'),
          c('electrode flex tail', 'Routes sensor electrodes to electronics'),
          c('sensor bias resistor network', 'Sets measurement bias and diagnostics'),
        ]),
        sub('calibration_drift_monitoring', 'Calibration and drift monitoring', 'Stores factory calibration and tracks signal quality.', ['sensor_signal_bus', 'calibration_data_bus', 'temperature_compensation_bus'], [
          c('calibration data EEPROM', 'Stores lot and factory calibration constants'),
          c('drift estimator firmware table', 'Flags likely chemistry drift'),
          c('factory calibration code', 'Links sensor output to release calibration'),
          c('signal integrity test pad', 'Supports production electrical test'),
        ]),
      ],
    },
    {
      id: 'actuation_kinematics',
      displayName: 'Applicator Insertion Mechanism',
      purpose: 'Inserts the filament to a controlled depth and locks out the used sharps path.',
      interfaces: ['insertion_path', 'sterile_boundary', 'user_trigger', 'service_access'],
      subModules: [
        sub('disposable_applicator', 'Disposable applicator', 'Presents the sensor and insertion action to the user.', ['insertion_path', 'sterile_boundary', 'user_trigger'], [
          c('Disposable applicator', 'Provides controlled sensor insertion'),
          c('spring insertion driver', 'Stores energy for repeatable insertion force'),
          c('trigger button', 'Starts user-controlled insertion'),
          c('safety cap', 'Protects sterile path before use'),
        ]),
        sub('insertion_mechanism', 'Insertion mechanism', 'Guides filament placement and retracts introducer hardware.', ['insertion_path', 'user_trigger'], [
          c('introducer needle', 'Opens insertion path for the sensor filament'),
          c('filament deployment shuttle', 'Carries filament during insertion'),
          c('depth stop collar', 'Limits insertion depth'),
          c('retraction latch', 'Locks the introducer after deployment'),
        ]),
        sub('sharps_lockout', 'Sharps lockout', 'Prevents reuse and shields the needle after application.', ['service_access', 'sterile_boundary'], [
          c('needle shield', 'Covers the introducer after use'),
          c('post-use lock tab', 'Prevents re-triggering after deployment'),
          c('applicator status window', 'Shows ready or used state'),
          c('trigger interlock spring', 'Blocks accidental deployment'),
        ]),
      ],
    },
    {
      id: 'structure_containment',
      displayName: 'Transmitter Housing Structure',
      purpose: 'Carries electronics, antenna, battery and seals inside a low-profile wearable transmitter.',
      interfaces: ['electronics_mount', 'ingress_boundary', 'adhesive_skin_boundary', 'service_access'],
      subModules: [
        sub('transmitter_housing', 'Transmitter housing', 'Protects electronics while staying wearable under clothing.', ['electronics_mount', 'ingress_boundary', 'adhesive_skin_boundary'], [
          c('Protective transmitter housing', 'Protects transmitter electronics from impact and splash'),
          c('ultrasonic weld seam', 'Closes the transmitter housing'),
          c('electronics carrier tray', 'Positions PCB and battery'),
          c('ingress gasket', 'Seals housing-to-patch interface'),
        ]),
        sub('patch_mechanical_frame', 'Patch mechanical frame', 'Links adhesive patch, sensor port and transmitter latch features.', ['electronics_mount', 'adhesive_skin_boundary', 'insertion_path'], [
          c('flexible patch frame', 'Carries sensor and transmitter loads'),
          c('sensor port boss', 'Locates the sensor filament exit'),
          c('transmitter latch rail', 'Retains electronics module on patch'),
          c('strain relief web', 'Reduces flex concentration near sensor port'),
        ]),
        sub('ingress_boundary', 'Ingress boundary', 'Controls sweat, splash and cleaning exposure around the electronics.', ['ingress_boundary', 'service_access'], [
          c('hydrophobic vent membrane', 'Equalises pressure while blocking water'),
          c('IP ingress seal', 'Maintains splash boundary'),
          c('splash shield lip', 'Deflects water and sweat'),
          c('housing serial marking', 'Links housing to manufacturing record'),
        ]),
      ],
    },
    {
      id: 'energy_storage_source',
      displayName: 'Wearable Energy Source',
      purpose: `Stores enough energy for ${wearDays} days of measurement and BLE telemetry.`,
      interfaces: ['cell_power_bus', 'service_access', 'lot_traceability'],
      subModules: [
        sub('battery_cell', 'Battery cell', 'Provides compact stored energy for the wear period.', ['cell_power_bus', 'lot_traceability'], [
          c('Thin-film battery', 'Stores energy for the wearable patch'),
          c('battery weld tab', 'Connects cell to electronics'),
          c('battery pouch insulator', 'Separates battery from housing'),
          c('state-of-charge witness pad', 'Supports production activation test'),
        ]),
        sub('power_reserve', 'Power reserve', 'Preserves operation during radio bursts and end-of-wear reserve.', ['cell_power_bus', 'service_access'], [
          c('brownout hold-up capacitor', 'Maintains rail during BLE bursts'),
          c('battery cut-off tab', 'Prevents discharge before activation'),
          c('shelf-life isolation film', 'Protects battery during storage'),
          c('activation pull strip', 'Starts device power during setup'),
        ]),
        sub('battery_safety', 'Battery safety', 'Controls battery fault, traceability and shelf handling hazards.', ['cell_power_bus', 'lot_traceability'], [
          c('battery vent clearance', 'Prevents housing stress during abnormal cell event'),
          c('reverse polarity fuse', 'Limits assembly fault current'),
          c('pack temperature dot', 'Records abusive storage exposure'),
          c('battery lot barcode', 'Links cell lot to release record'),
        ]),
      ],
    },
    {
      id: 'power_distribution',
      displayName: 'Low-Power Distribution',
      purpose: 'Duty-cycles sensor, MCU and radio loads while protecting the patient-contact electronics.',
      interfaces: ['cell_power_bus', 'low_power_rail', 'analog_power_rail', 'hardwired_trip', 'sensor_signal_bus'],
      subModules: [
        sub('low_power_rails', 'Low-power rails', 'Creates efficient rails for digital control and BLE telemetry.', ['cell_power_bus', 'low_power_rail', 'hardwired_trip'], [
          c('nanoamp power switch', 'Enables ultra-low standby current'),
          c('digital buck regulator', 'Feeds MCU and BLE loads'),
          c('rail measurement divider', 'Reports battery and rail state'),
          c('wake timer oscillator', 'Schedules low-power wake cycles'),
        ]),
        sub('analog_excitation', 'Analog excitation', 'Feeds low-noise power to electrochemical sensing.', ['cell_power_bus', 'analog_power_rail', 'sensor_signal_bus'], [
          c('sensor excitation mux', 'Selects sensor bias and diagnostics'),
          c('analog power filter', 'Reduces noise on the AFE rail'),
          c('electrode guard driver', 'Guards high-impedance sensor traces'),
          c('AFE wake timer', 'Powers analog sensing only when needed'),
        ]),
        sub('power_fault_handling', 'Power fault handling', 'Protects against rail collapse or unsafe current draw.', ['hardwired_trip', 'low_power_rail', 'analog_power_rail'], [
          c('hardwired reset supervisor', 'Resets logic on unsafe rail state'),
          c('overcurrent limiter', 'Limits fault current'),
          c('load gate transistor', 'Disconnects failed subcircuits'),
          c('fault latch', 'Stores power fault state for telemetry'),
        ]),
      ],
    },
    {
      id: 'control_compute_communication',
      displayName: 'Control Compute Communication',
      purpose: `Processes glucose data at roughly ${intervalMinutes} minute intervals and transmits encrypted readings.`,
      interfaces: ['sensor_signal_bus', 'calibration_data_bus', 'ble_link', 'alarm_state_bus', 'low_power_rail', 'temperature_compensation_bus'],
      subModules: [
        sub('mcu_firmware', 'MCU firmware', 'Runs sampling, compensation, filtering and device-state logic.', ['sensor_signal_bus', 'calibration_data_bus', 'low_power_rail', 'temperature_compensation_bus'], [
          c('Low-power microcontroller', 'Runs CGM signal processing and control logic'),
          c('firmware image', 'Defines sampling and alarm behaviour'),
          c('secure boot key store', 'Protects executable firmware path'),
          c('real-time clock', 'Timestamps readings and alarms'),
        ]),
        sub('ble_telemetry', 'BLE telemetry', 'Pairs with a reader or phone and sends trend data.', ['ble_link', 'low_power_rail', 'alarm_state_bus'], [
          c('BLE radio module', 'Transmits glucose trend data'),
          c('printed antenna', 'Radiates BLE signal through wearable housing'),
          c('pairing button pad', 'Supports controlled pairing flow'),
          c('encrypted session counter', 'Prevents replayed telemetry sessions'),
        ]),
        sub('data_buffering', 'Data buffering', 'Stores recent readings and diagnostic events between connections.', ['sensor_signal_bus', 'calibration_data_bus', 'alarm_state_bus'], [
          c('glucose trend buffer flash', 'Stores readings during phone disconnects'),
          c('event log memory', 'Records alarms and device faults'),
          c('calibration data bus bridge', 'Moves calibration constants to runtime logic'),
          c('clock drift compensator', 'Corrects timestamp drift across wear period'),
        ]),
      ],
    },
    {
      id: 'environmental_interface',
      displayName: 'Wear Environment Compensation',
      purpose: 'Accounts for body temperature, sweat, ingress and movement that can bias sensor readings.',
      interfaces: ['temperature_compensation_bus', 'ingress_boundary', 'adhesive_skin_boundary', 'sensor_signal_bus'],
      subModules: [
        sub('temperature_compensation', 'Temperature compensation', 'Measures skin-side temperature for chemistry compensation.', ['temperature_compensation_bus', 'sensor_signal_bus'], [
          c('Temperature sensor', 'Measures local skin-side temperature'),
          c('thermal model table', 'Compensates chemistry response'),
          c('skin temperature flex tail', 'Places sensor near patient boundary'),
          c('cold-start delay flag', 'Blocks early readings until stable'),
        ]),
        sub('sweat_water_boundary', 'Sweat and water boundary', 'Surfaces exposure conditions that can threaten patch reliability.', ['ingress_boundary', 'adhesive_skin_boundary'], [
          c('sweat barrier film', 'Diverts perspiration away from electronics'),
          c('condensation drain groove', 'Routes moisture away from sensor port'),
          c('humidity indicator dot', 'Shows water exposure during review'),
          c('ingress exposure witness', 'Records splash or sweat exposure'),
        ]),
        sub('motion_pressure', 'Motion and pressure artefact control', 'Flags physical conditions that can create signal artefacts.', ['adhesive_skin_boundary', 'sensor_signal_bus'], [
          c('motion artefact filter table', 'Filters movement-linked signal errors'),
          c('patch pressure relief slot', 'Reduces local compression artefact'),
          c('compression warning marker', 'Records unacceptable pressure marks'),
          c('activity context accelerometer', 'Feeds artefact detection logic'),
        ]),
      ],
    },
    {
      id: 'safety_protection',
      displayName: 'Patient Safety Protection',
      purpose: 'Controls alarms, stale data lockout, patient-contact evidence and applicator warnings.',
      interfaces: ['alarm_state_bus', 'sterile_boundary', 'adhesive_skin_boundary', 'hardwired_trip', 'service_access'],
      subModules: [
        sub('patient_alarm_logic', 'Patient alarm logic', 'Classifies clinically relevant sensor and telemetry states.', ['alarm_state_bus', 'sensor_signal_bus'], [
          c('hypoglycaemia alarm state', 'Flags low-glucose risk state'),
          c('hyperglycaemia alarm state', 'Flags high-glucose risk state'),
          c('sensor fault classifier', 'Detects failed or implausible readings'),
          c('stale data lockout', 'Stops outdated readings being treated as current'),
        ]),
        sub('biocompatibility_controls', 'Biocompatibility controls', 'Connects material and adhesive choices to patient-contact review.', ['adhesive_skin_boundary', 'service_access'], [
          c('biocompatibility material record', 'Tracks patient-contact materials'),
          c('adhesive irritation limit tag', 'Records adhesive exposure limit'),
          c('latex-free label', 'Identifies allergy-relevant material status'),
          c('skin-contact change log', 'Captures material revisions'),
        ]),
        sub('sterile_sharps_safety', 'Sterile and sharps safety', 'Controls sterile path, warnings and disposal state.', ['sterile_boundary', 'hardwired_trip', 'service_access'], [
          c('sterile boundary indicator', 'Confirms sterile packaging state before use'),
          c('sharps injury warning label', 'Communicates applicator hazard'),
          c('applicator disposal instruction', 'Guides safe disposal after use'),
          c('tamper evident seal', 'Shows packaging compromise'),
        ]),
      ],
    },
    {
      id: 'maintenance_serviceability',
      displayName: 'Packaging Traceability Serviceability',
      purpose: 'Preserves sterility, setup clarity, UDI traceability and release records until application.',
      interfaces: ['sterile_boundary', 'lot_traceability', 'service_access', 'ble_link'],
      subModules: [
        sub('sterile_packaging', 'Sterile packaging', 'Protects sensor, adhesive and applicator until use.', ['sterile_boundary', 'lot_traceability'], [
          c('Sterile barrier pouch', 'Protects the sterile device until use'),
          c('desiccant sachet', 'Controls moisture during shelf life'),
          c('pouch seal indicator', 'Shows packaging seal condition'),
          c('expiry date label', 'Communicates sterile shelf-life limit'),
        ]),
        sub('lot_traceability', 'Lot traceability', 'Links device, sensor chemistry and packaging to regulated release records.', ['lot_traceability', 'service_access'], [
          c('UDI label set', 'Provides regulated device identification'),
          c('IFU leaflet', 'Provides user instructions for setup and wear'),
          c('lot traceability barcode', 'Links production lot to release records'),
          c('release inspection stamp', 'Shows final inspection status'),
        ]),
        sub('user_setup', 'User setup', 'Supports pairing, warm-up and safe removal instructions.', ['service_access', 'ble_link'], [
          c('phone pairing QR card', 'Helps connect the patch to a reader or phone'),
          c('applicator instruction card', 'Guides user insertion sequence'),
          c('sensor warm-up timer label', 'Communicates no-reading warm-up period'),
          c('adhesive removal wipe', 'Supports skin-safe removal'),
        ]),
      ],
    },
  ]
}

function genericArchitecture(productClass: ProductClass): ScratchModuleSpec[] {
  return [
    {
      id: 'core_system',
      displayName: 'Core System',
      purpose: `Implements the primary ${productClass} function.`,
      interfaces: ['power', 'control', 'service_access'],
      subModules: [
        sub('primary_assembly', 'Primary assembly', 'Carries the main product function.', ['power', 'control'], [
          c('primary functional assembly', 'Implements the main function'),
          c('supporting frame', 'Carries the assembly'),
          c('control interface', 'Connects to control system'),
        ]),
      ],
    },
  ]
}

function sub(id: string, name: string, purpose: string, interfaces: string[], components: ScratchComponentSpec[]): ScratchSubModuleSpec {
  return { id, name, purpose, interfaces, components }
}

function c(name: string, role: string, quantity = 1, unit = 'candidate'): ScratchComponentSpec {
  return { name, role, quantity, unit }
}

function normaliseId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

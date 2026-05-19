/**
 * @file class-connections.ts — Per-product-class registry of REQUIRED
 * cross-module connections. Same data-not-code pattern as class-floors.ts /
 * class-standards.ts / class-hazards.ts.
 *
 * Tristan directive 2026-05-16 (post iter-60b audit): the engine emits
 * cross-module grammar_links freely but doesn't enforce that the PHYSICALLY
 * REQUIRED ones are present. iter-60b BESS had ESM ↔ environmental_interface,
 * ESM ↔ power_distribution, ESM ↔ safety_protection ↔ ESM, ESM ↔ mass_fluid.
 * But MISSING were: ESM ↔ control_compute_communication (BMS master should
 * report to EMS), ESM ↔ sensing_instrumentation (pack sensors feed back to
 * pack instrumentation), ESM ↔ structure_containment (racks bolt to floor),
 * ESM ↔ maintenance_serviceability (service port access). All four are
 * physically required for any real BESS.
 *
 * Each connection is bidirectional in this registry — the gate accepts a
 * link in either direction. Mechanism is also flexible: if the registry
 * requires {module_a, module_b, kind: 'electrical' | 'thermal' | 'control' |
 * 'mechanical' | 'safety'}, the gate accepts any specific mechanism that
 * falls under that kind (e.g. 'can_bus' for control, 'dc_busbar' for
 * electrical, 'mechanical_mount' for mechanical).
 */

export type ConnectionKind = 'electrical' | 'thermal' | 'control' | 'mechanical' | 'safety' | 'fluid' | 'data' | 'service'

export interface RequiredConnection {
  /** Bidirectional pair of module ids. */
  module_a: string
  module_b: string
  /** Kind of physical/logical relationship that must exist between them. */
  kind: ConnectionKind
  /** Why this connection is physically required for this product class. */
  applies_because: string
}

export interface ClassConnections {
  product_class: string
  display_name: string
  connections: RequiredConnection[]
}

// Mechanism → kind mapping used by the gate to classify actual links.
//
// 2026-05-19: massively expanded after a heatpump re-render dropped 93/118
// LLM-emitted cross-links (78%) silently. The reviewer LLMs naturally produce
// English-style terms (`safety_isolation`, `refrigerant_line`, `electrical_power`,
// `data_bus`, `fluid_flow_state`) that didn't appear in the original strict
// taxonomy. Both styles are now accepted; `mechanismToKind()` (below) adds a
// substring-based fallback for any future drift so the gate can't be defeated
// by a synonym again.
export const MECHANISM_TO_KIND: Record<string, ConnectionKind> = {
  // Electrical
  dc_busbar:           'electrical',
  ac_busbar:           'electrical',
  power_supply:        'electrical',
  power_distribution:  'electrical',
  cable_routing:       'electrical',
  electrical_power:    'electrical',
  power_routing:       'electrical',
  electrical:          'electrical',
  // Thermal
  thermal_contact:     'thermal',
  thermal_path:        'thermal',
  cooling_loop:        'thermal',
  heat_rejection:      'thermal',
  cooling:             'thermal',
  // Fluid
  coolant_supply:      'fluid',
  coolant_return:      'fluid',
  refrigerant_loop:    'fluid',
  refrigerant_line:    'fluid',
  pipe_run:            'fluid',
  manifold_run:        'fluid',
  fluid_flow_state:    'fluid',
  fluid_flow:          'fluid',
  air_duct:            'fluid',
  air_flow:            'fluid',
  // Control / data
  can_bus:             'control',
  modbus:              'control',
  modbus_tcp:          'control',
  ethernet:            'data',
  contactor_command:   'control',
  pwm_command:         'control',
  data_link:           'data',
  data_bus:            'data',
  telemetry:           'data',
  heater_enable:       'control',
  control_signal:      'control',
  analog_signal:       'data',
  sensor_feedback:     'data',
  // Mechanical
  mechanical_mount:    'mechanical',
  mount:               'mechanical',
  support:             'mechanical',
  bolted_joint:        'mechanical',
  // Safety
  cell_level_safety:   'safety',
  safety_interlock:    'safety',
  safety_isolation:    'safety',
  emergency_stop:      'safety',
  alarm_interlock:     'safety',
  // Service
  service_port:        'service',
  maintenance_access:  'service',
}

/**
 * Resolve an arbitrary mechanism string to a ConnectionKind. Tries the strict
 * MECHANISM_TO_KIND map first, then falls back to a TOKEN-based heuristic so
 * unknown-but-recognisable terms still classify (prevents the 2026-05-19 silent
 * drop where 78% of LLM-emitted cross-links were invisible to the gate).
 *
 * Token-based (not substring) — splits on `_`/`-`/whitespace and matches against
 * keyword sets. Substring regex was rejected after a coding-council review found
 * collisions (e.g. "trip"→"strip", "heat"→"sheath", "isolation"→"electrical_isolation",
 * `bus\b` failing inside "data_bus" because `_` is a word char). The token
 * approach has no such collisions and is easier to extend.
 *
 * Returns `null` only when the mechanism is truly unclassifiable.
 */
const KIND_TOKENS: Record<ConnectionKind, Set<string>> = {
  // Order matters during disambiguation when a token belongs to multiple kinds.
  // We rank kinds in a fixed order and pick the most-specific kind whose set
  // matches any token. See `mechanismToKind` below.
  safety: new Set([
    'safety','interlock','estop','emergency','trip','fuse','breaker','rcd','isolator','isolating',
  ]),
  fluid: new Set([
    'refrigerant','coolant','pipe','manifold','hose','duct','fluid','liquid','vapour','vapor',
    'valve','flow','line','reservoir','tank','plumbing','hvac',
  ]),
  thermal: new Set([
    'thermal','heat','cooling','chill','temperature','heatsink','condenser','evaporator','radiator','exchanger',
  ]),
  data: new Set([
    'data','telemetry','sensor','analog','digital','ethernet','canbus','modbus','tcp','rs485','rs232','rs422',
    'serial','protocol','spi','i2c','uart','feedback','reading','rx','tx',
  ]),
  control: new Set([
    'control','command','pwm','relay','drive','setpoint','signal','enable','disable','actuator','actuation',
    'contactor','dimmer','switch','trigger',
  ]),
  electrical: new Set([
    'electrical','power','busbar','voltage','current','cable','wire','rail','bus','distribution','supply',
    'phase','ac','dc',
  ]),
  mechanical: new Set([
    // 2026-05-19 code review (M1): removed 'rail' — it collides with electrical
    // 'voltage_rail'/'power_rail'/'dc_rail' and KIND_PRIORITY ranks mechanical
    // above electrical, so the token-set membership wins for mechanical and
    // silently mis-kinds electrical buses. Mechanical mounts use mount/bracket/
    // bolted/frame/chassis/clamp/flange — sufficient discriminators.
    'mount','bolted','bracket','fastener','joint','chassis','frame','clamp','flange',
  ]),
  service: new Set([
    // 2026-05-19 code review (M2): removed 'port' — collides with data
    // 'serial_port'/'ethernet_port'/'data_port' and KIND_PRIORITY ranks service
    // above data, so service wins. Service ports for maintenance still hit
    // via 'access'/'hatch'/'maintenance'/'servicing'.
    'service','access','hatch','maintenance','servicing',
  ]),
}
// Disambiguation order — if a mechanism's tokens hit multiple kinds, the
// FIRST kind that wins is the most-specific signal. Safety + service are
// most specific (rare collision), control wins over thermal/electrical when
// a "command"/"setpoint" token appears, data wins over electrical when a
// protocol token appears.
const KIND_PRIORITY: ConnectionKind[] = [
  'safety','service','control','data','fluid','thermal','mechanical','electrical',
]

export function mechanismToKind(mech: string): ConnectionKind | null {
  if (!mech) return null
  const m = mech.toLowerCase().trim()
  const exact = MECHANISM_TO_KIND[m]
  if (exact) return exact
  // Tokenise on snake_case / kebab-case / whitespace boundaries.
  const tokens = m.split(/[_\-\s]+/).filter(Boolean)
  if (tokens.length === 0) return null
  for (const kind of KIND_PRIORITY) {
    const set = KIND_TOKENS[kind]
    for (const t of tokens) {
      if (set.has(t)) return kind
    }
  }
  return null
}

// ─── Per-class connection requirements ────────────────────────────────────

const ENERGY_STORAGE: ClassConnections = {
  product_class: 'energy_storage',
  display_name: 'Battery Energy Storage System',
  connections: [
    { module_a: 'energy_storage_source', module_b: 'energy_conversion_transduction', kind: 'electrical', applies_because: 'Cell pack DC bus feeds the PCS inverter.' },
    { module_a: 'energy_storage_source', module_b: 'power_distribution',             kind: 'electrical', applies_because: 'DC distribution routes pack output to fusing + contactors before the inverter.' },
    { module_a: 'energy_storage_source', module_b: 'environmental_interface',        kind: 'thermal',    applies_because: 'Cell pack heat is removed by the cooling system; freezing-temperature operation requires heating.' },
    { module_a: 'energy_storage_source', module_b: 'mass_fluid_transport_process',   kind: 'fluid',      applies_because: 'Coolant manifolds supply chilled fluid to rack cold plates and return warmed fluid to the chiller.' },
    { module_a: 'energy_storage_source', module_b: 'control_compute_communication',  kind: 'control',    applies_because: 'BMS master reports pack state of charge / health to the EMS controller for site-level dispatch.' },
    { module_a: 'energy_storage_source', module_b: 'sensing_instrumentation',        kind: 'data',       applies_because: 'Pack-level current, voltage, insulation, and off-gas readings flow into the central instrumentation stack.' },
    { module_a: 'energy_storage_source', module_b: 'structure_containment',          kind: 'mechanical', applies_because: 'Racks bolt to the container floor with seismic bracing.' },
    { module_a: 'energy_storage_source', module_b: 'safety_protection',              kind: 'safety',     applies_because: 'Cell-level + module-level + pack-level safety chain: fusing, propagation barriers, deflagration vents, fire suppression.' },
    { module_a: 'energy_storage_source', module_b: 'maintenance_serviceability',     kind: 'service',    applies_because: 'BMS master serial port + rack-level service hatches for field maintenance.' },
    { module_a: 'energy_conversion_transduction', module_b: 'power_distribution',    kind: 'electrical', applies_because: 'PCS AC output feeds the AC distribution + grid-tie equipment.' },
    { module_a: 'energy_conversion_transduction', module_b: 'environmental_interface', kind: 'thermal',  applies_because: 'PCS IGBT/transformer losses are removed by the same cooling loop as the cells.' },
    { module_a: 'safety_protection',     module_b: 'sensing_instrumentation',         kind: 'data',       applies_because: 'Off-gas detectors, smoke detectors, fire-trip sensors feed the safety logic + the central instrumentation.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation', kind: 'data',       applies_because: 'EMS reads pack + ambient sensors to drive dispatch and alarm logic.' },
  ],
}

const THERMAL_SYSTEM: ClassConnections = {
  product_class: 'thermal_system',
  display_name: 'Heat Pump',
  connections: [
    { module_a: 'energy_storage_source', module_b: 'energy_conversion_transduction', kind: 'fluid',      applies_because: 'Refrigerant reservoir feeds the compressor; compressor is the energy-conversion engine.' },
    { module_a: 'energy_conversion_transduction', module_b: 'mass_fluid_transport_process', kind: 'fluid', applies_because: 'Compressor moves refrigerant through the high-side and low-side circuits via expansion and evaporator.' },
    { module_a: 'mass_fluid_transport_process', module_b: 'environmental_interface',  kind: 'thermal',    applies_because: 'Outdoor unit rejects heat to ambient; indoor unit absorbs heat from / delivers heat to the space.' },
    { module_a: 'energy_conversion_transduction', module_b: 'power_distribution',     kind: 'electrical', applies_because: 'Compressor + fans + drives draw AC power through the distribution system.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation', kind: 'data',       applies_because: 'PCB control reads temperature, pressure, current sensors and drives compressor + EXV + fans.' },
    { module_a: 'safety_protection',     module_b: 'sensing_instrumentation',         kind: 'data',       applies_because: 'Refrigerant leak detection + over-pressure switches feed safety logic.' },
    { module_a: 'control_compute_communication', module_b: 'energy_conversion_transduction', kind: 'control', applies_because: 'Control PCB commands compressor speed, fan speed, EXV opening, defrost reversing valve.' },
    { module_a: 'energy_conversion_transduction', module_b: 'structure_containment', kind: 'mechanical', applies_because: 'Compressor + heat exchangers bolt to the chassis with vibration isolators.' },
    { module_a: 'safety_protection',     module_b: 'maintenance_serviceability',     kind: 'service',    applies_because: 'F-gas service access points for refrigerant recovery and pressure testing.' },
  ],
}

const VERTICAL_FARM: ClassConnections = {
  product_class: 'vertical_farm',
  display_name: 'Vertical Farm',
  connections: [
    { module_a: 'energy_conversion_transduction', module_b: 'structure_containment', kind: 'electrical', applies_because: 'LED drivers power tier-level LED arrays mounted on the rack structure.' },
    { module_a: 'mass_fluid_transport_process', module_b: 'structure_containment',   kind: 'fluid',      applies_because: 'Fertigation manifolds run alongside the growing trays, supplying nutrient solution.' },
    { module_a: 'energy_storage_source', module_b: 'mass_fluid_transport_process',   kind: 'fluid',      applies_because: 'Water + nutrient reservoirs feed the fertigation system.' },
    { module_a: 'environmental_interface', module_b: 'structure_containment',        kind: 'thermal',    applies_because: 'HVAC + dehumidifier maintain the grow-room climate around the racks.' },
    { module_a: 'environmental_interface', module_b: 'mass_fluid_transport_process', kind: 'fluid',      applies_because: 'CO2 dosing + humidity control feed into the grow-room atmosphere.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation', kind: 'data',      applies_because: 'PLC reads pH, EC, PAR, temp, RH, CO2 sensors and drives the actuators.' },
    { module_a: 'control_compute_communication', module_b: 'energy_conversion_transduction', kind: 'control', applies_because: 'PLC drives LED PWM dimming + fan speed + pump on/off.' },
    { module_a: 'safety_protection',     module_b: 'sensing_instrumentation',         kind: 'data',       applies_because: 'CO2 over-concentration sensor + emergency-stop pull triggers safety lockout.' },
    { module_a: 'power_distribution',    module_b: 'energy_conversion_transduction',  kind: 'electrical', applies_because: 'Distribution panel feeds LED drivers, pumps, HVAC compressor.' },
  ],
}

const EV_CHARGER: ClassConnections = {
  product_class: 'ev_charger',
  display_name: 'EV Charger',
  connections: [
    { module_a: 'power_distribution',    module_b: 'energy_conversion_transduction', kind: 'electrical', applies_because: 'AC grid input feeds the AC-DC rectifier + DC-DC converter; for AC chargers, the pilot/control protocol drives the relay matrix.' },
    { module_a: 'energy_conversion_transduction', module_b: 'environmental_interface', kind: 'thermal',  applies_because: 'Power electronics losses are removed by liquid or forced-air cooling.' },
    { module_a: 'energy_conversion_transduction', module_b: 'structure_containment',  kind: 'mechanical', applies_because: 'Power modules and connectors bolt to the charger enclosure.' },
    { module_a: 'control_compute_communication', module_b: 'energy_conversion_transduction', kind: 'control', applies_because: 'OCPP back-office + CCS PLC communication drive the power-delivery state machine.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation', kind: 'data',       applies_because: 'Energy meter, connector temperature, RCD trip sensors feed the controller and billing.' },
    { module_a: 'safety_protection',     module_b: 'energy_conversion_transduction',  kind: 'safety',     applies_because: 'RCD Type B + isolation monitoring trip the DC output; protective earth bond is mandatory.' },
    { module_a: 'control_compute_communication', module_b: 'hmi_ergonomics',          kind: 'data',       applies_because: 'User-facing display + RFID/card reader + start-stop button.' },
  ],
}

const WEARABLE_MEDICAL: ClassConnections = {
  product_class: 'wearable_medical',
  display_name: 'Wearable Medical Device (CGM-style)',
  connections: [
    { module_a: 'sensing_instrumentation', module_b: 'control_compute_communication', kind: 'data',       applies_because: 'Glucose / heart-rate / etc. sensor signal feeds the on-device MCU.' },
    { module_a: 'control_compute_communication', module_b: 'energy_storage_source',   kind: 'electrical', applies_because: 'Battery powers the wearable transmitter; BMS monitors charge.' },
    { module_a: 'control_compute_communication', module_b: 'environmental_interface', kind: 'data',       applies_because: 'BLE / NFC radio communicates with phone / pump.' },
    { module_a: 'structure_containment', module_b: 'sensing_instrumentation',         kind: 'mechanical', applies_because: 'Adhesive patch holds the sensor against the skin; sensor insertion needle mechanical retention.' },
    { module_a: 'safety_protection',     module_b: 'sensing_instrumentation',         kind: 'data',       applies_because: 'Out-of-range alarms (hypo / hyper) drive the device alarm logic.' },
    { module_a: 'maintenance_serviceability', module_b: 'energy_storage_source',     kind: 'service',    applies_because: 'Replaceable / chargeable battery access (for re-usable transmitter portion).' },
  ],
}

const DRONE: ClassConnections = {
  product_class: 'drone',
  display_name: 'UAV / Drone',
  connections: [
    { module_a: 'energy_storage_source', module_b: 'energy_conversion_transduction', kind: 'electrical', applies_because: 'LiPo battery feeds the ESCs (electronic speed controllers).' },
    { module_a: 'energy_conversion_transduction', module_b: 'mass_fluid_transport_process', kind: 'mechanical', applies_because: 'Motor + propeller produces airflow / thrust.' },
    { module_a: 'control_compute_communication', module_b: 'energy_conversion_transduction', kind: 'control', applies_because: 'Flight controller drives each motor ESC via PWM / DShot.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation',   kind: 'data',     applies_because: 'IMU, GNSS, barometer, magnetometer feed the flight controller; vision / lidar for obstacle avoidance.' },
    { module_a: 'control_compute_communication', module_b: 'environmental_interface',   kind: 'data',     applies_because: 'RC radio link to ground station; telemetry downlink; LTE/Iridium for BVLOS.' },
    { module_a: 'structure_containment', module_b: 'energy_conversion_transduction',    kind: 'mechanical', applies_because: 'Airframe / arms hold motors at correct geometry under thrust + vibration.' },
    { module_a: 'safety_protection',     module_b: 'control_compute_communication',     kind: 'control',  applies_because: 'Return-to-home / failsafe behaviours on link loss; parachute / flight-termination on critical fault.' },
  ],
}

const EDGE_AI_SERVER: ClassConnections = {
  product_class: 'edge_ai_server',
  display_name: 'Edge AI Compute Module',
  connections: [
    { module_a: 'energy_conversion_transduction', module_b: 'control_compute_communication', kind: 'electrical', applies_because: 'PSU feeds the GPU / accelerator / motherboard.' },
    { module_a: 'control_compute_communication', module_b: 'environmental_interface',  kind: 'thermal',   applies_because: 'Compute heat is removed by fans / cold plates / liquid loop.' },
    { module_a: 'structure_containment', module_b: 'control_compute_communication',    kind: 'mechanical', applies_because: 'Chassis holds the compute assembly with mounting standoffs and vibration isolation.' },
    { module_a: 'sensing_instrumentation', module_b: 'control_compute_communication',  kind: 'data',       applies_because: 'Internal temperature / fan-speed / power sensors feed the BMC / IPMI.' },
    { module_a: 'control_compute_communication', module_b: 'power_distribution',       kind: 'electrical', applies_because: 'PoE / redundant PSU input / breaker chain.' },
    { module_a: 'safety_protection',     module_b: 'sensing_instrumentation',          kind: 'data',       applies_because: 'Over-temperature shutdown + watchdog reset on hung accelerators.' },
  ],
}

const BIOREACTOR: ClassConnections = {
  product_class: 'bioreactor',
  display_name: 'Bioreactor',
  connections: [
    { module_a: 'energy_storage_source', module_b: 'mass_fluid_transport_process',   kind: 'fluid',      applies_because: 'Media + buffer + nutrient reservoirs feed the vessel via metered pumps.' },
    { module_a: 'mass_fluid_transport_process', module_b: 'structure_containment',   kind: 'fluid',      applies_because: 'Sparger + harvest line + sample port pass through the vessel head plate.' },
    { module_a: 'environmental_interface', module_b: 'structure_containment',        kind: 'thermal',    applies_because: 'Jacketed cooling / heating loop maintains process temperature.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation', kind: 'data',      applies_because: 'PLC reads pH, DO, temp, mass, foam sensors and drives the doser pumps + agitator + airflow.' },
    { module_a: 'control_compute_communication', module_b: 'energy_conversion_transduction', kind: 'control', applies_because: 'PLC commands agitator drive speed + air-mass-flow-controller setpoint.' },
    { module_a: 'safety_protection',     module_b: 'sensing_instrumentation',         kind: 'data',       applies_because: 'Over-pressure relief + sterility-breach detection + foam-out detection feed shutdown logic.' },
    { module_a: 'maintenance_serviceability', module_b: 'structure_containment',     kind: 'service',    applies_because: 'CIP / SIP service ports + autoclave-rated removable sub-assemblies.' },
  ],
}

const AUV: ClassConnections = {
  product_class: 'auv',
  display_name: 'Autonomous Underwater Vehicle',
  connections: [
    { module_a: 'energy_storage_source', module_b: 'energy_conversion_transduction', kind: 'electrical', applies_because: 'Pressure-balanced battery feeds the thruster motor drives.' },
    { module_a: 'energy_conversion_transduction', module_b: 'mass_fluid_transport_process', kind: 'mechanical', applies_because: 'Thrusters move the vehicle through water.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation', kind: 'data',       applies_because: 'INS, depth, DVL, sonar feed the autopilot.' },
    { module_a: 'control_compute_communication', module_b: 'environmental_interface', kind: 'data',       applies_because: 'Acoustic modem / Iridium surface link / mission rendezvous.' },
    { module_a: 'structure_containment', module_b: 'control_compute_communication',   kind: 'mechanical', applies_because: 'Pressure hull contains the electronics; depth-rated to maximum operating depth.' },
    { module_a: 'safety_protection',     module_b: 'structure_containment',           kind: 'safety',     applies_because: 'Ballast drop on depth excursion; hull-strain monitoring; emergency surface beacon.' },
  ],
}

const HAPS: ClassConnections = {
  product_class: 'haps',
  display_name: 'High-Altitude Pseudo-Satellite',
  connections: [
    { module_a: 'energy_conversion_transduction', module_b: 'energy_storage_source', kind: 'electrical', applies_because: 'PV array charges the lithium battery during the day; battery sustains night flight.' },
    { module_a: 'energy_storage_source', module_b: 'control_compute_communication',  kind: 'electrical', applies_because: 'Battery powers autopilot + payload + comms.' },
    { module_a: 'energy_conversion_transduction', module_b: 'mass_fluid_transport_process', kind: 'mechanical', applies_because: 'Electric motors drive the propellers for station-keeping in winds.' },
    { module_a: 'structure_containment', module_b: 'energy_conversion_transduction', kind: 'mechanical', applies_because: 'Airframe holds PV array and motors; designed for stratospheric pressure / thermal cycling.' },
    { module_a: 'control_compute_communication', module_b: 'sensing_instrumentation', kind: 'data',       applies_because: 'Autopilot reads IMU, GNSS, pitot, ice-detect, solar-cell-temp sensors.' },
    { module_a: 'control_compute_communication', module_b: 'environmental_interface', kind: 'data',       applies_because: 'Ground station downlink + ATC ADS-B Out + Iridium backup.' },
    { module_a: 'safety_protection',     module_b: 'control_compute_communication',   kind: 'control',    applies_because: 'Flight termination system (independent of primary autopilot) for uncommanded descent.' },
  ],
}

// ─── Registry ─────────────────────────────────────────────────────────────

export const CLASS_CONNECTIONS: Record<string, ClassConnections> = {
  energy_storage:    ENERGY_STORAGE,
  thermal_system:    THERMAL_SYSTEM,
  vertical_farm:     VERTICAL_FARM,
  ev_charger:        EV_CHARGER,
  wearable_medical:  WEARABLE_MEDICAL,
  drone:             DRONE,
  edge_ai_server:    EDGE_AI_SERVER,
  bioreactor:        BIOREACTOR,
  auv:               AUV,
  haps:              HAPS,
}

export function getClassConnections(productClass: string): ClassConnections {
  return CLASS_CONNECTIONS[productClass] ?? {
    product_class: productClass,
    display_name: productClass,
    connections: [],
  }
}

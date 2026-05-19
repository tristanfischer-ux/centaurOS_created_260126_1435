# Design a containerised 3

Class: energy_storage
Verdict: conditional

## Requirement Traceability
- COVERED Energy capacity: 3.5 MWh -> Energy Storage Source, Power Conversion System, DC And AC Power Distribution; metric:headline_output, sanity:bess_c_rate, sanity:bess_duration, sanity:bess_container_energy_density
- COVERED Power rating: 1 MW -> Power Conversion System, DC And AC Power Distribution, Control Compute And Communication; sanity:bess_c_rate, sanity:bess_duration
- COVERED Mass constraint: 28000 kg -> Container Structure And Fit-Out, Maintenance And Serviceability; sanity:bess_container_energy_density

## Headline Metrics
- Annual MWh delivered: 1277.5 MWh/year (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS BESS C-Rate: 0.29 C (0.1C to 1.0C for typical grid-storage duration systems)
  Power-to-energy ratio implies 0.29C, equivalent to roughly 3.5 hours at rated power.
- PASS Rated Duration: 3.5 hours (1 to 6 hours for common containerised BESS applications)
  3.5 hours is plausible for a containerised grid-support BESS before detailed cell count and PCS sizing.
- PASS Container-Level Energy Density: 125 Wh/kg (50 to 200 Wh/kg at container/system level before detailed structural mass review)
  125 Wh/kg is within a plausible container-level range, but it still needs a mass roll-up by rack, PCS, HVAC and enclosure.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected energy_storage with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 11-module energy_storage architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 11 modules, 46 sub-modules, 204 component words
Required interface links:
- OK energy_storage_source -> energy_conversion_transduction via dc_bus
- OK energy_storage_source -> environmental_interface via thermal_loop
- OK energy_storage_source -> control_compute_communication via bms_network

- Energy Storage Source: Stores roughly 3.5 MWh usable energy in rack-mounted LFP cell assemblies.
  Interfaces: dc_bus, thermal_loop, bms_network, mechanical_mounts
  - Cell string: Electrochemical storage path assembled from series/parallel LFP cells.
    Components: LFP prismatic cells, cell-to-cell busbar, cell terminal hardware set, cell insulation pad, module fuse
    Interfaces: dc_bus, thermal_loop, bms_tap_harness
  - Rack structure: Constrains cell modules during transport, vibration and cycling expansion.
    Components: module steel frame, compression plate, compression tie rod set, module top cover, rack label plate
    Interfaces: mechanical_mounts, service_access
  - BMS slave board: Measures cell voltage and temperature at rack level.
    Components: BMS slave PCB, AFE monitor IC, NTC thermistor harness, isolated CAN transceiver, conformal coating
    Interfaces: bms_network, sensor_harness
  - DC string output: Combines rack outputs into a protected high-voltage DC path.
    Components: DC contactor or breaker, precharge resistor, HV fuse holder, pack current sensor, service disconnect
    Interfaces: dc_bus, hardwired_trip
  - Module interconnect harness: Routes low-voltage sensing, communications and temperature signals across rack assemblies.
    Components: cell voltage sense loom, rack CAN drop cable, harness strain relief rail, low-smoke cable sleeve
    Interfaces: bms_tap_harness, sensor_harness, service_access
  - Rack thermal interface: Couples cell modules to the container thermal loop while preserving service replacement access.
    Components: rack cold plate manifold, thermally conductive gap pad, coolant quick connector pair, rack drip tray, leak detection rope
    Interfaces: thermal_loop, mechanical_mounts, service_access
- Power Conversion System: Converts the battery DC bus into 1 MW grid-compatible AC output.
  Interfaces: dc_bus, ac_bus, modbus_tcp, thermal_path, hardwired_trip, protective_earth
  - PCS inverter bridge: Performs bidirectional DC/AC conversion.
    Components: PCS inverter, IGBT power module, DC link capacitor bank, gate driver board, inverter control board, liquid-cooled heatsink
    Interfaces: dc_bus, ac_bus, modbus_tcp
  - Transformer stage: Adapts PCS output voltage to site connection voltage.
    Components: cast resin transformer, HV winding, LV winding, temperature probe, anti-vibration mount
    Interfaces: ac_bus, thermal_path
  - Grid filter: Controls harmonics and conducted emissions.
    Components: grid filter choke, AC filter capacitor, EMI filter assembly, protective earth bar
    Interfaces: ac_bus, protective_earth
  - Grid protection relay: Supervises grid voltage, frequency and trip settings at the point of connection.
    Components: grid protection relay, voltage sensing fuse set, relay test block, trip circuit monitor, G99 settings label
    Interfaces: ac_bus, modbus_tcp, hardwired_trip, protective_earth
- Container Structure And Fit-Out: Provides weatherproof containment, transport structure and internal segregation.
  Interfaces: mechanical_mounts, service_access, fire_boundary, lifting_points, protective_earth
  - ISO container shell: Forms the weather-tight transportable enclosure.
    Components: corten steel side panel, corner casting, marine plywood floor, roof panel
    Interfaces: lifting_points, service_access
  - Internal partitions: Separates battery, PCS, controls and service zones.
    Components: steel stud frame, fire-rated board, mineral wool insulation, intumescent sealant
    Interfaces: fire_boundary, service_access
  - Rack mounting rails: Anchors battery racks against transport and seismic loads.
    Components: floor reinforcement plate, rack mounting rail, vibration isolator, anchor bolt set
    Interfaces: mechanical_mounts
  - Cable penetration sealing: Seals power, control and auxiliary cable entries through container fire and weather boundaries.
    Components: gland plate assembly, firestop collar set, EMC cable gland, rain drip shield, penetration schedule label
    Interfaces: fire_boundary, service_access, protective_earth
- Sensing And Instrumentation: Measures electrical, thermal and environmental state for operation and safety.
  Interfaces: sensor_bus, alarm_bus, bms_network, site_scada
  - Electrical measurement: Measures voltage, current and insulation state.
    Components: DC voltage transducer, Hall current sensor, insulation monitoring device, auxiliary metering transducer
    Interfaces: sensor_bus, dc_bus
  - Environmental sensors: Measures container air conditions and gas hazards.
    Components: temperature humidity sensor, hydrogen detector, smoke aspirating detector, door position switch
    Interfaces: sensor_bus, alarm_bus
  - Thermal sensors: Tracks coolant and heat exchanger temperatures.
    Components: coolant inlet thermistor, coolant outlet thermistor, flow meter, pressure transducer
    Interfaces: sensor_bus, thermal_loop
  - Event recording: Captures timestamped trips, alarms and measurements for engineering review.
    Components: fault recorder module, event timestamp logger, digital input card, local historian buffer, calibration certificate holder
    Interfaces: sensor_bus, alarm_bus, site_scada
- Control Compute And Communication: Coordinates BMS, PCS, auxiliaries and site-level dispatch.
  Interfaces: bms_network, modbus_tcp, sensor_bus, alarm_bus, site_scada, service_access
  - BMS master controller: Supervises pack state and protective limits.
    Components: BMS master controller, isolation interface, contactor driver output, SOC estimation firmware
    Interfaces: bms_network, hardwired_trip
  - EMS controller: Dispatches power and monitors system state.
    Components: industrial controller, I/O expansion module, network switch, cellular router
    Interfaces: modbus_tcp, site_scada
  - Communications gateway: Bridges local controls to site and remote systems.
    Components: Modbus TCP gateway, SCADA protocol adapter, time synchronisation module, cybersecurity firewall
    Interfaces: site_scada, modbus_tcp
  - Cybersecurity monitoring: Manages secure access, logging and recovery data for remote operation.
    Components: VPN access appliance, syslog collector, account key switch, firmware escrow tag, configuration backup module
    Interfaces: site_scada, modbus_tcp, service_access
- Safety Protection And Interlocks: Detects unsafe conditions and forces the system into a protected state.
  Interfaces: alarm_bus, hardwired_trip, fire_boundary, dc_bus, ac_bus, service_access
  - Fire suppression system: Detects and suppresses incipient battery-container fire.
    Components: Fire detection/suppression, clean-agent cylinder, release solenoid, nozzle pipework, pressure switch
    Interfaces: alarm_bus, fire_boundary
  - Emergency stop chain: Trips high-energy paths through hardwired safety logic.
    Components: E-stop mushroom button, safety relay, DC shunt trip output, AC breaker trip coil
    Interfaces: hardwired_trip, dc_bus, ac_bus
  - Surge and fault protection: Limits transient and overcurrent damage.
    Components: DC surge protection device, AC surge protection device, arc flash label set, protective earth bonding kit
    Interfaces: dc_bus, ac_bus, protective_earth
  - Deflagration venting: Provides a controlled pressure relief path if battery off-gas ignition occurs.
    Components: pressure relief vent panel, vent microswitch, flame arrestor mesh, vent weather hood, post-event inspection tag
    Interfaces: fire_boundary, alarm_bus, service_access
- Environmental Interface: Maintains the container operating envelope across weather and heat loads.
  Interfaces: thermal_loop, thermal_path, electrical_power, sensor_bus, service_access
  - HVAC unit: Controls air temperature and humidity inside compartments.
    Components: container HVAC unit, air filter element, condensate drain kit, HVAC controller
    Interfaces: electrical_power, thermal_loop, thermal_path, sensor_bus
  - Ventilation path: Directs airflow around PCS, controls and service areas.
    Components: intake louvre, exhaust louvre, EC fan assembly, airflow baffle
    Interfaces: thermal_loop, thermal_path, service_access
  - Thermal insulation: Reduces ambient heat transfer into the container.
    Components: insulation panel, vapour barrier film, thermal break strip, seal gasket set
    Interfaces: fire_boundary, thermal_path
  - Heat rejection coil: Rejects battery and PCS heat from the coolant loop to outdoor air.
    Components: dry cooler coil, EC condenser fan, fan contactor, coil guard grille, drain-safe condensate pan
    Interfaces: thermal_loop, thermal_path, electrical_power, service_access
- DC And AC Power Distribution: Routes high-voltage DC, grid AC and auxiliary power through protected paths.
  Interfaces: dc_bus, ac_bus, electrical_power, protective_earth, hardwired_trip
  - Main DC busbars: Carries pack current from racks to PCS.
    Components: copper DC busbar, busbar support insulator, busbar shroud, torque witness marker
    Interfaces: dc_bus, service_access
  - AC switchgear: Connects PCS output to site AC connection.
    Components: moulded-case circuit breaker, AC contactor, metering CT set, terminal block assembly
    Interfaces: ac_bus, protective_earth, hardwired_trip
  - Auxiliary power distribution: Supplies controls, HVAC, pumps and service loads.
    Components: auxiliary transformer, 24 V DC power supply, miniature circuit breaker bank, UPS module
    Interfaces: electrical_power, protective_earth
  - Earthing and lightning protection: Bonds exposed metalwork and surge devices to a verifiable protective-earth network.
    Components: main earth bar, earth stud array, lightning surge counter, equipotential bonding strap, earth continuity test point
    Interfaces: protective_earth, service_access
- Maintenance And Serviceability: Lets technicians inspect, isolate, lift and replace internal assemblies safely.
  Interfaces: service_access, lifting_points, protective_earth, sensor_bus, dc_bus
  - Access doors and hardware: Provides controlled entry to service zones.
    Components: lockable access door, door seal gasket, panic release latch, door stay arm
    Interfaces: service_access
  - Service lighting: Illuminates work zones during inspection.
    Components: LED service luminaire, emergency light fitting, maintenance receptacle, lighting switchgear
    Interfaces: electrical_power, service_access
  - Lifting and handling points: Supports transport, installation and module replacement.
    Components: certified lifting lug, forklift pocket reinforcement, removable rack guide, service trolley interface
    Interfaces: lifting_points, mechanical_mounts
  - Commissioning ports: Provides controlled access points for electrical, coolant and controller commissioning checks.
    Components: insulated test socket, coolant sampling port, laptop service port, lockout hasp rail, commissioning torque log plate
    Interfaces: service_access, sensor_bus, dc_bus
- Coolant Circulation Process: Moves coolant through battery racks, heat exchangers and serviceable filters.
  Interfaces: thermal_loop, sensor_bus, service_access, electrical_power
  - Coolant pump station: Circulates coolant through rack cold plates.
    Components: Thermal management loop, coolant circulation pump, pump VFD, check valve, isolation valve
    Interfaces: thermal_loop, electrical_power, sensor_bus
  - Filtration and treatment: Maintains coolant cleanliness and chemistry.
    Components: coolant filter housing, replaceable filter cartridge, glycol concentration sensor, fill and drain manifold
    Interfaces: thermal_loop, service_access
  - Expansion and air removal: Accommodates fluid expansion and removes trapped air.
    Components: expansion vessel, automatic air vent, pressure relief valve, low pressure switch
    Interfaces: thermal_loop, sensor_bus
  - Heat exchanger manifold: Transfers rack heat into the outdoor heat rejection path while preserving service bypass options.
    Components: plate heat exchanger, temperature balancing valve, purge valve set, service bypass loop, insulated hose set
    Interfaces: thermal_loop, service_access, sensor_bus
- Operator HMI And Labelling: Presents system status, controls access and communicates hazards to operators.
  Interfaces: site_scada, service_access, alarm_bus
  - Local HMI panel: Provides local status, alarms and manual controls.
    Components: industrial touchscreen, panel PC, key switch, alarm buzzer beacon
    Interfaces: site_scada, service_access
  - External labelling: Communicates hazards and service instructions.
    Components: high voltage warning label, arc flash boundary label, fire suppression instruction placard, asset QR label
    Interfaces: service_access
  - Operator workflow aids: Supports safe inspection and reset actions.
    Components: laminated isolation checklist, inspection log holder, status stack light, manual reset station
    Interfaces: service_access, alarm_bus
  - Remote notification interface: Routes actionable alarms to the site operator while preventing unsafe remote reset.
    Components: operator notification relay, SMS alarm output module, alarm acknowledgement button, escalation contact label, remote reset inhibit relay
    Interfaces: site_scada, alarm_bus, service_access

## BoM
Total: £0
- 1 candidate × LFP prismatic cells: £unpriced
- 1 candidate × cell-to-cell busbar: £unpriced
- 1 candidate × cell terminal hardware set: £unpriced
- 1 candidate × cell insulation pad: £unpriced
- 1 candidate × module fuse: £unpriced
- 1 candidate × module steel frame: £unpriced
- 1 candidate × compression plate: £unpriced
- 1 candidate × compression tie rod set: £unpriced
- 1 candidate × module top cover: £unpriced
- 1 candidate × rack label plate: £unpriced
- 1 candidate × BMS slave PCB: £unpriced
- 1 candidate × AFE monitor IC: £unpriced
- 1 candidate × NTC thermistor harness: £unpriced
- 1 candidate × isolated CAN transceiver: £unpriced
- 1 candidate × conformal coating: £unpriced
- 1 candidate × DC contactor or breaker: £unpriced
- 1 candidate × precharge resistor: £unpriced
- 1 candidate × HV fuse holder: £unpriced
- 1 candidate × pack current sensor: £unpriced
- 1 candidate × service disconnect: £unpriced
- 1 candidate × cell voltage sense loom: £unpriced
- 1 candidate × rack CAN drop cable: £unpriced
- 1 candidate × harness strain relief rail: £unpriced
- 1 candidate × low-smoke cable sleeve: £unpriced
- 1 candidate × rack cold plate manifold: £unpriced
- 1 candidate × thermally conductive gap pad: £unpriced
- 1 candidate × coolant quick connector pair: £unpriced
- 1 candidate × rack drip tray: £unpriced
- 1 candidate × leak detection rope: £unpriced
- 1 candidate × PCS inverter: £unpriced
- 1 candidate × IGBT power module: £unpriced
- 1 candidate × DC link capacitor bank: £unpriced
- 1 candidate × gate driver board: £unpriced
- 1 candidate × inverter control board: £unpriced
- 1 candidate × liquid-cooled heatsink: £unpriced
- 1 candidate × cast resin transformer: £unpriced
- 1 candidate × HV winding: £unpriced
- 1 candidate × LV winding: £unpriced
- 1 candidate × temperature probe: £unpriced
- 1 candidate × anti-vibration mount: £unpriced
- 1 candidate × grid filter choke: £unpriced
- 1 candidate × AC filter capacitor: £unpriced
- 1 candidate × EMI filter assembly: £unpriced
- 1 candidate × protective earth bar: £unpriced
- 1 candidate × grid protection relay: £unpriced
- 1 candidate × voltage sensing fuse set: £unpriced
- 1 candidate × relay test block: £unpriced
- 1 candidate × trip circuit monitor: £unpriced
- 1 candidate × G99 settings label: £unpriced
- 1 candidate × corten steel side panel: £unpriced
- 1 candidate × corner casting: £unpriced
- 1 candidate × marine plywood floor: £unpriced
- 1 candidate × roof panel: £unpriced
- 1 candidate × steel stud frame: £unpriced
- 1 candidate × fire-rated board: £unpriced
- 1 candidate × mineral wool insulation: £unpriced
- 1 candidate × intumescent sealant: £unpriced
- 1 candidate × floor reinforcement plate: £unpriced
- 1 candidate × rack mounting rail: £unpriced
- 1 candidate × vibration isolator: £unpriced
- 1 candidate × anchor bolt set: £unpriced
- 1 candidate × gland plate assembly: £unpriced
- 1 candidate × firestop collar set: £unpriced
- 1 candidate × EMC cable gland: £unpriced
- 1 candidate × rain drip shield: £unpriced
- 1 candidate × penetration schedule label: £unpriced
- 1 candidate × DC voltage transducer: £unpriced
- 1 candidate × Hall current sensor: £unpriced
- 1 candidate × insulation monitoring device: £unpriced
- 1 candidate × auxiliary metering transducer: £unpriced
- 1 candidate × temperature humidity sensor: £unpriced
- 1 candidate × hydrogen detector: £unpriced
- 1 candidate × smoke aspirating detector: £unpriced
- 1 candidate × door position switch: £unpriced
- 1 candidate × coolant inlet thermistor: £unpriced
- 1 candidate × coolant outlet thermistor: £unpriced
- 1 candidate × flow meter: £unpriced
- 1 candidate × pressure transducer: £unpriced
- 1 candidate × fault recorder module: £unpriced
- 1 candidate × event timestamp logger: £unpriced
- 1 candidate × digital input card: £unpriced
- 1 candidate × local historian buffer: £unpriced
- 1 candidate × calibration certificate holder: £unpriced
- 1 candidate × BMS master controller: £unpriced
- 1 candidate × isolation interface: £unpriced
- 1 candidate × contactor driver output: £unpriced
- 1 candidate × SOC estimation firmware: £unpriced
- 1 candidate × industrial controller: £unpriced
- 1 candidate × I/O expansion module: £unpriced
- 1 candidate × network switch: £unpriced
- 1 candidate × cellular router: £unpriced
- 1 candidate × Modbus TCP gateway: £unpriced
- 1 candidate × SCADA protocol adapter: £unpriced
- 1 candidate × time synchronisation module: £unpriced
- 1 candidate × cybersecurity firewall: £unpriced
- 1 candidate × VPN access appliance: £unpriced
- 1 candidate × syslog collector: £unpriced
- 1 candidate × account key switch: £unpriced
- 1 candidate × firmware escrow tag: £unpriced
- 1 candidate × configuration backup module: £unpriced
- 1 candidate × Fire detection/suppression: £unpriced
- 1 candidate × clean-agent cylinder: £unpriced
- 1 candidate × release solenoid: £unpriced
- 1 candidate × nozzle pipework: £unpriced
- 1 candidate × pressure switch: £unpriced
- 1 candidate × E-stop mushroom button: £unpriced
- 1 candidate × safety relay: £unpriced
- 1 candidate × DC shunt trip output: £unpriced
- 1 candidate × AC breaker trip coil: £unpriced
- 1 candidate × DC surge protection device: £unpriced
- 1 candidate × AC surge protection device: £unpriced
- 1 candidate × arc flash label set: £unpriced
- 1 candidate × protective earth bonding kit: £unpriced
- 1 candidate × pressure relief vent panel: £unpriced
- 1 candidate × vent microswitch: £unpriced
- 1 candidate × flame arrestor mesh: £unpriced
- 1 candidate × vent weather hood: £unpriced
- 1 candidate × post-event inspection tag: £unpriced
- 1 candidate × container HVAC unit: £unpriced
- 1 candidate × air filter element: £unpriced
- 1 candidate × condensate drain kit: £unpriced
- 1 candidate × HVAC controller: £unpriced
- 1 candidate × intake louvre: £unpriced
- 1 candidate × exhaust louvre: £unpriced
- 1 candidate × EC fan assembly: £unpriced
- 1 candidate × airflow baffle: £unpriced
- 1 candidate × insulation panel: £unpriced
- 1 candidate × vapour barrier film: £unpriced
- 1 candidate × thermal break strip: £unpriced
- 1 candidate × seal gasket set: £unpriced
- 1 candidate × dry cooler coil: £unpriced
- 1 candidate × EC condenser fan: £unpriced
- 1 candidate × fan contactor: £unpriced
- 1 candidate × coil guard grille: £unpriced
- 1 candidate × drain-safe condensate pan: £unpriced
- 1 candidate × copper DC busbar: £unpriced
- 1 candidate × busbar support insulator: £unpriced
- 1 candidate × busbar shroud: £unpriced
- 1 candidate × torque witness marker: £unpriced
- 1 candidate × moulded-case circuit breaker: £unpriced
- 1 candidate × AC contactor: £unpriced
- 1 candidate × metering CT set: £unpriced
- 1 candidate × terminal block assembly: £unpriced
- 1 candidate × auxiliary transformer: £unpriced
- 1 candidate × 24 V DC power supply: £unpriced
- 1 candidate × miniature circuit breaker bank: £unpriced
- 1 candidate × UPS module: £unpriced
- 1 candidate × main earth bar: £unpriced
- 1 candidate × earth stud array: £unpriced
- 1 candidate × lightning surge counter: £unpriced
- 1 candidate × equipotential bonding strap: £unpriced
- 1 candidate × earth continuity test point: £unpriced
- 1 candidate × lockable access door: £unpriced
- 1 candidate × door seal gasket: £unpriced
- 1 candidate × panic release latch: £unpriced
- 1 candidate × door stay arm: £unpriced
- 1 candidate × LED service luminaire: £unpriced
- 1 candidate × emergency light fitting: £unpriced
- 1 candidate × maintenance receptacle: £unpriced
- 1 candidate × lighting switchgear: £unpriced
- 1 candidate × certified lifting lug: £unpriced
- 1 candidate × forklift pocket reinforcement: £unpriced
- 1 candidate × removable rack guide: £unpriced
- 1 candidate × service trolley interface: £unpriced
- 1 candidate × insulated test socket: £unpriced
- 1 candidate × coolant sampling port: £unpriced
- 1 candidate × laptop service port: £unpriced
- 1 candidate × lockout hasp rail: £unpriced
- 1 candidate × commissioning torque log plate: £unpriced
- 1 candidate × Thermal management loop: £unpriced
- 1 candidate × coolant circulation pump: £unpriced
- 1 candidate × pump VFD: £unpriced
- 1 candidate × check valve: £unpriced
- 1 candidate × isolation valve: £unpriced
- 1 candidate × coolant filter housing: £unpriced
- 1 candidate × replaceable filter cartridge: £unpriced
- 1 candidate × glycol concentration sensor: £unpriced
- 1 candidate × fill and drain manifold: £unpriced
- 1 candidate × expansion vessel: £unpriced
- 1 candidate × automatic air vent: £unpriced
- 1 candidate × pressure relief valve: £unpriced
- 1 candidate × low pressure switch: £unpriced
- 1 candidate × plate heat exchanger: £unpriced
- 1 candidate × temperature balancing valve: £unpriced
- 1 candidate × purge valve set: £unpriced
- 1 candidate × service bypass loop: £unpriced
- 1 candidate × insulated hose set: £unpriced
- 1 candidate × industrial touchscreen: £unpriced
- 1 candidate × panel PC: £unpriced
- 1 candidate × key switch: £unpriced
- 1 candidate × alarm buzzer beacon: £unpriced
- 1 candidate × high voltage warning label: £unpriced
- 1 candidate × arc flash boundary label: £unpriced
- 1 candidate × fire suppression instruction placard: £unpriced
- 1 candidate × asset QR label: £unpriced
- 1 candidate × laminated isolation checklist: £unpriced
- 1 candidate × inspection log holder: £unpriced
- 1 candidate × status stack light: £unpriced
- 1 candidate × manual reset station: £unpriced
- 1 candidate × operator notification relay: £unpriced
- 1 candidate × SMS alarm output module: £unpriced
- 1 candidate × alarm acknowledgement button: £unpriced
- 1 candidate × escalation contact label: £unpriced
- 1 candidate × remote reset inhibit relay: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
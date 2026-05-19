# Untitled hardware project

Class: bioreactor
Verdict: conditional

## Requirement Traceability
- COVERED Working volume: 50 L -> Sterile Structure Containment, Media Gas And Harvest Transport, Mixing And Agitation, Thermal Gas Exhaust Interface; metric:headline_output, sanity:bioreactor_working_volume, sanity:bioreactor_process_closure, sanity:bioreactor_aseptic_pressure_safety

## Headline Metrics
- Annual culture volume: 2000 L/year (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS Single-Use Working Volume: 50 L (1 to 2000 L for common single-use mammalian-cell systems; larger volumes need platform-specific bag and mixing evidence)
  50 L is plausible for a single-use mammalian-cell bioreactor before detailed mixing, oxygen-transfer and bag-platform evidence.
- PASS Sterile Process Closure: present (sterile fluid path, gas path, sensor bus and pump control present)
  Media/feed/harvest paths, gas transfer, sensors and controller actions are connected before sourcing.
- PASS Aseptic And Pressure Safety: present (sterile boundary, pressure relief, exhaust path, alarm bus and service access present)
  The architecture names the sterile and overpressure controls needed before BoM sourcing.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected bioreactor with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 9-module bioreactor architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 9 modules, 27 sub-modules, 108 component words
Required interface links:
- OK structure_containment -> mass_fluid_transport_process via sterile_fluid_path
- OK actuation_kinematics -> structure_containment via sterile_boundary
- OK mass_fluid_transport_process -> environmental_interface via gas_path
- OK sensing_instrumentation -> control_compute_communication via sensor_bus
- OK control_compute_communication -> mass_fluid_transport_process via pump_control
- OK safety_protection -> structure_containment via pressure_relief

- Sterile Structure Containment: Supports a 50 L single-use culture volume while preserving the sterile disposable boundary.
  Interfaces: sterile_boundary, sterile_fluid_path, mechanical_mounts, service_access, pressure_relief
  - Single-use bag chamber: Carries the disposable culture bag and keeps ports accessible for sterile setup.
    Components: Single-use bioreactor bag, bag support tray, port clamp set, bag integrity test label
    Interfaces: sterile_boundary, sterile_fluid_path, mechanical_mounts, service_access, pressure_relief
  - Support frame and load path: Carries fluid mass, agitation loads and service handling forces.
    Components: stainless support frame, load cell mounting bracket set, levelling foot set, lifting eye kit
    Interfaces: mechanical_mounts, service_access
  - Sterile connector panel: Organises aseptic feed, harvest, sampling and gas connections.
    Components: Sterile tubing and connector set, aseptic sampling port, clamp rail, connector parking bracket
    Interfaces: sterile_boundary, sterile_fluid_path, service_access
- Mixing And Agitation: Transfers controllable mixing energy into the culture without compromising the disposable boundary.
  Interfaces: mixing_drive, control_bus, sterile_boundary, sensor_bus
  - Agitation drive train: Controls impeller or rocking motion for suspension culture.
    Components: Agitation drive, magnetic coupling hub, drive encoder, motor mounting plate
    Interfaces: mixing_drive, control_bus, sterile_boundary
  - Mixing impeller interface: Keeps the disposable impeller or rocker coupling aligned to the bag.
    Components: single-use impeller coupling, impeller guard insert, rocker angle stop, mixing validation coupon
    Interfaces: mixing_drive, sterile_boundary, service_access
  - Agitation safety feedback: Detects stalled or excessive mixing conditions.
    Components: motor current sensor, overspeed interlock input, drive fault relay, emergency drive stop contactor
    Interfaces: mixing_drive, sensor_bus, alarm_bus
- Media Gas And Harvest Transport: Moves sterile media, feeds, harvest and process gases through controlled disposable paths.
  Interfaces: sterile_fluid_path, gas_path, pump_control, control_bus, sensor_bus
  - Feed pump manifold: Meters media, nutrient and base additions into the culture.
    Components: Peristaltic feed pump, pump tubing cassette set, media bag hanger, feed line pinch clamp
    Interfaces: sterile_fluid_path, pump_control, sensor_bus
  - Harvest and sampling path: Routes harvest and samples without opening the culture boundary.
    Components: harvest transfer tubing set, single-use sample valve, waste collection bag, low-hold-up connector
    Interfaces: sterile_fluid_path, service_access, sensor_bus
  - Sparger gas mixing: Meters air, oxygen, nitrogen and CO2 into the disposable sparger path.
    Components: Sparger and gas-mix manifold, mass-flow controller bank, sterile gas filter capsule, sparger check valve
    Interfaces: gas_path, sterile_fluid_path, control_bus
- Thermal Gas Exhaust Interface: Controls culture temperature and sterile exhaust conditions.
  Interfaces: thermal_loop, gas_path, exhaust_path, sterile_boundary, sensor_bus
  - Temperature control loop: Transfers heat into or out of the disposable culture vessel.
    Components: Temperature control loop, heater blanket, cooling plate, thermal interface mat
    Interfaces: thermal_loop, control_bus, sensor_bus
  - Exhaust filter train: Maintains sterile exhaust and overpressure relief path.
    Components: Exhaust filter and pressure relief set, condensate knock-out bottle, exhaust heater sleeve, pressure relief indicator
    Interfaces: exhaust_path, gas_path, sterile_boundary, pressure_relief
  - Ambient enclosure conditions: Manages local clean-bench or enclosure support conditions.
    Components: ambient temperature probe, clean-zone status beacon, splash guard panel, wipe-down surface kit
    Interfaces: service_access, sensor_bus, alarm_bus
- Process Sensing Instrumentation: Measures culture and equipment state needed for closed-loop control and batch release evidence.
  Interfaces: sensor_bus, sterile_fluid_path, gas_path, thermal_loop
  - DO and pH sensing: Measures dissolved oxygen and pH through aseptic or single-use sensor paths.
    Components: Dissolved oxygen optical sensor, Single-use pH sensor, sensor patch reader, sensor calibration record card
    Interfaces: sensor_bus, sterile_fluid_path
  - Pressure, mass and temperature sensing: Tracks working volume, pressure and thermal state.
    Components: Load cell set, bag pressure transducer, culture temperature probe, foam detection probe
    Interfaces: sensor_bus, thermal_loop, pressure_relief, mechanical_mounts
  - Gas flow sensing: Verifies inlet gas delivery and exhaust path condition.
    Components: gas flow sensor set, exhaust pressure sensor, oxygen analyser cell, CO2 analyser cell
    Interfaces: sensor_bus, gas_path, exhaust_path
- Control Compute Communication: Runs recipe, process control, alarms, historian and batch-record communication.
  Interfaces: control_bus, sensor_bus, pump_control, batch_record_network, alarm_bus, service_port
  - Process controller: Coordinates agitation, gas, pH, DO, temperature and pump loops.
    Components: Bioreactor controller, I/O terminal slice set, control enclosure, recipe execution firmware
    Interfaces: control_bus, sensor_bus, pump_control, alarm_bus
  - Batch record gateway: Exports process history and audit data.
    Components: batch historian module, audit trail storage, ethernet switch, secure time source
    Interfaces: batch_record_network, service_port, sensor_bus
  - Operator and alarm logic: Presents alarms and controlled operator actions.
    Components: alarm annunciator, operator HMI panel, role access key switch, batch acknowledge button
    Interfaces: alarm_bus, control_bus, service_port
- Power Distribution: Supplies protected mains and low-voltage power to pumps, controller, agitation and thermal hardware.
  Interfaces: mains_supply, protective_earth, control_bus, service_access
  - Control power panel: Distributes mains and DC control power to the bioreactor skid.
    Components: RCD mains isolator, 24 V DC power supply, terminal block rail, panel earth bar
    Interfaces: mains_supply, protective_earth, control_bus, service_access
  - Actuator power feeds: Feeds agitation, pumps and thermal actuators.
    Components: pump power distribution loom, agitation drive breaker, heater output relay, cable gland plate
    Interfaces: mains_supply, control_bus, protective_earth
  - Backup power and shutdown: Keeps control alive long enough for safe process stop.
    Components: UPS buffer module, safe shutdown relay, power-fail input module, shutdown status lamp
    Interfaces: mains_supply, alarm_bus, control_bus
- Aseptic And Pressure Safety: Protects culture sterility, disposable pressure limits and operator exposure.
  Interfaces: sterile_boundary, pressure_relief, exhaust_path, alarm_bus, protective_earth
  - Sterile pressure safety: Prevents bag overpressure and sterile vent blockage.
    Components: single-use pressure relief valve, vent filter integrity tag, pressure alarm relay, bag burst shield
    Interfaces: sterile_boundary, pressure_relief, exhaust_path, alarm_bus
  - Aseptic setup controls: Reduces setup contamination risk.
    Components: sterile connection checklist card, connector tamper seal set, pre-use integrity test kit, operator gowning placard
    Interfaces: sterile_boundary, service_access, alarm_bus
  - Operator electrical safety: Keeps wet-process electrical risks controlled.
    Components: emergency stop button, door interlock switch, leak tray float switch, protective earth test point
    Interfaces: protective_earth, mains_supply, service_access
- Setup Calibration And Service: Supports bag loading, sensor calibration, sterile turnaround and controlled service access.
  Interfaces: service_access, sterile_fluid_path, sensor_bus, batch_record_network
  - Single-use setup: Guides bag installation and sterile connector management.
    Components: bag loading fixture, tube routing template, connector cap organiser, setup verification barcode sheet
    Interfaces: service_access, sterile_fluid_path, sterile_boundary
  - Sensor calibration access: Makes pre-batch sensor checks repeatable.
    Components: pH calibration buffer holder, DO zero span adapter, calibration data entry HMI page, sensor replacement guide label
    Interfaces: service_access, sensor_bus, sterile_fluid_path
  - Cleaning and turnaround: Supports non-product-contact cleaning and post-batch reset.
    Components: wipe-down kit holder, spill tray liner, spent bag removal cart interface, turnaround checklist card
    Interfaces: service_access, batch_record_network

## BoM
Total: £0
- 1 candidate × Single-use bioreactor bag: £unpriced
- 1 candidate × bag support tray: £unpriced
- 1 candidate × port clamp set: £unpriced
- 1 candidate × bag integrity test label: £unpriced
- 1 candidate × stainless support frame: £unpriced
- 1 candidate × load cell mounting bracket set: £unpriced
- 1 candidate × levelling foot set: £unpriced
- 1 candidate × lifting eye kit: £unpriced
- 1 candidate × Sterile tubing and connector set: £unpriced
- 1 candidate × aseptic sampling port: £unpriced
- 1 candidate × clamp rail: £unpriced
- 1 candidate × connector parking bracket: £unpriced
- 1 candidate × Agitation drive: £unpriced
- 1 candidate × magnetic coupling hub: £unpriced
- 1 candidate × drive encoder: £unpriced
- 1 candidate × motor mounting plate: £unpriced
- 1 candidate × single-use impeller coupling: £unpriced
- 1 candidate × impeller guard insert: £unpriced
- 1 candidate × rocker angle stop: £unpriced
- 1 candidate × mixing validation coupon: £unpriced
- 1 candidate × motor current sensor: £unpriced
- 1 candidate × overspeed interlock input: £unpriced
- 1 candidate × drive fault relay: £unpriced
- 1 candidate × emergency drive stop contactor: £unpriced
- 3 each × Peristaltic feed pump: £unpriced
- 1 candidate × pump tubing cassette set: £unpriced
- 1 candidate × media bag hanger: £unpriced
- 1 candidate × feed line pinch clamp: £unpriced
- 1 candidate × harvest transfer tubing set: £unpriced
- 1 candidate × single-use sample valve: £unpriced
- 1 candidate × waste collection bag: £unpriced
- 1 candidate × low-hold-up connector: £unpriced
- 1 candidate × Sparger and gas-mix manifold: £unpriced
- 1 candidate × mass-flow controller bank: £unpriced
- 1 candidate × sterile gas filter capsule: £unpriced
- 1 candidate × sparger check valve: £unpriced
- 1 candidate × Temperature control loop: £unpriced
- 1 candidate × heater blanket: £unpriced
- 1 candidate × cooling plate: £unpriced
- 1 candidate × thermal interface mat: £unpriced
- 1 candidate × Exhaust filter and pressure relief set: £unpriced
- 1 candidate × condensate knock-out bottle: £unpriced
- 1 candidate × exhaust heater sleeve: £unpriced
- 1 candidate × pressure relief indicator: £unpriced
- 1 candidate × ambient temperature probe: £unpriced
- 1 candidate × clean-zone status beacon: £unpriced
- 1 candidate × splash guard panel: £unpriced
- 1 candidate × wipe-down surface kit: £unpriced
- 1 candidate × Dissolved oxygen optical sensor: £unpriced
- 1 candidate × Single-use pH sensor: £unpriced
- 1 candidate × sensor patch reader: £unpriced
- 1 candidate × sensor calibration record card: £unpriced
- 1 candidate × Load cell set: £unpriced
- 1 candidate × bag pressure transducer: £unpriced
- 1 candidate × culture temperature probe: £unpriced
- 1 candidate × foam detection probe: £unpriced
- 1 candidate × gas flow sensor set: £unpriced
- 1 candidate × exhaust pressure sensor: £unpriced
- 1 candidate × oxygen analyser cell: £unpriced
- 1 candidate × CO2 analyser cell: £unpriced
- 1 candidate × Bioreactor controller: £unpriced
- 1 candidate × I/O terminal slice set: £unpriced
- 1 candidate × control enclosure: £unpriced
- 1 candidate × recipe execution firmware: £unpriced
- 1 candidate × batch historian module: £unpriced
- 1 candidate × audit trail storage: £unpriced
- 1 candidate × ethernet switch: £unpriced
- 1 candidate × secure time source: £unpriced
- 1 candidate × alarm annunciator: £unpriced
- 1 candidate × operator HMI panel: £unpriced
- 1 candidate × role access key switch: £unpriced
- 1 candidate × batch acknowledge button: £unpriced
- 1 candidate × RCD mains isolator: £unpriced
- 1 candidate × 24 V DC power supply: £unpriced
- 1 candidate × terminal block rail: £unpriced
- 1 candidate × panel earth bar: £unpriced
- 1 candidate × pump power distribution loom: £unpriced
- 1 candidate × agitation drive breaker: £unpriced
- 1 candidate × heater output relay: £unpriced
- 1 candidate × cable gland plate: £unpriced
- 1 candidate × UPS buffer module: £unpriced
- 1 candidate × safe shutdown relay: £unpriced
- 1 candidate × power-fail input module: £unpriced
- 1 candidate × shutdown status lamp: £unpriced
- 1 candidate × single-use pressure relief valve: £unpriced
- 1 candidate × vent filter integrity tag: £unpriced
- 1 candidate × pressure alarm relay: £unpriced
- 1 candidate × bag burst shield: £unpriced
- 1 candidate × sterile connection checklist card: £unpriced
- 1 candidate × connector tamper seal set: £unpriced
- 1 candidate × pre-use integrity test kit: £unpriced
- 1 candidate × operator gowning placard: £unpriced
- 1 candidate × emergency stop button: £unpriced
- 1 candidate × door interlock switch: £unpriced
- 1 candidate × leak tray float switch: £unpriced
- 1 candidate × protective earth test point: £unpriced
- 1 candidate × bag loading fixture: £unpriced
- 1 candidate × tube routing template: £unpriced
- 1 candidate × connector cap organiser: £unpriced
- 1 candidate × setup verification barcode sheet: £unpriced
- 1 candidate × pH calibration buffer holder: £unpriced
- 1 candidate × DO zero span adapter: £unpriced
- 1 candidate × calibration data entry HMI page: £unpriced
- 1 candidate × sensor replacement guide label: £unpriced
- 1 candidate × wipe-down kit holder: £unpriced
- 1 candidate × spill tray liner: £unpriced
- 1 candidate × spent bag removal cart interface: £unpriced
- 1 candidate × turnaround checklist card: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
# Untitled hardware project

Class: vertical_farm
Verdict: feasible

## Requirement Traceability
- COVERED Envelope length: 2.4 m -> Growing Structure And Containment, Harvest Cleaning And Serviceability, Light Climate And Gas Environment; sanity:farm_footprint, sanity:farm_wet_electrical_separation, sanity:farm_process_closure
- COVERED Envelope width: 1.4 m -> Growing Structure And Containment, Harvest Cleaning And Serviceability, Light Climate And Gas Environment; sanity:farm_footprint, sanity:farm_wet_electrical_separation, sanity:farm_process_closure
- COVERED Footprint: 3.36 m2 -> Growing Structure And Containment, Harvest Cleaning And Serviceability, Light Climate And Gas Environment; sanity:farm_footprint, sanity:farm_wet_electrical_separation, sanity:farm_process_closure

## Headline Metrics
- Annual leafy-green yield: 1800 kg/year (low)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS Grow Unit Footprint: 3.36 m2 (1 to 20 m2 for compact prototype grow units)
  3.36 m2 is a compact but workable footprint if stacked trays and service access are resolved.
- PASS Wet/Electrical Separation: present (washdown boundary, mains supply and protective-earth interfaces present)
  The architecture declares a wet-zone boundary and protected electrical distribution before sourcing components.
- PASS Climate/Nutrient/Control Closure: present (environmental, nutrient transport, sensing and control modules all present)
  Crop growth has a closed loop for light/climate, nutrient movement, sensing and controller action.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected vertical_farm with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 9-module vertical_farm architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 9 modules, 28 sub-modules, 122 component words
Required interface links:
- OK control_compute_communication -> environmental_interface via actuator_bus
- OK control_compute_communication -> mass_fluid_transport_process via actuator_bus
- OK environmental_interface -> mass_fluid_transport_process via sensor_bus

- Growing Structure And Containment: Carries stacked crop trays, lighting and service access within a compact 3.36 m2 footprint.
  Interfaces: service_access, tray_support, washdown_boundary, mains_supply
  - Growing rack stack: Supports stacked trays, lighting bars and plant mass.
    Components: Growing rack structure, aluminium extrusion upright, cross brace set, adjustable levelling foot, tray slide rail
    Interfaces: tray_support, service_access
  - Crop tray carriers: Holds channels, mats and seedlings at controlled spacing.
    Components: food-safe grow tray, NFT channel insert, seedling raft, root-zone cover, tray drain fitting
    Interfaces: tray_support, nutrient_loop
  - Enclosure panels: Separates humid grow volume from room air and service zones.
    Components: washdown side panel, clear inspection door, EPDM door gasket, condensate drip channel
    Interfaces: washdown_boundary, airflow
- Light Climate And Gas Environment: Controls photons, airflow, humidity and CO2 around the crop canopy.
  Interfaces: lighting_control, airflow, sensor_bus, actuator_bus, mains_supply
  - Horticultural lighting: Delivers crop-specific photosynthetic photon flux to each shelf.
    Components: LED grow lights, dimmable LED driver, lighting suspension bracket, PPFD calibration target, glare shield
    Interfaces: lighting_control, mains_supply, service_access
  - Canopy air mixing: Moves air across leaves to reduce stagnant humidity pockets.
    Components: Air circulation fans, fan guard grille, airflow baffle plate, replaceable intake filter
    Interfaces: airflow, actuator_bus
  - Humidity and temperature control: Maintains crop vapor-pressure deficit and sensible heat balance.
    Components: dehumidifier module, heat exchanger coil, condensate pump, supply air temperature probe, humidity control relay
    Interfaces: airflow, sensor_bus, actuator_bus
  - CO2 enrichment: Measures and doses CO2 when the growing chamber is closed.
    Components: CO2 sensor or dosing, NDIR CO2 sensor head, CO2 solenoid valve, gas regulator, CO2 distribution tube
    Interfaces: airflow, sensor_bus, actuator_bus
- Nutrient And Water Transport Process: Stores, doses, filters and circulates nutrient solution through crop trays.
  Interfaces: nutrient_loop, sensor_bus, actuator_bus, service_access, washdown_boundary
  - Reservoir and plumbing: Contains nutrient solution and routes it to shelves.
    Components: Reservoir and plumbing set, opaque nutrient reservoir, bulkhead fitting set, PVC-U manifold, return drain header
    Interfaces: nutrient_loop, service_access
  - Fertigation pumping: Moves nutrient solution at controlled flow rate.
    Components: Nutrient pump, pump isolation valve, check valve, flow meter, pump vibration mount
    Interfaces: nutrient_loop, actuator_bus, sensor_bus
  - Nutrient dosing: Adds nutrient concentrates and pH correction to the reservoir.
    Components: peristaltic dosing pump, pH dosing pump, chemical suction lance, anti-siphon valve, mixing eductor
    Interfaces: nutrient_loop, actuator_bus, sensor_bus
  - Filtration and sanitation: Keeps the nutrient loop clean and serviceable.
    Components: inline mesh filter, UV steriliser, drain valve, sample port
    Interfaces: nutrient_loop, service_access
- Crop And Process Instrumentation: Measures climate, nutrient chemistry and crop state for control and review.
  Interfaces: sensor_bus, video_link, nutrient_loop, airflow
  - Climate sensors: Measures canopy temperature, humidity and light level.
    Components: temperature humidity probe, PAR light sensor, leaf temperature sensor, differential pressure switch
    Interfaces: sensor_bus, airflow
  - Nutrient sensors: Measures solution chemistry and reservoir level.
    Components: pH probe, EC probe, reservoir level sensor, solution temperature probe
    Interfaces: sensor_bus, nutrient_loop
  - Crop observation: Captures visual crop evidence and growth state.
    Components: RGB crop camera, camera light shield, time-lapse controller, calibration colour card
    Interfaces: video_link, sensor_bus
- Recipe Control And Communications: Runs crop recipes, controls actuators and records operating history.
  Interfaces: sensor_bus, actuator_bus, lighting_control, video_link, operator_network
  - Environmental controller: Coordinates lighting, fertigation, climate and alarms.
    Components: Environmental controller, DIN-rail PLC, analog input module, relay output module, real-time clock module
    Interfaces: sensor_bus, actuator_bus, lighting_control
  - Recipe management: Stores crop recipes and set-point schedules.
    Components: recipe database, set-point scheduler, alarm historian, data export module
    Interfaces: operator_network, lighting_control
  - Remote monitoring: Provides operator status and alerts outside the unit.
    Components: industrial Ethernet switch, Wi-Fi gateway, MQTT telemetry bridge, SMS alarm modem
    Interfaces: operator_network, video_link
- Wet-Zone Power Distribution: Distributes mains and low-voltage power to lighting, pumps, controls and safety devices.
  Interfaces: mains_supply, lighting_control, actuator_bus, protective_earth
  - Mains isolation panel: Provides incoming isolation and branch protection.
    Components: RCD isolator panel, lockable main isolator, RCBO breaker bank, protective earth bar, surge protection device
    Interfaces: mains_supply, protective_earth, service_access
  - Lighting power distribution: Feeds and switches LED drivers by shelf.
    Components: lighting bus trunk, IP65 cable gland set, driver mounting rail, fused spur module
    Interfaces: mains_supply, lighting_control
  - Low-voltage control power: Feeds sensors, controller and communication devices.
    Components: 24 V DC power supply, DC distribution terminal, UPS buffer module, control cabinet heater
    Interfaces: actuator_bus, sensor_bus
- Food-Safe Safety And Protection: Controls electrical, water, chemical and operator risks in a humid cultivation unit.
  Interfaces: mains_supply, washdown_boundary, service_access, alarm_bus
  - Leak containment: Detects and contains nutrient leaks before they reach electrical zones.
    Components: leak detection rope, bunded base tray, overflow standpipe, floor drain adapter
    Interfaces: washdown_boundary, alarm_bus
  - Operator interlocks: Reduces exposure to bright light, moving fans and chemicals during service.
    Components: door interlock switch, lighting inhibit relay, chemical storage latch, emergency stop button
    Interfaces: service_access, alarm_bus
  - Food contact controls: Keeps crop-facing components cleanable and traceable.
    Components: food-grade tubing set, cleaning validation swab kit, material traceability label, washdown SOP placard
    Interfaces: washdown_boundary, service_access
- Harvest Cleaning And Serviceability: Supports tray removal, cleaning, filter changes and routine crop operations.
  Interfaces: service_access, washdown_boundary, nutrient_loop
  - Harvest access: Allows ergonomic crop removal and replanting.
    Components: slide-out tray handle, shelf stop latch, harvest work ledge, removable seedling cassette
    Interfaces: service_access, tray_support
  - Cleaning access: Allows sanitation of wet and crop-contact areas.
    Components: quick-release manifold union, removable sump screen, washdown hose connection, drying fan mode switch
    Interfaces: washdown_boundary, service_access
  - Consumable service: Makes filters, probes and dosing consumables replaceable.
    Components: filter service hatch, probe calibration cup, dosing bottle tray, spare gasket kit
    Interfaces: service_access, nutrient_loop
- Operator HMI And Labelling: Shows grow state, alarms, recipes and safe operating instructions.
  Interfaces: operator_network, service_access, alarm_bus
  - Local HMI: Provides local status, recipe selection and alarm acknowledgement.
    Components: touchscreen HMI, recipe selector control, alarm buzzer beacon, USB data export port
    Interfaces: operator_network, service_access
  - Labelling and workflows: Communicates hazards, cleaning steps and crop lot identity.
    Components: crop lot label holder, chemical hazard label set, cleaning checklist card, electrical isolation placard
    Interfaces: service_access

## BoM
Total: £0
- 1 candidate × Growing rack structure: £unpriced
- 1 candidate × aluminium extrusion upright: £unpriced
- 1 candidate × cross brace set: £unpriced
- 1 candidate × adjustable levelling foot: £unpriced
- 1 candidate × tray slide rail: £unpriced
- 1 candidate × food-safe grow tray: £unpriced
- 1 candidate × NFT channel insert: £unpriced
- 1 candidate × seedling raft: £unpriced
- 1 candidate × root-zone cover: £unpriced
- 1 candidate × tray drain fitting: £unpriced
- 1 candidate × washdown side panel: £unpriced
- 1 candidate × clear inspection door: £unpriced
- 1 candidate × EPDM door gasket: £unpriced
- 1 candidate × condensate drip channel: £unpriced
- 1 candidate × LED grow lights: £unpriced
- 1 candidate × dimmable LED driver: £unpriced
- 1 candidate × lighting suspension bracket: £unpriced
- 1 candidate × PPFD calibration target: £unpriced
- 1 candidate × glare shield: £unpriced
- 1 candidate × Air circulation fans: £unpriced
- 1 candidate × fan guard grille: £unpriced
- 1 candidate × airflow baffle plate: £unpriced
- 1 candidate × replaceable intake filter: £unpriced
- 1 candidate × dehumidifier module: £unpriced
- 1 candidate × heat exchanger coil: £unpriced
- 1 candidate × condensate pump: £unpriced
- 1 candidate × supply air temperature probe: £unpriced
- 1 candidate × humidity control relay: £unpriced
- 1 candidate × CO2 sensor or dosing: £unpriced
- 1 candidate × NDIR CO2 sensor head: £unpriced
- 1 candidate × CO2 solenoid valve: £unpriced
- 1 candidate × gas regulator: £unpriced
- 1 candidate × CO2 distribution tube: £unpriced
- 1 candidate × Reservoir and plumbing set: £unpriced
- 1 candidate × opaque nutrient reservoir: £unpriced
- 1 candidate × bulkhead fitting set: £unpriced
- 1 candidate × PVC-U manifold: £unpriced
- 1 candidate × return drain header: £unpriced
- 1 candidate × Nutrient pump: £unpriced
- 1 candidate × pump isolation valve: £unpriced
- 1 candidate × check valve: £unpriced
- 1 candidate × flow meter: £unpriced
- 1 candidate × pump vibration mount: £unpriced
- 1 candidate × peristaltic dosing pump: £unpriced
- 1 candidate × pH dosing pump: £unpriced
- 1 candidate × chemical suction lance: £unpriced
- 1 candidate × anti-siphon valve: £unpriced
- 1 candidate × mixing eductor: £unpriced
- 1 candidate × inline mesh filter: £unpriced
- 1 candidate × UV steriliser: £unpriced
- 1 candidate × drain valve: £unpriced
- 1 candidate × sample port: £unpriced
- 1 candidate × temperature humidity probe: £unpriced
- 1 candidate × PAR light sensor: £unpriced
- 1 candidate × leaf temperature sensor: £unpriced
- 1 candidate × differential pressure switch: £unpriced
- 1 candidate × pH probe: £unpriced
- 1 candidate × EC probe: £unpriced
- 1 candidate × reservoir level sensor: £unpriced
- 1 candidate × solution temperature probe: £unpriced
- 1 candidate × RGB crop camera: £unpriced
- 1 candidate × camera light shield: £unpriced
- 1 candidate × time-lapse controller: £unpriced
- 1 candidate × calibration colour card: £unpriced
- 1 candidate × Environmental controller: £unpriced
- 1 candidate × DIN-rail PLC: £unpriced
- 1 candidate × analog input module: £unpriced
- 1 candidate × relay output module: £unpriced
- 1 candidate × real-time clock module: £unpriced
- 1 candidate × recipe database: £unpriced
- 1 candidate × set-point scheduler: £unpriced
- 1 candidate × alarm historian: £unpriced
- 1 candidate × data export module: £unpriced
- 1 candidate × industrial Ethernet switch: £unpriced
- 1 candidate × Wi-Fi gateway: £unpriced
- 1 candidate × MQTT telemetry bridge: £unpriced
- 1 candidate × SMS alarm modem: £unpriced
- 1 candidate × RCD isolator panel: £unpriced
- 1 candidate × lockable main isolator: £unpriced
- 1 candidate × RCBO breaker bank: £unpriced
- 1 candidate × protective earth bar: £unpriced
- 1 candidate × surge protection device: £unpriced
- 1 candidate × lighting bus trunk: £unpriced
- 1 candidate × IP65 cable gland set: £unpriced
- 1 candidate × driver mounting rail: £unpriced
- 1 candidate × fused spur module: £unpriced
- 1 candidate × 24 V DC power supply: £unpriced
- 1 candidate × DC distribution terminal: £unpriced
- 1 candidate × UPS buffer module: £unpriced
- 1 candidate × control cabinet heater: £unpriced
- 1 candidate × leak detection rope: £unpriced
- 1 candidate × bunded base tray: £unpriced
- 1 candidate × overflow standpipe: £unpriced
- 1 candidate × floor drain adapter: £unpriced
- 1 candidate × door interlock switch: £unpriced
- 1 candidate × lighting inhibit relay: £unpriced
- 1 candidate × chemical storage latch: £unpriced
- 1 candidate × emergency stop button: £unpriced
- 1 candidate × food-grade tubing set: £unpriced
- 1 candidate × cleaning validation swab kit: £unpriced
- 1 candidate × material traceability label: £unpriced
- 1 candidate × washdown SOP placard: £unpriced
- 1 candidate × slide-out tray handle: £unpriced
- 1 candidate × shelf stop latch: £unpriced
- 1 candidate × harvest work ledge: £unpriced
- 1 candidate × removable seedling cassette: £unpriced
- 1 candidate × quick-release manifold union: £unpriced
- 1 candidate × removable sump screen: £unpriced
- 1 candidate × washdown hose connection: £unpriced
- 1 candidate × drying fan mode switch: £unpriced
- 1 candidate × filter service hatch: £unpriced
- 1 candidate × probe calibration cup: £unpriced
- 1 candidate × dosing bottle tray: £unpriced
- 1 candidate × spare gasket kit: £unpriced
- 1 candidate × touchscreen HMI: £unpriced
- 1 candidate × recipe selector control: £unpriced
- 1 candidate × alarm buzzer beacon: £unpriced
- 1 candidate × USB data export port: £unpriced
- 1 candidate × crop lot label holder: £unpriced
- 1 candidate × chemical hazard label set: £unpriced
- 1 candidate × cleaning checklist card: £unpriced
- 1 candidate × electrical isolation placard: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
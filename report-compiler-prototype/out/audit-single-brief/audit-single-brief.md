# Untitled hardware project

Class: ev_charger
Verdict: feasible

## Requirement Traceability
- COVERED DC output power: 120 kW -> AC Input And DC Output Distribution, Power Conversion Stack, Vehicle Charging Interface, Thermal And Environmental Interface; metric:headline_output, sanity:evcharger_power_level, sanity:evcharger_power_safety_chain, sanity:evcharger_protocol_closure

## Headline Metrics
- Annual energy dispensed: 175200 kWh/year (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS DC Charger Power Level: 120 kW (50 to 350 kW for common public DC fast-charger classes; >350 kW needs heavier cable, grid and cooling evidence)
  120 kW is a plausible DC fast-charger output before detailed grid, cable and thermal derating evidence.
- PASS Vehicle/Backend Protocol Closure: present (CCS2, ISO 15118 PLC, OCPP network and metering bus present)
  Vehicle handshake, backend session state and billable metering are connected before sourcing.
- PASS Power And Safety Chain: present (AC input, DC output, cooling, insulation monitoring, emergency stop and protective earth present)
  High-power conversion and user/service safety interfaces are explicitly allocated.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected ev_charger with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 10-module ev_charger architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 10 modules, 30 sub-modules, 120 component words
Required interface links:
- OK power_distribution -> energy_conversion_transduction via ac_input_bus
- OK energy_conversion_transduction -> charging_connector_interface via dc_output_bus
- OK control_compute_communication -> charging_connector_interface via iso15118_plc
- OK control_compute_communication -> energy_conversion_transduction via control_bus
- OK sensing_instrumentation -> control_compute_communication via metering_bus
- OK environmental_interface -> energy_conversion_transduction via coolant_loop

- AC Input And DC Output Distribution: Protects the incoming supply and DC output path for a roughly 120 kW charger.
  Interfaces: ac_input_bus, dc_output_bus, protective_earth, metering_bus, service_access
  - AC input switchgear: Protects and isolates the grid connection before conversion.
    Components: AC input breaker and SPD, lockable AC isolator, surge arrestor cartridge, input terminal shroud
    Interfaces: ac_input_bus, protective_earth, service_access
  - DC output switchgear: Connects and isolates the charging output path.
    Components: DC output contactor set, precharge resistor module, DC output fuse carrier, output polarity label
    Interfaces: dc_output_bus, control_bus, protective_earth
  - Billing metering branch: Measures delivered energy and exposes metering data to control.
    Components: MID energy meter, meter CT shunt set, meter seal kit, meter calibration label
    Interfaces: metering_bus, dc_output_bus, service_access
- Power Conversion Stack: Converts protected AC input into controlled high-power DC output.
  Interfaces: ac_input_bus, dc_output_bus, coolant_loop, control_bus, protective_earth
  - Rectifier power modules: Performs modular AC/DC conversion.
    Components: Power module stack, power module backplane, module locking rail, DC-link capacitor bank
    Interfaces: ac_input_bus, dc_output_bus, coolant_loop, control_bus
  - Output filtering: Reduces ripple and conducted emissions on charging output.
    Components: DC output choke, EMI filter assembly, snubber network board, thermal interface pad set
    Interfaces: dc_output_bus, protective_earth
  - Converter supervision: Monitors module health and coordinates derating.
    Components: module health monitor board, heatsink temperature probe, fan/coolant derating table, firmware recovery jumper
    Interfaces: control_bus, sensor_bus, coolant_loop
- Vehicle Charging Interface: Presents the CCS2 conductive and communication interface to the vehicle.
  Interfaces: dc_output_bus, ccs2_vehicle_interface, iso15118_plc, control_pilot, protective_earth
  - CCS2 cable connector: Routes high-current DC and proximity/pilot connections.
    Components: CCS2 liquid-cooled cable and connector, connector temperature sensor pair, proximity pilot resistor set, cable strain relief boot
    Interfaces: dc_output_bus, ccs2_vehicle_interface, control_pilot, protective_earth
  - Connector cooling coupling: Connects high-current cable cooling to the charger thermal loop.
    Components: liquid-cooled cable manifold, quick-connect coolant coupler, coolant leak catch tray, cable coolant temperature probe
    Interfaces: coolant_loop, ccs2_vehicle_interface, service_access
  - Vehicle communication frontend: Handles control pilot and PLC communication with the vehicle.
    Components: ISO 15118 PLC modem, control pilot interface board, proximity detection input, vehicle comms isolation transformer
    Interfaces: iso15118_plc, control_pilot, control_bus
- Control Compute Communication: Coordinates charge sessions, power-module commands, backend state and safety reactions.
  Interfaces: control_bus, iso15118_plc, ocpp_network, metering_bus, alarm_bus, service_port
  - Charge controller: Runs session state, output limits and fault transitions.
    Components: charge controller PCB, safety IO terminal block, real-time clock module, nonvolatile event log memory
    Interfaces: control_bus, metering_bus, alarm_bus
  - Backend gateway: Connects the charge point to operator systems.
    Components: OCPP communications gateway, LTE router module, ethernet surge protector, secure element module
    Interfaces: ocpp_network, service_port
  - Vehicle protocol stack: Coordinates ISO 15118, cable limits and metering sessions.
    Components: ISO 15118 PLC modem, Plug and Charge certificate store, charging session firmware image, protocol debug header
    Interfaces: iso15118_plc, control_bus, metering_bus
- Metering And Electrical Sensing: Measures billing energy, voltage, current, insulation and connector state.
  Interfaces: metering_bus, dc_output_bus, insulation_monitoring, sensor_bus, control_bus
  - Energy metering: Measures energy delivered to the vehicle.
    Components: MID energy meter, DC voltage transducer, DC current shunt, meter pulse output isolator
    Interfaces: metering_bus, dc_output_bus
  - Insulation fault detection: Detects loss of isolation on the DC charging path.
    Components: Insulation monitoring device, IMD coupling network, fault status relay, test resistor plug
    Interfaces: insulation_monitoring, dc_output_bus, alarm_bus
  - Connector sensing: Monitors cable, latch and temperature states.
    Components: connector latch microswitch, handle temperature sensor, cable identification resistor reader, holster presence switch
    Interfaces: sensor_bus, ccs2_vehicle_interface, control_pilot
- Thermal And Environmental Interface: Rejects power-electronics and cable heat while protecting outdoor electronics.
  Interfaces: coolant_loop, airflow_path, condensate_drain, service_access, protective_earth
  - Liquid cooling loop: Circulates coolant through power modules and liquid-cooled cable.
    Components: Cooling loop assembly, coolant pump, plate radiator, coolant reservoir
    Interfaces: coolant_loop, sensor_bus, service_access
  - Thermal air path: Moves air through cabinet heat exchangers and filters.
    Components: cabinet fan tray, inlet filter mat, exhaust louvre assembly, airflow proving switch
    Interfaces: airflow_path, coolant_loop, protective_earth
  - Weatherproofing: Protects the charger from rain, condensation and UV exposure.
    Components: cabinet drain grommet, door gasket set, anti-condensation heater, UV-rated cable cover
    Interfaces: condensate_drain, service_access
- Cabinet Structure And Containment: Houses high-power electronics, cable management and outdoor installation features.
  Interfaces: mechanical_mounts, service_access, protective_earth, ccs2_vehicle_interface
  - Outdoor cabinet: Carries power electronics and protects against weather and impact.
    Components: powder-coated steel cabinet, front service door, anti-vandal hinge set, plinth mounting kit
    Interfaces: mechanical_mounts, service_access, protective_earth
  - Cable holster and boom: Manages heavy high-current cable during user operation.
    Components: connector holster, cable retractor arm, cable bend limiter, parking status flag
    Interfaces: ccs2_vehicle_interface, mechanical_mounts
  - Internal compartmentation: Separates AC input, DC output, control and user zones.
    Components: segregated AC/DC barrier, control compartment shield, service warning placard, earthing braid set
    Interfaces: service_access, protective_earth
- Safety Protection: Protects users, vehicles and service personnel from high-power charging hazards.
  Interfaces: emergency_stop, insulation_monitoring, protective_earth, alarm_bus, dc_output_bus
  - Emergency stop chain: Trips output contactors and records user/service stop events.
    Components: Emergency stop and safety interlock set, E-stop mushroom button, door interlock switch, safety relay module
    Interfaces: emergency_stop, alarm_bus, control_bus
  - DC fault protection: Detects and interrupts DC-side electrical faults.
    Components: Insulation monitoring device, DC arc detection board, output contactor weld check circuit, fault discharge resistor
    Interfaces: dc_output_bus, insulation_monitoring, alarm_bus
  - User access protection: Prevents user contact with live parts and communicates safe operation.
    Components: touch-safe connector shutter, protective earth continuity strap, charging status beacon, safety instruction label
    Interfaces: protective_earth, ccs2_vehicle_interface
- Maintenance And Commissioning: Supports installation, commissioning, remote diagnosis and field replacement.
  Interfaces: service_access, service_port, ocpp_network, metering_bus, coolant_loop
  - Commissioning access: Exposes safe setup and verification points.
    Components: commissioning terminal block, meter test port, output test socket cover, commissioning checklist card
    Interfaces: service_access, service_port, metering_bus
  - Replaceable modules: Makes high-failure assemblies field swappable.
    Components: slide-out power module rail, quick-disconnect coolant fitting, gateway DIN rail carrier, spare fuse and link kit
    Interfaces: service_access, control_bus, coolant_loop
  - Remote diagnostics: Collects and exports health data for service teams.
    Components: diagnostic log exporter, remote firmware update agent, health telemetry packet schema, service VPN profile
    Interfaces: ocpp_network, service_port, control_bus
- User Payment And HMI: Guides charging sessions, payment, status and accessibility at the charger front end.
  Interfaces: ocpp_network, control_bus, ccs2_vehicle_interface, service_access
  - User display panel: Presents session state, price, energy and fault messages.
    Components: touchscreen HMI panel, status LED light bar, audio buzzer, sunlight-readable display cover
    Interfaces: control_bus, ocpp_network
  - Payment and identity: Supports card, RFID or app-based authorisation.
    Components: RFID reader module, contactless payment terminal, receipt QR code generator, privacy label
    Interfaces: ocpp_network, control_bus
  - User cable guidance: Helps users lift, park and confirm the heavy CCS2 connector.
    Components: connector instruction graphic, cable park indicator, accessibility reach label, session stop button
    Interfaces: ccs2_vehicle_interface, service_access

## BoM
Total: £0
- 1 candidate × AC input breaker and SPD: £unpriced
- 1 candidate × lockable AC isolator: £unpriced
- 1 candidate × surge arrestor cartridge: £unpriced
- 1 candidate × input terminal shroud: £unpriced
- 1 candidate × DC output contactor set: £unpriced
- 1 candidate × precharge resistor module: £unpriced
- 1 candidate × DC output fuse carrier: £unpriced
- 1 candidate × output polarity label: £unpriced
- 1 candidate × MID energy meter: £unpriced
- 1 candidate × meter CT shunt set: £unpriced
- 1 candidate × meter seal kit: £unpriced
- 1 candidate × meter calibration label: £unpriced
- 1 candidate × Power module stack: £unpriced
- 1 candidate × power module backplane: £unpriced
- 1 candidate × module locking rail: £unpriced
- 1 candidate × DC-link capacitor bank: £unpriced
- 1 candidate × DC output choke: £unpriced
- 1 candidate × EMI filter assembly: £unpriced
- 1 candidate × snubber network board: £unpriced
- 1 candidate × thermal interface pad set: £unpriced
- 1 candidate × module health monitor board: £unpriced
- 1 candidate × heatsink temperature probe: £unpriced
- 1 candidate × fan/coolant derating table: £unpriced
- 1 candidate × firmware recovery jumper: £unpriced
- 1 candidate × CCS2 liquid-cooled cable and connector: £unpriced
- 1 candidate × connector temperature sensor pair: £unpriced
- 1 candidate × proximity pilot resistor set: £unpriced
- 1 candidate × cable strain relief boot: £unpriced
- 1 candidate × liquid-cooled cable manifold: £unpriced
- 1 candidate × quick-connect coolant coupler: £unpriced
- 1 candidate × coolant leak catch tray: £unpriced
- 1 candidate × cable coolant temperature probe: £unpriced
- 1 candidate × ISO 15118 PLC modem: £unpriced
- 1 candidate × control pilot interface board: £unpriced
- 1 candidate × proximity detection input: £unpriced
- 1 candidate × vehicle comms isolation transformer: £unpriced
- 1 candidate × charge controller PCB: £unpriced
- 1 candidate × safety IO terminal block: £unpriced
- 1 candidate × real-time clock module: £unpriced
- 1 candidate × nonvolatile event log memory: £unpriced
- 1 candidate × OCPP communications gateway: £unpriced
- 1 candidate × LTE router module: £unpriced
- 1 candidate × ethernet surge protector: £unpriced
- 1 candidate × secure element module: £unpriced
- 1 candidate × ISO 15118 PLC modem: £unpriced
- 1 candidate × Plug and Charge certificate store: £unpriced
- 1 candidate × charging session firmware image: £unpriced
- 1 candidate × protocol debug header: £unpriced
- 1 candidate × MID energy meter: £unpriced
- 1 candidate × DC voltage transducer: £unpriced
- 1 candidate × DC current shunt: £unpriced
- 1 candidate × meter pulse output isolator: £unpriced
- 1 candidate × Insulation monitoring device: £unpriced
- 1 candidate × IMD coupling network: £unpriced
- 1 candidate × fault status relay: £unpriced
- 1 candidate × test resistor plug: £unpriced
- 1 candidate × connector latch microswitch: £unpriced
- 1 candidate × handle temperature sensor: £unpriced
- 1 candidate × cable identification resistor reader: £unpriced
- 1 candidate × holster presence switch: £unpriced
- 1 candidate × Cooling loop assembly: £unpriced
- 1 candidate × coolant pump: £unpriced
- 1 candidate × plate radiator: £unpriced
- 1 candidate × coolant reservoir: £unpriced
- 1 candidate × cabinet fan tray: £unpriced
- 1 candidate × inlet filter mat: £unpriced
- 1 candidate × exhaust louvre assembly: £unpriced
- 1 candidate × airflow proving switch: £unpriced
- 1 candidate × cabinet drain grommet: £unpriced
- 1 candidate × door gasket set: £unpriced
- 1 candidate × anti-condensation heater: £unpriced
- 1 candidate × UV-rated cable cover: £unpriced
- 1 candidate × powder-coated steel cabinet: £unpriced
- 1 candidate × front service door: £unpriced
- 1 candidate × anti-vandal hinge set: £unpriced
- 1 candidate × plinth mounting kit: £unpriced
- 1 candidate × connector holster: £unpriced
- 1 candidate × cable retractor arm: £unpriced
- 1 candidate × cable bend limiter: £unpriced
- 1 candidate × parking status flag: £unpriced
- 1 candidate × segregated AC/DC barrier: £unpriced
- 1 candidate × control compartment shield: £unpriced
- 1 candidate × service warning placard: £unpriced
- 1 candidate × earthing braid set: £unpriced
- 1 candidate × Emergency stop and safety interlock set: £unpriced
- 1 candidate × E-stop mushroom button: £unpriced
- 1 candidate × door interlock switch: £unpriced
- 1 candidate × safety relay module: £unpriced
- 1 candidate × Insulation monitoring device: £unpriced
- 1 candidate × DC arc detection board: £unpriced
- 1 candidate × output contactor weld check circuit: £unpriced
- 1 candidate × fault discharge resistor: £unpriced
- 1 candidate × touch-safe connector shutter: £unpriced
- 1 candidate × protective earth continuity strap: £unpriced
- 1 candidate × charging status beacon: £unpriced
- 1 candidate × safety instruction label: £unpriced
- 1 candidate × commissioning terminal block: £unpriced
- 1 candidate × meter test port: £unpriced
- 1 candidate × output test socket cover: £unpriced
- 1 candidate × commissioning checklist card: £unpriced
- 1 candidate × slide-out power module rail: £unpriced
- 1 candidate × quick-disconnect coolant fitting: £unpriced
- 1 candidate × gateway DIN rail carrier: £unpriced
- 1 candidate × spare fuse and link kit: £unpriced
- 1 candidate × diagnostic log exporter: £unpriced
- 1 candidate × remote firmware update agent: £unpriced
- 1 candidate × health telemetry packet schema: £unpriced
- 1 candidate × service VPN profile: £unpriced
- 1 candidate × touchscreen HMI panel: £unpriced
- 1 candidate × status LED light bar: £unpriced
- 1 candidate × audio buzzer: £unpriced
- 1 candidate × sunlight-readable display cover: £unpriced
- 1 candidate × RFID reader module: £unpriced
- 1 candidate × contactless payment terminal: £unpriced
- 1 candidate × receipt QR code generator: £unpriced
- 1 candidate × privacy label: £unpriced
- 1 candidate × connector instruction graphic: £unpriced
- 1 candidate × cable park indicator: £unpriced
- 1 candidate × accessibility reach label: £unpriced
- 1 candidate × session stop button: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
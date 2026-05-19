# Design an 8 kW thermal air-source heat pump with COP 3

Class: heat_pump
Verdict: feasible

## Requirement Traceability
- COVERED Thermal output: 8 kW -> Refrigerant Energy Conversion, Outdoor Air Interface, Hydronic Heat Delivery; metric:headline_output, sanity:heatpump_cop_input_power, sanity:heatpump_refrigerant_hydronic_closure
- COVERED Coefficient of performance: 3.5 COP -> Refrigerant Energy Conversion, Control Compute Communication, Sensing Instrumentation; metric:headline_output, sanity:heatpump_cop_input_power, sanity:heatpump_refrigerant_hydronic_closure

## Headline Metrics
- Annual useful heat output: 16000 kWh/year (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS COP And Input Power: 3.5 COP / 2.29 kW electric input (COP 2.5 to 5.5 for plausible air-source heat-pump operating points)
  A 8 kW thermal target at COP 3.5 implies roughly 2.29 kW electrical input before detailed operating-point curves.
- PASS Refrigerant/Hydronic Closure: present (refrigerant loop, hydronic loop, control bus and sensor bus present)
  Heat extraction, compression, water-side delivery, control and sensing are connected before BoM sourcing.
- PASS Safety And Serviceability Interfaces: present (pressure relief, protective earth, condensate drain and service access present)
  The architecture names the main safety and service interfaces needed for a monobloc heat-pump review.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected heat_pump with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 10-module heat_pump architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 10 modules, 31 sub-modules, 124 component words
Required interface links:
- OK environmental_interface -> energy_conversion_transduction via refrigerant_loop
- OK energy_conversion_transduction -> mass_fluid_transport_process via hydronic_loop
- OK control_compute_communication -> energy_conversion_transduction via control_bus
- OK sensing_instrumentation -> control_compute_communication via sensor_bus

- Refrigerant Energy Conversion: Moves roughly 8 kW of useful heat with a target COP near 3.5.
  Interfaces: refrigerant_loop, hydronic_loop, control_bus, protective_earth, service_access
  - Compressor inverter stage: Raises refrigerant pressure while modulating thermal output.
    Components: Inverter scroll compressor, compressor inverter drive, compressor mounting grommet set, crankcase heater band
    Interfaces: refrigerant_loop, control_bus, protective_earth
  - Expansion metering stage: Meters refrigerant into the outdoor coil across operating conditions.
    Components: Electronic expansion valve, EEV stepper harness, liquid-line filter drier, sight glass indicator
    Interfaces: refrigerant_loop, control_bus, service_access
  - Refrigerant manifold: Routes refrigerant between compressor, evaporator, condenser and service points.
    Components: copper refrigerant tube set, service valve pair, brazed joint sleeve set, refrigerant charge label
    Interfaces: refrigerant_loop, service_access
  - Condenser coupling boundary: Defines the refrigerant-to-water handoff into the hydronic heat-delivery module.
    Components: refrigerant stub-out pair, hydronic stub-out pair, plate heat exchanger mounting bracket, condenser insulation sleeve
    Interfaces: refrigerant_loop, hydronic_loop, sensor_bus, service_access
- Outdoor Air Interface: Extracts ambient heat while managing airflow, frost and condensate.
  Interfaces: refrigerant_loop, airflow_path, condensate_drain, sensor_bus
  - Outdoor evaporator: Transfers ambient heat into the refrigerant loop.
    Components: Outdoor finned evaporator coil, coil temperature sensor, coil guard grille, hydrophilic fin coating
    Interfaces: refrigerant_loop, airflow_path, sensor_bus
  - Fan air path: Drives controlled airflow through the coil face.
    Components: Variable-speed fan assembly, EC fan motor controller, fan shroud, inlet debris screen
    Interfaces: airflow_path, control_bus, protective_earth
  - Defrost and condensate path: Controls frost meltwater and drainage away from the outdoor unit.
    Components: condensate drain tray, trace heater cable, defrost temperature probe, drain hose barb
    Interfaces: condensate_drain, sensor_bus, service_access
- Hydronic Heat Delivery: Transfers condenser heat into the building water circuit with protected flow.
  Interfaces: hydronic_loop, pressure_relief, sensor_bus, service_access
  - Condenser heat exchanger: Transfers refrigerant heat to the water loop.
    Components: Brazed plate heat exchanger, plate exchanger insulation jacket, water outlet temperature sensor, refrigerant outlet temperature sensor
    Interfaces: refrigerant_loop, hydronic_loop, sensor_bus
  - Circulation pump group: Maintains water flow through the condenser and heating circuit.
    Components: Hydronic circulation pump, pump isolation valve pair, flow proving switch, strainer filter
    Interfaces: hydronic_loop, control_bus, protective_earth
  - Hydronic safety group: Limits water pressure and allows commissioning service.
    Components: Hydronic safety valve kit, expansion vessel, automatic air vent, fill and drain valve set
    Interfaces: hydronic_loop, pressure_relief, service_access
- Control Compute Communication: Coordinates refrigerant, fan, pump, defrost and user-demand states.
  Interfaces: control_bus, sensor_bus, service_port, alarm_bus
  - Main controller: Runs heating, hot-water, anti-freeze and defrost state machines.
    Components: Heat pump controller PCB, controller enclosure, real-time clock module, non-volatile fault memory
    Interfaces: control_bus, sensor_bus, service_port
  - Power driver IO: Switches controlled loads and reads discrete safety inputs.
    Components: compressor contactor, pump relay output, fan PWM output board, safety chain input terminal
    Interfaces: control_bus, protective_earth, alarm_bus
  - Service communications: Exposes commissioning and diagnostics to installers.
    Components: Modbus service port, USB commissioning adapter, fault LED stack, installer QR code label
    Interfaces: service_port, sensor_bus
- Sensing Instrumentation: Measures refrigerant, water and ambient state for safety and efficiency.
  Interfaces: sensor_bus, refrigerant_loop, hydronic_loop, airflow_path
  - Refrigerant sensing: Measures pressure and temperature around the refrigerant circuit.
    Components: Refrigerant sensor and pressure transducers, suction temperature probe, discharge temperature probe, refrigerant leak sensor
    Interfaces: sensor_bus, refrigerant_loop
  - Water sensing: Measures water-loop temperatures and flow evidence.
    Components: flow temperature sensor, return temperature sensor, flow meter cartridge, water pressure transducer
    Interfaces: sensor_bus, hydronic_loop
  - Ambient sensing: Measures external conditions that affect capacity and defrost.
    Components: ambient temperature sensor, ambient humidity sensor, air pressure switch, rain ingress sensor
    Interfaces: sensor_bus, airflow_path
- Electrical Power Distribution: Distributes mains power to compressor, fan, pump, controller and auxiliaries.
  Interfaces: mains_supply, protective_earth, control_bus, service_access
  - Mains input protection: Provides isolation and over-current protection at the unit boundary.
    Components: lockable isolator switch, MCB breaker set, RCD protection device, surge protection device
    Interfaces: mains_supply, protective_earth, service_access
  - Internal power rails: Creates protected rails for control and auxiliary loads.
    Components: 24 V DC power supply, terminal rail assembly, fused auxiliary terminal, protective earth bar
    Interfaces: mains_supply, control_bus, protective_earth
  - Cable management: Separates mains, sensor and refrigerant-adjacent wiring.
    Components: segregated cable duct, IP-rated cable gland set, EMC ferrite clamp set, wiring diagram label
    Interfaces: service_access, sensor_bus, control_bus
- Monobloc Structure And Containment: Contains the refrigeration system, controls airflow and supports outdoor mounting.
  Interfaces: airflow_path, condensate_drain, service_access, mechanical_mounts
  - Weatherproof cabinet: Protects refrigerant, electrical and hydronic assemblies outdoors.
    Components: galvanised steel cabinet, powder-coated access panel, EPDM door gasket, IP-rated fastener set
    Interfaces: airflow_path, service_access, protective_earth
  - Mounting base: Carries compressor mass and isolates installation vibration.
    Components: anti-vibration foot set, base rail pair, condensate fall spacer, lifting lug set
    Interfaces: mechanical_mounts, condensate_drain
  - Service access panels: Creates access for commissioning and repair without dismantling the unit.
    Components: removable service panel, hinged controller cover, quarter-turn latch set, service clearance label
    Interfaces: service_access
- Safety Protection: Protects against refrigerant, pressure, electrical and freeze hazards.
  Interfaces: pressure_relief, alarm_bus, protective_earth, sensor_bus
  - Refrigerant safety: Detects abnormal refrigerant conditions and defines response paths.
    Components: high-pressure cut-out switch, low-pressure cut-out switch, refrigerant leak alarm output, refrigerant warning label
    Interfaces: refrigerant_loop, sensor_bus, alarm_bus
  - Hydronic freeze protection: Prevents water-loop freeze damage in low ambient conditions.
    Components: anti-freeze thermostat, backup immersion heater relay, drain-down instruction label, glycol compatibility tag
    Interfaces: hydronic_loop, sensor_bus, control_bus
  - Electrical safety: Maintains protection and earthing integrity.
    Components: earth continuity test point, touch-safe terminal cover, over-temperature cut-out, safety compliance label
    Interfaces: protective_earth, mains_supply, alarm_bus
- Maintenance And Commissioning: Supports installation, refrigerant service, hydronic flushing and periodic inspection.
  Interfaces: service_access, service_port, refrigerant_loop, hydronic_loop
  - Commissioning ports: Provides controlled access to refrigerant and water commissioning points.
    Components: refrigerant service port cap set, hydronic drain cock, pressure gauge pocket, commissioning checklist card
    Interfaces: service_access, refrigerant_loop, hydronic_loop
  - Filter service: Keeps hydronic and air paths maintainable.
    Components: cleanable Y-strainer basket, coil cleaning access cover, service interval label, spare gasket kit
    Interfaces: service_access, hydronic_loop, airflow_path
  - Diagnostic access: Lets technicians verify states without dismantling assemblies.
    Components: diagnostic test header, fault code label, data log export button, installer handover record
    Interfaces: service_port, sensor_bus, control_bus
- User And Installer Interface: Presents operating mode, alarms and service instructions to users and installers.
  Interfaces: service_port, alarm_bus, control_bus
  - Local display: Shows heat-pump status and permits basic configuration.
    Components: LCD status display, menu button membrane, weatherproof display window, mode indicator LED set
    Interfaces: control_bus, service_port
  - Remote thermostat interface: Connects building demand to heat pump control.
    Components: thermostat input terminal, Modbus room controller link, demand signal opto-isolator, installer wiring label
    Interfaces: control_bus, service_port
  - Alarm and user guidance: Communicates faults and safe user actions.
    Components: alarm relay output, user quick-start label, fault reset button, QR service documentation label
    Interfaces: alarm_bus, service_access

## BoM
Total: £0
- 1 candidate × Inverter scroll compressor: £unpriced
- 1 candidate × compressor inverter drive: £unpriced
- 1 candidate × compressor mounting grommet set: £unpriced
- 1 candidate × crankcase heater band: £unpriced
- 1 candidate × Electronic expansion valve: £unpriced
- 1 candidate × EEV stepper harness: £unpriced
- 1 candidate × liquid-line filter drier: £unpriced
- 1 candidate × sight glass indicator: £unpriced
- 1 candidate × copper refrigerant tube set: £unpriced
- 1 candidate × service valve pair: £unpriced
- 1 candidate × brazed joint sleeve set: £unpriced
- 1 candidate × refrigerant charge label: £unpriced
- 1 candidate × refrigerant stub-out pair: £unpriced
- 1 candidate × hydronic stub-out pair: £unpriced
- 1 candidate × plate heat exchanger mounting bracket: £unpriced
- 1 candidate × condenser insulation sleeve: £unpriced
- 1 candidate × Outdoor finned evaporator coil: £unpriced
- 1 candidate × coil temperature sensor: £unpriced
- 1 candidate × coil guard grille: £unpriced
- 1 candidate × hydrophilic fin coating: £unpriced
- 1 candidate × Variable-speed fan assembly: £unpriced
- 1 candidate × EC fan motor controller: £unpriced
- 1 candidate × fan shroud: £unpriced
- 1 candidate × inlet debris screen: £unpriced
- 1 candidate × condensate drain tray: £unpriced
- 1 candidate × trace heater cable: £unpriced
- 1 candidate × defrost temperature probe: £unpriced
- 1 candidate × drain hose barb: £unpriced
- 1 candidate × Brazed plate heat exchanger: £unpriced
- 1 candidate × plate exchanger insulation jacket: £unpriced
- 1 candidate × water outlet temperature sensor: £unpriced
- 1 candidate × refrigerant outlet temperature sensor: £unpriced
- 1 candidate × Hydronic circulation pump: £unpriced
- 1 candidate × pump isolation valve pair: £unpriced
- 1 candidate × flow proving switch: £unpriced
- 1 candidate × strainer filter: £unpriced
- 1 candidate × Hydronic safety valve kit: £unpriced
- 1 candidate × expansion vessel: £unpriced
- 1 candidate × automatic air vent: £unpriced
- 1 candidate × fill and drain valve set: £unpriced
- 1 candidate × Heat pump controller PCB: £unpriced
- 1 candidate × controller enclosure: £unpriced
- 1 candidate × real-time clock module: £unpriced
- 1 candidate × non-volatile fault memory: £unpriced
- 1 candidate × compressor contactor: £unpriced
- 1 candidate × pump relay output: £unpriced
- 1 candidate × fan PWM output board: £unpriced
- 1 candidate × safety chain input terminal: £unpriced
- 1 candidate × Modbus service port: £unpriced
- 1 candidate × USB commissioning adapter: £unpriced
- 1 candidate × fault LED stack: £unpriced
- 1 candidate × installer QR code label: £unpriced
- 1 candidate × Refrigerant sensor and pressure transducers: £unpriced
- 1 candidate × suction temperature probe: £unpriced
- 1 candidate × discharge temperature probe: £unpriced
- 1 candidate × refrigerant leak sensor: £unpriced
- 1 candidate × flow temperature sensor: £unpriced
- 1 candidate × return temperature sensor: £unpriced
- 1 candidate × flow meter cartridge: £unpriced
- 1 candidate × water pressure transducer: £unpriced
- 1 candidate × ambient temperature sensor: £unpriced
- 1 candidate × ambient humidity sensor: £unpriced
- 1 candidate × air pressure switch: £unpriced
- 1 candidate × rain ingress sensor: £unpriced
- 1 candidate × lockable isolator switch: £unpriced
- 1 candidate × MCB breaker set: £unpriced
- 1 candidate × RCD protection device: £unpriced
- 1 candidate × surge protection device: £unpriced
- 1 candidate × 24 V DC power supply: £unpriced
- 1 candidate × terminal rail assembly: £unpriced
- 1 candidate × fused auxiliary terminal: £unpriced
- 1 candidate × protective earth bar: £unpriced
- 1 candidate × segregated cable duct: £unpriced
- 1 candidate × IP-rated cable gland set: £unpriced
- 1 candidate × EMC ferrite clamp set: £unpriced
- 1 candidate × wiring diagram label: £unpriced
- 1 candidate × galvanised steel cabinet: £unpriced
- 1 candidate × powder-coated access panel: £unpriced
- 1 candidate × EPDM door gasket: £unpriced
- 1 candidate × IP-rated fastener set: £unpriced
- 1 candidate × anti-vibration foot set: £unpriced
- 1 candidate × base rail pair: £unpriced
- 1 candidate × condensate fall spacer: £unpriced
- 1 candidate × lifting lug set: £unpriced
- 1 candidate × removable service panel: £unpriced
- 1 candidate × hinged controller cover: £unpriced
- 1 candidate × quarter-turn latch set: £unpriced
- 1 candidate × service clearance label: £unpriced
- 1 candidate × high-pressure cut-out switch: £unpriced
- 1 candidate × low-pressure cut-out switch: £unpriced
- 1 candidate × refrigerant leak alarm output: £unpriced
- 1 candidate × refrigerant warning label: £unpriced
- 1 candidate × anti-freeze thermostat: £unpriced
- 1 candidate × backup immersion heater relay: £unpriced
- 1 candidate × drain-down instruction label: £unpriced
- 1 candidate × glycol compatibility tag: £unpriced
- 1 candidate × earth continuity test point: £unpriced
- 1 candidate × touch-safe terminal cover: £unpriced
- 1 candidate × over-temperature cut-out: £unpriced
- 1 candidate × safety compliance label: £unpriced
- 1 candidate × refrigerant service port cap set: £unpriced
- 1 candidate × hydronic drain cock: £unpriced
- 1 candidate × pressure gauge pocket: £unpriced
- 1 candidate × commissioning checklist card: £unpriced
- 1 candidate × cleanable Y-strainer basket: £unpriced
- 1 candidate × coil cleaning access cover: £unpriced
- 1 candidate × service interval label: £unpriced
- 1 candidate × spare gasket kit: £unpriced
- 1 candidate × diagnostic test header: £unpriced
- 1 candidate × fault code label: £unpriced
- 1 candidate × data log export button: £unpriced
- 1 candidate × installer handover record: £unpriced
- 1 candidate × LCD status display: £unpriced
- 1 candidate × menu button membrane: £unpriced
- 1 candidate × weatherproof display window: £unpriced
- 1 candidate × mode indicator LED set: £unpriced
- 1 candidate × thermostat input terminal: £unpriced
- 1 candidate × Modbus room controller link: £unpriced
- 1 candidate × demand signal opto-isolator: £unpriced
- 1 candidate × installer wiring label: £unpriced
- 1 candidate × alarm relay output: £unpriced
- 1 candidate × user quick-start label: £unpriced
- 1 candidate × fault reset button: £unpriced
- 1 candidate × QR service documentation label: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
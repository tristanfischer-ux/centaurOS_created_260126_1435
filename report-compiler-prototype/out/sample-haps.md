# Untitled hardware project

Class: haps
Verdict: feasible

## Requirement Traceability
- COVERED Wingspan: 35 m -> Ultra-Light Wing Structure, Solar Energy Harvesting, Propulsion And Control Surfaces, Ground Handling Serviceability; sanity:haps_wingspan_envelope, sanity:haps_energy_flight_closure
- COVERED Endurance: 30 days -> Solar Energy Harvesting, Night-Cycle Energy Storage, Flight Power Distribution, Propulsion And Control Surfaces, Autonomy Control Communication; metric:headline_output, sanity:haps_endurance_target, sanity:haps_energy_flight_closure
- COVERED Operating altitude: 20 km -> Stratospheric Environmental Interface, Navigation And Airdata Sensing, Autonomy Control Communication, Flight Safety And Recovery; sanity:haps_altitude_band, sanity:haps_energy_flight_closure, sanity:haps_payload_comms_safety

## Headline Metrics
- Station-keeping endurance: 30 days (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS Stratospheric Altitude Band: 20 km (15 to 25 km for common HAPS station-keeping concepts; outside this band needs atmospheric, power and airspace evidence)
  20 km sits in the stratospheric operating band before detailed wind, airspace and thermal environment evidence.
- PASS Station-Keeping Endurance: 30 days (<=60 days plausible for early solar HAPS concept, 60-180 days needs strong degradation and energy evidence, >180 days is high risk)
  30 days requires solar day/night balance, degradation allowance, battery reserve and stratospheric wind validation.
- PASS Wing Span Envelope: 35 m (10 to 80 m for lightweight demonstrator-to-service HAPS concepts before aeroelastic proof)
  35 m is plausible for a solar HAPS wing, but still needs aeroelastic, transport and launch-handling evidence.
- PASS Solar/Energy/Flight Closure: present (solar DC, battery DC, propulsion power, flight control and battery monitor paths present)
  Solar generation, night-cycle battery storage, propulsion loads and flight control are connected before BoM sourcing.
- PASS Payload/Telemetry/Safety Closure: present (payload data, payload power, telemetry, hardwired trip, thermal path and recovery parachute present)
  Payload relay, ground command, thermal protection and recovery paths are named before sourcing or flight-readiness claims.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected haps with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 11-module haps architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 11 modules, 33 sub-modules, 132 component words
Required interface links:
- OK energy_harvesting -> power_distribution via solar_dc_bus
- OK energy_storage_source -> power_distribution via battery_dc_bus
- OK power_distribution -> actuation_kinematics via propulsion_power_bus
- OK control_compute_communication -> actuation_kinematics via flight_control_bus
- OK sensing_instrumentation -> control_compute_communication via sensor_bus
- OK payload_communication -> control_compute_communication via payload_data_link
- OK environmental_interface -> energy_storage_source via thermal_path
- OK safety_protection -> control_compute_communication via telemetry_link

- Ultra-Light Wing Structure: Carries a roughly 35 m high-aspect-ratio wing, solar skin, propulsion pods and payload loads.
  Interfaces: aero_load_path, solar_mount, propulsion_mounts, service_access, payload_mount
  - Wing primary structure: Provides the long-span lift structure and distributed payload mounting.
    Components: High-aspect-ratio wing structure, carbon spar cap set, foam rib set, wing joiner sleeve
    Interfaces: aero_load_path, solar_mount, propulsion_mounts
  - Tail and control structure: Provides static stability and trim surfaces.
    Components: tail boom assembly, elevator surface, rudder surface, control hinge set
    Interfaces: aero_load_path, flight_control_bus, service_access
  - Payload bay structure: Supports payload, avionics and access panels while preserving aerodynamic form.
    Components: payload bay frame, avionics tray, access panel latch set, mass balance bracket
    Interfaces: payload_mount, service_access, aero_load_path
- Solar Energy Harvesting: Converts daytime stratospheric sunlight into regulated electrical energy.
  Interfaces: solar_dc_bus, solar_mount, sensor_bus, thermal_path
  - Solar skin array: Distributes photovoltaic cells over wing surfaces.
    Components: Solar cell array, cell interconnect ribbon, transparent encapsulation film, solar string bypass diode
    Interfaces: solar_dc_bus, solar_mount, thermal_path
  - MPPT conversion: Tracks photovoltaic maximum power and feeds the flight DC bus.
    Components: MPPT power tracker, solar input current sensor, solar voltage tap loom, MPPT heat spreader
    Interfaces: solar_dc_bus, sensor_bus, service_access
  - Solar health monitoring: Detects string degradation and weathering across long endurance missions.
    Components: solar string monitor board, UV exposure witness coupon, wing surface temperature sensor, solar inspection connector
    Interfaces: solar_dc_bus, sensor_bus, service_access
- Night-Cycle Energy Storage: Stores enough solar energy for night operation during a 30 day station-keeping target.
  Interfaces: battery_dc_bus, thermal_path, battery_monitor_bus, service_access
  - Stratospheric battery pack: Stores night-cycle and transient propulsion energy.
    Components: Stratospheric battery pack, battery management board, lightweight battery enclosure, cell heater film
    Interfaces: battery_dc_bus, thermal_path, battery_monitor_bus
  - Battery thermal zone: Protects battery capacity in low-pressure, cold stratospheric conditions.
    Components: battery insulation sleeve, phase-change thermal buffer, battery temperature sensor harness, battery vent path
    Interfaces: thermal_path, battery_monitor_bus, sensor_bus
  - Energy reserve monitoring: Tracks day/night balance and mission abort reserve.
    Components: coulomb counter module, reserve energy estimator, battery isolation contactor, night-cycle test connector
    Interfaces: battery_monitor_bus, sensor_bus, telemetry_link
- Flight Power Distribution: Balances solar input, battery storage and protected load rails for propulsion, avionics and payload.
  Interfaces: solar_dc_bus, battery_dc_bus, propulsion_power_bus, payload_power_bus, low_voltage_rail, hardwired_trip
  - Solar and battery power management: Combines harvested and stored energy into mission load rails.
    Components: solar battery charge controller, main DC bus board, payload power switch, propulsion bus fuse set
    Interfaces: solar_dc_bus, battery_dc_bus, propulsion_power_bus, payload_power_bus
  - Low-voltage distribution: Feeds avionics, sensors, servos and communications loads.
    Components: avionics DC converter, servo power rail, communications DC converter, low-voltage harness loom
    Interfaces: low_voltage_rail, payload_power_bus, service_access
  - Load-shed protection: Protects mission reserve during energy-negative conditions.
    Components: load shed relay set, brownout supervisor, energy priority controller, fault latch indicator
    Interfaces: hardwired_trip, payload_power_bus, battery_monitor_bus
- Propulsion And Control Surfaces: Generates efficient station-keeping thrust and aerodynamic trim in thin stratospheric air.
  Interfaces: propulsion_power_bus, flight_control_bus, propulsion_mounts, aero_load_path
  - Electric propulsion pods: Provides distributed propulsive thrust along the wing.
    Components: Electric propulsion pod, high-altitude propeller set, motor controller module, propulsion pod fairing
    Interfaces: propulsion_power_bus, flight_control_bus, propulsion_mounts
  - Control surface actuation: Moves trim surfaces with low power and reliable feedback.
    Components: low-temperature servo actuator, control linkage rod set, surface position sensor, servo heater trace
    Interfaces: flight_control_bus, aero_load_path, low_voltage_rail
  - Station-keeping trim: Supports efficient loiter in variable stratospheric winds.
    Components: trim schedule table, gust load estimator, airspeed setpoint manager, propulsion calibration record
    Interfaces: flight_control_bus, sensor_bus, aero_load_path
- Autonomy Control Communication: Runs autonomous station keeping, energy management, payload coordination and ground command links.
  Interfaces: flight_control_bus, sensor_bus, telemetry_link, battery_monitor_bus, payload_data_link, hardwired_trip
  - Flight control computer: Executes flight stabilisation, energy-aware routing and station keeping.
    Components: Flight control computer, autopilot IO board, flight software image, watchdog supervisor
    Interfaces: flight_control_bus, sensor_bus, battery_monitor_bus, hardwired_trip
  - Ground command link: Maintains command, telemetry and mission supervision.
    Components: Ground control link, telemetry transceiver, command authentication module, mission log recorder
    Interfaces: telemetry_link, payload_data_link, service_access
  - Energy-aware autonomy: Coordinates route, payload duty cycle and energy reserve.
    Components: solar forecast model, wind field route planner, payload duty-cycle controller, return corridor manager
    Interfaces: battery_monitor_bus, payload_data_link, flight_control_bus
- Navigation And Airdata Sensing: Measures navigation, airdata, structural loads and energy state for closed-loop autonomy.
  Interfaces: sensor_bus, flight_control_bus, aero_load_path, telemetry_link
  - Navigation suite: Provides position, attitude and timing references.
    Components: GNSS INS navigation unit, barometric altitude sensor, sun sensor pair, precision timebase module
    Interfaces: sensor_bus, flight_control_bus, telemetry_link
  - Airdata and weather sensors: Measures local atmosphere and flight condition.
    Components: pitot static probe, outside air temperature probe, wind estimation filter, humidity frost sensor
    Interfaces: sensor_bus, flight_control_bus
  - Structural health sensing: Tracks load and deformation over long-span flight.
    Components: wing strain gauge strip, spar temperature sensor, vibration accelerometer, structural health recorder
    Interfaces: sensor_bus, aero_load_path, telemetry_link
- Communications Payload: Provides relay or observation service payload with controlled power, RF and data interfaces.
  Interfaces: payload_data_link, payload_power_bus, rf_aperture, thermal_path, service_access
  - Payload radio: Carries communications relay payload electronics.
    Components: Stratospheric communications payload, payload modem board, payload RF power amplifier, payload processor module
    Interfaces: payload_data_link, payload_power_bus, thermal_path
  - Antenna aperture: Provides RF aperture and beam orientation support.
    Components: Payload antenna array, antenna ground plane film, antenna feed harness, beam pointing calibration target
    Interfaces: rf_aperture, payload_data_link, aero_load_path
  - Payload integration: Controls payload mounting, thermal coupling and service access.
    Components: payload isolation mount, payload thermal strap, payload access hatch, payload configuration tag
    Interfaces: payload_power_bus, thermal_path, service_access
- Stratospheric Environmental Interface: Protects systems from low pressure, cold soak, UV exposure and thermal cycling near 20 km altitude.
  Interfaces: thermal_path, solar_mount, service_access, rf_aperture, aero_load_path
  - Thermal protection: Controls cold-soak and daytime heating across batteries, avionics and payload.
    Components: Thermal insulation blanket, multi-layer insulation patch, lightweight thermal strap, thermal witness label
    Interfaces: thermal_path, service_access
  - UV and surface protection: Protects solar skin and airframe surface from UV, ozone and abrasion.
    Components: UV protective film, leading edge erosion tape, surface contamination wipe kit, coating inspection marker
    Interfaces: solar_mount, aero_load_path, service_access
  - Low-pressure electronics management: Accounts for low pressure cooling and electrical spacing.
    Components: low-pressure vent path, conformal coating set, high-altitude creepage spacer, desiccant cartridge
    Interfaces: thermal_path, payload_power_bus, service_access
- Flight Safety And Recovery: Protects airspace, ground risk and vehicle hardware during energy faults, lost-link and descent.
  Interfaces: hardwired_trip, telemetry_link, flight_control_bus, service_access, aero_load_path
  - Abort and recovery: Provides controlled descent and recovery location after mission abort.
    Components: Recovery parachute system, parachute deployment controller, recovery beacon, safe descent mode logic
    Interfaces: hardwired_trip, telemetry_link, flight_control_bus
  - Airspace safety: Maintains geofence, lost-link and flight termination policies.
    Components: geofence database, lost-link failsafe, flight termination relay, airspace transponder module
    Interfaces: flight_control_bus, telemetry_link, hardwired_trip
  - Ground handling safety: Controls launch, recovery and battery handling hazards.
    Components: launch arming interlock, propulsion safety pin set, battery handling placard, recovery inspection checklist
    Interfaces: service_access, aero_load_path, battery_monitor_bus
- Ground Handling Serviceability: Supports wing assembly, launch preparation, payload checkout and recovery inspection.
  Interfaces: service_access, aero_load_path, telemetry_link, solar_mount
  - Wing assembly service: Makes distributed wing sections inspectable and assembled repeatably.
    Components: wing assembly jig, spar pin torque tool, solar skin protection mat, assembly witness mark set
    Interfaces: service_access, aero_load_path, solar_mount
  - Launch and recovery equipment: Supports low-speed launch and controlled recovery handling.
    Components: launch dolly interface, wingtip handling fixture, recovery cradle, ground wind limit placard
    Interfaces: service_access, aero_load_path, telemetry_link
  - Payload checkout: Verifies communications payload and telemetry before launch.
    Components: payload checkout cable, RF load test adapter, telemetry ground terminal, preflight log card
    Interfaces: service_access, payload_data_link, telemetry_link

## BoM
Total: £0
- 1 candidate × High-aspect-ratio wing structure: £unpriced
- 1 candidate × carbon spar cap set: £unpriced
- 1 candidate × foam rib set: £unpriced
- 1 candidate × wing joiner sleeve: £unpriced
- 1 candidate × tail boom assembly: £unpriced
- 1 candidate × elevator surface: £unpriced
- 1 candidate × rudder surface: £unpriced
- 1 candidate × control hinge set: £unpriced
- 1 candidate × payload bay frame: £unpriced
- 1 candidate × avionics tray: £unpriced
- 1 candidate × access panel latch set: £unpriced
- 1 candidate × mass balance bracket: £unpriced
- 1 candidate × Solar cell array: £unpriced
- 1 candidate × cell interconnect ribbon: £unpriced
- 1 candidate × transparent encapsulation film: £unpriced
- 1 candidate × solar string bypass diode: £unpriced
- 1 candidate × MPPT power tracker: £unpriced
- 1 candidate × solar input current sensor: £unpriced
- 1 candidate × solar voltage tap loom: £unpriced
- 1 candidate × MPPT heat spreader: £unpriced
- 1 candidate × solar string monitor board: £unpriced
- 1 candidate × UV exposure witness coupon: £unpriced
- 1 candidate × wing surface temperature sensor: £unpriced
- 1 candidate × solar inspection connector: £unpriced
- 1 candidate × Stratospheric battery pack: £unpriced
- 1 candidate × battery management board: £unpriced
- 1 candidate × lightweight battery enclosure: £unpriced
- 1 candidate × cell heater film: £unpriced
- 1 candidate × battery insulation sleeve: £unpriced
- 1 candidate × phase-change thermal buffer: £unpriced
- 1 candidate × battery temperature sensor harness: £unpriced
- 1 candidate × battery vent path: £unpriced
- 1 candidate × coulomb counter module: £unpriced
- 1 candidate × reserve energy estimator: £unpriced
- 1 candidate × battery isolation contactor: £unpriced
- 1 candidate × night-cycle test connector: £unpriced
- 1 candidate × solar battery charge controller: £unpriced
- 1 candidate × main DC bus board: £unpriced
- 1 candidate × payload power switch: £unpriced
- 1 candidate × propulsion bus fuse set: £unpriced
- 1 candidate × avionics DC converter: £unpriced
- 1 candidate × servo power rail: £unpriced
- 1 candidate × communications DC converter: £unpriced
- 1 candidate × low-voltage harness loom: £unpriced
- 1 candidate × load shed relay set: £unpriced
- 1 candidate × brownout supervisor: £unpriced
- 1 candidate × energy priority controller: £unpriced
- 1 candidate × fault latch indicator: £unpriced
- 4 each × Electric propulsion pod: £unpriced
- 1 candidate × high-altitude propeller set: £unpriced
- 1 candidate × motor controller module: £unpriced
- 1 candidate × propulsion pod fairing: £unpriced
- 1 candidate × low-temperature servo actuator: £unpriced
- 1 candidate × control linkage rod set: £unpriced
- 1 candidate × surface position sensor: £unpriced
- 1 candidate × servo heater trace: £unpriced
- 1 candidate × trim schedule table: £unpriced
- 1 candidate × gust load estimator: £unpriced
- 1 candidate × airspeed setpoint manager: £unpriced
- 1 candidate × propulsion calibration record: £unpriced
- 1 candidate × Flight control computer: £unpriced
- 1 candidate × autopilot IO board: £unpriced
- 1 candidate × flight software image: £unpriced
- 1 candidate × watchdog supervisor: £unpriced
- 1 candidate × Ground control link: £unpriced
- 1 candidate × telemetry transceiver: £unpriced
- 1 candidate × command authentication module: £unpriced
- 1 candidate × mission log recorder: £unpriced
- 1 candidate × solar forecast model: £unpriced
- 1 candidate × wind field route planner: £unpriced
- 1 candidate × payload duty-cycle controller: £unpriced
- 1 candidate × return corridor manager: £unpriced
- 1 candidate × GNSS INS navigation unit: £unpriced
- 1 candidate × barometric altitude sensor: £unpriced
- 1 candidate × sun sensor pair: £unpriced
- 1 candidate × precision timebase module: £unpriced
- 1 candidate × pitot static probe: £unpriced
- 1 candidate × outside air temperature probe: £unpriced
- 1 candidate × wind estimation filter: £unpriced
- 1 candidate × humidity frost sensor: £unpriced
- 1 candidate × wing strain gauge strip: £unpriced
- 1 candidate × spar temperature sensor: £unpriced
- 1 candidate × vibration accelerometer: £unpriced
- 1 candidate × structural health recorder: £unpriced
- 1 candidate × Stratospheric communications payload: £unpriced
- 1 candidate × payload modem board: £unpriced
- 1 candidate × payload RF power amplifier: £unpriced
- 1 candidate × payload processor module: £unpriced
- 1 candidate × Payload antenna array: £unpriced
- 1 candidate × antenna ground plane film: £unpriced
- 1 candidate × antenna feed harness: £unpriced
- 1 candidate × beam pointing calibration target: £unpriced
- 1 candidate × payload isolation mount: £unpriced
- 1 candidate × payload thermal strap: £unpriced
- 1 candidate × payload access hatch: £unpriced
- 1 candidate × payload configuration tag: £unpriced
- 1 candidate × Thermal insulation blanket: £unpriced
- 1 candidate × multi-layer insulation patch: £unpriced
- 1 candidate × lightweight thermal strap: £unpriced
- 1 candidate × thermal witness label: £unpriced
- 1 candidate × UV protective film: £unpriced
- 1 candidate × leading edge erosion tape: £unpriced
- 1 candidate × surface contamination wipe kit: £unpriced
- 1 candidate × coating inspection marker: £unpriced
- 1 candidate × low-pressure vent path: £unpriced
- 1 candidate × conformal coating set: £unpriced
- 1 candidate × high-altitude creepage spacer: £unpriced
- 1 candidate × desiccant cartridge: £unpriced
- 1 candidate × Recovery parachute system: £unpriced
- 1 candidate × parachute deployment controller: £unpriced
- 1 candidate × recovery beacon: £unpriced
- 1 candidate × safe descent mode logic: £unpriced
- 1 candidate × geofence database: £unpriced
- 1 candidate × lost-link failsafe: £unpriced
- 1 candidate × flight termination relay: £unpriced
- 1 candidate × airspace transponder module: £unpriced
- 1 candidate × launch arming interlock: £unpriced
- 1 candidate × propulsion safety pin set: £unpriced
- 1 candidate × battery handling placard: £unpriced
- 1 candidate × recovery inspection checklist: £unpriced
- 1 candidate × wing assembly jig: £unpriced
- 1 candidate × spar pin torque tool: £unpriced
- 1 candidate × solar skin protection mat: £unpriced
- 1 candidate × assembly witness mark set: £unpriced
- 1 candidate × launch dolly interface: £unpriced
- 1 candidate × wingtip handling fixture: £unpriced
- 1 candidate × recovery cradle: £unpriced
- 1 candidate × ground wind limit placard: £unpriced
- 1 candidate × payload checkout cable: £unpriced
- 1 candidate × RF load test adapter: £unpriced
- 1 candidate × telemetry ground terminal: £unpriced
- 1 candidate × preflight log card: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
# Untitled hardware project

Class: auv
Verdict: feasible

## Requirement Traceability
- COVERED Endurance: 8 hours -> Subsea Energy Storage, Subsea Power Distribution, Thruster Actuation Kinematics, Autonomy Compute Communication; metric:headline_output, sanity:auv_endurance_target, sanity:auv_navigation_control_closure, sanity:auv_pressure_power_recovery_safety
- COVERED Depth rating: 300 m -> Pressure Structure Containment, Pressure Thermal Buoyancy Interface, Leak Abort And Recovery Safety; sanity:auv_depth_rating, sanity:auv_pressure_power_recovery_safety

## Headline Metrics
- Survey endurance: 8 hours (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS Depth Rating: 300 m (10 to 600 m for inspection-class AUV prototypes; deeper missions need dedicated pressure-vessel, seal and recovery evidence)
  300 m is plausible for an inspection AUV before detailed pressure-boundary calculation, material selection and proof testing.
- PASS Survey Endurance Target: 8 hours (<=12 h plausible for compact inspection AUV concept, 12-24 h needs battery/drag budget, >24 h is high risk without a detailed energy model)
  8 hours is credible only after drag, hotel-load, payload-load and reserve-energy calculations are completed.
- PASS Navigation/Control Closure: present (navigation sensor bus, payload data bus, acoustic link and thrust command bus present)
  DVL/INS/depth sensing, payload data, acoustic messages and thruster commands are connected before BoM sourcing.
- PASS Pressure/Power/Recovery Safety: present (pressure boundary, leak alarm, alarm bus, DC power, service access and recovery beacon present)
  The architecture names the hull boundary, leak detection, power isolation and recovery mechanisms needed before sourcing components.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected auv with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 9-module auv architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 9 modules, 27 sub-modules, 108 component words
Required interface links:
- OK energy_storage_source -> power_distribution via dc_power_bus
- OK power_distribution -> actuation_kinematics via thruster_power_bus
- OK control_compute_communication -> actuation_kinematics via thrust_command_bus
- OK sensing_instrumentation -> control_compute_communication via navigation_sensor_bus
- OK sensing_instrumentation -> control_compute_communication via payload_data_bus
- OK environmental_interface -> structure_containment via pressure_boundary
- OK safety_protection -> control_compute_communication via alarm_bus
- OK safety_protection -> structure_containment via pressure_boundary

- Pressure Structure Containment: Maintains a dry electronics and battery envelope for a 300 m underwater operating target.
  Interfaces: pressure_boundary, mechanical_mounts, service_access, hydrodynamic_shell
  - Pressure hull shell: Forms the dry pressure boundary and endcap sealing envelope.
    Components: Pressure hull, endcap clamp ring, double O-ring gland set, hull proof-test port
    Interfaces: pressure_boundary, mechanical_mounts, service_access
  - Internal mounting frame: Locates dry electronics, batteries and payload interface hardware.
    Components: electronics tray rail, battery cradle frame, payload mounting rail, trim weight pocket
    Interfaces: mechanical_mounts, service_access
  - Hydrodynamic fairing: Reduces drag and protects external appendages during survey runs.
    Components: nose fairing, tail cone fairing, stabilising fin set, access hatch latch set
    Interfaces: hydrodynamic_shell, mechanical_mounts, service_access
- Subsea Energy Storage: Stores enough mission energy for roughly 8 hours before detailed drag, hotel-load and reserve calculations.
  Interfaces: dc_power_bus, battery_monitor_bus, service_access, thermal_path
  - Subsea battery pack: Supplies mission energy with reserve margin and pressure-rated containment.
    Components: Battery pack, battery management board, pack isolation fuse, pressure-rated battery enclosure
    Interfaces: dc_power_bus, battery_monitor_bus, thermal_path
  - Charging interface: Enables deck charging and state verification without compromising the pressure boundary.
    Components: charge interlock plug, shore charger adapter, state-of-charge display puck, battery vent inspection plug
    Interfaces: service_access, dc_power_bus, battery_monitor_bus
  - Energy monitoring: Tracks reserve energy and supports abort decisions.
    Components: coulomb counter module, pack temperature sensor strip, energy reserve indicator, battery telemetry isolator
    Interfaces: battery_monitor_bus, alarm_bus
- Subsea Power Distribution: Routes protected power to thrusters, mission computer, navigation sensors and payloads.
  Interfaces: dc_power_bus, thruster_power_bus, payload_power_bus, low_voltage_rail, service_access
  - DC distribution: Switches and protects the main battery bus before branch loads.
    Components: fused DC distribution board, Wet-mate connector set, main power enable relay, bus voltage monitor
    Interfaces: dc_power_bus, thruster_power_bus, payload_power_bus
  - Low-voltage rails: Creates stable avionics and payload supply rails.
    Components: 24 V DC converter, 12 V payload converter, 5 V avionics converter, EMI power filter
    Interfaces: low_voltage_rail, payload_power_bus, service_access
  - Isolation and grounding: Controls leakage, bonding and service isolation paths in a flooded environment.
    Components: ground fault monitor, chassis bonding strap, service isolation key, fault annunciator module
    Interfaces: dc_power_bus, alarm_bus, service_access
- Thruster Actuation Kinematics: Generates controlled surge, heave, yaw and station-keeping authority underwater.
  Interfaces: thruster_power_bus, thrust_command_bus, mechanical_mounts, hydrodynamic_shell
  - Thruster array: Provides vectored propulsion channels for survey and manoeuvre control.
    Components: Thruster set, thruster nozzle guard, thruster mounting bracket, motor phase harness
    Interfaces: thruster_power_bus, thrust_command_bus, mechanical_mounts
  - Drive electronics: Converts command inputs into motor phase drive while reporting current and faults.
    Components: thruster motor controller stack, current sensor channel set, controller heat spreader, thrust calibration table
    Interfaces: thruster_power_bus, thrust_command_bus, alarm_bus
  - Trim and stability surfaces: Improves passive stability and reduces control effort.
    Components: adjustable trim fin, ballast trim block, roll trim screw set, tow-tank trim mark
    Interfaces: hydrodynamic_shell, mechanical_mounts, service_access
- Autonomy Compute Communication: Runs mission autonomy, navigation fusion, acoustic messaging, payload logging and fail-safe states.
  Interfaces: navigation_sensor_bus, payload_data_bus, thrust_command_bus, acoustic_link, alarm_bus, service_access
  - Mission computer stack: Executes mission state machine, vehicle control and payload logging.
    Components: Mission computer, real-time control board, watchdog supervisor module, mission data recorder
    Interfaces: navigation_sensor_bus, payload_data_bus, thrust_command_bus, alarm_bus
  - Acoustic communications: Provides low-bandwidth underwater command, health and recovery messaging.
    Components: Acoustic modem, acoustic transducer mount, acoustic isolation pad, surface command protocol adapter
    Interfaces: acoustic_link, service_access, alarm_bus
  - Software health management: Defines safe modes, reserve-energy logic and post-mission evidence.
    Components: failsafe state machine, time sync module, configuration backup storage, debug service port
    Interfaces: alarm_bus, battery_monitor_bus, service_access
- Navigation And Payload Sensing: Measures vehicle state, seabed-relative movement, depth and inspection payload data.
  Interfaces: navigation_sensor_bus, payload_data_bus, pressure_boundary, acoustic_link
  - Navigation sensor suite: Combines bottom-track velocity, inertial attitude and surface fixes.
    Components: DVL, Inertial navigation unit, magnetic compass module, GNSS surface receiver
    Interfaces: navigation_sensor_bus, service_access
  - Depth and environment sensors: Measures depth, water conditions and pressure-boundary state.
    Components: Depth and pressure sensor, water temperature probe, conductivity sensor, internal humidity sensor
    Interfaces: navigation_sensor_bus, pressure_boundary, alarm_bus
  - Payload sensor bay: Carries inspection payloads and synchronises payload data with navigation state.
    Components: Forward sonar payload, camera viewport window, payload sync trigger, payload data link module
    Interfaces: payload_data_bus, navigation_sensor_bus, pressure_boundary
- Pressure Thermal Buoyancy Interface: Manages pressure boundary support, heat rejection, buoyancy and trim interactions with seawater.
  Interfaces: pressure_boundary, thermal_path, buoyancy_trim, service_access, hydrodynamic_shell
  - Pressure boundary management: Handles penetrators, pressure compensation and pressure-test interfaces.
    Components: cable penetrator seal, pressure compensation bladder, oil-fill service port, pressure equalisation valve
    Interfaces: pressure_boundary, service_access
  - Thermal path: Conducts electronics and battery heat into the hull and surrounding seawater.
    Components: electronics thermal bridge, hull heat spreader plate, battery thermal pad, thruster heat sink collar
    Interfaces: thermal_path, pressure_boundary, mechanical_mounts
  - Buoyancy and trim: Sets neutral buoyancy, trim and recoverable mass distribution.
    Components: syntactic foam block set, ballast rail, buoyancy calibration tag, field trim worksheet
    Interfaces: buoyancy_trim, hydrodynamic_shell, service_access
- Leak Abort And Recovery Safety: Detects water ingress, over-depth risk and lost-vehicle states, then drives abort and recovery behaviour.
  Interfaces: leak_alarm_bus, alarm_bus, pressure_boundary, dc_power_bus, service_access
  - Leak detection: Detects internal water ingress before catastrophic electronics damage.
    Components: Leak detection sensor, bilge moisture strip, leak alarm relay, absorbent witness pad
    Interfaces: leak_alarm_bus, alarm_bus, pressure_boundary
  - Abort and recovery: Supports vehicle location and recovery after fault or mission completion.
    Components: Recovery beacon, drop-weight release, emergency strobe, surface flag float
    Interfaces: alarm_bus, service_access, acoustic_link
  - Pressure fail-safe: Prevents over-depth operation and isolates hazardous energy under fault.
    Components: over-depth abort switch, watchdog kill relay, battery isolation contactor, pressure relief service plug
    Interfaces: pressure_boundary, dc_power_bus, alarm_bus
- Deck Recovery And Service: Supports launch, recovery, charging, leak testing and field service without disturbing verified settings unnecessarily.
  Interfaces: service_access, mechanical_mounts, pressure_boundary, dc_power_bus
  - Deck recovery: Provides safe handling points for launch and retrieval operations.
    Components: lifting bridle, deck recovery handle, launch cradle interface, tow point fitting
    Interfaces: mechanical_mounts, service_access
  - Service access: Enables repeatable checks for seals, charging and diagnostics.
    Components: O-ring grease kit, vacuum leak test port, diagnostic connector, service checklist card
    Interfaces: service_access, pressure_boundary, dc_power_bus
  - Field transport: Protects the vehicle and records environmental exposure between missions.
    Components: transport cradle, protective nose cover, desiccant cartridge, maintenance log tag
    Interfaces: service_access, hydrodynamic_shell

## BoM
Total: £0
- 1 candidate × Pressure hull: £unpriced
- 1 candidate × endcap clamp ring: £unpriced
- 1 candidate × double O-ring gland set: £unpriced
- 1 candidate × hull proof-test port: £unpriced
- 1 candidate × electronics tray rail: £unpriced
- 1 candidate × battery cradle frame: £unpriced
- 1 candidate × payload mounting rail: £unpriced
- 1 candidate × trim weight pocket: £unpriced
- 1 candidate × nose fairing: £unpriced
- 1 candidate × tail cone fairing: £unpriced
- 1 candidate × stabilising fin set: £unpriced
- 1 candidate × access hatch latch set: £unpriced
- 1 candidate × Battery pack: £unpriced
- 1 candidate × battery management board: £unpriced
- 1 candidate × pack isolation fuse: £unpriced
- 1 candidate × pressure-rated battery enclosure: £unpriced
- 1 candidate × charge interlock plug: £unpriced
- 1 candidate × shore charger adapter: £unpriced
- 1 candidate × state-of-charge display puck: £unpriced
- 1 candidate × battery vent inspection plug: £unpriced
- 1 candidate × coulomb counter module: £unpriced
- 1 candidate × pack temperature sensor strip: £unpriced
- 1 candidate × energy reserve indicator: £unpriced
- 1 candidate × battery telemetry isolator: £unpriced
- 1 candidate × fused DC distribution board: £unpriced
- 1 candidate × Wet-mate connector set: £unpriced
- 1 candidate × main power enable relay: £unpriced
- 1 candidate × bus voltage monitor: £unpriced
- 1 candidate × 24 V DC converter: £unpriced
- 1 candidate × 12 V payload converter: £unpriced
- 1 candidate × 5 V avionics converter: £unpriced
- 1 candidate × EMI power filter: £unpriced
- 1 candidate × ground fault monitor: £unpriced
- 1 candidate × chassis bonding strap: £unpriced
- 1 candidate × service isolation key: £unpriced
- 1 candidate × fault annunciator module: £unpriced
- 6 each × Thruster set: £unpriced
- 1 candidate × thruster nozzle guard: £unpriced
- 1 candidate × thruster mounting bracket: £unpriced
- 1 candidate × motor phase harness: £unpriced
- 1 candidate × thruster motor controller stack: £unpriced
- 1 candidate × current sensor channel set: £unpriced
- 1 candidate × controller heat spreader: £unpriced
- 1 candidate × thrust calibration table: £unpriced
- 1 candidate × adjustable trim fin: £unpriced
- 1 candidate × ballast trim block: £unpriced
- 1 candidate × roll trim screw set: £unpriced
- 1 candidate × tow-tank trim mark: £unpriced
- 1 candidate × Mission computer: £unpriced
- 1 candidate × real-time control board: £unpriced
- 1 candidate × watchdog supervisor module: £unpriced
- 1 candidate × mission data recorder: £unpriced
- 1 candidate × Acoustic modem: £unpriced
- 1 candidate × acoustic transducer mount: £unpriced
- 1 candidate × acoustic isolation pad: £unpriced
- 1 candidate × surface command protocol adapter: £unpriced
- 1 candidate × failsafe state machine: £unpriced
- 1 candidate × time sync module: £unpriced
- 1 candidate × configuration backup storage: £unpriced
- 1 candidate × debug service port: £unpriced
- 1 candidate × DVL: £unpriced
- 1 candidate × Inertial navigation unit: £unpriced
- 1 candidate × magnetic compass module: £unpriced
- 1 candidate × GNSS surface receiver: £unpriced
- 1 candidate × Depth and pressure sensor: £unpriced
- 1 candidate × water temperature probe: £unpriced
- 1 candidate × conductivity sensor: £unpriced
- 1 candidate × internal humidity sensor: £unpriced
- 1 candidate × Forward sonar payload: £unpriced
- 1 candidate × camera viewport window: £unpriced
- 1 candidate × payload sync trigger: £unpriced
- 1 candidate × payload data link module: £unpriced
- 1 candidate × cable penetrator seal: £unpriced
- 1 candidate × pressure compensation bladder: £unpriced
- 1 candidate × oil-fill service port: £unpriced
- 1 candidate × pressure equalisation valve: £unpriced
- 1 candidate × electronics thermal bridge: £unpriced
- 1 candidate × hull heat spreader plate: £unpriced
- 1 candidate × battery thermal pad: £unpriced
- 1 candidate × thruster heat sink collar: £unpriced
- 1 candidate × syntactic foam block set: £unpriced
- 1 candidate × ballast rail: £unpriced
- 1 candidate × buoyancy calibration tag: £unpriced
- 1 candidate × field trim worksheet: £unpriced
- 1 candidate × Leak detection sensor: £unpriced
- 1 candidate × bilge moisture strip: £unpriced
- 1 candidate × leak alarm relay: £unpriced
- 1 candidate × absorbent witness pad: £unpriced
- 1 candidate × Recovery beacon: £unpriced
- 1 candidate × drop-weight release: £unpriced
- 1 candidate × emergency strobe: £unpriced
- 1 candidate × surface flag float: £unpriced
- 1 candidate × over-depth abort switch: £unpriced
- 1 candidate × watchdog kill relay: £unpriced
- 1 candidate × battery isolation contactor: £unpriced
- 1 candidate × pressure relief service plug: £unpriced
- 1 candidate × lifting bridle: £unpriced
- 1 candidate × deck recovery handle: £unpriced
- 1 candidate × launch cradle interface: £unpriced
- 1 candidate × tow point fitting: £unpriced
- 1 candidate × O-ring grease kit: £unpriced
- 1 candidate × vacuum leak test port: £unpriced
- 1 candidate × diagnostic connector: £unpriced
- 1 candidate × service checklist card: £unpriced
- 1 candidate × transport cradle: £unpriced
- 1 candidate × protective nose cover: £unpriced
- 1 candidate × desiccant cartridge: £unpriced
- 1 candidate × maintenance log tag: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
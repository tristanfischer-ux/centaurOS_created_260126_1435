# Untitled hardware project

Class: drone
Verdict: conditional

## Requirement Traceability
- COVERED Duration: 40 minutes -> Flight Energy Storage, Propulsion And Flight Actuation, Flight Control Compute And Communications; metric:headline_output, sanity:drone_endurance_target, sanity:drone_propulsion_quads, sanity:drone_control_power_chain

## Headline Metrics
- Flight endurance: 40 minutes (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- WARN Endurance Target: 40 minutes (<=30 min typical, 30-45 min aggressive, >45 min high-risk without mass/power budget)
  40 minutes is an aggressive cinematography-drone target and needs a mass, propeller and battery energy budget before design freeze.
- PASS Quad Propulsion Allocation: 4 motors / 4 ESCs (four motors and four ESCs allocated for quadcopter layout)
  The architecture allocates one motor-drive channel per rotor before BoM sourcing.
- PASS Control/Power/Actuation Chain: present (power bus, motor drive, sensor bus and radio link all present)
  Flight battery, flight controller, radio/navigation link and propulsion are connected by explicit interfaces.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected drone with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 9-module drone architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 9 modules, 26 sub-modules, 110 component words
Required interface links:
- OK energy_storage_source -> actuation_kinematics via power_bus
- OK control_compute_communication -> actuation_kinematics via motor_drive
- OK control_compute_communication -> sensing_instrumentation via sensor_bus

- Airframe Structure And Payload Mounting: Carries propulsion, battery and camera payload while targeting roughly 40 minutes of flight endurance.
  Interfaces: motor_mounts, payload_mount, battery_mount, service_access
  - Carbon airframe: Provides rigid arms, centre plates and landing structure.
    Components: Carbon airframe, carbon fibre arm tube, centre plate pair, arm folding hinge, landing gear strut
    Interfaces: motor_mounts, payload_mount, battery_mount
  - Payload mounting: Supports vibration-isolated camera payload attachment.
    Components: camera gimbal mount plate, rubber vibration damper, payload quick-release latch, payload CG adjustment rail
    Interfaces: payload_mount, video_link
  - Battery mounting: Secures removable packs against manoeuvre loads.
    Components: battery tray, battery retention strap, anti-slip battery pad, pack latch sensor
    Interfaces: battery_mount, power_bus
- Flight Energy Storage: Stores mission energy and supplies high-current propulsion and avionics loads.
  Interfaces: power_bus, charger_interface, battery_mount, sensor_bus
  - Flight battery pack: Provides swappable energy storage for flight operations.
    Components: Flight battery pack, high-discharge cell group, battery management PCB, XT90 anti-spark connector, pack temperature sensor
    Interfaces: power_bus, charger_interface, battery_mount
  - Power monitoring: Measures pack current and voltage for endurance management.
    Components: power module shunt, voltage divider board, low-voltage alarm output, battery telemetry connector
    Interfaces: power_bus, sensor_bus
  - Charging interface: Supports safe pack charging and fleet rotation.
    Components: balance charge harness, charging cradle, pack ID label, transport storage case insert
    Interfaces: charger_interface, service_access
- Propulsion And Flight Actuation: Generates lift, yaw and manoeuvre authority through motor, ESC and propeller groups.
  Interfaces: power_bus, motor_drive, motor_mounts, sensor_bus
  - Motor sets: Convert electrical power into shaft torque.
    Components: Brushless motors, motor mounting screw set, motor phase lead set, motor bearing shield
    Interfaces: power_bus, motor_drive, motor_mounts
  - ESC stack: Drives motors from flight-controller commands.
    Components: ESC, ESC cooling plate, PWM signal harness, current telemetry line, ESC conformal coating
    Interfaces: power_bus, motor_drive, sensor_bus
  - Propeller sets: Generate thrust and set acoustic/efficiency envelope.
    Components: Propeller set, propeller hub adapter, propeller lock nut, spare propeller pouch
    Interfaces: motor_mounts
- Flight Control Compute And Communications: Runs stabilisation, navigation, command link and failsafe behaviours.
  Interfaces: sensor_bus, motor_drive, radio_link, video_link, power_bus
  - Flight controller stack: Stabilises aircraft and executes flight modes.
    Components: Flight controller, IMU vibration isolation mount, barometer foam cover, SD card flight logger, failsafe firmware profile
    Interfaces: sensor_bus, motor_drive, power_bus
  - Radio and navigation link: Provides pilot command, telemetry and positioning.
    Components: Radio and GNSS link, GNSS antenna mast, RC receiver, telemetry radio module, antenna diversity mount
    Interfaces: radio_link, sensor_bus
  - Video downlink: Streams camera status and framing view to operator.
    Components: low-latency video transmitter, video antenna pair, HDMI micro cable, video power filter
    Interfaces: video_link, power_bus
- Navigation And Cinematography Sensing: Captures video, inertial state and environmental data needed for controlled flight.
  Interfaces: sensor_bus, video_link, payload_mount
  - Camera payload: Captures stabilised 4K imagery.
    Components: 4K camera payload, three-axis gimbal, camera control cable, lens protection hood, microSD media card
    Interfaces: video_link, payload_mount
  - Navigation sensors: Measures orientation, height and heading.
    Components: magnetometer module, rangefinder altimeter, optical flow sensor, airspeed estimate port
    Interfaces: sensor_bus
  - Health sensing: Monitors vibration, temperature and payload state.
    Components: vibration monitor pad, payload presence switch, avionics temperature probe, landing contact switch
    Interfaces: sensor_bus, payload_mount
- Aircraft Power Distribution: Routes battery power to propulsion, avionics and payload through protected low-mass paths.
  Interfaces: power_bus, protective_earth, motor_drive, video_link
  - Main power bus: Distributes pack current to ESCs and avionics converters.
    Components: power distribution PCB, copper bus plane, main fuse link, anti-spark loop key
    Interfaces: power_bus, motor_drive
  - Voltage regulation: Creates stable rails for flight controller, radio and payload.
    Components: 5 V BEC regulator, 12 V payload regulator, LC noise filter, rail status LED
    Interfaces: power_bus, video_link
  - Wiring harness: Connects avionics with strain relief and field-service routing.
    Components: silicone power lead set, JST signal harness, braided cable sleeve, strain relief clip set
    Interfaces: power_bus, sensor_bus, video_link
- Flight Safety And Containment: Reduces injury, runaway, battery and lost-link risks before and during flight.
  Interfaces: radio_link, power_bus, service_access, alarm_bus
  - Arming interlocks: Prevents unintended motor start during handling.
    Components: arming switch, status buzzer, motor inhibit logic, preflight checklist tag
    Interfaces: power_bus, alarm_bus
  - Lost-link response: Defines recovery path when command link degrades.
    Components: return-to-home failsafe, geofence configuration, low battery landing logic, flight termination setting
    Interfaces: radio_link, sensor_bus
  - Battery safety: Manages pack handling, thermal and transport risks.
    Components: fire-resistant battery pouch, pack swelling gauge, charge log sheet, thermal warning label
    Interfaces: power_bus, service_access
- Field Maintenance And Serviceability: Supports rapid propeller, arm, battery and payload service between flights.
  Interfaces: service_access, motor_mounts, payload_mount
  - Field repair access: Makes high-wear flight parts replaceable.
    Components: spare arm clamp, motor alignment gauge, propeller torque tool, field fastener kit
    Interfaces: service_access, motor_mounts
  - Inspection points: Provides visible checks before launch.
    Components: crack inspection marker, fastener witness paint, battery cycle counter label, payload latch witness mark
    Interfaces: service_access
  - Transport and storage: Protects aircraft between missions.
    Components: foam transport case, propeller guard sleeve, gimbal transport lock, desiccant storage pouch
    Interfaces: service_access, payload_mount
- Ground Operator Interface: Presents mission status, camera framing and preflight instructions to the operator.
  Interfaces: radio_link, video_link, service_access
  - Ground controller: Gives pilot manual control and flight status.
    Components: handheld transmitter, ground-station tablet, sun hood, controller neck strap
    Interfaces: radio_link, video_link
  - Mission labelling: Communicates safe setup, IDs and payload status.
    Components: aircraft ID label, propeller rotation label, payload mass placard, preflight checklist card
    Interfaces: service_access

## BoM
Total: £0
- 1 candidate × Carbon airframe: £unpriced
- 1 candidate × carbon fibre arm tube: £unpriced
- 1 candidate × centre plate pair: £unpriced
- 1 candidate × arm folding hinge: £unpriced
- 1 candidate × landing gear strut: £unpriced
- 1 candidate × camera gimbal mount plate: £unpriced
- 1 candidate × rubber vibration damper: £unpriced
- 1 candidate × payload quick-release latch: £unpriced
- 1 candidate × payload CG adjustment rail: £unpriced
- 1 candidate × battery tray: £unpriced
- 1 candidate × battery retention strap: £unpriced
- 1 candidate × anti-slip battery pad: £unpriced
- 1 candidate × pack latch sensor: £unpriced
- 1 candidate × Flight battery pack: £unpriced
- 1 candidate × high-discharge cell group: £unpriced
- 1 candidate × battery management PCB: £unpriced
- 1 candidate × XT90 anti-spark connector: £unpriced
- 1 candidate × pack temperature sensor: £unpriced
- 1 candidate × power module shunt: £unpriced
- 1 candidate × voltage divider board: £unpriced
- 1 candidate × low-voltage alarm output: £unpriced
- 1 candidate × battery telemetry connector: £unpriced
- 1 candidate × balance charge harness: £unpriced
- 1 candidate × charging cradle: £unpriced
- 1 candidate × pack ID label: £unpriced
- 1 candidate × transport storage case insert: £unpriced
- 4 each × Brushless motors: £unpriced
- 1 candidate × motor mounting screw set: £unpriced
- 1 candidate × motor phase lead set: £unpriced
- 1 candidate × motor bearing shield: £unpriced
- 4 each × ESC: £unpriced
- 1 candidate × ESC cooling plate: £unpriced
- 1 candidate × PWM signal harness: £unpriced
- 1 candidate × current telemetry line: £unpriced
- 1 candidate × ESC conformal coating: £unpriced
- 1 candidate × Propeller set: £unpriced
- 1 candidate × propeller hub adapter: £unpriced
- 1 candidate × propeller lock nut: £unpriced
- 1 candidate × spare propeller pouch: £unpriced
- 1 candidate × Flight controller: £unpriced
- 1 candidate × IMU vibration isolation mount: £unpriced
- 1 candidate × barometer foam cover: £unpriced
- 1 candidate × SD card flight logger: £unpriced
- 1 candidate × failsafe firmware profile: £unpriced
- 1 candidate × Radio and GNSS link: £unpriced
- 1 candidate × GNSS antenna mast: £unpriced
- 1 candidate × RC receiver: £unpriced
- 1 candidate × telemetry radio module: £unpriced
- 1 candidate × antenna diversity mount: £unpriced
- 1 candidate × low-latency video transmitter: £unpriced
- 1 candidate × video antenna pair: £unpriced
- 1 candidate × HDMI micro cable: £unpriced
- 1 candidate × video power filter: £unpriced
- 1 candidate × 4K camera payload: £unpriced
- 1 candidate × three-axis gimbal: £unpriced
- 1 candidate × camera control cable: £unpriced
- 1 candidate × lens protection hood: £unpriced
- 1 candidate × microSD media card: £unpriced
- 1 candidate × magnetometer module: £unpriced
- 1 candidate × rangefinder altimeter: £unpriced
- 1 candidate × optical flow sensor: £unpriced
- 1 candidate × airspeed estimate port: £unpriced
- 1 candidate × vibration monitor pad: £unpriced
- 1 candidate × payload presence switch: £unpriced
- 1 candidate × avionics temperature probe: £unpriced
- 1 candidate × landing contact switch: £unpriced
- 1 candidate × power distribution PCB: £unpriced
- 1 candidate × copper bus plane: £unpriced
- 1 candidate × main fuse link: £unpriced
- 1 candidate × anti-spark loop key: £unpriced
- 1 candidate × 5 V BEC regulator: £unpriced
- 1 candidate × 12 V payload regulator: £unpriced
- 1 candidate × LC noise filter: £unpriced
- 1 candidate × rail status LED: £unpriced
- 1 candidate × silicone power lead set: £unpriced
- 1 candidate × JST signal harness: £unpriced
- 1 candidate × braided cable sleeve: £unpriced
- 1 candidate × strain relief clip set: £unpriced
- 1 candidate × arming switch: £unpriced
- 1 candidate × status buzzer: £unpriced
- 1 candidate × motor inhibit logic: £unpriced
- 1 candidate × preflight checklist tag: £unpriced
- 1 candidate × return-to-home failsafe: £unpriced
- 1 candidate × geofence configuration: £unpriced
- 1 candidate × low battery landing logic: £unpriced
- 1 candidate × flight termination setting: £unpriced
- 1 candidate × fire-resistant battery pouch: £unpriced
- 1 candidate × pack swelling gauge: £unpriced
- 1 candidate × charge log sheet: £unpriced
- 1 candidate × thermal warning label: £unpriced
- 1 candidate × spare arm clamp: £unpriced
- 1 candidate × motor alignment gauge: £unpriced
- 1 candidate × propeller torque tool: £unpriced
- 1 candidate × field fastener kit: £unpriced
- 1 candidate × crack inspection marker: £unpriced
- 1 candidate × fastener witness paint: £unpriced
- 1 candidate × battery cycle counter label: £unpriced
- 1 candidate × payload latch witness mark: £unpriced
- 1 candidate × foam transport case: £unpriced
- 1 candidate × propeller guard sleeve: £unpriced
- 1 candidate × gimbal transport lock: £unpriced
- 1 candidate × desiccant storage pouch: £unpriced
- 1 candidate × handheld transmitter: £unpriced
- 1 candidate × ground-station tablet: £unpriced
- 1 candidate × sun hood: £unpriced
- 1 candidate × controller neck strap: £unpriced
- 1 candidate × aircraft ID label: £unpriced
- 1 candidate × propeller rotation label: £unpriced
- 1 candidate × payload mass placard: £unpriced
- 1 candidate × preflight checklist card: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
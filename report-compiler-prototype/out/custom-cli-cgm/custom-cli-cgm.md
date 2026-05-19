# Untitled hardware project

Class: cgm
Verdict: feasible

## Requirement Traceability
- COVERED Wear duration: 14 days -> Skin Patient Interface, Wearable Energy Source, Wear Environment Compensation, Patient Safety Protection; metric:headline_output, sanity:cgm_wear_duration, sanity:cgm_patch_power_comms_safety
- COVERED Reading interval: 5 minutes -> Glucose Sensing Instrumentation, Control Compute Communication, Low-Power Distribution; sanity:cgm_reading_interval, sanity:cgm_biofluid_signal_closure, sanity:cgm_patch_power_comms_safety
- COVERED MARD target: 9 % -> Glucose Sensing Instrumentation, Wear Environment Compensation, Control Compute Communication; sanity:cgm_accuracy_target, sanity:cgm_biofluid_signal_closure

## Headline Metrics
- Sensor wear duration: 14 days (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS Wear Duration: 14 days (7 to 15 days for common disposable CGM patch wear; longer wear needs adhesive, biocompatibility and sensor-drift evidence)
  14 days is plausible only after adhesive retention, irritation, sterile boundary and sensor-drift evidence are reviewed.
- PASS Reading Interval: 5 minutes (1 to 15 minute reading intervals for wearable trend monitoring before battery and radio duty-cycle evidence)
  5 minute readings are credible after sensor settling, BLE duty cycle, buffering and battery budget are validated.
- PASS MARD Accuracy Target: 9 % (<=10% MARD target before clinical validation; 10-15% needs strong use-case constraints, >15% is weak for dosing-adjacent use)
  9% MARD is a target only; it still needs clinical protocol, comparator method, calibration and population evidence.
- PASS Biofluid/Signal Closure: present (interstitial fluid path, electrode signal, sensor signal bus and calibration data bus present)
  Patient-contact fluid access, electrochemical readout and calibration state are connected before BoM sourcing.
- PASS Patch/Power/Comms/Safety Closure: present (adhesive skin boundary, sterile boundary, BLE link, low-power rail, alarm bus and disposable applicator present)
  Wear attachment, sterility, telemetry, energy and patient safety paths are named before sourcing or clinical claims.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected cgm with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 10-module cgm architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 10 modules, 30 sub-modules, 120 component words
Required interface links:
- OK skin_patient_interface -> sensing_instrumentation via interstitial_fluid_path
- OK actuation_kinematics -> skin_patient_interface via insertion_path
- OK sensing_instrumentation -> control_compute_communication via sensor_signal_bus
- OK sensing_instrumentation -> control_compute_communication via calibration_data_bus
- OK energy_storage_source -> power_distribution via cell_power_bus
- OK power_distribution -> sensing_instrumentation via analog_power_rail
- OK power_distribution -> control_compute_communication via low_power_rail
- OK environmental_interface -> control_compute_communication via temperature_compensation_bus
- OK control_compute_communication -> safety_protection via alarm_state_bus
- OK maintenance_serviceability -> skin_patient_interface via sterile_boundary

- Skin Patient Interface: Maintains adhesive, sterile and comfort boundaries for roughly 14 days of continuous wear.
  Interfaces: adhesive_skin_boundary, interstitial_fluid_path, sterile_boundary, insertion_path, service_access
  - Adhesive patch stack: Keeps the patch attached while preserving skin comfort and fluid access.
    Components: Adhesive skin patch, hydrocolloid edge seal, breathable backing film, pull tab liner
    Interfaces: adhesive_skin_boundary, interstitial_fluid_path, sterile_boundary
  - Sensor skin contact: Positions the filament entry site and protects the skin boundary.
    Components: skin contact gasket, filament entry seal, antimicrobial contact pad, insertion site spacing ring
    Interfaces: interstitial_fluid_path, insertion_path, sterile_boundary
  - Wear comfort and retention: Controls patch flex, sweat movement and user removal.
    Components: flex relief bridge, sweat channel texture, patch stretch zone, removal aid tab
    Interfaces: adhesive_skin_boundary, service_access
- Glucose Sensing Instrumentation: Measures interstitial glucose and supports a target MARD near 9% before clinical validation.
  Interfaces: interstitial_fluid_path, electrode_signal_path, sensor_signal_bus, calibration_data_bus, analog_power_rail, temperature_compensation_bus
  - Glucose filament stack: Combines electrochemical layers into the patient-contact sensing path.
    Components: Glucose sensing filament, Enzyme reagent membrane, Reference electrode, diffusion limiting membrane
    Interfaces: interstitial_fluid_path, electrode_signal_path, analog_power_rail
  - Analog front end: Biases, reads and filters the electrochemical sensor signal.
    Components: potentiostat AFE, low-leakage input guard, electrode flex tail, sensor bias resistor network
    Interfaces: electrode_signal_path, sensor_signal_bus, analog_power_rail
  - Calibration and drift monitoring: Stores factory calibration and tracks signal quality.
    Components: calibration data EEPROM, drift estimator firmware table, factory calibration code, signal integrity test pad
    Interfaces: sensor_signal_bus, calibration_data_bus, temperature_compensation_bus
- Applicator Insertion Mechanism: Inserts the filament to a controlled depth and locks out the used sharps path.
  Interfaces: insertion_path, sterile_boundary, user_trigger, service_access
  - Disposable applicator: Presents the sensor and insertion action to the user.
    Components: Disposable applicator, spring insertion driver, trigger button, safety cap
    Interfaces: insertion_path, sterile_boundary, user_trigger
  - Insertion mechanism: Guides filament placement and retracts introducer hardware.
    Components: introducer needle, filament deployment shuttle, depth stop collar, retraction latch
    Interfaces: insertion_path, user_trigger
  - Sharps lockout: Prevents reuse and shields the needle after application.
    Components: needle shield, post-use lock tab, applicator status window, trigger interlock spring
    Interfaces: service_access, sterile_boundary
- Transmitter Housing Structure: Carries electronics, antenna, battery and seals inside a low-profile wearable transmitter.
  Interfaces: electronics_mount, ingress_boundary, adhesive_skin_boundary, service_access
  - Transmitter housing: Protects electronics while staying wearable under clothing.
    Components: Protective transmitter housing, ultrasonic weld seam, electronics carrier tray, ingress gasket
    Interfaces: electronics_mount, ingress_boundary, adhesive_skin_boundary
  - Patch mechanical frame: Links adhesive patch, sensor port and transmitter latch features.
    Components: flexible patch frame, sensor port boss, transmitter latch rail, strain relief web
    Interfaces: electronics_mount, adhesive_skin_boundary, insertion_path
  - Ingress boundary: Controls sweat, splash and cleaning exposure around the electronics.
    Components: hydrophobic vent membrane, IP ingress seal, splash shield lip, housing serial marking
    Interfaces: ingress_boundary, service_access
- Wearable Energy Source: Stores enough energy for 14 days of measurement and BLE telemetry.
  Interfaces: cell_power_bus, service_access, lot_traceability
  - Battery cell: Provides compact stored energy for the wear period.
    Components: Thin-film battery, battery weld tab, battery pouch insulator, state-of-charge witness pad
    Interfaces: cell_power_bus, lot_traceability
  - Power reserve: Preserves operation during radio bursts and end-of-wear reserve.
    Components: brownout hold-up capacitor, battery cut-off tab, shelf-life isolation film, activation pull strip
    Interfaces: cell_power_bus, service_access
  - Battery safety: Controls battery fault, traceability and shelf handling hazards.
    Components: battery vent clearance, reverse polarity fuse, pack temperature dot, battery lot barcode
    Interfaces: cell_power_bus, lot_traceability
- Low-Power Distribution: Duty-cycles sensor, MCU and radio loads while protecting the patient-contact electronics.
  Interfaces: cell_power_bus, low_power_rail, analog_power_rail, hardwired_trip, sensor_signal_bus
  - Low-power rails: Creates efficient rails for digital control and BLE telemetry.
    Components: nanoamp power switch, digital buck regulator, rail measurement divider, wake timer oscillator
    Interfaces: cell_power_bus, low_power_rail, hardwired_trip
  - Analog excitation: Feeds low-noise power to electrochemical sensing.
    Components: sensor excitation mux, analog power filter, electrode guard driver, AFE wake timer
    Interfaces: cell_power_bus, analog_power_rail, sensor_signal_bus
  - Power fault handling: Protects against rail collapse or unsafe current draw.
    Components: hardwired reset supervisor, overcurrent limiter, load gate transistor, fault latch
    Interfaces: hardwired_trip, low_power_rail, analog_power_rail
- Control Compute Communication: Processes glucose data at roughly 5 minute intervals and transmits encrypted readings.
  Interfaces: sensor_signal_bus, calibration_data_bus, ble_link, alarm_state_bus, low_power_rail, temperature_compensation_bus
  - MCU firmware: Runs sampling, compensation, filtering and device-state logic.
    Components: Low-power microcontroller, firmware image, secure boot key store, real-time clock
    Interfaces: sensor_signal_bus, calibration_data_bus, low_power_rail, temperature_compensation_bus
  - BLE telemetry: Pairs with a reader or phone and sends trend data.
    Components: BLE radio module, printed antenna, pairing button pad, encrypted session counter
    Interfaces: ble_link, low_power_rail, alarm_state_bus
  - Data buffering: Stores recent readings and diagnostic events between connections.
    Components: glucose trend buffer flash, event log memory, calibration data bus bridge, clock drift compensator
    Interfaces: sensor_signal_bus, calibration_data_bus, alarm_state_bus
- Wear Environment Compensation: Accounts for body temperature, sweat, ingress and movement that can bias sensor readings.
  Interfaces: temperature_compensation_bus, ingress_boundary, adhesive_skin_boundary, sensor_signal_bus
  - Temperature compensation: Measures skin-side temperature for chemistry compensation.
    Components: Temperature sensor, thermal model table, skin temperature flex tail, cold-start delay flag
    Interfaces: temperature_compensation_bus, sensor_signal_bus
  - Sweat and water boundary: Surfaces exposure conditions that can threaten patch reliability.
    Components: sweat barrier film, condensation drain groove, humidity indicator dot, ingress exposure witness
    Interfaces: ingress_boundary, adhesive_skin_boundary
  - Motion and pressure artefact control: Flags physical conditions that can create signal artefacts.
    Components: motion artefact filter table, patch pressure relief slot, compression warning marker, activity context accelerometer
    Interfaces: adhesive_skin_boundary, sensor_signal_bus
- Patient Safety Protection: Controls alarms, stale data lockout, patient-contact evidence and applicator warnings.
  Interfaces: alarm_state_bus, sterile_boundary, adhesive_skin_boundary, hardwired_trip, service_access
  - Patient alarm logic: Classifies clinically relevant sensor and telemetry states.
    Components: hypoglycaemia alarm state, hyperglycaemia alarm state, sensor fault classifier, stale data lockout
    Interfaces: alarm_state_bus, sensor_signal_bus
  - Biocompatibility controls: Connects material and adhesive choices to patient-contact review.
    Components: biocompatibility material record, adhesive irritation limit tag, latex-free label, skin-contact change log
    Interfaces: adhesive_skin_boundary, service_access
  - Sterile and sharps safety: Controls sterile path, warnings and disposal state.
    Components: sterile boundary indicator, sharps injury warning label, applicator disposal instruction, tamper evident seal
    Interfaces: sterile_boundary, hardwired_trip, service_access
- Packaging Traceability Serviceability: Preserves sterility, setup clarity, UDI traceability and release records until application.
  Interfaces: sterile_boundary, lot_traceability, service_access, ble_link
  - Sterile packaging: Protects sensor, adhesive and applicator until use.
    Components: Sterile barrier pouch, desiccant sachet, pouch seal indicator, expiry date label
    Interfaces: sterile_boundary, lot_traceability
  - Lot traceability: Links device, sensor chemistry and packaging to regulated release records.
    Components: UDI label set, IFU leaflet, lot traceability barcode, release inspection stamp
    Interfaces: lot_traceability, service_access
  - User setup: Supports pairing, warm-up and safe removal instructions.
    Components: phone pairing QR card, applicator instruction card, sensor warm-up timer label, adhesive removal wipe
    Interfaces: service_access, ble_link

## BoM
Total: £0
- 1 candidate × Adhesive skin patch: £unpriced
- 1 candidate × hydrocolloid edge seal: £unpriced
- 1 candidate × breathable backing film: £unpriced
- 1 candidate × pull tab liner: £unpriced
- 1 candidate × skin contact gasket: £unpriced
- 1 candidate × filament entry seal: £unpriced
- 1 candidate × antimicrobial contact pad: £unpriced
- 1 candidate × insertion site spacing ring: £unpriced
- 1 candidate × flex relief bridge: £unpriced
- 1 candidate × sweat channel texture: £unpriced
- 1 candidate × patch stretch zone: £unpriced
- 1 candidate × removal aid tab: £unpriced
- 1 candidate × Glucose sensing filament: £unpriced
- 1 candidate × Enzyme reagent membrane: £unpriced
- 1 candidate × Reference electrode: £unpriced
- 1 candidate × diffusion limiting membrane: £unpriced
- 1 candidate × potentiostat AFE: £unpriced
- 1 candidate × low-leakage input guard: £unpriced
- 1 candidate × electrode flex tail: £unpriced
- 1 candidate × sensor bias resistor network: £unpriced
- 1 candidate × calibration data EEPROM: £unpriced
- 1 candidate × drift estimator firmware table: £unpriced
- 1 candidate × factory calibration code: £unpriced
- 1 candidate × signal integrity test pad: £unpriced
- 1 candidate × Disposable applicator: £unpriced
- 1 candidate × spring insertion driver: £unpriced
- 1 candidate × trigger button: £unpriced
- 1 candidate × safety cap: £unpriced
- 1 candidate × introducer needle: £unpriced
- 1 candidate × filament deployment shuttle: £unpriced
- 1 candidate × depth stop collar: £unpriced
- 1 candidate × retraction latch: £unpriced
- 1 candidate × needle shield: £unpriced
- 1 candidate × post-use lock tab: £unpriced
- 1 candidate × applicator status window: £unpriced
- 1 candidate × trigger interlock spring: £unpriced
- 1 candidate × Protective transmitter housing: £unpriced
- 1 candidate × ultrasonic weld seam: £unpriced
- 1 candidate × electronics carrier tray: £unpriced
- 1 candidate × ingress gasket: £unpriced
- 1 candidate × flexible patch frame: £unpriced
- 1 candidate × sensor port boss: £unpriced
- 1 candidate × transmitter latch rail: £unpriced
- 1 candidate × strain relief web: £unpriced
- 1 candidate × hydrophobic vent membrane: £unpriced
- 1 candidate × IP ingress seal: £unpriced
- 1 candidate × splash shield lip: £unpriced
- 1 candidate × housing serial marking: £unpriced
- 1 candidate × Thin-film battery: £unpriced
- 1 candidate × battery weld tab: £unpriced
- 1 candidate × battery pouch insulator: £unpriced
- 1 candidate × state-of-charge witness pad: £unpriced
- 1 candidate × brownout hold-up capacitor: £unpriced
- 1 candidate × battery cut-off tab: £unpriced
- 1 candidate × shelf-life isolation film: £unpriced
- 1 candidate × activation pull strip: £unpriced
- 1 candidate × battery vent clearance: £unpriced
- 1 candidate × reverse polarity fuse: £unpriced
- 1 candidate × pack temperature dot: £unpriced
- 1 candidate × battery lot barcode: £unpriced
- 1 candidate × nanoamp power switch: £unpriced
- 1 candidate × digital buck regulator: £unpriced
- 1 candidate × rail measurement divider: £unpriced
- 1 candidate × wake timer oscillator: £unpriced
- 1 candidate × sensor excitation mux: £unpriced
- 1 candidate × analog power filter: £unpriced
- 1 candidate × electrode guard driver: £unpriced
- 1 candidate × AFE wake timer: £unpriced
- 1 candidate × hardwired reset supervisor: £unpriced
- 1 candidate × overcurrent limiter: £unpriced
- 1 candidate × load gate transistor: £unpriced
- 1 candidate × fault latch: £unpriced
- 1 candidate × Low-power microcontroller: £unpriced
- 1 candidate × firmware image: £unpriced
- 1 candidate × secure boot key store: £unpriced
- 1 candidate × real-time clock: £unpriced
- 1 candidate × BLE radio module: £unpriced
- 1 candidate × printed antenna: £unpriced
- 1 candidate × pairing button pad: £unpriced
- 1 candidate × encrypted session counter: £unpriced
- 1 candidate × glucose trend buffer flash: £unpriced
- 1 candidate × event log memory: £unpriced
- 1 candidate × calibration data bus bridge: £unpriced
- 1 candidate × clock drift compensator: £unpriced
- 1 candidate × Temperature sensor: £unpriced
- 1 candidate × thermal model table: £unpriced
- 1 candidate × skin temperature flex tail: £unpriced
- 1 candidate × cold-start delay flag: £unpriced
- 1 candidate × sweat barrier film: £unpriced
- 1 candidate × condensation drain groove: £unpriced
- 1 candidate × humidity indicator dot: £unpriced
- 1 candidate × ingress exposure witness: £unpriced
- 1 candidate × motion artefact filter table: £unpriced
- 1 candidate × patch pressure relief slot: £unpriced
- 1 candidate × compression warning marker: £unpriced
- 1 candidate × activity context accelerometer: £unpriced
- 1 candidate × hypoglycaemia alarm state: £unpriced
- 1 candidate × hyperglycaemia alarm state: £unpriced
- 1 candidate × sensor fault classifier: £unpriced
- 1 candidate × stale data lockout: £unpriced
- 1 candidate × biocompatibility material record: £unpriced
- 1 candidate × adhesive irritation limit tag: £unpriced
- 1 candidate × latex-free label: £unpriced
- 1 candidate × skin-contact change log: £unpriced
- 1 candidate × sterile boundary indicator: £unpriced
- 1 candidate × sharps injury warning label: £unpriced
- 1 candidate × applicator disposal instruction: £unpriced
- 1 candidate × tamper evident seal: £unpriced
- 1 candidate × Sterile barrier pouch: £unpriced
- 1 candidate × desiccant sachet: £unpriced
- 1 candidate × pouch seal indicator: £unpriced
- 1 candidate × expiry date label: £unpriced
- 1 candidate × UDI label set: £unpriced
- 1 candidate × IFU leaflet: £unpriced
- 1 candidate × lot traceability barcode: £unpriced
- 1 candidate × release inspection stamp: £unpriced
- 1 candidate × phone pairing QR card: £unpriced
- 1 candidate × applicator instruction card: £unpriced
- 1 candidate × sensor warm-up timer label: £unpriced
- 1 candidate × adhesive removal wipe: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
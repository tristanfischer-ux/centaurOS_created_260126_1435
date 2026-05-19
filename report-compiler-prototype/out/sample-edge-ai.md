# Untitled hardware project

Class: edge_ai
Verdict: feasible

## Requirement Traceability
- COVERED Inference throughput: 200 TOPS -> Compute Acceleration, Thermal Airflow Interface, Control Compute Communication; metric:headline_output, sanity:edgeai_compute_throughput, sanity:edgeai_data_compute_closure, sanity:edgeai_thermal_power_safety
- COVERED Rack height: 1 U -> Rack Structure Containment, Thermal Airflow Interface, Field Maintenance Serviceability; sanity:edgeai_power_density, sanity:edgeai_thermal_power_safety
- COVERED Power budget: 700 W -> Power Distribution, Thermal Airflow Interface, Security And Safety Protection; sanity:edgeai_power_density, sanity:edgeai_thermal_power_safety

## Headline Metrics
- Inference throughput: 200 TOPS (medium)
- Estimated CAPEX: 0 GBP (low)
- Estimated annual OPEX: 0 GBP/year (low)

## Engineering Sanity Checks
- PASS Inference Throughput: 200 TOPS (10 to 2000 TOPS for a rack edge inference appliance before model and latency derating)
  200 TOPS is plausible only after model benchmark, precision mode, batching and accelerator thermal derating evidence.
- PASS Rack Power Density: 700 W/U (100 to 1500 W/U for forced-air edge appliances; higher density needs detailed rack inlet and cooling proof)
  700 W in 1U implies 700 W/U before rack inlet temperature, airflow and PSU derating evidence.
- PASS Data/Compute Closure: present (PCIe fabric, inference network, storage bus and management network present)
  Accelerator, host control, network ingress and model storage are connected before BoM sourcing.
- PASS Thermal/Power Safety: present (thermal path, airflow path, fan control, AC input, protective earth, thermal alarm and hardwired trip present)
  Rack thermal management and hardware shutdown paths are named before any sourced BoM or cost claim.
- PASS Secure Management: present (secure boot chain, management network, service access and TPM present)
  The architecture includes a measurable secure-management path before fleet deployment claims.

## Compiler Stage Trace
- PASSED Brief Parsing: Extracted quantified requirements from the user brief before design generation.
- PASSED Product-Class Selection: Selected edge_ai with high confidence from brief keywords.
- PASSED Universal Module Architecture: Built a 10-module edge_ai architecture from the scratch universal architecture grammar.
- PASSED Submodule Expansion: Expanded each module into engineering submodules with local purpose, interfaces and component candidates.
- PASSED Interface Graph: Checked class-required module-to-module interfaces before allowing BoM review.
- PASSED Component Candidates: Converted allocated component words into a candidate BoM without supplier prices.
- PASSED Architecture Readiness Gate: Architecture validators found no blocker or major issue, so candidate BoM review can start.
- WARNING Sourcing And BoM Admission: No supplier, manufacturer, part number or cost claims have been admitted because no source-backed evidence was provided.

## Architecture
Readiness for BoM: ready
Coverage: 10 modules, 30 sub-modules, 120 component words
Required interface links:
- OK control_compute_communication -> compute_acceleration via pcie_fabric
- OK power_distribution -> compute_acceleration via gpu_power_bus
- OK network_io -> control_compute_communication via inference_network
- OK data_storage -> control_compute_communication via storage_bus
- OK environmental_interface -> compute_acceleration via thermal_path
- OK sensing_instrumentation -> control_compute_communication via sensor_bus
- OK safety_protection -> power_distribution via hardwired_trip
- OK structure_containment -> environmental_interface via airflow_path

- Rack Structure Containment: Provides a 1U rack envelope with controlled airflow, card retention and service access.
  Interfaces: rack_mount, airflow_path, service_access, protective_earth
  - Rack chassis: Carries appliance boards, power supplies and front-to-back airflow features.
    Components: 1U rack chassis, slide rail kit, internal divider panel, front bezel assembly
    Interfaces: rack_mount, airflow_path, service_access, protective_earth
  - Accelerator mounting: Restrains high-power cards and maintains airflow clearance.
    Components: accelerator retention bracket, PCIe riser support, card stiffener rail, GPU airflow baffle
    Interfaces: rack_mount, airflow_path, service_access
  - Service labelling: Marks rack identity, airflow direction and field-replaceable units.
    Components: asset label plate, airflow direction label, rack ear set, cable management arm
    Interfaces: service_access, rack_mount
- Compute Acceleration: Provides roughly 200 TOPS of accelerator throughput before model and thermal derating evidence.
  Interfaces: pcie_fabric, memory_bus, gpu_power_bus, thermal_path, sensor_bus
  - Accelerator module: Runs neural-network inference workloads at the edge.
    Components: AI accelerator module, accelerator carrier board, PCIe edge connector, accelerator retention latch
    Interfaces: pcie_fabric, gpu_power_bus, thermal_path, sensor_bus
  - CPU and memory complex: Hosts preprocessing, runtime orchestration and memory-resident model state.
    Components: CPU module, ECC memory, System motherboard, boot flash device
    Interfaces: memory_bus, pcie_fabric, low_voltage_rail, sensor_bus
  - Signal and power integrity: Stabilises accelerator clocks, high-speed lanes and transient power demand.
    Components: high-current VRM module, PCIe retimer set, clock distribution device, power integrity capacitor bank
    Interfaces: pcie_fabric, gpu_power_bus, thermal_path
- Network IO: Moves inference requests, responses and timing data through the appliance boundary.
  Interfaces: inference_network, management_network, pcie_fabric, service_access
  - High-speed network: Terminates production inference traffic.
    Components: High-speed NIC, optical transceiver cage, NIC heatsink, network link LED board
    Interfaces: inference_network, pcie_fabric, service_access
  - Timing and ingest: Synchronises inference streams and accepts trigger inputs where needed.
    Components: PTP timing module, GPIO trigger input, data ingest connector, network bypass relay
    Interfaces: inference_network, management_network, service_access
  - IO isolation and routing: Controls EMC, strain relief and service routing at high-speed ports.
    Components: EMI gasket strip, shielded IO bracket, cable strain relief comb, service loop tie set
    Interfaces: inference_network, service_access, protective_earth
- Data Storage: Stores models, runtime images, logs and local inference buffers.
  Interfaces: storage_bus, pcie_fabric, service_access, secure_boot_chain
  - NVMe storage: Provides local high-throughput storage for models and telemetry.
    Components: NVMe SSD, M.2 carrier tray, drive thermal pad, drive retention screw set
    Interfaces: storage_bus, pcie_fabric, service_access
  - Model cache and recovery: Keeps model versions, rollback images and erase functions controlled.
    Components: model cache partition, storage health monitor, secure erase controller, firmware recovery image
    Interfaces: storage_bus, secure_boot_chain, management_network
  - Log and evidence buffer: Captures operational evidence for debugging and compliance review.
    Components: event log partition, write endurance counter, crash dump region, log export port
    Interfaces: storage_bus, management_network, service_access
- Control Compute Communication: Runs host firmware, inference orchestration, management control and secure remote operation.
  Interfaces: pcie_fabric, storage_bus, management_network, inference_network, sensor_bus, thermal_alarm_bus, secure_boot_chain
  - Host control: Coordinates CPU, accelerator, storage and management functions.
    Components: BMC management controller, management Ethernet PHY, BIOS firmware image, platform configuration EEPROM
    Interfaces: pcie_fabric, storage_bus, management_network, sensor_bus
  - Runtime orchestration: Loads inference runtime, accelerator drivers and service policy.
    Components: inference runtime image, accelerator driver bundle, watchdog service, configuration manifest
    Interfaces: pcie_fabric, storage_bus, inference_network, secure_boot_chain
  - Remote management: Supports controlled diagnostics and firmware maintenance.
    Components: out-of-band management port, serial console header, debug access lockout, firmware signing key slot
    Interfaces: management_network, service_access, secure_boot_chain
- Power Distribution: Converts AC input into protected appliance rails for a 700 W power-budget target.
  Interfaces: ac_input_bus, low_voltage_rail, gpu_power_bus, protective_earth, hardwired_trip, sensor_bus
  - AC input conversion: Accepts rack AC input and provides redundant conversion.
    Components: Redundant power supply, AC inlet filter, input fuse holder, power-good signal harness
    Interfaces: ac_input_bus, protective_earth, sensor_bus
  - DC rail distribution: Distributes 12 V and accelerator rails to boards and fans.
    Components: 12 V busbar, accelerator power harness, hot-swap controller, fan power distribution loom
    Interfaces: low_voltage_rail, gpu_power_bus, service_access
  - Hold-up and protection: Survives short dips and trips unsafe rail faults.
    Components: hold-up capacitor module, brownout detector, current shunt module, eFuse channel set
    Interfaces: low_voltage_rail, hardwired_trip, sensor_bus
- Thermal Airflow Interface: Controls front-to-back airflow and heat transfer from accelerator, CPU, NIC and storage.
  Interfaces: airflow_path, thermal_path, fan_control_bus, sensor_bus, service_access
  - Forced-air cooling: Maintains rack airflow through compute and power zones.
    Components: Fan wall assembly, PWM fan controller, airflow straightener, replaceable dust filter
    Interfaces: airflow_path, fan_control_bus, sensor_bus
  - Heat transfer path: Couples accelerator and CPU losses into chassis airflow.
    Components: Heatsink cold plate, thermal interface material set, heatpipe assembly, rear exhaust duct
    Interfaces: thermal_path, airflow_path, service_access
  - Inlet and outlet management: Protects rack pressure and prevents hot-air recirculation.
    Components: front inlet grille, rear exhaust grille, air seal foam kit, rack pressure map label
    Interfaces: airflow_path, service_access
- Telemetry Instrumentation: Measures temperature, fan, power, intrusion and service state for health management.
  Interfaces: sensor_bus, management_network, thermal_alarm_bus, fan_control_bus
  - Thermal sensors: Measures inlet, accelerator, exhaust and board climate state.
    Components: inlet temperature sensor, accelerator hotspot sensor, exhaust temperature sensor, board humidity sensor
    Interfaces: sensor_bus, thermal_alarm_bus
  - Power and fan telemetry: Feeds PSU, rail and airflow state into BMC management.
    Components: PSU PMBus monitor, rail current monitor, fan tachometer hub, chassis intrusion switch
    Interfaces: sensor_bus, fan_control_bus, management_network
  - Front panel status: Exposes health and service state to rack technicians.
    Components: front status LED board, UID button, alarm buzzer, LCD status panel
    Interfaces: sensor_bus, management_network, service_access
- Security And Safety Protection: Protects boot integrity, operator safety and thermal shutdown paths.
  Interfaces: secure_boot_chain, thermal_alarm_bus, hardwired_trip, protective_earth, service_access
  - Secure boot: Anchors platform identity and firmware trust.
    Components: TPM security module, secure boot policy, chassis tamper switch, recovery jumper cover
    Interfaces: secure_boot_chain, management_network, service_access
  - Thermal shutdown: Trips unsafe thermal or fan-failure states.
    Components: thermal trip relay, overtemperature latch, fan failure interlock, hardwired shutdown line
    Interfaces: thermal_alarm_bus, hardwired_trip, fan_control_bus
  - Electrical safety: Maintains operator protection and safe service boundaries.
    Components: protective earth stud, insulation barrier sheet, finger-safe PSU cover, warning label set
    Interfaces: protective_earth, service_access, hardwired_trip
- Field Maintenance Serviceability: Supports rack installation, hot-swap FRUs, diagnostics and firmware recovery.
  Interfaces: service_access, rack_mount, management_network, airflow_path
  - Field-replaceable units: Makes high-wear parts replaceable without removing the whole appliance.
    Components: hot-swap fan carrier, drive service handle, PSU latch mechanism, accelerator extraction handle
    Interfaces: service_access, airflow_path
  - Rack installation: Maintains mechanical support and cabling in edge racks.
    Components: rack rail kit, rear support bracket, cable retention comb, airflow blanking panel
    Interfaces: rack_mount, service_access
  - Service workflow: Captures field diagnostics and controlled recovery evidence.
    Components: service checklist card, firmware version label, spare screw kit, diagnostics USB key
    Interfaces: service_access, management_network, secure_boot_chain

## BoM
Total: £0
- 1 candidate × 1U rack chassis: £unpriced
- 1 candidate × slide rail kit: £unpriced
- 1 candidate × internal divider panel: £unpriced
- 1 candidate × front bezel assembly: £unpriced
- 1 candidate × accelerator retention bracket: £unpriced
- 1 candidate × PCIe riser support: £unpriced
- 1 candidate × card stiffener rail: £unpriced
- 1 candidate × GPU airflow baffle: £unpriced
- 1 candidate × asset label plate: £unpriced
- 1 candidate × airflow direction label: £unpriced
- 1 candidate × rack ear set: £unpriced
- 1 candidate × cable management arm: £unpriced
- 1 candidate × AI accelerator module: £unpriced
- 1 candidate × accelerator carrier board: £unpriced
- 1 candidate × PCIe edge connector: £unpriced
- 1 candidate × accelerator retention latch: £unpriced
- 1 candidate × CPU module: £unpriced
- 1 candidate × ECC memory: £unpriced
- 1 candidate × System motherboard: £unpriced
- 1 candidate × boot flash device: £unpriced
- 1 candidate × high-current VRM module: £unpriced
- 1 candidate × PCIe retimer set: £unpriced
- 1 candidate × clock distribution device: £unpriced
- 1 candidate × power integrity capacitor bank: £unpriced
- 1 candidate × High-speed NIC: £unpriced
- 1 candidate × optical transceiver cage: £unpriced
- 1 candidate × NIC heatsink: £unpriced
- 1 candidate × network link LED board: £unpriced
- 1 candidate × PTP timing module: £unpriced
- 1 candidate × GPIO trigger input: £unpriced
- 1 candidate × data ingest connector: £unpriced
- 1 candidate × network bypass relay: £unpriced
- 1 candidate × EMI gasket strip: £unpriced
- 1 candidate × shielded IO bracket: £unpriced
- 1 candidate × cable strain relief comb: £unpriced
- 1 candidate × service loop tie set: £unpriced
- 1 candidate × NVMe SSD: £unpriced
- 1 candidate × M.2 carrier tray: £unpriced
- 1 candidate × drive thermal pad: £unpriced
- 1 candidate × drive retention screw set: £unpriced
- 1 candidate × model cache partition: £unpriced
- 1 candidate × storage health monitor: £unpriced
- 1 candidate × secure erase controller: £unpriced
- 1 candidate × firmware recovery image: £unpriced
- 1 candidate × event log partition: £unpriced
- 1 candidate × write endurance counter: £unpriced
- 1 candidate × crash dump region: £unpriced
- 1 candidate × log export port: £unpriced
- 1 candidate × BMC management controller: £unpriced
- 1 candidate × management Ethernet PHY: £unpriced
- 1 candidate × BIOS firmware image: £unpriced
- 1 candidate × platform configuration EEPROM: £unpriced
- 1 candidate × inference runtime image: £unpriced
- 1 candidate × accelerator driver bundle: £unpriced
- 1 candidate × watchdog service: £unpriced
- 1 candidate × configuration manifest: £unpriced
- 1 candidate × out-of-band management port: £unpriced
- 1 candidate × serial console header: £unpriced
- 1 candidate × debug access lockout: £unpriced
- 1 candidate × firmware signing key slot: £unpriced
- 2 each × Redundant power supply: £unpriced
- 1 candidate × AC inlet filter: £unpriced
- 1 candidate × input fuse holder: £unpriced
- 1 candidate × power-good signal harness: £unpriced
- 1 candidate × 12 V busbar: £unpriced
- 1 candidate × accelerator power harness: £unpriced
- 1 candidate × hot-swap controller: £unpriced
- 1 candidate × fan power distribution loom: £unpriced
- 1 candidate × hold-up capacitor module: £unpriced
- 1 candidate × brownout detector: £unpriced
- 1 candidate × current shunt module: £unpriced
- 1 candidate × eFuse channel set: £unpriced
- 1 candidate × Fan wall assembly: £unpriced
- 1 candidate × PWM fan controller: £unpriced
- 1 candidate × airflow straightener: £unpriced
- 1 candidate × replaceable dust filter: £unpriced
- 1 candidate × Heatsink cold plate: £unpriced
- 1 candidate × thermal interface material set: £unpriced
- 1 candidate × heatpipe assembly: £unpriced
- 1 candidate × rear exhaust duct: £unpriced
- 1 candidate × front inlet grille: £unpriced
- 1 candidate × rear exhaust grille: £unpriced
- 1 candidate × air seal foam kit: £unpriced
- 1 candidate × rack pressure map label: £unpriced
- 1 candidate × inlet temperature sensor: £unpriced
- 1 candidate × accelerator hotspot sensor: £unpriced
- 1 candidate × exhaust temperature sensor: £unpriced
- 1 candidate × board humidity sensor: £unpriced
- 1 candidate × PSU PMBus monitor: £unpriced
- 1 candidate × rail current monitor: £unpriced
- 1 candidate × fan tachometer hub: £unpriced
- 1 candidate × chassis intrusion switch: £unpriced
- 1 candidate × front status LED board: £unpriced
- 1 candidate × UID button: £unpriced
- 1 candidate × alarm buzzer: £unpriced
- 1 candidate × LCD status panel: £unpriced
- 1 candidate × TPM security module: £unpriced
- 1 candidate × secure boot policy: £unpriced
- 1 candidate × chassis tamper switch: £unpriced
- 1 candidate × recovery jumper cover: £unpriced
- 1 candidate × thermal trip relay: £unpriced
- 1 candidate × overtemperature latch: £unpriced
- 1 candidate × fan failure interlock: £unpriced
- 1 candidate × hardwired shutdown line: £unpriced
- 1 candidate × protective earth stud: £unpriced
- 1 candidate × insulation barrier sheet: £unpriced
- 1 candidate × finger-safe PSU cover: £unpriced
- 1 candidate × warning label set: £unpriced
- 1 candidate × hot-swap fan carrier: £unpriced
- 1 candidate × drive service handle: £unpriced
- 1 candidate × PSU latch mechanism: £unpriced
- 1 candidate × accelerator extraction handle: £unpriced
- 1 candidate × rack rail kit: £unpriced
- 1 candidate × rear support bracket: £unpriced
- 1 candidate × cable retention comb: £unpriced
- 1 candidate × airflow blanking panel: £unpriced
- 1 candidate × service checklist card: £unpriced
- 1 candidate × firmware version label: £unpriced
- 1 candidate × spare screw kit: £unpriced
- 1 candidate × diagnostics USB key: £unpriced

## Section Issues
- bom: blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, blocker/critical_part_unpriced, major/low_priced_line_ratio
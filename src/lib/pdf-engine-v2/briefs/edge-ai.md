# UK Edge-AI Inference Server Brief

We are developing a 1U short-depth rackmount edge-AI inference server targeting deployment in outdoor telecom edge cabinets, cell-tower street furniture, and enterprise network-closet racks where full datacenter-depth enclosures are impractical. The chassis is 482 mm wide × 450 mm deep (short-depth), fits a standard 19-inch rack, and houses one or two AI accelerator modules (GPU-class or purpose-built inference accelerator) alongside a low-power host processor, NVMe storage, and a managed PoE+ switch sub-module for aggregating attached sensors and IoT edge devices. The product targets inference workloads — computer vision, natural-language processing tokenisation, time-series anomaly detection — rather than training. It must operate without active cooling failure down to NEBS-derived thermal extremes and must survive vibration, humidity, and dust conditions typical of uncontrolled telecom edge environments. The platform is firmware-updateable over a management network interface and supports Kubernetes K3s or equivalent edge-container orchestration.

Target customer: UK mobile network operators (BT/EE, VMO2, Three UK) deploying distributed-AI for open radio-access-network intelligent-controller inference; UK local authorities and smart-city programme integrators (Milton Keynes Council Future Cities, Transport for London); UK Ministry of Defence (DE&S) for edge-sensor fusion at forward operating bases; and managed-service providers hosting private-5G AI-analytics workloads. Procurement typically through Defence and Security Accelerator or Crown Commercial Service framework agreements. Annual volume 600–1,200 units per year by year 2.

Key constraints:
- Unit cost ceiling: £14,500 ex-works per 1U server (including chassis, accelerator module(s), host SoC, NVMe, managed switch, power supply unit, rail kit; excluding installation, cabling, and per-deployment software licences)
- AI inference throughput: ≥ 40 TOPS (INT8) sustained at full thermal load; ≥ 55 TOPS peak; inference-performance-per-kilowatt ≥ 45 TOPS/kW at full sustained load (i.e. ≤ 1.2 kW total system power at 55 TOPS peak)
- System power envelope: ≤ 1,200 W total chassis draw at full accelerator load; power supply unit 80 PLUS Platinum rated, 100–240 V AC 50/60 Hz, redundant 1+1 configuration
- Operating temperature: -5 °C to +50 °C inlet air (NEBS GR-63 Zone 4 ambient range, extended commercial); storage -40 °C to +70 °C
- Chassis mass: ≤ 18 kg fully populated (for two-person rack installation in constrained cabinet without hoist)
- Chassis dimensions: 1U (44.45 mm) × 482 mm × 450 mm (H × W × D) — short-depth to fit 500 mm-depth telecom outdoor cabinets
- Vibration and shock: NEBS GR-63 core (seismic zone 4, vibration 5–100 Hz), ETS 300 019-1-4 Class 4.1 road-transport
- Humidity: 5–95% RH non-condensing operating; IEC 60068-2-78 damp-heat endurance 40 °C / 93% RH 96 h
- Ingress protection: IP40 minimum for chassis front panel; sealed PCIe slot blanks and cable-entry glands for outdoor-cabinet deployments
- Management: out-of-band IPMI 2.0 / Redfish BMC; 1 GbE dedicated management port; console RS-232; TPM 2.0 hardware security module
- Networking: 2× 25 GbE SFP28 uplinks + 4× 1 GbE RJ45 downstream; managed PoE+ switch sub-module ≥ 60 W total PoE budget
- Storage: ≥ 1 TB NVMe M.2 (model-weight cache + inference telemetry ring-buffer)
- Mean time between failures: ≥ 150,000 hours demonstrated at +40 °C (BELLCORE/Telcordia SR-332 Method I)
- Annual production: 800 units per year by year 2

Safety and regulatory:
- NEBS GR-63-CORE Issue 4 (network equipment building system — physical protection)
- NEBS GR-1089-CORE Issue 6 (electromagnetic compatibility and electrical safety)
- EN 55032 / EN 55035 (EMC — multimedia equipment emissions and immunity)
- EN IEC 62368-1:2020+A11:2021 (audio/video and IT equipment safety, replacing EN 60950-1)
- IEC 60068-2-6 (vibration sinusoidal), IEC 60068-2-27 (shock), IEC 60068-2-78 (damp heat)
- BS EN IEC 63000:2018 (RoHS technical documentation assessment)
- ETSI EN 300 386 v2.2.1 (EMC for telecom network equipment)
- UKCA marking under UK Radio Equipment Regulations 2017 (for radio sub-modules) + UK Electrical Equipment (Safety) Regulations 2016
- Cyber Resilience Act (EU) preparation: firmware update signing, SBOM per ETSI EN 303 645 v2.1.1
- REACH and RoHS2 Directive 2011/65/EU (substance declarations for solder + PCB materials)

Sub-modules expected: short-depth 1U steel chassis with perforated top deck + slide rails, AI accelerator module (e.g. NVIDIA Jetson AGX Orin 64 GB or Hailo-15H M.2 dual-module), host SoC board (Arm Cortex-A78 quad-core or x86 Atom C5000 class, 32 GB LPDDR5, PCIe Gen4 interface to accelerator), NVMe 1 TB M.2 2280, redundant 1+1 platinum PSU (600 W + 600 W, hot-swap), managed 4-port PoE+ GbE switch ASIC (Marvell 88E6393X or equivalent), 2× SFP28 25 GbE NIC (Mellanox ConnectX-6 Lx or equivalent), BMC (ASPEED AST2600 or equivalent) + TPM 2.0, front-panel LCD status display + USB-A service port, cable-management arm, passive heatsink assembly (copper vapour-chamber + forced-air fans, speed-controllable 0–100% for noise/thermal trade), thermal shutdown at 55 °C inlet, K3s edge-container runtime pre-loaded on NVMe factory image.

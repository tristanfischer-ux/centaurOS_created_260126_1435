# UK 350 kW Ultra-Rapid DC Charger Brief

We are developing a 350 kW ultra-rapid DC charger for the UK motorway and trunk-road network, delivered as a single CCS2-compatible pedestal with integrated transformer-isolation and dynamic load-sharing across two outlets. Target customers are UK Charge Point Operators (Gridserve, BP Pulse, Osprey, Instavolt, MFG) deploying at motorway service areas and forecourts under the Rapid Charging Fund and Project Rapid contracts.

Key constraints:
- Unit cost ceiling: £35,000 ex-works per pedestal (including transformer, dispenser, payment terminal; excluding civils, MV cabling, and Distribution Network Operator connection)
- Maximum delivered power per outlet: 350 kW (1,000 V DC @ 500 A) sustained for ≥ 20 minutes; second outlet load-shares dynamically when both engaged
- Input: 400 V AC three-phase, 50 Hz, ≥ 500 A per phase per pedestal (650 kW peak input including conversion losses)
- Power factor: ≥ 0.98 lagging at full output
- Conversion efficiency: ≥ 95% at 350 kW (peak), ≥ 92% at 50 kW (light load)
- Total harmonic distortion (current): ≤ 5% per IEEE 519-2022 across the input range
- Galvanic isolation: medium-frequency transformer between AC input and DC output (mandatory per BS EN 61851-23-1:2020)
- Operating temperature: -25 °C to +45 °C ambient (UK winter to summer envelope)
- Ingress protection: IP55 for the pedestal enclosure, IP67 for the CCS2 connector when stowed
- Acoustic noise: ≤ 65 dBA at 1 m at full output (residential adjacency requirement)
- Annual production: 800 units per year for the UK rollout window 2026-2030
- Service interval: 12 months between scheduled inspections; mean time between failures (MTBF) ≥ 30,000 hours

Safety and regulatory:
- BS EN 61851-1:2019 (general charging requirements)
- BS EN 61851-23-1:2020 (DC charging system requirements)
- BS EN 61851-23-3:2024 (DC charging functional safety)
- ISO 15118-2:2014 + ISO 15118-20:2022 (Plug & Charge communication)
- BS EN IEC 61000-6-2:2019 / 61000-6-4:2019 (EMC immunity and emissions for industrial)
- The Electricity Safety, Quality and Continuity Regulations 2002 (UK) for grid-side
- UK Public Charge Point Regulations 2023 (pricing, contactless payment, 99% availability)
- Open Charge Point Protocol (OCPP) 2.0.1 for back-office integration
- UN/ECE R10 Rev 6 (EMC for electric vehicles, applicable to the connector)

Sub-modules expected: AC input stage with active front-end (active power factor correction, 12-pulse rectifier configuration), medium-frequency isolation transformer, DC output stage (interleaved buck converters with silicon-carbide modules), cooling system (forced-air over silicon-carbide modules, liquid loop for transformer), CCS2 dispenser with HV cable cooling, payment + display module (contactless terminal, 15-inch sunlight-readable display), communication module (4G cellular + Ethernet backhaul, OCPP 2.0.1), human-machine interface, control electronics (functional-safety microcontroller running ASIL-B firmware), enclosure (galvanised steel with vandalism-resistant panels).

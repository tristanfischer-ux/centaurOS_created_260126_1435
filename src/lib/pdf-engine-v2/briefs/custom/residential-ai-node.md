# Residential Distributed AI Compute Node Brief

We are designing an edge AI inference and training compute node — an NVIDIA-GPU edge data-centre appliance — packaged in a weatherproof cabinet that mounts on the external wall of a residential home. Each node runs distributed AI workloads for a compute-network operator. It plugs into the household single-phase supply and backhauls over the home broadband connection or an integrated Starlink terminal. The host homeowner receives reduced-cost electricity (the operator pays a hosting power rebate) and free high-speed internet via the shared Starlink link. The unit is deliberately sized to fall within UK permitted development so it needs no planning permission — comparable in footprint to a domestic air-conditioning condenser.

Target market: AI compute-network operators monetising distributed inference and training capacity; participating homeowners who host a node in exchange for cheaper power and free connectivity. Comparable edge systems include NVIDIA IGX Orin, Dell PowerEdge XR4520c, Supermicro mini-edge, and Lenovo ThinkEdge — but re-housed for unattended outdoor residential deployment.

Key constraints:
- Unit cost ceiling: £12,000 ex-works per node
- Compute target: 4 × NVIDIA L40S class accelerators delivering ≥ 1,400 TOPS INT8 sustained for inference, with mixed-precision training capability; host compute module with 256 GB DDR5 ECC and NVMe cache
- Peak power draw: ≤ 3.7 kW; continuous draw ≤ 3.4 kW from a single-phase 230 V AC dedicated 32 A radial circuit (it is an electrical LOAD only, not a grid-export generator)
- External envelope: 700 × 450 × 280 mm wall-mounted outdoor cabinet (under 1 m³, projecting under 1 m from the wall) to remain within permitted development
- Noise level: ≤ 42 dBA at 1 m to meet residential night-time limits
- Operating temperature -10 to +40 °C outdoor ambient; IP55 weatherproof enclosure; condensation and solar-gain managed
- Cooling: sealed liquid-to-air loop or filtered forced-air; no external water connection; waste heat rejected to ambient
- Inference latency: < 50 ms per 1024-token language-model request at the node
- Connectivity: dual backhaul — gigabit RJ45/fibre to the home network AND an integrated Starlink high-performance terminal with automatic failover
- Annual production volume: 5,000 nodes per year

Safety and regulatory:
- UKCA and CE marking
- BS 7671 (IET Wiring Regulations) for the household electrical connection, including a dedicated RCBO-protected radial and surge protection
- IEC 62368-1 audio/video, information and communication technology equipment safety
- EMC Directive 2014/30/EU
- Radio Equipment Directive 2014/53/EU for the Starlink and any wireless interfaces
- RoHS 2 Directive 2011/65/EU and WEEE Directive 2012/19/EU
- IP55 ingress protection (IEC 60529) for outdoor wall mounting
- Permitted development under the Town and Country Planning (General Permitted Development) Order — no planning permission required
- GDPR compliance for any data processed at the node (architectural, not certified)

Sub-modules expected: NVIDIA L40S GPU accelerator cards, x86 host compute module, DDR5 ECC memory, NVMe boot and cache drives, single-phase AC-DC power supply with active power-factor correction, surge protection and RCBO connection module, smart energy meter for the hosting rebate, outdoor IP55 wall-mount cabinet with solar shroud, thermal management (coolant pump, cold plates, air-blast heat exchanger, fans), networking (managed Ethernet switch, integrated Starlink terminal, home-uplink module), power distribution board, baseboard management controller for remote operation, and EMC filtering.

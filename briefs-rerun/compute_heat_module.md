# Modular Compute-Heat Brick Brief

We are designing a compact, mass-produced ~1-kilowatt artificial-intelligence inference unit — "the brick" — that recovers essentially all of its electrical draw as low-grade heat and delivers it into a hot-water loop. It is fundamentally a domestic/commercial water-heating appliance that happens to compute, NOT a rack-mount data-centre server: it is liquid-cooled, near-silent, plug-in, and its defining output is heat into the host's water. The brick is the atom of a modular distributed fleet — one brick heats a single home's hot-water cylinder, tens gang on a shared manifold to heat a swimming pool, hundreds rack together to pre-heat a food factory's process water — the unit never changes, only the count. Each brick runs inference workloads dispatched by a central compute-network operator; its warm coolant passes through a quick-connect liquid-to-water heat exchanger into the host's water, and a small integral dry-cooler sheds any heat the host cannot use. It plugs into an ordinary single-phase 13-amp domestic socket and backhauls over the host's broadband or an optional shared Starlink terminal. The host receives free or cheap heat (a hot-water/fuel-bill saving) and, at home scale, has the unit's electricity reimbursed; the operator sells the aggregated compute. Because a single brick is an indoor electrical appliance, it needs no planning permission.

Target market: artificial-intelligence compute-network operators monetising distributed inference; and heat hosts who take the recovered warmth — homeowners (hot-water cylinder), leisure centres and hotels (pool and shower water), commercial laundries, food and beverage processors and breweries (clean-in-place pre-heat), glasshouses, and district-heating schemes. The same brick serves all of them at different counts. Comparable precedents: Heata (United Kingdom — compute on a domestic hot-water cylinder), Deep Green (United Kingdom — compute heating a leisure-centre pool), MintGreen (compute district heating); re-conceived as one identical, mass-produced, fleet-coordinated unit.

Key constraints:
- Unit cost ceiling: £3,450 ex-works per brick (cheap, identical, mass-produced — the modular economics depend on a low per-unit cost, not a bespoke big box)
- Compute target: 1 × inference accelerator (high-end consumer graphics card or efficient unified-memory device class), ≥ 300 TOPS INT8 sustained for inference serving; host compute module with 64–128 GB memory and an NVMe model-weight cache; interactive inference latency: time-to-first-token < 200 ms and sustained decode ≥ 50 tokens per second per stream (single-batch, ~8-billion-parameter model at INT8; a full 1024-token completion in roughly 15–20 seconds — memory-bandwidth-bound); inference and batch workloads only (no synchronous distributed training)
- Power draw: ≤ 1.0 kW continuous from a single-phase 230 V AC 13 A BS1363 socket (an electrical LOAD only, not a grid-export generator); a reduced-power home variant draws ~0.5 kW to match a hot-water-only sink
- Heat recovery: ≥ 85% of electrical input recovered as usable heat delivered at 55–65 °C into the host water loop through a liquid-to-water plate heat exchanger (or cylinder coil at home scale); integral dry-cooler bypass sheds surplus heat when the host demand is satisfied (nights, weekends, summer) so compute never throttles for want of a heat sink
- Heat output: ~1.0 kW thermal (~24 kWh/day) per brick at full load (coefficient of performance 1 — compute is a perfect heater); the brick count is sized to the host's heat demand
- Envelope: 450 × 300 × 550 mm floor- or wall-standing sealed indoor unit (under 0.08 m³); identical mechanical, hydraulic, and network interface across every deployment so the fleet stays uniform
- Noise level: ≤ 40 dBA at 1 m to meet residential night-time limits
- Operating temperature: 0 to +35 °C indoor ambient; sealed liquid cooling loop; condensation managed
- Connectivity: host broadband 25/5 Mbit/s minimum (50/20 recommended) OR an optional integrated Starlink terminal with automatic failover; inference traffic is bandwidth-light (prompt in, answer out; model weights cached locally) and latency-tolerant
- Modularity and aggregation: identical bricks aggregate via a heat manifold + rack frame + managed network switch + site controller — 1 brick = a home, ~20–150 = a pool or laundry, hundreds-to-thousands = a factory or district scheme; only the aggregation kit is site-specific, the brick is constant
- Annual production volume: 20,000 bricks per year
- Maximum mass: 35 kg per brick (a single-person-liftable appliance, not a fixed plant)
- Design life: 8–10 years (commercial electronics service life; the accelerator is a field-replaceable module on a ~3-year refresh cycle)
- Manufacturing process: electronics box-build assembly — surface-mount and through-hole PCB assembly, liquid cold-plate and brazed-plate heat-exchanger integration, sheet-metal and aluminium enclosure fabrication, coolant fill, and functional burn-in test. This is a mass-produced electronics appliance, NOT a field-erected process plant.
- Materials: sheet-steel and aluminium enclosure, copper cold-plates, a brazed stainless-steel plate heat exchanger, and populated electronic assemblies (accelerator card, host compute board, power supply unit). No process vessels, pressure plant, or solvent/reagent systems.

Economics (deterministic model inputs — the dossier must render an economics section computed from these by explicit formula, not estimation; show the break-even electricity price):
- Capital cost per brick: taken from the bill-of-materials total
- Electricity price: £0.20 per kWh (assumption; report the break-even price at which annual net = £0)
- Compute yield: £0.15 per kW-hour of compute sold
- Utilisation: 0.70
- Heat-capture fraction: 0.85
- Displaced-fuel price (heat value to host): £0.07 per kWh-thermal where the host displaces gas; £0.20 per kWh where the host displaces electric immersion (home)
- Maintenance: 5% of capital cost per year
- Representative fleet counts to cost out: 1 (home), 50 (pool), 500 (factory) — capital, annual net, and simple payback for each

Safety and regulatory:
- UKCA and CE marking
- BS 7671 (IET Wiring Regulations) — 13 A plug-and-socket connection (or RCBO-protected radial), surge protection
- IEC 62368-1 (information and communication technology equipment safety)
- Building Regulations Part G3 (unvented hot-water connection) and Part P (electrical) for the heat-delivery interface; competent-person installation
- Legionella Approved Code of Practice L8 — a 60 °C pasteurisation path on domestic hot water
- Pressure Systems Safety Regulations 2000 for the heat-transfer loop
- EMC Directive 2014/30/EU; Radio Equipment Directive 2014/53/EU (Starlink and wireless interfaces)
- RoHS 2 Directive 2011/65/EU and WEEE Directive 2012/19/EU
- Measuring Instruments Directive — revenue-grade metering of both electricity drawn and heat delivered (the basis for the host rebate and compute accounting)
- Permitted development / indoor electrical appliance — no planning permission for a single home brick; permitted installed plant indoors at a commercial site
- GDPR for any data processed at the node (architectural, not certified)

Sub-modules expected: inference accelerator card, x86 or Arm host compute module, ECC memory, NVMe model-weight cache drive, single-phase AC-DC power supply with active power-factor correction, RCBO and surge-protection connection module, revenue-grade smart electricity-and-heat meter, liquid cold-plate assembly with sealed coolant loop, coolant circulation pump and expansion reservoir, quick-connect heat-output coupling, liquid-to-water plate heat exchanger host interface with isolation valves and thermostatic mixing and boiler-booster handoff, integral dry-cooler bypass (fan, radiator, diverter valve), low-noise sealed enclosure with coolant leak detection and auto-isolation and thermal cut-out, networking module (managed Ethernet, optional integrated Starlink terminal, host-uplink), baseboard management controller running the node agent (fetch / run / return / prove work units), and EMC filtering. Site-scale aggregation kit (secondary): heat-manifold headers ganging N bricks, rack frame, managed network switch, three-phase site power distribution board, and a site controller with building-management-system integration.

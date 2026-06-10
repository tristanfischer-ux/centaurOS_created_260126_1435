<!--
COST ANCHOR (brief-cost-ceiling drawer rule — market-anchored, not gut-feel)
Output family: electrical power → £/kWe (with thermal recovery as secondary).
Basis: farm-scale anaerobic-digestion + combined-heat-and-power plants run ~£4,000-6,500/kWe installed
at small scale. The CHP gas engine alone is ~£500-900/kWe, but the digester tanks (primary + secondary),
feedstock handling, gas upgrading/cleaning, gas holder, pasteurisation and grid-export switchgear
dominate the balance of plant. A 250 kWe farm AD-CHP unit therefore lands ~£1.0-1.6M for the equipment
ex-works (excludes civil groundworks, feedstock building, grid reinforcement beyond the export point).
Chosen ceiling: £1,400,000 ex-works at 250 kWe electrical = £5,600/kWe — mid farm-scale AD-CHP band.
Secondary check: ~270 kW thermal recovered → if costed against total useful output (520 kW e+th) that is
~£2,700/kW, consistent with cogeneration economics. Confidence: moderate.
MULTI-DOMAIN BY DESIGN: this brief genuinely spans gas handling (anaerobic process + biogas cleaning),
heat recovery (engine jacket + exhaust heat exchangers + digester heating loop) AND grid export
(synchronous generator + G99 protection + step-up). It must invoke a process-plant family, a
thermal-systems family AND a power-electronics/grid family simultaneously.
-->
# Farm-Scale Anaerobic Digester + CHP Brief

We are designing a farm-scale anaerobic digestion plant with an integrated combined-heat-and-power (CHP) unit. The plant takes farm feedstock — cattle slurry, food-processing residues and energy crops — and digests it anaerobically to produce biogas, which is cleaned and burned in a gas engine to generate electricity for grid export and recover heat for on-farm use and digester heating. The digestate is separated into a liquid fraction (returned to land as fertiliser) and a fibre fraction. The plant is a modular, skid-and-tank system erected on a prepared concrete pad beside the farm.

Target market: UK and Irish livestock and mixed farms, agricultural cooperatives and food-processing sites seeking on-site renewable power, heat and a managed route for organic waste and slurry, with revenue from electricity export and renewable-heat and green-gas incentives. Single-plant sale ex-works; the digester tanks ship as flat-pack bolted-panel kits and are field-erected on the customer's plinth.

Process description (continuous):
- Receive and macerate feedstock; buffer in a feed-mixing tank; pasteurise where animal by-product regulations require (70 °C for 1 hour)
- Pump feedstock into the primary mesophilic digester (~40 °C) where bacteria produce biogas (~55% methane, ~45% CO2, trace H2S)
- Pass digestate to a secondary digester / gas-tight digestate store for residual gas capture
- Collect biogas in a double-membrane gas holder; remove hydrogen sulphide (biological or activated-carbon desulphurisation); chill/dry the gas to drop out moisture
- Burn cleaned biogas in a spark-ignition gas engine driving a synchronous generator for electricity
- Recover heat from the engine jacket water and exhaust via heat exchangers; circulate to the digester heating coils and an on-farm heat loop
- Separate digestate into liquid and fibre fractions for return to land
- Synchronise and export electricity to the distribution network through G99 protection and a step-up transformer

Key constraints:
- Electrical output: 250 kWe continuous at the generator terminals (primary output target), grid-exported at 400 V then stepped up to 11 kV
- Heat recovery: ≥ 270 kWth recovered (engine jacket + exhaust), of which ~80 kWth serves digester heating and the balance an on-farm heat loop
- Biogas production: approximately 105 Nm³/h biogas at ~55% methane (~58 kW of methane energy per 100 Nm³ basis)
- Feedstock throughput: approximately 60 tonnes/day mixed feedstock (slurry + crop + residues)
- Digester capacity: primary digester ~2,500 m³ working volume, mesophilic ~40 °C; secondary store gas-tight
- Electrical efficiency ≥ 38%; total CHP efficiency (electrical + useful heat) ≥ 80%
- Gas quality to engine: H2S < 250 ppm after desulphurisation; moisture-dewpointed; methane ≥ 50%
- Design life: 20 years for the tanks and civil interfaces; 60,000-hour major-overhaul interval on the gas engine
- Operating environment: outdoor farm site, -10 °C to +35 °C ambient; corrosive (H2S, ammonia) gas-side atmosphere; ATEX zoning around the gas holder and engine
- Unit cost ceiling: £1,400,000 ex-works for the complete plant (digester tanks as bolted-panel kits, gas holder, desulphurisation and gas-cleaning skid, CHP container, heat-recovery skid, digestate separator, controls and grid-export switchgear) — excludes site civils, feed building and any network reinforcement beyond the export point
- Annual production volume: 15 plants per year
- Jurisdiction: UK

Safety and regulatory:
- UKCA and CE marking
- DSEAR and ATEX Directive 2014/34/EU for the biogas-handling, gas-holder and engine zones (biogas is flammable)
- Gas Appliances Regulation and engine gas-train safety (gas detection, slam-shut valves, flame arrestors)
- Pressure Equipment Directive 2014/68/EU for any pressurised gas vessels and the heat-recovery circuit
- Machinery Directive 2006/42/EC for the engine, pumps, mixers and separator
- G99 Issue 6 (UK grid connection for the synchronous generator)
- Animal By-Products Regulation (EC) No 1069/2009 and the associated pasteurisation requirement where applicable
- Environmental permitting (standard rules permit for on-farm AD); digestate to PAS 110 / quality protocol for land spreading
- COSHH for H2S and ammonia exposure; confined-space procedures for the tanks

Sub-modules expected: feedstock reception and maceration, feed-mixing and pasteurisation tank, primary mesophilic digester with mixers and heating coils, secondary digester / gas-tight digestate store, double-membrane gas holder, hydrogen-sulphide desulphurisation and gas drying/chilling skid, biogas booster and gas train, spark-ignition gas engine with synchronous generator, jacket-water and exhaust heat-recovery exchangers with the digester and on-farm heat loop, digestate separator (liquid/fibre), process pumps and pipework, instrumentation and SCADA control, grid-export switchgear with G99 protection and step-up transformer, and the flare for surplus or off-spec gas.

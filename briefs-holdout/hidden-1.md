<!--
SEALED HIDDEN HOLDOUT (G5). See HIDDEN-README.md. Never run, never used by any writeback/learning
until final acceptance.

COST ANCHOR (brief-cost-ceiling drawer rule — market-anchored, not gut-feel)
Output family: water throughput → £/(L·day⁻¹) of rated potable-water capacity.
Basis: refrigeration-condensation atmospheric water generators at the multi-thousand-litre/day scale
carry capex roughly £30-60 per (L/day) of rated capacity (large machines amortise the refrigeration
plant; small consumer units are far higher per litre). The dominant lever is specific energy, ~0.3-0.5
kWh per litre of water condensed at moderate humidity; that drives the refrigeration sizing and the
operating cost story.
Chosen ceiling: £250,000 ex-works at 5,000 L/day rated = £50/(L·day⁻¹) — mid band for an industrial
condensation AWG. Confidence: low-moderate (AWG cost data is vendor-thin; band kept wide).
-->
# Atmospheric Water Generator Brief

We are designing an industrial atmospheric water generator — a containerised machine that extracts potable water from ambient air by refrigeration condensation, then filters, mineralises and disinfects it to drinking-water standard. Humid air is drawn across a chilled coil where moisture condenses; the condensate is collected, multi-stage filtered, remineralised, UV- and ozone-disinfected, and stored in a hygienic tank ready for dispense. The unit is a self-contained, electrically-powered water source for sites without reliable mains water.

Target market: UK and international operators needing off-grid or supplementary potable water — remote sites, disaster-relief and humanitarian deployments, defence forward bases, construction camps and water-stressed communities. Single-unit sale ex-works; the plant is skid/container-mounted for transport and rapid commissioning.

Key constraints:
- Primary output target: 5,000 litres/day of potable water at reference conditions (30 °C, 60% relative humidity)
- Water quality: to WHO drinking-water guidelines / UK Private Water Supplies standard — filtered, remineralised, disinfected, low turbidity, pathogen-free
- Specific energy: ≤ 0.45 kWh per litre of water produced at reference conditions
- Production sensitivity: rated 5,000 L/day at 30 °C/60% RH, derating gracefully in cooler/drier air; minimum useful output specified down to 18 °C/40% RH
- Refrigeration: vapour-compression chiller with food-grade-compatible refrigerant; condensate coil corrosion-resistant and hygienic
- Water treatment: pre-filtration, activated-carbon and membrane stages, remineralisation dosing, UV and ozone disinfection, hygienic storage tank with recirculation
- Power: three-phase 400 V supply; the unit is an electrical load only
- Maximum gross mass: 4,500 kg
- External envelope: containerised / skid-mounted for road transport on a standard trailer
- Design life: 15 years; CIP-cleanable wetted path; filter and membrane consumables on a serviceable schedule
- Operating environment: outdoor, -5 °C to +45 °C ambient; IP-rated electrical enclosure; dust-filtered air intake
- Unit cost ceiling: £250,000 ex-works for the complete machine (air handling, refrigeration plant, condensate collection, water-treatment train, storage and dispense, controls)
- Annual production volume: 100 units per year
- Jurisdiction: UK, with international deployment

Safety and regulatory:
- UKCA and CE marking
- Machinery Directive 2006/42/EC for the refrigeration and air-handling machinery
- F-Gas Regulation for the refrigerant charge
- Pressure Equipment Directive 2014/68/EU for the refrigeration circuit
- BS 7671 (IET Wiring Regulations) and EMC Directive 2014/30/EU for the electrical installation
- Drinking-water quality to WHO guidelines and the UK Private Water Supplies Regulations; food-contact-material compliance on the wetted path
- Regulation 31 (water fittings) and disinfection-by-product limits for the treatment stages
- IP-rated ingress protection for outdoor installation

Sub-modules expected: air intake and filtration, vapour-compression refrigeration plant, hygienic condensation coil and condensate collection, multi-stage water-treatment train (pre-filter, carbon, membrane), remineralisation dosing, UV and ozone disinfection, hygienic storage and recirculation tank, dispense point, electrical distribution and controls with environmental monitoring, and the skid/container enclosure.

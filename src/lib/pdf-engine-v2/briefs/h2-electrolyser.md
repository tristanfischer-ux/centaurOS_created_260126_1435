# UK 5 MW PEM Electrolyser Stack Brief

We are developing a 5 MW polymer-electrolyte-membrane (PEM) electrolyser system for green hydrogen production at industrial sites and refuelling stations in the UK and EU. The system delivers up to 90 kg/hour of hydrogen at 30 bar outlet pressure, packaged in a 40-foot containerised module ready for grid + water + venting connection.

Target customer: UK industrial decarbonisation projects (cement, glass, steel), heavy-vehicle refuelling stations (Hynet, Element 2, ITM Motive), and BEIS / Department for Energy Security and Net Zero funded projects under the Net Zero Hydrogen Fund and Hydrogen Allocation Round (HAR2 / HAR3). Operated under EIGA IGC Doc 134/13 and BCGA Code of Practice 4 (UK industrial hydrogen).

Key constraints:
- Unit cost ceiling: £4,500,000 ex-works for the containerised 5 MW module (including stack, balance of plant, container, control system; excluding site civils, MV transformer, deionised-water plant, and storage)
- Rated electrical input: 5.0 MW at the AC terminals (415 V, three-phase, 50 Hz), with rectifier output 800 V DC at 6,250 A nominal
- Specific energy consumption: ≤ 55 kWh/kg H₂ at nominal load (system-level, including auxiliaries)
- Hydrogen production rate: 90 kg/hour at nominal (≥ 1,000 Nm³/hour at standard conditions)
- Hydrogen purity: ≥ 99.999% (5N grade) per ISO 14687:2019 fuel-cell-vehicle specification
- Outlet pressure: 30 bar gauge at the container H₂ flange (direct-to-storage compatible without booster compression)
- Dynamic response: 5-100% load ramp in ≤ 2 minutes (grid-balancing service capability)
- Stack lifetime: ≥ 80,000 operating hours to 90% of beginning-of-life capacity
- Operating temperature: -10 °C to +35 °C ambient; deionised-water feed at 18-22 °C
- Footprint: 40-foot ISO container shell (12.2 m × 2.44 m × 2.9 m) external, ≤ 22 tonnes gross weight
- Acoustic emission: ≤ 70 dBA at 1 m at full load (industrial-site adjacency)
- Annual production: 20 units per year by year 4

Safety and regulatory:
- ATEX Directive 2014/34/EU + BS EN 60079 series (gas-zone classification for hydrogen)
- ISO 22734:2019 (hydrogen generators using water-electrolysis process)
- ISO 19880-3:2018 (hydrogen valves), ISO 19880-5:2019 (hydrogen dispensers — relevant for refuelling-station integration)
- BS EN ISO 11114-4:2017 (compatibility of metallic materials with hydrogen)
- Pressure Equipment Directive 2014/68/EU (Category III or IV for the high-pressure plant)
- Machinery Directive 2006/42/EC, Low Voltage Directive 2014/35/EU
- BS EN 50104:2010 (oxygen detection for asphyxiation risk in O₂-rich exhaust)
- IEC 60204-1:2018 (electrical safety of machinery)
- DSEAR (Dangerous Substances and Explosive Atmospheres Regulations 2002, UK)
- COMAH (Control of Major Accident Hazards Regulations 2015, lower-tier may apply)

Sub-modules expected: PEM stack (5 MW nominal, ~200 cells in series at 25 kW per cell, perfluorinated-sulfonic-acid membrane, iridium-oxide anode catalyst), AC/DC rectifier (5 MW IGBT-based with active front end and DC-link filtering, ≥ 98% efficiency), deionised-water circulation loop (high-pressure feed pump, ion-exchange polisher, conductivity-monitored ≤ 1 µS/cm), gas-water separator + dryer skid (for H₂ side and O₂ side), hydrogen drying skid (pressure-swing-adsorption or temperature-swing-adsorption to reach 5N purity), oxygen vent stack (passive, with O₂-rich-vent flame arrestor), thermal management (closed-loop coolant + dry cooler at the container roof), control system (Siemens S7-1500 or Beckhoff TwinCAT with SIL-2 functional-safety loops for stack overpressure and H₂-in-air detection), containerised enclosure (insulated 40-foot intermodal with ATEX-classified zones, fire-suppression, H₂ leak detection at 0.4% lower-flammability-limit setpoint).

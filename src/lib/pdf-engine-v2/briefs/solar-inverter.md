# UK 1,500 V Central Solar Inverter Brief

We are developing a 4 MW utility-scale central solar inverter for ground-mounted photovoltaic plants in the UK and EU. The unit operates at 1,500 V DC string voltage with active-front-end IGBT topology and integrated medium-voltage step-up transformer ready for 33 kV direct connection.

Target customer: UK utility-scale solar developers (Bluefield Solar Income Fund, Foresight Solar, Lightsource bp, Cero Generation) deploying ground-mounted plants under Allocation Round 7 (AR7) and AR8 Contracts for Difference + the unsubsidised merchant-market segment. EU operators (EnBW, Statkraft, Iberdrola) deploying under the EU REPowerEU action plan and national feed-in tariffs.

Key constraints:
- Unit cost ceiling: £180,000 ex-works for the containerised 4 MW unit (including inverter cabinet, transformer, low-voltage and medium-voltage switchgear, control system; excluding civils, racking, and DC string cabling)
- Rated AC output: 4.0 MVA at 33 kV (medium-voltage terminals), 4.0 MW active power at unity power factor
- DC input range: 800-1,500 V (operational), 1,500 V maximum open-circuit
- Maximum DC current: 4,000 A at the DC bus
- Conversion efficiency: ≥ 98.5% peak (CEC weighted), ≥ 98.2% European weighted
- Power factor: 0 to ±0.95 reactive, dynamic Volt-VAR + Volt-Watt grid support per IEEE 1547-2018
- Total harmonic distortion (current): ≤ 3% at full load
- Fault-ride-through: meet G99 / EU RfG Type C (5-10 MW) low-voltage-ride-through curves with 1.5× rated current for 150 ms
- Operating ambient: -25 °C to +50 °C; derating linear above +40 °C
- Cooling: forced-air over silicon-carbide / IGBT power modules; sealed cabinets IP54
- Footprint: 6 m × 2.5 m × 2.9 m (20-foot ISO half-container size) with crane-lift mass ≤ 18 tonnes
- Mean time between failures (MTBF): ≥ 100,000 hours per IEC 61724-1
- Annual production target: 150 units per year by year 4

Safety and regulatory:
- BS EN 50549-1/-2:2019 (grid-connected inverter requirements for ≤ 16 A and > 16 A per phase, respectively)
- ENA Engineering Recommendation G99 (UK distribution-network connection for ≥ 1 MW)
- EU Network Code Requirements for Generators (RfG, EU 2016/631) Type C (1-50 MW)
- IEC 62116:2014 (anti-islanding test), IEC 61727:2004 (PV interconnection)
- IEC 62109-1/-2:2010 (PV inverter safety)
- IEEE 1547-2018 + IEEE 1547.1-2020 (interconnection and interoperability for distributed energy resources)
- BS EN 61000-6-2/-4:2019 (EMC immunity / emissions for industrial environments)
- IEC 62920:2017 (PV inverter EMC)
- BS EN 61439-1/-2:2021 (low-voltage switchgear assemblies)
- BS EN 62271 series (medium-voltage switchgear)
- Pressure Equipment Directive 2014/68/EU (Category I — transformer oil)
- Machinery Directive 2006/42/EC, Low Voltage Directive 2014/35/EU

Sub-modules expected: 1,500 V DC bus + DC-side switchgear (with arc-fault detection per UL 1699B), DC link capacitors (film-type, oil-filled or polypropylene), inverter bridge (silicon-carbide MOSFETs in 6-pulse three-level NPC topology with snubber circuits), output L-C-L filter (line reactor + filter capacitors + line-side reactor), medium-voltage step-up transformer (33 kV / 690 V, three-winding cast-resin or oil-immersed, 4.5 MVA design), medium-voltage switchgear (vacuum or SF6-free circuit-breaker with NEC + cable termination), control system (Siemens, ABB, or in-house running real-time grid control + Volt-VAR + ride-through algorithms), HMI + revenue-grade metering (with IEC 61850 + Modbus TCP for SCADA integration), thermal management (forced-air across SiC modules, cold-plate liquid-loop optional for high-ambient sites), enclosure (IP54 painted-steel cabinets with internal vibration-isolation for switchgear).

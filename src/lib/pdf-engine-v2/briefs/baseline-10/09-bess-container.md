# BESS Test Brief

We are designing a containerised 2.5 MWh Battery Energy Storage System, 1 MW PCS, LFP prismatic cells, housed in a 40-foot ISO container.

Target market: UK grid-scale frequency response and capacity market, plus C&I peak shaving. Factory-assembled and deployable within 5 working days of delivery to site.

Key constraints:
- Unit cost: £1,700,000 ex-works target — within the premium UK-certified band £1.5-1.9M ex-works (≈£600-760/kWh usable). Industry reference: commodity-tier utility BESS (Tier-1 Chinese components, no UK certifications) lands £550-750k ex-works for the same 2.5 MWh usable; premium UK-certified band (Schaltbau / ABB / Beckhoff / Pfannenberg / Siemens switchgear, IEC 62619 + UL 9540A + NFPA 855 + G99 Issue 6 compliance, factory-acceptance tested) lands £1.5-1.9M ex-works. This design targets the premium band.
- Maximum gross mass: 35,000 kg (road-transportable; may require notification or specialist trailer for some routes)
- External envelope: 12,192 × 2,438 × 2,896 mm (standard 40-foot ISO)
- Usable energy: 2.5 MWh minimum at 25 °C, 80% depth of discharge, beginning of life (design over-delivers to ≥2.65 MWh)
- Power rating: 1.0 MW continuous; transient ride-through to 1.10 MW for ≤ 60 s (transformer-limited)
- Cell chemistry: LFP prismatic (CATL 280 Ah, EVE 280 Ah, or equivalent ≥280 Ah class)
- DC bus voltage: ~800 V nominal (system voltage), AC output at 400 V / 50 Hz via the PCS
- Design life: 15 years or 6,000 equivalent full cycles at 80% DoD
- Operating temperature: -20 °C to +50 °C ambient
- Annual batch size: 25 units per year

Safety and regulatory:
- IEC 62619 (cell-level safety)
- UL 9540A (system-level thermal runaway propagation)
- NFPA 855 (installation clearances and suppression)
- G99 Issue 6 (UK grid connection for grid-scale inverters)
- BS EN 61439-1/-2 (internal switchgear type testing)

Sub-modules expected: battery racks, BMS master + slaves, 1 MW PCS with step-up transformer, liquid-cooled thermal management, fire detection and suppression, energy management system, container fit-out, DC busbars.

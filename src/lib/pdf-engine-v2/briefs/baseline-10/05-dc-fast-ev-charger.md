# DC Fast EV Charger Brief

We are designing a 150 kW DC fast EV charger for UK commercial installation at motorway service stations, retail car parks and fleet depots. Dual CCS2 outputs that load-share one 150 kW power stack, OCPP 2.0.1 compliant back-end with ISO 15118 plug-and-charge support.

Target market: UK charge-point operators (Instavolt, Gridserve, MFG EV Power, BP Pulse, Shell Recharge) expanding dual-connector 150 kW sites, and fleet operators running light commercial vehicles overnight. Direct competitors are Alpitronic Hypercharger HYC 150, Kempower Satellite, and ABB Terra 184.

Key constraints:
- Unit cost ceiling: £35,000 ex-works per dual-connector unit
- Maximum total DC output: 150 kW continuous, 165 kW for 30 s
- External envelope: 800 × 700 × 1,850 mm (W × D × H), suitable for a standard parking-bay footprint
- Two CCS2 liquid-cooled cables, 5 m each, rated 400 A continuous
- Input: 400 V AC 3-phase + N + PE, 230 A per phase, fed from an on-site 11 kV / 0.4 kV transformer via a G99-compliant protection relay
- Output voltage range: 150 V to 1,000 V DC, output current up to 500 A per port (shared)
- Peak-efficiency point: ≥ 96 % at 50 % load; full-load efficiency: ≥ 94 %
- Operating temperature -25 to +40 °C, relative humidity 5-95 % non-condensing
- Annual production volume: 3,000 units per year

Safety and regulatory:
- G99 Issue 6 Engineering Recommendation (UK grid connection)
- IEC 61851-1 / -23 electric vehicle conductive charging system
- IEC 62196-3 CCS2 connector
- ISO 15118 -2 / -20 plug-and-charge communication
- OCPP 2.0.1 back-end protocol
- EN 61439-1/-2 low-voltage switchgear
- EN 50549-2 LV-connected generator / load protection
- CE + UKCA marking, EMC Directive 2014/30/EU, Low Voltage Directive 2014/35/EU
- IP54 enclosure; IK10 impact resistance

Sub-modules expected: 150 kW isolated DC/DC power stack (typically six 25 kW modules in parallel), input 3-phase PFC rectifier, auxiliary LVAC distribution + UPS, two CCS2 dispenser heads with liquid-cooled cables, liquid-cooling loop (pump + heat exchanger + reservoir), HMI (10-inch touchscreen + contactless card reader), cellular 4G backhaul + Ethernet backhaul, metering + isolation contactors, G99 protection relay, stainless-steel weatherproof enclosure.

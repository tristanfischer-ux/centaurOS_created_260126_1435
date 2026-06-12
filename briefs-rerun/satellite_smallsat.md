# Earth Observation Small Satellite Brief

We are designing a ~150 kg small satellite (smallsat) for sub-metre optical Earth observation from a low Earth sun-synchronous orbit. The spacecraft carries a pushbroom optical imager and downlinks imagery over a high-rate X-band link. It is a free-flying orbital spacecraft launched as an ESPA-class secondary payload into low Earth orbit; this is a microsatellite-class satellite bus, not an aircraft or balloon.

Target market: commercial Earth-observation data providers, government and defence mapping agencies, and downstream analytics customers in agriculture, insurance, maritime domain awareness, and disaster response across the UK, EU and export markets. Comparable platforms include Satellogic NewSat, Planet SkySat, and Airbus S250.

Key constraints:
- Unit cost ceiling: £6,500,000 per flight unit (recurring, excluding launch)
- Spacecraft wet mass: ≤ 165 kg; payload mass allocation: 45 kg
- Orbit: sun-synchronous LEO, 500 km altitude, 10:30 local time of descending node
- Payload performance: ≤ 0.75 m ground sample distance panchromatic at nadir; 4-band multispectral at ≤ 3 m GSD; ≥ 12 km swath
- Pointing performance: ≤ 0.05° absolute pointing accuracy, ≤ 0.005°/s stability (imaging-grade three-axis control)
- Power: ≥ 500 W orbit-average end-of-life from a deployable solar array; Li-ion battery sized for eclipse + peak imaging/downlink
- Payload data downlink: ≥ 500 Mbps X-band; redundant S-band TT&C uplink/downlink
- Propulsion: electric or cold-gas, ≥ 30 m/s delta-v for orbit maintenance, collision avoidance, and end-of-life deorbit
- Design life: 5 years operational, with ≤ 25-year post-mission deorbit compliance
- Operating environment: LEO radiation (total ionising dose), thermal cycling -40 to +60 °C, hard vacuum
- Annual production volume: 12 flight units per year (constellation build-out)

Safety and regulatory:
- ECSS (European Cooperation for Space Standardisation) engineering and product-assurance standards
- ITU Radio Regulations frequency coordination and filing for X-band and S-band
- ISO 24113 space debris mitigation and the IADC 25-year deorbit guideline
- Launch vehicle interface per the EELV Secondary Payload Adapter (ESPA) ring specification
- Export control assessment under UK strategic export licensing and EU dual-use regulation
- Planetary protection not applicable (Earth orbit)

Sub-modules expected: pushbroom optical imager payload (telescope optical tube assembly, CFRP optical bench, focal-plane detector array, payload electronics), attitude determination and control (reaction wheel assembly, star trackers, fine sun sensors, magnetorquers, GNSS receiver), on-board computer plus payload data handler FPGA, communications (X-band high-rate transmitter and patch/horn antenna, S-band TT&C transceiver), electrical power (deployable solar array, lithium-ion battery, power conditioning and distribution unit), propulsion (thruster, propellant tank, feed system), structure (aluminium honeycomb bus panels, central thrust tube, separation ring), and thermal control (multi-layer insulation, heaters, radiators, heat pipes).

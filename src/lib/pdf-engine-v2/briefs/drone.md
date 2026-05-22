# BVLOS Inspection Drone Brief

We are developing a beyond-visual-line-of-sight (BVLOS) inspection drone for UK utility-asset inspection — overhead transmission lines, gas pipelines, wind turbines, rail corridors. The platform is a hybrid quad-plane VTOL with a turbo-electric range extender for extended endurance over long-linear-asset corridors.

Target customer: UK Distribution Network Operators (DNOs), National Grid Electricity Transmission, Cadent Gas, Network Rail, and offshore wind operators (Vattenfall, Ørsted, SSE) operating in EASA-/UK-CAA-regulated BVLOS specific-category airspace. Operated by CAA GVC-holder pilots from a remote control station with C2 telemetry.

Key constraints:
- Unit cost ceiling: £45,000 ex-works (CAA-registrable Class C3 unit, not including ground station)
- Maximum take-off mass: ≤ 25 kg (CAA Specific Category, A2 + A3 operations possible without authorisation; BVLOS requires Operational Authorisation)
- Payload: 2 kg minimum (sensor pod: LiDAR + visual + thermal + RF spectrum analyser)
- Endurance: ≥ 4 hours at cruise (linear inspection mission profile)
- Range: ≥ 80 km radius from launch point with C2 telemetry link
- Cruise airspeed: 22 m/s minimum
- Stall airspeed: ≤ 12 m/s (VTOL transition window)
- Wind tolerance: 12 m/s steady + 20 m/s gust (UK winter weather envelope)
- Operating temperature: -10 °C to +40 °C (UK winter to summer)
- Battery: lithium-polymer with ≥ 200 Wh/kg specific energy
- Annual batch size: 50 units per year

Safety and regulatory:
- UK CAA CAP 722 (Operational Authorisation for Specific Category BVLOS)
- EASA Implementing Regulation (EU) 2019/947 (UAS operations in the EU/UK)
- EASA SORA methodology for operational risk assessment
- ASTM F3322 (parachute recovery system for unmanned aircraft)
- IP54 ingress protection minimum (rain + dust)
- ICAO Annex 13 incident reporting for any in-flight failure
- Radio Equipment Directive 2014/53/EU for C2 link and payload telemetry

Sub-modules expected: airframe (carbon-composite wing, fuselage, tail booms), propulsion (4× lift rotors for VTOL + 1× pusher rotor for cruise), avionics (autopilot + IMU + GPS-INS), power distribution (battery pack + generator + DC bus), C2 communications (4G/5G + satcom backup + RF telemetry), sensor payload bay, parachute recovery system, ground control station interface.

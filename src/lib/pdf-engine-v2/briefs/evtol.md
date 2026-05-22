# Urban Air Mobility eVTOL Brief

We are developing a 4-seat passenger eVTOL (electric vertical take-off and landing) aircraft for short-range urban air mobility (UAM) routes in the UK and EU. The configuration is a tilt-rotor design with six rotors that tilt from vertical (hover) to horizontal (cruise) for efficient transition flight.

Target customer: UK and EU UAM operators (Skyports, Volocopter UK, Lilium partners, urban transport authorities). Operated under EASA Special Condition for VTOL-Capable Aircraft (SC-VTOL) with Type Certification target by 2028.

Key constraints:
- Unit cost ceiling: £2,400,000 ex-works (Type-Certified Class III VTOL, not including ground infrastructure)
- Maximum take-off mass: ≤ 2,800 kg (CS-VLA-derived envelope for light personal-use VTOL)
- Empty mass target: ≤ 1,400 kg (50% empty-weight fraction)
- Passenger payload: 4 occupants × 95 kg + 4 × 10 kg luggage = 420 kg
- Range: ≥ 130 km with reserves (UAM short-haul route + 30-min FAR Part 91 IFR reserve)
- Cruise airspeed: 55 m/s minimum (200 km/h)
- Vertical lift power: ≥ 480 kW peak (T/W > 1.3 for hover + transition margin)
- Cruise power: ≤ 180 kW continuous
- Battery: 600 V DC bus, ≥ 350 kWh usable, ≥ 250 Wh/kg specific energy, ≥ 4C charging
- Operating envelope: -10 °C to +45 °C, density altitude up to 2,500 m
- Acoustic target: ≤ 65 dBA at 100 m on take-off, ≤ 55 dBA at cruise overhead
- Annual production target: 25 units per year by year 5

Safety and regulatory:
- EASA SC-VTOL (Special Condition for VTOL-Capable Aircraft, Enhanced Category)
- EASA Acceptable Means of Compliance for SC-VTOL MOC-2387
- CS-25 sub-part E (powerplant installation)
- DO-178C (avionics software, DAL-A for flight-critical functions)
- DO-254 (avionics hardware, DAL-A for flight-critical functions)
- DO-160G (environmental qualification of avionics)
- Battery safety per EUROCAE ED-307 + RTCA DO-311A
- BVLOS operational requirements per EASA SORA for non-revenue passenger flights

Sub-modules expected: airframe (composite primary structure + crash-attenuation seats), six tilt-rotors (electric motors + propellers + tilt actuators), high-voltage battery pack with BMS + thermal management, flight control system (triplex-redundant fly-by-wire), avionics (DAL-A flight management + ADS-B + radio altimeter), cabin pressurisation + climate (optional), emergency descent system (multi-rotor lift-redundancy or ballistic parachute), ground charging interface (≥ 350 kW CCS2-compatible).

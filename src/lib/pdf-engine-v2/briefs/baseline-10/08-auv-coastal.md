# Autonomous Underwater Vehicle Brief

We are designing a 2-metre-class autonomous underwater vehicle (AUV) for coastal survey, offshore-wind inspection and hydrographic mapping in UK and EU territorial waters. 100 m rated depth, 24-hour endurance, modular payload bay for multibeam sonar, sub-bottom profiler or environmental DNA sampler.

Target market: UK hydrographic survey contractors (Fugro UK, MMT, Kraken Robotics UK), offshore-wind O&M operators inspecting inter-array cables on Dogger Bank, and coastal environmental agencies monitoring benthic habitat. Competes with Kongsberg HUGIN Endurance (overkill + £M-class), Teledyne Gavia (comparable class) and L3Harris Iver3 (US-built).

Key constraints:
- Unit cost ceiling: £235,000 ex-works, excluding sonar payload
- Rated depth: 100 m operational, 150 m crush depth with ≥ 1.5 safety factor
- External envelope: 2,100 × 230 × 230 mm (L × D × H), neutrally-buoyant in seawater at 1,025 kg/m³
- Mass in air: ≤ 90 kg (two-person lift + trolley, no crane required)
- Cruise speed: 3 knots nominal, 5 knots dash
- Endurance: ≥ 24 hours at cruise in seawater at 5 to 25 °C
- Navigation: inertial + GPS-aided on surface, Doppler-velocity-log + pressure-depth when submerged, position drift ≤ 0.2 % of distance travelled
- Communications: 2.4 GHz Wi-Fi on surface, acoustic modem for status pings while submerged, Iridium backup for emergency surfacing
- Payload bay: modular wet-mate 30-cm-long section, 10 kg + 500 W power budget for payloads
- Annual production volume: 30 units per year

Safety and regulatory:
- DNV-RU-NAVAL-Pt4-Ch9 autonomous and unmanned ships / vehicles (emerging class rule)
- Lloyd's Register underwater technology code ShipRight UWT
- IMO MSC.1/Circ.1638 maritime autonomous surface ships operational guidelines
- IECEx certification not required (non-ATEX waters)
- UK Maritime and Coastguard Agency MGN 664 autonomous vessel code
- IP68 rated electronics pressure housings, titanium-6Al-4V fasteners
- IMDG Code for lithium-ion battery transport (UN 3480 Class 9)
- EMC Directive 2014/30/EU, Radio Equipment Directive 2014/53/EU
- MCA M Notice requirements for autonomous coastal operation notification

Sub-modules expected: titanium pressure-hull (main + nose + tail sections), syntactic-foam trim weights, 12 kWh lithium-ion pressure-balanced battery (oil-compensated), brushless thruster + propeller, 4 × control-surface servos (rudder + elevator + aileron + spoiler), inertial navigation system + Doppler velocity log, acoustic modem transducer, GPS + Iridium masthead, pressure-depth sensor, wet-mate payload connector, modular payload bay, forward-looking obstacle-avoidance sonar, leak detector + emergency drop weight, 2.4 GHz Wi-Fi pop-up antenna on surface, recovery beacon + strobe.

# UK Subsea-Inspection AUV Brief

We are developing a 300 kg-class autonomous underwater vehicle (AUV) for subsea-asset inspection in UK and North Sea waters — offshore wind-farm export cables, oil-and-gas pipelines, sub-sea infrastructure surveys. The vehicle dives to 1,500 m, operates for 24 hours per mission, and carries a multi-sensor payload bay (multibeam sonar, sub-bottom profiler, high-definition imaging, methane sniffer).

Target customer: UK offshore-survey contractors (Fugro, Reach Subsea, Boskalis Subsea Services), wind-farm operators (Ørsted UK, SSE Renewables, Vattenfall), and oil-and-gas duty holders (Harbour Energy, NEO Energy) operating in UK Continental Shelf waters. Operated by Class IV Remote-Pilot-trained operators from a Dynamic-Positioning Class-2 support vessel via through-water acoustic telemetry.

Key constraints:
- Unit cost ceiling: £750,000 ex-works (including vehicle, baseline payload, deck-handling cradle, charging dock; excluding launch-and-recovery-system gantry and support-vessel fit-out)
- Maximum diving depth: 1,500 m (with 1.5× design margin to 2,250 m crush-pressure rating per DNV-GL-OS-E101)
- Endurance: ≥ 24 hours at 3-knot cruise speed (≥ 72 nautical miles per mission)
- Maximum mass: 300 kg dry (including baseline payload + 90 kWh battery pack)
- Hull envelope: ≤ 3.0 m length × 0.7 m diameter (torpedo form factor) for a single-operator launch on a 2-tonne LARS
- Cruise speed: 3.0 knots nominal, dash speed 5.0 knots for 30 minutes
- Battery: 90 kWh lithium-iron-phosphate pressure-tolerant pack, hot-swappable on deck, ≥ 6-hour recharge between missions
- Sensor payload power: ≥ 600 W continuous available to the payload bay
- Positioning: USBL-aided dead-reckoning inertial navigation, with ≤ 0.1% of distance-travelled error after 24 hours
- Operating temperature: -2 °C to +30 °C water; -10 °C to +40 °C deck
- Acoustic communications: 200 bps minimum at 1,500 m slant range; surface-buoy iridium link for over-the-horizon
- Annual production: 25 units per year by year 4

Safety and regulatory:
- DNV-GL-OS-E101 (subsea-vehicle structural design)
- DNV-RP-A203 (recommended practice for underwater-vehicle electronics qualification)
- IMCA R 006 + R 015 (codes of practice for vehicles in offshore use)
- BS EN ISO 19030 (subsea pressure-hull qualification testing)
- Marine and Coastguard Agency Workboat Code (compatibility with the supporting workboat operations)
- BS EN ISO 13849-1 (machinery functional safety, PL-d for emergency-abort)
- Lithium-Battery UN 38.3 test pack for transport
- WEEE Directive (waste of electronic equipment), Battery Directive 2006/66/EC end-of-life take-back

Sub-modules expected: pressure hull (6082-T6 aluminium or grade-5 titanium torpedo shell, with composite fairings for low-acoustic-signature), variable-buoyancy unit (positive on surface, neutral at depth, oil-compensated piston actuator), propulsion (single 8-blade ducted propeller + 6-DOF thruster array on bow and stern for hover-and-station-keeping), battery pack (90 kWh oil-compensated pressure-tolerant lithium iron phosphate), main electronics housing (oil-compensated or 1-atm pressure vessel, depending on subsystem), sensor payload bay (multibeam sonar, sub-bottom profiler, methane sniffer, HD camera + LED illumination), USBL transponder + acoustic modem head, surface-buoy iridium relay (towed cable or surface release), deck-handling cradle + LARS launch interface, charging dock with shore-side power supply.

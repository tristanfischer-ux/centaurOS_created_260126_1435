# UK 5-Axis Vertical Machining Centre Brief

We are developing a 5-axis vertical machining centre (VMC) for high-precision aerospace and medical-component manufacture in the UK and EU. Configuration is a trunnion-table 5-axis (X, Y, Z linear axes + A, C rotary axes) with rigid cast-iron column, hydrostatic spindle, and integrated coolant filtration.

Target customer: UK aerospace tier-1/2 suppliers (GKN Aerospace, Meggitt, Doncasters), medical-device manufacturers (Smith+Nephew, DePuy Synthes UK), and precision-engineering contract shops with revenue £5-50 M needing in-house capacity for titanium, nickel-superalloy, and stainless-steel parts to ±5 µm tolerance.

Key constraints:
- Unit cost ceiling: £280,000 ex-works for the base machine (excluding tooling, palletisation, robot integration, and post-process metrology)
- Travels: 600 mm X, 500 mm Y, 500 mm Z linear; ±120° A axis, 360° continuous C axis
- Workpiece envelope: 500 mm diameter × 400 mm height on the trunnion
- Spindle: 15,000 rpm BT-40 taper, 22 kW continuous (40% duty cycle), 145 Nm peak torque
- Rapid traverse: 40 m/min on linear axes; 80 rpm rapid on A and C
- Positioning accuracy: ±2.5 µm on linear axes per VDI/DGQ 3441 (machine acceptance test)
- Repeatability: ±1 µm linear, ±2 arc-seconds rotary
- Volumetric accuracy: ≤ 12 µm over the full work envelope after compensation
- Maximum cutting feed: 20 m/min sustained; 35 m/min peak
- Coolant flow: 80 L/min through-spindle (70 bar), 200 L/min flood, 40 L/min wash-down
- Footprint: 3.2 m × 2.8 m × 2.6 m (height with door clearance)
- Mass: ≤ 8,500 kg (single-truck UK road transport without abnormal-load permit)
- Operating temperature: 18-26 °C (workshop-conditioned, narrow band to preserve precision)
- Annual production: 75 units per year by year 5

Safety and regulatory:
- BS EN ISO 16090-1:2018 (machining-centre safety)
- Machinery Directive 2006/42/EC (UK SI 2008/1597) — CE / UKCA mark
- BS EN 60204-1:2018 (electrical safety of machinery)
- ISO 230-1/-2/-3/-4 (geometric and positioning testing standards)
- ISO 10791-1:2024 (machining-centre acceptance conditions)
- BS EN ISO 13849-1:2023 (safety-related parts of control systems, PL-d for guard interlocks)
- EU Low Voltage Directive 2014/35/EU
- BS EN IEC 61800-5-1:2023 (variable-frequency drive functional safety)
- Pressure Equipment Directive 2014/68/EU (Cat I — coolant accumulators)

Sub-modules expected: machine base (Meehanite cast-iron, vibration-damping ribbing, ≥ 4,500 kg base mass), Y-axis bridge column (T-rib cast iron, finite-element-optimised for thermal stability), X-axis saddle + Z-axis ram (linear-motor or ball-screw + servo-motor, hydrostatic guideways), spindle assembly (BT-40 hybrid-ceramic-bearing motor spindle, oil-air lubrication, integrated thermal compensation sensor), trunnion table (A-axis cradle + C-axis rotary, direct-drive torque motors), tool changer (40-position chain magazine + double-arm changer, 4-second chip-to-chip), coolant system (200 L stainless tank, 25-µm bag filter + 5-µm cartridge, vortex separator), chip conveyor (hinged-belt for prismatic + steel-mesh for swarf), enclosure (full-cover splash-guard with safety-rated interlocks and inspection-window glass), Siemens 840D sl or Heidenhain TNC 640 CNC control with operator panel, electrical cabinet (37 kW main contactor, drives, programmable logic controller).

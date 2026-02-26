"use client"

/**
 * @file cad-lab-progress.tsx — Engineering-grade progress experience.
 *
 * @description Three-tier educational system during AI operations:
 *   Tier 1: Operation-specific explainer (what the AI is doing right now)
 *   Tier 2: Subject-matched engineering facts (keyword-matched, no AI call)
 *   Tier 3: Contextual micro-step annotations alongside progress lines
 *
 * Facts are chosen by scanning the subject input for domain keywords
 * (rocket, satellite, drone, EV, robot) so users learn about their
 * specific technology while waiting.
 *
 * @component
 */

import { useState, useEffect, useMemo, useRef } from "react"
import { CheckCircle2, Loader2, Clock, GraduationCap, Activity } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

// ─────────────────────────────────────────────────────────────────────
// Tier 1: What the AI is doing RIGHT NOW
// ─────────────────────────────────────────────────────────────────────
const OPERATION_EXPLAINERS: Record<string, string[]> = {
  research: [
    "Scanning engineering databases for real-world specifications. Every dimension comes from datasheets, not estimation.",
    "Cross-referencing technical documentation, manufacturer specs, and published reference designs.",
    "Identifying material candidates, manufacturing constraints, and dimensional tolerances from industry data.",
  ],
  breakdown: [
    "Detecting engineering domain from your research report, then building a domain-specific decomposition prompt.",
    "Claude is analysing the full research report to identify 4–8 independent physical sub-assemblies with realistic lead times.",
    "Each module is assessed for interfaces, key parts, failure modes, and manufacturing process compatibility.",
  ],
  generate: [
    "Writing parametric CadQuery code. Unlike static STEP files, parametric models rebuild automatically when any dimension changes.",
    "Generating 3D geometry with proper filleting, chamfering, and assembly features for manufacturing readiness.",
    "Executing on cloud infrastructure — producing 7 orthographic projections, DFM analysis, and mass properties with center-of-gravity data.",
  ],
  batch: [
    "Running full pipeline across all modules — each gets parametric code, 3D geometry, 7 views, and DFM analysis.",
    "Parallelising CadQuery execution on Modal cloud. Each module produces STEP + STL exports and manufacturing assessment.",
    "Aggregating system-level metrics: total mass, maximum envelope, manufacturing readiness grade, and cost estimates.",
  ],
}

// ─────────────────────────────────────────────────────────────────────
// Tier 2: Subject-matched deep engineering facts
// ─────────────────────────────────────────────────────────────────────
const SUBJECT_FACT_POOLS: Record<string, string[]> = {
  rocket: [
    "Rocket nozzles operate above 3,000°C. Regenerative cooling channels in the nozzle wall carry cryogenic propellant to prevent material failure.",
    "Inconel 718 maintains 80% of its room-temperature strength at 700°C, making it the standard alloy for thrust chamber structures.",
    "Modern 3D-printed rocket engines (Relativity, Rocket Lab) achieve comparable thrust-to-weight at 1/10th the part count of traditionally manufactured engines.",
    "Chamber pressure directly determines nozzle exit geometry. A 20 bar chamber needs a 15:1 expansion ratio for sea-level optimisation.",
    "Gimbal bearings on a thrust mount must handle both axial thrust loads and lateral forces from thrust vector control — typically ±5° deflection.",
    "Ablative nozzle liners (carbon-phenolic composite) sacrifice material thickness to absorb heat. Typical regression rate: 0.1-0.3 mm/s.",
    "Propellant feed-through ports must maintain seal integrity under vibration loads of 15-25g RMS during launch.",
    "Thrust structure mass fraction (structure mass / total thrust) is a key metric. Best-in-class: <0.5% for LOX/RP-1 engines.",
    "LOX turbopumps on Merlin engines spin at 30,000+ RPM. The inducer at the inlet handles cavitation while the impeller accelerates flow to supersonic velocities.",
    "RP-1 (refined petroleum) has a density of ~800 kg/m³ compared to LOX at 1,140 kg/m³. Tank volume ratio is 1.4:1 for stoichiometric combustion.",
    "Thrust chamber wall thickness: 1-2mm for copper-lined chambers. The wall must withstand 500-700 bar internal pressure while conducting heat to the cooling channels.",
    "Expansion ratio affects vacuum efficiency: a 16:1 nozzle is optimal for vacuum, but produces massive overexpansion at sea level causing flow separation.",
    "Sea-level rockets use 10-12:1 expansion ratios. Vacuum-optimized engines use 80-200:1 — the massive bell shape you see on upper stages.",
    "Regenerative cooling uses fuel as coolant before injection. For LOX/methane, the methane endothermic reaction absorbs additional heat.",
    "Fuel injector plate: hundreds of tiny orifices (~0.5mm) must produce uniform spray pattern. Manufacturing tolerance: ±25μm.",
    "Ignition systems use TEA-TEB (triethylaluminum-triethylborane) hypergolic injection for Merlin. Spark ignition on Raptor uses glow plugs pre-heated to 1,400°C.",
    "Engine cycle matters: gas-generator (Merlin) bleeds 3% of thrust for turbine power. Staged combustion (Raptor) extracts 95%+ of energy for near-optimal Isp.",
    "Vaporized propellant volume expansion: liquid oxygen expands ~860x when vaporized. Tank pressurization systems must handle this massive volume change.",
    "Heat shield tiles on reusable vehicles withstand 1,300°C. Hexagonal tiles on Space Shuttle had 300+ unique shapes to fit the curvature.",
    " TPS (Thermal Protection System) mass fraction: ~20% of dry mass for a vehicle returning from LEO. Elon Musk claims Starship will get to ~5%.",
    "Re-entry heating follows the square root of velocity. Doubling entry velocity increases heating 1.4x, but energy dissipation quadruples.",
    "Scramjet operation above Mach 5: airflow through the engine remains supersonic. The fuel is injected downstream of the throat where local Mach is ~2.",
    "Hybrid rocket motors use solid fuel (HTPB rubber) with liquid oxidizer (N2O or LOX). Throttle capability and automatic restart are major advantages.",
    "Electric pump-fed engines (Rocket Lab's new design) eliminate turbopump complexity. The pump adds ~5% dry mass but removes the hot gas generator.",
    "Sea-level specific impulse (Isp) for Merlin: 282s. Vacuum Isp: 311s. Each second of Isp is worth ~25 kg of payload to orbit.",
    "Vacuum-optimized Merlin has a 2.1m diameter nozzle vs 1.2m sea-level. The 'elephant foot' shape is engineered to minimize weight while resisting 50+ bar hoop stress.",
    "Engineout capability: Falcon 9 can lose any single engine and still reach orbit. The remaining 8 engines run 20% richer to compensate.",
    "Full-flow staged combustion burns all propellant through the pre-burner, then through the main chamber. Raptor achieves 350s Isp — near-theoretical maximum.",
    "Engine bells are fabricated from spinning seamless tubes with braided outer layers. Inconel remains ductile at cryogenic temps, unlike niobium which becomes brittle.",
    "Pogo oscillation is a harmonic instability in the fuel system. The column of propellant in the feed line acts like a spring-mass system at 5-30 Hz.",
    "Engine restart in space requires thermal conditioning. Chambers must be above freezing, turbopump bearings pre-spooled to operating temperature.",
    "Mass flow rate for Merlin: ~275 kg/s at full thrust. That's 1,650 kg of propellant burned per second of flight at full throttle.",
    "Specific impulse efficiency: 98%+ is achievable with optimal mixture ratio, nozzle design, and cooling. Diminishing returns beyond that.",
    "Thrust vector control (TVC) hydraulic pressure: 200-300 bar. The actuators must move the 10,000+ kg engine with sub-millisecond response.",
    "Thrust termination: pyrotechnic frangible bolts sever propellant lines, then helium purge prevents residual ignition risk.",
    "Engine test stands have water-cooled flame deflectors absorbing 500+ MW thermal load. The steam plume from a Merlin test reaches 50m.",
    "Bipropellant hypergolic engines (SpaceX Draco, MERLIN) use MMH and NTO. The combination ignites on contact — no ignition system needed.",
    "Pressure-fed engines (Blue Origin's BE-3) use tank pressure instead of turbopumps. Simpler, but limited to ~15-20 bar chamber pressure.",
    "Orbital Maneuvering Vehicles typically use hydrazine monopropellant. Catalytic decomposition produces 70% hydrogen peroxide at 600°C — extremely corrosive.",
  ],
  satellite: [
    "In LEO, a CubeSat experiences thermal cycling from -150°C to +150°C every 90-minute orbit. All joints must accommodate differential thermal expansion.",
    "A 1U CubeSat mass budget is 1.33 kg maximum. The structural frame typically consumes 200-300g, leaving ~1 kg for payload and subsystems.",
    "PC-104 is the standard CubeSat avionics bus: 90.17mm × 95.89mm boards with a 104-pin connector stack at 15.24mm pitch.",
    "Deployment switches (kill switches) are mandated by CubeSat Design Specification. They must cut all power while stowed in the P-POD deployer.",
    "Reaction wheels provide attitude control by conservation of angular momentum. A 10 mNm·s wheel can slew a 3U CubeSat at ~1°/s.",
    "Space-grade aluminum 7075-T6 is preferred over 6061 for CubeSat frames — 40% higher yield strength at only 3% more mass.",
    "Solar cell efficiency in LEO: triple-junction GaAs cells achieve 30%+ but cost ~$300/W. Silicon cells at 22% are 10x cheaper per watt.",
    "Outgassing is critical in vacuum. All materials must meet NASA ASTM E595: <1% TML (total mass loss) and <0.1% CVCM.",
    "ADCS (Attitude Determination and Control System) magnetorquers use Earth's magnetic field. A 0.2 A·m² magnetorquer provides 10 μNm torque in 0.3 Gauss field.",
    "GEO satellites orbit at 35,786 km — 3x further than LEO. Round-trip signal delay: 240ms. Real-time voice is impractical.",
    "TT&C (Telemetry, Tracking, Command) uses S-band (2-4 GHz) for uplink, X-band (8-12 GHz) for high-rate downlink. Optical links: 1.55 μm laser at 10 Gbps.",
    "Solar panel degradation: multi-junction cells lose ~0.5%/year in GEO. After 15 years, still producing 85% of original power.",
    "LEO constellation: Starlink at 550 km uses ~100 satellites per plane, 1,000 km/s relative velocity between adjacent planes. Collision risk: 1 in 100 million per conjunction.",
    "Ion thrusters (Busek BHT-600) produce 6 mN/kW specific impulse of 3,000 s. That's 3x chemical efficiency but 0.1% of thrust density.",
    "GEO station-keeping: ±0.1° longitude control requires ~50 kg of hydrazine per year. Electric propulsion reduces this to <10 kg but needs 5x more time.",
    "Thermal control: passive (MLI blankets, white paints, phase change material) vs active (heat pipes, loop heat pipes moving fluid by capillary action).",
    "Radiation hardening: SRAM memories require TMR (triple modular redundancy). Doses above 100 krad cause single-event upsets in unhardened parts.",
    "Single Event Latchup (SEL) can destroy power electronics. SEL protection: current limiters, watchdog timers, hardware disable circuits.",
    "Micro-meteoroid flux: flux peaks during meteor showers. Whipple shielding (multiple thin layers) breaks up particles before hitting main structure.",
    "-deployer compliance: ICD (Interface Control Document) between satellite and deployer. Viking: 6U, 12U, 16U. ISRO PSLV: 2U-36U.",
    "Testing for space: thermal vacuum cycling (-40°C to +60°C, 10+ cycles), vibration (20-2000 Hz random), acoustic (140+ dB), pyro shock.",
    "Solar sail propulsion uses photon pressure: ~9 μN/m² at 1 AU from the Sun. A 1 km² sail could accelerate a 1,000 kg craft at 0.1 mm/s².",
    "Tethers in space: 20 km aluminum wire generates ~40V from crossing Earth's magnetic field. Could provide 5 kW from a 20A current.",
    "Deployable booms: stowed in <1U volume, unfurl to 6m. Bi-stable reels use stored energy to deploy without motors.",
    "Patch antennas for UHF: 1/4-wave ground plane. Circular polarization requires dual-fed patches with 90° phase shift.",
    "Star trackers: 6-10 magnitude sensitivity, <1 arcsec accuracy. Field of view: 20° × 20° typical. Sun avoidance angle: 30-45°.",
    "Sun sensors: analog (four quadrants generating error voltage) or digital (pixel array with centroiding). Accuracy: 0.1-1°.",
    "Magnetometers: fluxgate sensors for 0.1 nT resolution. Must be boom-deployed to avoid spacecraft magnetic interference.",
    "GPS receiver for orbit determination: <10m accuracy with 4-6 satellites in view. Patch antenna on spacecraft body works in LEO.",
    "Battery technology: Li-ion cells at 150-200 Wh/kg. Cycle life: 5,000 cycles at 80% depth of discharge. Calendar life: 10 years.",
    "Zener diode bias networks prevent electrostatic discharge (ESD) on orbit. Harness metallization: 50-100 Ω/square conductive coating.",
    "RF passive intermodulation: metal-to-metal contacts in waveguides generate spurious signals. Silver plating reduces PIM by 20 dB.",
    "Antenna pointing: gimbaled vs body-fixed. Body-fixed saves mass but limits coverage. Gimbal allows 360° with reaction wheels.",
    "Data handling: spacewire (IEEE 1355) at 200 Mbps, CAN bus for subsystem comms, MIL-STD-1553 for legacy spacecraft.",
    "Software radiation tolerance: dual-redundant processors voting on output. Memory scrubbing corrects single-bit upsets in RAM.",
    "Launch vehicle integration: pyros (explosive bolts), umbilical disconnect, hold-down release, fairing separation mechanisms.",
    "End-of-life deorbit: controlled reentry (aim at Point Nemo, spacecraft cemetery) vs graveyard orbit 200 km above GEO.",
    "Constellation phasing: Walker Delta pattern ensures even coverage. 24 satellites at 1,200 km provide global coverage with 30-60 min revisit.",
  ],
  drone: [
    "Carbon fiber layup orientation determines stiffness direction. 0°/90° cross-ply is standard for drone arms; ±45° adds torsional rigidity for vibration damping.",
    "Motor KV rating × battery voltage = no-load RPM. For a heavy-lift octocopter, 300-400 KV motors on 6S (22.2V) give optimal thrust-to-weight.",
    "Propeller efficiency peaks at specific advance ratios. Matching prop diameter to motor KV is the single largest factor in flight time.",
    "Center of gravity must be within 5mm of the geometric center for stable PID control. Asymmetric payloads require counterweights or software trim.",
    "ESC timing advance (0-30°) affects motor efficiency and heat generation. Higher advance improves high-RPM efficiency but increases low-speed cogging.",
    "Vibration from motors at the frame's natural frequency causes Jello effect in cameras. Soft-mounting motors with O-rings shifts the resonance.",
    "For coaxial motor configurations, the lower propeller operates in disturbed air. Expect 15-20% thrust loss on the lower motor compared to isolated operation.",
    "Retractable landing gear reduces drag by ~8% in forward flight but adds 200-400g. Break-even flight time: approximately 12 minutes.",
    "Flight time calculation: thrust-to-weight < 0.5 for hover. At 0.5, you can hover. At 0.3, you have 50% power headroom for maneuvers.",
    "Battery C-rate: 1C = discharge in 1 hour. A 5000mAh 30C battery can output 150A. At hover, you might need 10-15A — that's 2-3C.",
    "Cell chemistry: LiPo (lithium polymer) vs LiHV (high voltage). LiHV charges to 4.35V/cell vs 4.2V/cell — 5% more energy but reduced cycle life.",
    "Propeller thrust formula: T = 4.392e-4 × D³ × (RPM)² × pitch. Pitch-to-diameter ratio of 0.5 is efficient for hovering; 0.3 for high speed.",
    "Blade pitch optimization: collective pitch controls total thrust, cyclic pitch tilts thrust vector. Swashplate mechanism enables all three.",
    "Flight controller loop: 1-4 kHz update rate. PID controller: proportional (error response), integral (accumulated error), derivative (rate of change).",
    "Gyroscope drift: MEMS gyros drift 1-10°/hour without correction. Accelerometer fusion corrects drift but adds noise during maneuvers.",
    "Barometric altimeter accuracy: ±10m typical. Sonar for low altitude (<10m), GPS-RTK for cm-level, LiDAR for obstacle avoidance.",
    "Geo-fencing: GPS fence prevents flight beyond set radius. Compliance: FAA Part 107 requires visual line of sight, max 400 ft AGL.",
    "RTK GPS: carrier-phase correction achieves 2 cm horizontal, 3 cm vertical accuracy. Base station + rover setup required.",
    "Optical flow for position hold: downward-facing camera tracks ground features. Works indoors where GPS fails. Requires textured surface.",
    "Failsafe: return-to-home (RTH) activates on signal loss, low battery, or manual trigger. Compass calibration essential — magnetic interference causes flyaways.",
    "Dynamic flight envelope: never exceed speed (VNE), best rate of climb speed (Vy), best angle of climb speed (Vx).",
    "Brushless motor construction: 12N14P (12 slots, 14 poles) is standard. More poles = more torque at lower RPM, but higher cogging torque.",
    "Motor efficiency map: peak efficiency at 70-80% throttle. Operating at 100% throttle dramatically increases heat, reduces efficiency 10-15%.",
    "Transmission loss: belt drives add efficiency loss but allow gear reduction. Direct drive is most efficient but requires high-KV motors.",
    "Aerodynamic drag: parasitic drag = Cd × A × 0.5 × ρ × V². At 20 m/s (45 mph), drag dominates. At 5 m/s (11 mph), induced dominates.",
    "Flaperons combine flap and aileron function. Differentially deflecting both reduces roll rate but increases lift — useful for approach.",
    "VTOL transition: multi-rotor to fixed-wing is complex. Thrust vectoring, tilting motors, or separate propulsion systems each have tradeoffs.",
    "Airframe materials: carbon fiber (highest stiffness/weight), fiberglass (cheaper, less brittle), foam core (impact-resistant), 3D printed (complex shapes).",
    "Servo torque: 1-5 kg·cm standard, 10+ kg·cm for heavy loads. Digital servos offer faster response but higher current draw.",
    "Telemetry: OSD (on-screen display) overlays flight data. 900 MHz or 2.4 GHz for long range, 5.8 GHz for video (Vtx).",
    "LIPO battery storage: store at 3.8V/cell (storage voltage). Storing fully charged or fully discharged dramatically reduces cycle life.",
    "Battery internal resistance (IR): increases with age. Measure with battery checker. IR doubles = 50% power loss as heat.",
    "Battery pack configuration: 3S = 3 cells in series (11.1V nominal). Parallel increases capacity, series increases voltage.",
    "Motor mounting: press-fit vs screw. Set screws can loosen from vibration. Threadlocker essential, re-torque after first flights.",
    "Propeller balance: unbalanced props cause vibration, motor bearing wear, and camera shake. Use dynamic balancer for sub-0.01g accuracy.",
    "Flight mode switch: manual (full control), stabilized (self-level), loiter (GPS hold), return-to-home, auto mission.",
    "Mission planner: waypoint navigation, ROI (region of interest) camera targeting, photogrammetry grid patterns, telemetry logging.",
    "BVLOS (Beyond Visual Line of Sight) operations: require waiver in US. Equipped with detect-and-avoid, remote ID, operational approval.",
  ],
  ev: [
    "Prismatic lithium-ion cells expand 3-5% during charge cycling. Battery module housing must provide controlled preload while allowing this swelling.",
    "Liquid cooling channels target a Reynolds number of 4,000-10,000 for turbulent flow — the sweet spot between heat transfer and pumping power.",
    "Busbar current density limits: copper busbars should not exceed 5 A/mm² for continuous operation to keep temperature rise under 30°C.",
    "UN ECE R100 mandates HV isolation resistance of 500 Ω/V minimum. A 400V pack needs 200 kΩ isolation from chassis ground.",
    "Thermal runaway propagation is the critical safety failure. Vent ports must direct hot gas (>600°C) away from adjacent cells within 5 seconds.",
    "Cell-to-pack ratio (cell volume / pack volume) determines energy density. Tesla 4680 structural pack achieves ~72%, up from ~55% in earlier designs.",
    "BMS current measurement uses hall-effect sensors for high-side sensing. Accuracy of ±0.5% over -40°C to +85°C is required for accurate SOC estimation.",
    "Cooling plate flatness tolerance of ±0.1mm is critical for thermal interface material (TIM) contact with cell faces.",
    "Cell chemistry: NMC (nickel-manganese-cobalt) balances energy density, power, and cost. LFP (iron phosphate) is safer and longer life but 20% less energy.",
    "SOC (State of Charge) estimation: coulomb counting ±5% error accumulates over time. OCV (open-circuit voltage) lookup table corrects drift when rested.",
    "SOH (State of Health): capacity fade and internal resistance increase. At 80% SOH, EV battery typically qualifies for replacement.",
    "Cell thermal runaway: initiates at 130-150°C for NMC. Prevention: pressure-sensitive vent, ceramic-coated separator, flame-retardant electrolyte.",
    "Charging curves: CC-CV (constant current, then constant voltage). DC fast charge tapers current when SOC reaches 80% to protect cells.",
    "Charging rate: 1C = full charge in 1 hour. 350 kW chargers can charge 100 kWh pack at 3.5C. But heat limits sustained rates.",
    "Wound motor (stator windings) vs permanent magnet (PM) synchronous. PM motors have better efficiency but rare-earth magnets are expensive.",
    "Induction motors: no permanent magnets, simpler construction, robust. Tesla originally used induction in Model S/X, switched to PM for efficiency.",
    "Motor controller: IGBT (insulated-gate bipolar transistor) modules switch 800V at 500+ amps. Silicon carbide (SiC) MOSFETs reduce switching losses 50%.",
    "Inverter efficiency: 95-98% for SiC, 90-95% for Si IGBT. Losses are split between conduction and switching.",
    "Regenerative braking: motor acts as generator, feeds power back to battery. Typical energy recovery: 10-30% of kinetic energy.",
    "One-pedal driving: strong regen enables stopping without brake pedal. Requires careful calibration to prevent lurching.",
    "Onboard charger (OBC): AC charging 3.3-22 kW uses inverter in reverse. Bidirectional (V2G) capability coming to newer models.",
    "DC-DC converter: steps HV battery (400-800V) down to 12V for accessories. Isolated designs prevent ground loops.",
    "HV connector sealing: IP67 minimum (dust-tight, water submersion). Thermal cycling from -40°C to +60°C challenges seal integrity.",
    "Battery pack structural integration: cells are load-bearing member. Tesla structural pack bonds cells directly to pack floor structure.",
    "Thermal interface materials: gap filler (silicone-based) or phase change material (melts at 45-55°C). Thermal conductivity: 1-5 W/m·K.",
    "Heat pump efficiency: COP (coefficient of performance) of 2-3. Can provide 3 kW heating from 1 kW electrical input.",
    "Cabin heating: PTC heater 3-8 kW. Heat pump more efficient above ~5°C ambient. Cold climate EVs may see 30%+ range reduction.",
    "V2G (vehicle-to-grid): bidirectional charger enables returning power to grid. Aggregated EVs could provide grid-scale storage.",
    "Battery swapping: NIO's model. 500+ kg battery pack swaps in 3 minutes. Infrastructure cost vs charging network tradeoffs.",
    "Wireless charging: resonant inductive coupling at 85-90% efficiency. Gap: 15-30 cm. Requires precise alignment.",
    "Cell formatting: laser welding tabs for low resistance. Ultrasonic welding for aluminum. Resistance spot welding is fastest.",
    "Module design: 8-24 cells in series per module. Module-level fusing prevents cascade failure when one cell shorts.",
    "Voltage balancing: passive (bleed resistor dissipates energy) vs active (capacitor/inductor redistributes charge). Active is more efficient.",
    "Battery lifetime: calendar life (time) + cycle life (charge cycles). Calendar degrades faster at high SOC and high temperature.",
    "Second-life applications: EV batteries at 70-80% SOH still have 60-70% capacity. Grid storage, backup power ideal use cases.",
    "Recycling: hydrometallurgical (acid leaching) vs pyrometallurgical (smelting). Black mass contains lithium, cobalt, nickel for recovery.",
    "Tire rolling resistance: affects range 10-15%. Low rolling resistance tires often sacrifice wet grip. Balance matters.",
    "Aerodynamics: Cd × A (drag area) is key metric. Typical EV Cd: 0.24-0.30. Reducing 10% improves highway range 5%.",
    "Weight: 500-700 kg battery in a large EV. Chassis lightening is critical but must meet crash safety requirements.",
  ],
  robot: [
    "Harmonic drive gears achieve 100:1 reduction in a single stage with <1 arcmin backlash. Standard in collaborative robot joints.",
    "Cable routing through revolute joints must accommodate ±180° rotation. Helical cable paths prevent fatigue failure over 10M+ cycles.",
    "Force-torque sensors at the wrist use 6-axis strain gauge bridges. Resolution of 0.1N and 0.005 Nm enables delicate assembly tasks.",
    "ISO 10218 defines safety zones: maximum TCP speed of 250 mm/s and 150N maximum contact force for collaborative operation near humans.",
    "Joint servo bandwidth determines maximum Cartesian acceleration. A 50 Hz bandwidth joint limits TCP acceleration to approximately 5 m/s².",
    "Cycloidal drives are gaining adoption over harmonic drives — similar ratios but 3x higher shock load capacity and no flex spline fatigue failure.",
    "Encoder resolution directly limits positioning repeatability. 19-bit absolute encoders give ±0.003° resolution per joint — sufficient for ±0.02mm TCP repeatability on a 1m reach arm.",
    "Gravity compensation using spring mechanisms can reduce joint motor torque requirements by 60-80%, enabling lighter actuators.",
    "Robot kinematics: forward kinematics (joint angles → TCP pose) is straightforward. Inverse kinematics (desired TCP → joint angles) can have multiple solutions.",
    "Denavit-Hartenberg (DH) parameters: standard convention for relating consecutive joint frames. Each joint has θ (rotation), d (offset), a (link length), α (twist).",
    "Trajectory planning: point-to-point (PTP) moves through intermediate waypoints. Linear moves maintain constant TCP velocity. Circular moves require center and radius.",
    "S-curve acceleration: trapezoidal velocity profiles cause jerky motion. S-curve smooths acceleration and jerk, reducing vibration and motor stress.",
    "Collision detection: external sensors (force-torque, torque sensors in joints, skin sensors) detect contact. Emergency stop in <10ms.",
    "Force control: impedance control makes robot behave like spring-damper. Position control makes it rigid. Hybrid allows simultaneous force and position control.",
    "Compliance: mechanical (spring in joint) vs control-based (detect force and adapt). Mechanical is inherently safer, control is more flexible.",
    "End-effector tooling: grippers (parallel, angular, vacuum), welding torches, spray guns, tool changers with automatic calibration.",
    "Vision integration: eye-in-hand (camera on robot) vs fixed (camera watching workspace). 2D vs 3D vision. Structured light vs stereo vs time-of-flight.",
    "Pick-and-place: typical cycle time 1-5 seconds depending on reach, payload, vision. High-speed delta robots achieve <0.5 second cycles.",
    "Path accuracy: industrial robots ±0.1mm typical, precision robots ±0.02mm. Calibration improves accuracy from repeatability baseline.",
    "Joint motors: frameless (direct drive) vs housed. Frameless integrates into link, saves mass. Housed includes bearing, easier to replace.",
    "Robot programming: online (teach pendant, lead-through) vs offline (simulation in CAM software). Simulation then download is standard.",
    "ROS (Robot Operating System): open-source framework. MoveIt for motion planning, rviz for visualization, Gazebo for simulation.",
    "PLC integration: robot as cell in manufacturing line. Ethernet/IP, PROFINET, or EtherCAT for real-time communication.",
    "Safety rated controlled stop: category 2 stop maintains power, monitors safety zone. Category 0 removes all power — emergency only.",
    "Collaborative robots (cobots): designed for direct human-robot interaction. Force-limited joints, rounded edges, no pinch points.",
    "Payload derating: at maximum reach, payload is reduced. Center of gravity offset reduces allowable payload. Check payload diagram.",
    "Mounting: floor, ceiling, wall, rail (linear axis). Ceiling mount saves floor space, may reduce payload capacity.",
    "Through-hole in base: for cable routing. Utility connections (pneumatics, fluids) can pass through hollow wrist.",
    "Tool center point (TCP): defined point for tool behavior. Gripper TCP at grip point, welding TCP at wire tip.",
    "Coordinate systems: base, world, tool, user (workobject). Programming in workobject coordinates accounts for part variation.",
    "Digital twins: simulation in virtual environment mirrors physical robot. Offline programming, process optimization, predictive maintenance.",
    "Predictive maintenance: vibration analysis, motor current signature, temperature monitoring predict failures before they occur.",
    "Machine tending: loading/unloading CNC, injection molding, press brakes. Requires precise part location, gripper design, part-present sensing.",
    "Assembly: precision insertion (peg-in-hole) requires force control and compliance. Vibro-insertion uses high-frequency vibration to reduce friction.",
    "Welding: MIG/MAG (gas metal arc), TIG (gas tungsten), spot welding. Wire feed speed, voltage, torch angle all affect quality.",
    "Painting: electrostatic atomizers apply paint efficiently. Robot path density, atomizer speed, paint flow rate affect thickness uniformity.",
    "Quality inspection: probe (touch), vision (2D/3D), CMM (coordinate measuring machine). In-process inspection catches defects early.",
    "Simulation: collision detection, cycle time estimation, reach verification. Programming in simulation before touching real equipment.",
    "Cost of ownership: initial purchase + installation + programming + maintenance. ROI calculation considers throughput increase, quality improvement.",
  ],
  default: [
    "Aluminum 6061-T6 has a yield strength of 276 MPa and excellent machinability. 7075-T6 offers 503 MPa but is harder to weld.",
    "Tolerance stack-up analysis: for an assembly of N parts each at ±0.1mm, worst-case stack is ±0.1×N mm, but RSS (statistical) is ±0.1×√N mm.",
    "FDM 3D printing achieves ±0.2mm accuracy. SLS: ±0.1mm. CNC machining: ±0.025mm. Choose process by required tolerance, not preference.",
    "Surface finish Ra 3.2μm is standard for CNC machining. Ra 0.8μm requires finishing passes. Ra 0.1μm requires grinding or lapping.",
    "Parametric CAD models are defined by constraints, not coordinates. Changing one dimension propagates through all dependent features automatically.",
    "DFM rule of thumb: wall thickness should be ≥1.5mm for injection molding, ≥0.8mm for sheet metal, and ≥0.4mm for FDM printing.",
    "STEP (ISO 10303) is the universal CAD exchange format. It preserves solid geometry, assemblies, and metadata across all major CAD packages.",
    "Mass properties matter: center of gravity position affects structural loads, vibration modes, and assembly stability during manufacturing.",
    "BOM (Bill of Materials): structured list of all parts and assemblies. Includes part number, quantity, material, supplier, cost.",
    "GD&T (Geometric Dimensioning and Tolerancing): positional tolerance, flatness, circularity, cylindricity. ±0.1mm positional vs ±0.1mm positional with MMC modifier.",
    "Fasteners: socket head cap screws (SHCS) for precision, hex bolts for structural, sheet metal screws for thin materials. Torque specs critical.",
    "Anodizing: electrochemical process adds aluminum oxide layer. Type II (decorative) 5-25μm, Type III (hardcoat) 25-150μm, reduces fatigue strength 30%.",
    "Heat treatment: T6 (solution treat + artificial age) maximizes strength. Annealing (O) softens for forming. Quenching rate affects final properties.",
    "Electrical grounding: single-point star ground prevents ground loops. Chassis ground should have <1Ω connection to PCB ground.",
    "IPC standards: IPC-A-610 for electronics assembly, IPC-6012 for printed boards. Class 3 (high-reliability) requires 100% inspection criteria.",
    "Soldering: SAC305 (Sn96.5Ag3Cu0.5) lead-free standard. Reflow profile: preheat, soak, reflow, cooling. Peak temp 235-245°C.",
    "Wire gauge: AWG 20 = 0.5mm², handles 5A. AWG 24 = 0.2mm², 2A. Voltage drop: <3% for long runs, use V = IR calculation.",
    "FEA (Finite Element Analysis): mesh density affects accuracy. Stress concentrations require refined mesh. Linear vs non-linear materials.",
    "CFD (Computational Fluid Dynamics): mesh near walls must be fine. Turbulence models k-ε (fast) vs LES (accurate). Convergence criteria: <1% change.",
    "DFMEA (Design Failure Mode and Effects Analysis): proactively identify failure modes, assign severity, occurrence, detection ratings. RPN (risk priority number) guides priority.",
    "DFA (Design for Assembly): minimize parts, maximize symmetry, use self-locating features. Assembly time directly affects unit cost.",
    "Value Engineering: analyze function vs cost. Keep function, reduce cost. Or add function, justify cost increase. Target 20%+ cost reduction.",
    "Design verification vs validation: verification asks \"did we build it right?\" (testing against spec). Validation asks \"did we build the right thing?\" (meets user need).",
    "Concurrent engineering: design, manufacturing, test teams work in parallel. Reduces downstream issues. Requires robust communication.",
    "Drawing standards: ISO or ASME Y14.5. Title block, revision block, material callout, GD&T, notes. 3D model as master vs drawing as master.",
    "Rapid prototyping: SLA (stereolithography) smoothest, SLS (selective laser sintering) strong, FDM (fused deposition) cheapest. Direct metal printing available.",
    "Injection molding: shrinkage 0.5-2% depending on material. Draft angle 1-3° prevents sticking. Gate design affects flow and part quality.",
    "Sheet metal: bend allowance = angle × (radius + 0.5 × thickness). K-factor (neutral axis location) typically 0.33-0.50.",
    "Turning vs milling: turning (lathe) for cylindrical parts, rotating workpiece. Milling (mill) for flat surfaces, rotating tool.",
    "CMM (Coordinate Measuring Machine): contact (stylus) or non-contact (laser, white light). Accuracy ±1-5μm. Environmental control critical.",
    "Calibration: traceable to national standards. Certificate documents measurement uncertainty. Recalibration interval depends on usage and stability.",
    "Cost estimation: material cost + processing cost + assembly + test + overhead. Break-even analysis for make vs buy decisions.",
    "Supply chain: lead time, MOQ (minimum order quantity), supplier qualification. Single source risk vs dual-sourcing cost premium.",
    "Intellectual property: patents (inventions), trademarks (brands), trade secrets (confidential processes). NDA before technical discussions.",
    "Regulatory compliance: CE marking (Europe), FCC (US), UL (safety), RoHS (hazardous substances). Required for market access.",
    "Sustainability: recyclable materials, design for disassembly, energy-efficient manufacturing. ESG reporting increasingly required.",
    "Renard numbers: R10, R20, R40 preferred values. E3, E6, E12 for electronic components. Reduces unnecessary inventory.",
    "Cost-per-part modeling: high volume favors investment in tooling (molds, dies). Low volume favors CNC or 3D printing.",
    "Design for test: test points accessible, built-in self-test (BIST), boundary scan for PCBs. Reduces test time and fixture cost.",
    "Failure analysis: root cause (design vs manufacturing vs material), 8D report, corrective action, verification. Prevents recurrence.",
  ],
  // ─────────────────────────────────────────────────────────────────────
  // Additional domains for broader engineering coverage
  // ─────────────────────────────────────────────────────────────────────
  aerospace: [
    "Commercial aircraft certification: FAR Part 25 (transport category) requires 60,000+ flight hours, 3x life limit testing, and fatigue crack propagation analysis.",
    "Composite fuselage testing: Boeing 787 undergoes pressure testing to 1.5x max operating pressure. Every rivet hole checked for fatigue cracks after test.",
    "737 MAX MCAS: Maneuvering Characteristics Augmentation System used angle-of-attack sensors. Dual sensor requirement added after accidents.",
    "Fly-by-wire: side-stick controller sends digital commands to flight computers. No direct mechanical link to control surfaces. F-16 introduced in 1974.",
    "A320 glass cockpit: first commercial fly-by-wire. Replaced analog gauges with 6 LCD screens. Pilots train on identical simulators.",
    "Jet engine bypass ratio: turbofan vs turbojet. High-bypass (10:1) is efficient at subsonic speeds. Low-bypass (5:1) or turbojet for supersonic.",
    "N1/N2 spool speeds: N1 (fan/low compressor) and N2 (high compressor/turbine) measured as %RPM. Both spools independent for reliability.",
    "Thrust specific fuel consumption (TSFC): measures fuel efficiency. High-bypass turbofan: 0.5 lb/hr/lbf. Lower is better.",
    "Vne (never exceed): redline speed. Exceeding causes structural damage or flutter. Different from Vmo (maximum operating).",
    "Stall speed (Vs): minimum speed for controllability. Config changes Vs: flaps increase lift, lower Vs. Must be 1.3xVs for approach.",
    "Load factor: n = lift / weight. Coordinated level turn: n = 1/cos(bank). 60° bank = 2g. 45° bank = 1.41g.",
    "DoD aircraft typically have T-tails: reduces tail strike risk, better visibility. But susceptible to deep stall (Learjet, early 727).",
    "737 landing gear: trailing-link ( strut angles back on extension). Allows flatter fuselage angle, slower approach, smaller gates.",
    "Cargo aircraft: 747 freighter nose lifts, 777F side cargo door. Floor beams rated for 150 kg/m² distributed, 500 kg/m² concentrated.",
    "RNAV (Area Navigation): GPS-based paths replacing VOR/DME airways. RNP (Required Navigation Performance) adds on-board monitoring.",
    "RVSM: Reduced Vertical Separation Minimum. Above FL290 (29,000 ft), aircraft spaced 1000 ft vs 2000 ft. Requires certified altimeter.",
    "TCAS: Traffic Collision Avoidance System. Resolution advisory (RA): climb or descend. Traffic advisory (TA): traffic nearby.",
    "ADS-B: Automatic Dependent Surveillance-Broadcast. GPS position broadcast every second. Required in US airspace since 2020.",
    "EDTO (Extended Diversion Time Operations): twin-engine aircraft approved for routes 180+ min from nearest airport. ETOPS 330 for 787/350.",
    "Composite wing testing: A350 wings bent 5.5m upward (1.5x limit) in static test. First Airbus composite wing to pass.",
    "Engine-out climb gradient: must exceed 2.4% single-engine on takeoff, 2.1% on approach. Determines obstacle clearance capability.",
    "Cabin pressurization: 8,000 ft equivalent at cruise altitude. Two outflow valves control rate. Pressurization failure triggers emergency descent.",
    "De-icing: pneumatic (boot inflation) or chemical (glycol). Anti-ice (on ground) vs de-ice (in flight). Holdover time tables specify limits.",
    "Wind shear detection: predictive (forward-looking LiDAR/Radar) vs reactive (aircraft weather radar). Microburst detection critical for safety.",
    "Aircraft painting: 200-300 kg of paint on widebody. Reduces drag 1-2%. Livery changes require stripping and reapplying.",
    "FAA certification: Type Certificate (airworthiness), Production Certificate (manufacturing), Airworthiness Certificate (individual aircraft).",
    "Part 23 (small aircraft) vs Part 25 (transport category): different complexity thresholds. Part 23 amendment 64 simplified certification.",
    "Aircraft saved by redundancy: 3 hydraulic systems (A, B, standby), 3 electrical buses, 4 flight computers with voting.",
    "Galley waste: no dumping mid-flight. Must be retained and emptied on ground. Safety regulation after waste killed engine on DC-10.",
    "Bird strike certification: engines must withstand bird impact. Fan blades tested with dead chickens at mach 0.8.",
    "Lightning protection: foil strip (strike diverter) on fuselage, conductive window edges, static wicks. Direct strike every 3,000 flight hours.",
    "HUD (Head-Up Display): projects flight data on canopy. Military origins. Enables lower landing minimums.",
    "FMS (Flight Management System): flight plan input, navigation, performance optimization. Database updated every 28 days (AIRAC cycle).",
    "EFIS (Electronic Flight Instrument System): PFD (primary flight display) and ND (navigation display). Replaced mechanical instruments.",
    "Winglets vs raked wingtips: winglets vertical, raked curved backward. Both reduce induced drag 4-5%. Blended winglet is hybrid.",
    "Variable stator (IV): inlet guide vanes adjust angle for different thrust levels. CFM56 turbofan uses variable stator in high compressor.",
    "Engine bleed air: 14% of compressor output for cabin pressurization, anti-ice, hydraulic pump. Reduced bleed improves fuel efficiency.",
    "Composite vs aluminum fuselage: aluminum fatigues (cracks), composites delaminate. Different inspection intervals and repair techniques.",
    "AOG (Aircraft on Ground): every hour costs $10,000-100,000. AOG spares pool, AOG technicians, ferry flights for parts.",
  ],
  medical: [
    "FDA Class I devices: general controls (sterilization, registration). 740,000 devices exempt from premarket notification (510(k)).",
    "FDA Class II devices: 510(k) required. Demonstrates substantial equivalence to predicate device. 6,000+ 510(k) submissions annually.",
    "FDA Class III devices: PMA (Premarket Approval) required. Clinical trials, bench testing, manufacturing quality system. Highest risk.",
    "ISO 13485: medical device QMS. Requires documented procedures, traceability, risk management (ISO 14971). Not ISO 9001.",
    "ISO 14971: risk management for medical devices. Risk = severity × probability. ALARP (as low as reasonably practicable) principle.",
    "Biocompatibility testing: ISO 10993 series. Cytotoxicity, sensitization, irritation, systemic toxicity. Sample extraction vs direct contact.",
    "Sterilization validation: SAL (Sterility Assurance Level) = 10⁻⁶ (1 in 1,000,000). EtO gas, steam, radiation, plasma methods.",
    "EtO (ethylene oxide) sterilization: 30-60°C process, gas diffuses into packaging. Requires aeration to remove residual EtO. Toxic/carcinogenic.",
    "Cleanroom classification: ISO Class 5 (100) is particles ≥0.5μm ≤ 3,520/m³. ISO Class 7 (10,000) for device assembly.",
    "Cleanroom pressure: positive pressure prevents contamination ingress. 10-15 Pa differential across HEPA filters. Gowning procedures critical.",
    "DHF (Design History File): documents design process per 21 CFR 820.30. Design reviews, verification, validation, risk analysis.",
    "Design controls: design input (requirements), output (specifications), verification (meets input), validation (meets user needs), changes.",
    "IPG (Implantable Pulse Generator): pacemaker/ICD. Battery (lithium-iodine, 8-10 year life), circuitry, header with IS-1/DF-4 connector.",
    "Pacemaker leads: 5-6 French (1.7-2mm) diameter. Active fixation (screw-in) vs passive (tines). Bipolar sensing reduces myopotential noise.",
    "ICD therapy: VF (ventricular fibrillation) shock (30-40 J), VT (ventricular tachycardia) anti-tachycardia pacing. Sensing: R-wave amplitude >5mV.",
    "TEE (Transesophageal Echocardiography): probe in esophagus, 5-10 MHz transducer, cross-sectional heart images. Ultrasound window close to heart.",
    "MRI safety: patients with pacemakers excluded (historically). MR-conditional devices have specific field strength limits (1.5T, 3T).",
    "CT dose: CTDI (Computed Tomography Dose Index). Typical head: 50 mGy, chest: 20 mGy. ALARA principle: As Low As Reasonably Achievable.",
    "X-ray imaging: kVp (kilovoltage peak) affects contrast, mA affects exposure time. Higher kVp = lower contrast, more penetration.",
    "DR (Digital Radiography): flat panel detector captures X-ray directly. CR (Computed Radiography) uses photostimulable phosphor plate.",
    "Ultrasound: piezoelectric crystal vibrates at 2-15 MHz. Higher frequency = better resolution, less penetration. Gel couples acoustic energy.",
    "HIPAA: health information privacy. Technical safeguards: encryption, access controls, audit logs. Physical, administrative safeguards also required.",
    "HIPAA BAA (Business Associate Agreement): required for any vendor handling PHI (Protected Health Information). Cloud providers, consultants.",
    "Unique Device Identification (UDI): FDA mandate. Device identifier (DI) + production identifier (lot, serial, expiration). Database: GUDID.",
    "510(k) predicate: device must be substantially equivalent to legally marketed predicate. Different intended use = different device category.",
    "De novo: pathway for novel devices without predicate. Interactive review process. Typically 8-12 months.",
    "Software as Medical Device (SaMD): IEC 62304 software lifecycle. Class A (no injury possible), B (non-serious injury), C (death/serious injury).",
    "IEC 62304: software development planning, requirements, architectural design, detailed design, unit/integration/system testing, release.",
    "Cybersecurity: FDA premarket guidance, postmarket management. SBOM (Software Bill of Materials), vulnerability disclosure, patching.",
    "Removable prosthodontics: full/partial dentures. Acrylic base (PMMA), metal framework (CoCr), artificial teeth. Retention: clasps, implants.",
    "Dental implants: osseointegration with bone. Surface treatments (SLA, hydrophilic) improve success. Loading protocol: immediate vs delayed.",
    "Orthopedic implants: titanium alloy (Ti-6Al-4V) for strength/biocompatibility. CoCr for wear surfaces. UHMWPE bearing surface.",
    "Hip replacement: femoral stem, femoral head, acetabular cup, liner. Ceramic-on-polyethylene most common. Ceramic-on-ceramic: silent, wear-resistant.",
    "Spinal fusion: pedicle screws, rods, interbody cage. PEEK vs titanium cage. Anterior (ALIF), Posterior (PLIF), Transforaminal (TLIF) approaches.",
    "Drug-eluting stents: sirolimus or paclitaxel drug. Polymer coating for controlled release. Bare metal (BMS) vs drug-eluting (DES).",
    "Surgical robotics: da Vinci system has 4 arms, endowrist instruments, 3D visualization. Precision, tremor filtration, teleoperation.",
    "3D printing in medicine: patient-specific implants, anatomical models for surgical planning, custom prosthetics. Materials: titanium, PEEK, resin.",
    "Hemodialysis: blood pump 200-500 mL/min, dialysate flow 500-800 mL/min. Urea clearance (K) × time (t) = Kt/V adequacy measure.",
    "Infusion pumps: syringe vs peristaltic. Flow accuracy ±5%. Occlusion alarm threshold: 10-15 psi. Alarms: air-in-line, upstream, downstream.",
    "Medical device packaging: peel-open pouch (Tyvek/poly), rigid tray, sterile barrier. Package integrity testing (dye penetration, bubble emission).",
  ],
  marine: [
    "IMO (International Maritime Organization): UN agency regulating shipping. SOLAS (safety), MARPOL (pollution), MLC (labor). Flag state enforcement.",
    "Classification societies: DNV, Lloyd's Register, ABS. Rules for hull strength, machinery, safety. Survey every 5 years (class renewal).",
    "Hull steel grades: AH (36 ksi yield), DH (36 ksi, -20°C), EH (36 ksi, -40°C). Higher strength: FQ47 (47 ksi yield).",
    "Corrosion protection: sacrificial anodes (zinc, aluminum) for underwater. Impressed current (ICCP) for above water. Coating systems (epoxy, vinyl).",
    "Ballast water management: IMO D-2 standard. UV or electrochlorination treatment. Discharge must contain <10 viable organisms/m³.",
    "Shaft alignment: laser alignment achieves <0.05 mm offset. Torsionally rigid coupling vs flexible. Propeller-induced vibration is key.",
    "Stern tube bearing: oil-lubricated rubber (white metal, PTFE). Water-lubricated composite for US Navy. Bearing length = 2-3 × diameter.",
    "Propeller design: Wageningen B-series for merchant ships, Kaplan for high-speed. Cavitation (vapor bubbles) damages blades, causes vibration.",
    "Rudder design: flap rudders improve maneuverability 30%. Boss and pintle type: pintle carries thrust. Becker: asymmetric for twin-screw.",
    "Ship stability: GM (metacentric height) positive for stability. Free surface effect reduces GM. Intact and damage stability calculations.",
    "Load line (Plimsoll): marks legal cargo capacity. Summer, Winter, Tropical freshwater marks. Based on deck line and freeboard.",
    "Gross tonnage (GT): internal volume measure, 1 GT = 2.83 m³. Net tonnage (NT): cargo/passenger revenue space. Determines fees/regulations.",
    "Vessel speed: slow steaming (10-15 knots) saves fuel. Economic speed ~14 knots. Full speed 20+ knots uses 2x fuel per mile.",
    "Main engine: MAN B&W two-stroke crosshead. Specific fuel oil consumption (SFOC): ~170 g/kWh. Engine efficiency ~50%.",
    "Auxiliary engines: 4-stroke medium-speed for ship service. Running at 80% load optimizes efficiency. Generators: 440V/60Hz or 400V/50Hz.",
    "Boiler: exhaust gas economizer (EGH) recovers waste heat. Auxiliary boiler for start-up. Composite boiler combines all functions.",
    "Shaft generator: PTO (power take-off) from main engine. 6-10 MW for hotel load. Variable speed for efficiency.",
    "Bow thruster: transverse thruster for maneuverment. 500-3,000 kW. Tunnel thruster vs azimuth thruster (rotates 360°).",
    "Navigation: ECDIS (Electronic Chart Display), AIS (Automatic Identification), RADAR/ARPA. Bridge resource management (BRM) training required.",
    "SOLAS Chapter V: watchkeeping, navigation equipment. Two-person bridge watch above 3,000 GT. SOLAS SOL (Safety of Life at Sea).",
    "MARPOL: Annex I (oil), II (chemicals), III (packaged goods), IV (sewage), V (garbage), VI (air pollution). Enforced by Port State Control.",
    "EEDI (Energy Efficiency Design Index): grams CO₂ per tonne-mile. Phase 3 (2025): 30% reduction from baseline. New buildings affected.",
    "SCR (Selective Catalytic Reduction): reduces NOx 80%. Urea injection into exhaust. Urea consumption ~5% of fuel consumption.",
    "Scrubber: exhaust gas scrubber removes SOx. Open loop (seawater) vs closed loop (caustic). Washwater discharge regulations vary.",
    "LNG as fuel: methane slip reduction critical. Dual-fuel engines: 90% gas, 10% pilot diesel. LNG tank: membrane vs spherical.",
    "Marpol Annex VI: global sulfur limit 0.5% (vs 3.5% previously). ECA (Emission Control Area): 0.1% in Baltic, North Sea, US/Canada coast.",
    "Cargo handling: containerized (TEU, FEU), bulk (ore, grain, coal), liquid (tanker, chemical). Stowage plan optimizes trim/stability.",
    "Container stowage: Bay plan (row × tier), reefer (refrigerated) plugs, heavy on bottom. Stow factor: m³/tonne.",
    "Roll-on/RoRo: vehicles on adjustable decks. LOA (length overall), beam, deck height critical. Stern ramp, bow ramp, side ramp types.",
    "Offshore: jack-up rig for shallow water (<150m), semi-sub for deep, drillship for ultra-deep. Mooring vs dynamic positioning (DP).",
    "Dynamic positioning (DP): thrusters automatically maintain position. DP-1 (single failure doesn't cause loss), DP-2 (any single failure OK), DP-3 (any double failure OK).",
    "Mooring lines: synthetic (nylon, polyester) vs wire. Breaking strength: 10-20% of working load. Safe working load (SWL) = 1/5 breaking.",
    "Anchor handling: Danforth, Navy, AC-14 types. Holding power: Danforth 5-10× weight. Drag embedment anchors (Bruce) 10-30× weight.",
    "Sailing yachts: displacement (hull speed ~1.34√LWL), semi-displacement, planing. Keel vs fin vs bulb. Lead vs cast iron vs ballast.",
    "Composite yachts: carbon fiber hull, foam core. Vacuum infusion reduces weight 20% vs wet layup. Post-cure at 80°C improves properties.",
    "Naval architecture: hydrostatics (Buoyancy), hydrodynamics (resistance, propulsion), structures (hull, deck), stability (intact, damage).",
    "Ship motion: roll (heeling), pitch (bow up/down), heave (vertical). Roll period: T = 2π√GM/ω². Metacentric height GM determines stability.",
  ],
  electronics: [
    "Resistor color code: 4-band (2 significant, 1 multiplier, 1 tolerance), 5-band (3 significant). Precision: 1%, 0.1%. SMD: 3-digit (E24), 4-digit (E96).",
    "Capacitor types: ceramic (C0G/NP0 stable, X7R/Y5V temperature), film (polyester, polypropylene), electrolytic (Al, tantalum). ESR matters.",
    "Inductor selection: saturation current (Isat), rated current (Irms), DCR (DC resistance), Q factor. Shielded vs unshielded for EMI.",
    "Op-amp specifications: offset voltage (Vio), input bias current (Ib), CMRR, PSRR, gain-bandwidth product (GBW). Stability with feedback.",
    "ADC resolution: ENOB (effective number of bits) accounts for noise. SNR = 6.02N + 1.76 dB for full-scale sine. DNL, INL specs.",
    "DAC: R-2R ladder vs sigma-delta. Resolution, settling time, spurious-free dynamic range (SFDR). Audio: 24-bit, 192 kS/s.",
    "PCB stackup: 4-layer (signal/GND/power/signal), 6-layer (embedded planes). Impedance control: microstrip, stripline. Dk tolerance ±2%.",
    "PCB design: 50Ω traces for RF, 90Ω differential pairs for USB/Ethernet. Return path on adjacent plane. Via stitching for ground.",
    "ESD protection: TVS diode (clamping), ESD protection IC (rail clamp). Human Body Model (HBM) 2kV, Machine Model (MM) 200V.",
    "EMI/EMC: radiated vs conducted emissions. Shielding, filtering, grounding. CISPR 11 (industrial), CISPR 32 (multimedia) standards.",
    "Switching regulators: buck (step-down), boost (step-up), buck-boost (inverting). Efficiency 90%+ vs linear regulator 40-60%.",
    "Buck converter design: inductor selection (L = (Vin-Vout)×D/(ΔIL×fsw)), input/output capacitors (ESR, ripple), feedback compensation.",
    "Thermal design: θJA (junction-to-ambient), θJC (junction-to-case). junction temp = power × θJA + ambient. Heatsink sizing.",
    "Solder paste: SAC305 (96.5Sn/3Ag/0.5Cu) standard. Lead-free requires higher temperature (217°C peak vs 183°C). Solderability affects yield.",
    "Reflow profile: ramp-up, soak (150-200°C), reflow (245°C peak), cooling. Soak stabilizes, reflow melts, cooling solidifies.",
    "IPC standards: IPC-A-610 (acceptability), IPC-J-STD-001 (soldering), IPC-6012 (board). Class 3 (high reliability) for aerospace/medical.",
    "Flex circuits: polyimide (Kapton) base, copper traces. Stiffener areas for connectors.动态 (dynamic) vs static flex.",
    "High-speed digital: signal integrity matters. Transmission line effects at length > λ/20. Reflection at impedance mismatch.",
    "SerDes:Serializer/Deserializer. 10 Gbps+ serial links. PCIe, USB, SATA, HDMI. Pre-emphasis, equalization compensate loss.",
    "Clock distribution: zero-delay buffer, clock fanout. Jitter accumulation. Spread spectrum (SSCG) reduces EMI 10-20 dB.",
    "Power supply sequencing: rail-by-rail turn-on/off. Voltage supervisor, sequencing IC. Margining for testing.",
    "Battery management: cell balancing (passive vs active), SOC estimation (coulomb counting, OCV), protection (OVP, UVP, OCP).",
    "Motor control: BLDC (sensorless, Hall), stepper (full, half, microstep). FOC (field-oriented control) for smooth torque. TI DRV8xxx, ST L6xxx.",
    "Microcontroller selection: processing (MIPS, DMIPS), memory (Flash, RAM), peripherals (ADC, timers, comms), power (active, sleep).",
    "ARM Cortex-M: M0/M0+ (ultra low power), M3/M4 (general purpose, DSP/FPU), M7 (high performance). Toolchain: ARM GCC, Keil, IAR.",
    "FPGA: LUT-based logic, block RAM, DSP slices, transceivers. Configuration: SRAM (volatile, fast), flash (non-volatile),antifuse (one-time).",
    "Signal conditioning: instrumentation amplifier (INA), operational amplifier (OPA), analog filter (Sallen-Key, Butterworth).",
    "Wireless: ISM band (433 MHz, 868 MHz, 2.4 GHz). LoRa (long range, low power), BLE (short range, paired), cellular (NB-IoT, LTE-M).",
    "Antenna design: dipole, monopole, patch, Yagi. Impedance 50Ω. VSWR < 2:1 for matching. Gain in dBi (vs isotropic) or dBd (vs dipole).",
    "RF design: Smith chart for matching, S-parameters (S11 reflection, S21 transmission), VSWR, return loss. 50Ω system impedance.",
    "Oscilloscope: bandwidth 5x signal frequency. Sampling ≥2x bandwidth. Memory depth affects long captures. Protocol decode useful.",
    "Logic analyzer: state/timing analysis. Protocol decode: I2C, SPI, UART, USB. Async serial requires sampling 4x faster than bit rate.",
    "Power analysis: current probe, electronic load, power analyzer. Efficiency = Pout/Pin. Power factor correction (PFC) for AC-DC.",
    "Schematic capture: hierarchical, modular. DRC (design rule check), ERC (electrical rule check). Simulation: SPICE, behavioral.",
    "BOM management: preferred parts, lifecycle status (active, NRND, obsolete), substitute parts, sourcing. DigiKey, Mouser, Arrow.",
  ],
  optics: [
    "Lens maker's equation: 1/f = (n-1)(1/R1 - 1/R2 + (n-1)d/(nR1R2)). Thick lens correction for lens thickness d.",
    "F-number (f/#): f/# = focal length / entrance pupil diameter. Lower f/# = faster lens, more light. f/1.4 vs f/2.8 is 4× light difference.",
    "Numerical aperture (NA): NA = n sin(θ). Determines resolution, light gathering. NA 0.95 vs 0.5 is 3.6× more resolution.",
    "Rayleigh criterion: resolution = 1.22 λ / (2 NA). λ=550nm, NA=1.4 (oil) gives 240 nm resolution. ~0.25 μm in best light microscopes.",
    "Diffraction limit: smallest resolvable feature. λ/2NA for practical imaging. Cannot resolve below this regardless of lens quality.",
    "Aberrations: spherical (off-axis), coma (rays at angle), astigmatism (tangential/sagittal focus), field curvature, distortion, chromatic.",
    "Lens design: aspheric surfaces reduce spherical aberration. Low-dispersion glass (ED, Fluorite) reduces chromatic aberration. Achromatic doublet.",
    "Anti-reflection coating: quarter-wave thickness (λ/4n). MgF2 coating on eyeglasses. Multi-layer AR for laser optics.",
    "Optical materials: N-BK7 (common, moderate dispersion), fused silica (UV grade), sapphire (scratch-resistant), CaF2 (UV/IR).",
    "Optical fibers: step-index (SMF28 single mode at 1310/1550nm), graded-index (multimode for short reach). NA 0.12-0.20.",
    "Fiber attenuation: 0.2 dB/km at 1550nm. Rayleigh scattering fundamental limit. Bending loss at small radii.",
    "Laser safety: Class 1 (safe), 2 (visible, blink reflex), 3B (hazardous), 4 (eye/skin burn). Power, wavelength, exposure time determine class.",
    "Laser beam quality: M² (beam parameter product). M²=1 is diffraction-limited. Focus spot = 4λf#/πw. Brightness = power/(λ²M⁴).",
    "Optical coherence: coherent (laser) vs incoherent (LED). Coherence length affects interferometry. Short coherence = 1 mm, long = meters.",
    "Polarization: linear, circular, elliptical. Polarizer (wire grid, dichroic), waveplate (quarter-wave, half-wave). Birefringence in crystals.",
    "Optical filters: longpass, shortpass, bandpass. Colored glass (absorption), dielectric (interference). Blocking 10⁻⁴ outside passband.",
    "Beamsplitter: plate (50/50), cube (cemented), polarizing (Glan-Thompson). Wavelength sensitivity in plate type.",
    "Detector types: CCD (charge-coupled), CMOS (active pixel), InGaAs (SWIR), MCT (LWIR), PMT (photomultiplier, single photon).",
    "Quantum efficiency: CCD/CMOS 40-80% (back-illuminated best). PMT 20-30% but gain 10⁶. Sensitivity: photons/pW.",
    "Interferometry: Michelson, Mach-Zehnder, Fabry-Perot. Surface figure measurement λ/20 (P-V). Phase shifting for 3D surface.",
    "Optical metrology: contact (stylus) vs non-contact (interferometry, confocal). White light scanning, confocal microscopy, OCT.",
    "Free-space optics (FSO): laser communication through air. Affected by fog, rain, scintillation. Free space loss = (λ/4πd)².",
    "Telescope design: refractor (lens) vs reflector (mirror). Newtonian, Cassegrain, Schmidt-Cassegrain. Aperture determines resolution/light grasp.",
    "Night vision: Image Intensifier (I²) amplifies ambient light 30,000x. Gen III GaAs photocathode, microchannel plate. Flooded phosphor screen.",
    "Thermal imaging: cooled (MCT, QWIP) vs uncooled (microbolometer). Sensitivity 30 mK typical. Emissivity correction needed.",
    "Endoscopy: fiber bundles (2000-10000 fibers) vs chip-on-tip CMOS. 2-10 mm diameter. White light + NBI (narrow band imaging).",
    "Confocal microscopy: point illumination, reject out-of-focus light. Optical sectioning ~0.5 μm. Z-stacking for 3D reconstruction.",
    "Optical coherence tomography: low-coherence interferometry. 1-15 μm axial resolution. Medical: ophthalmology, cardiology. In-vivo imaging.",
    "LiDAR: time-of-flight (direct) vs FMCW (frequency modulated). 905 nm (silicon) vs 1550 nm (InGaAs) laser. Scanning: MEMS, galvanometer, OPA.",
    "Structured light: projected pattern, triangulate distortion. Phase shift gives sub-pixel accuracy. Face ID, 3D scanning.",
    "Holography:记录的干涉パターン. Digital holography, holographic display. Point cloud + phase reconstruction.",
    "Diffractive optics: DOE (diffractive optical element). Kinoform surface relief. Grating, diffuser, beam shaper in single element.",
    "Nonlinear optics: second-harmonic generation (SHG), sum-frequency (SFG), optical parametric oscillator (OPO). Requires phase matching (birefringent, quasi-phase).",
    "Adaptive optics: deformable mirror corrects wavefront. Shack-Hartmann sensor measures aberration. Astronomy, retinal imaging.",
    "Photonics: planar lightwave circuit (PLC), silicon photonics. Modulator, AWG (arrayed waveguide), Germanium photodetector. CMOS co-packaged.",
    "Fiber optics communications: DWDM (dense wavelength division), 100G/400G coherent. EDFA (erbium-doped fiber amplifier).",
    "Lidar classification: Class 1 eye-safe at all times. 905 nm limited to 0.33 mW (pulsed). 1550 nm higher power allowed (eye-safe at cornea).",
    "Optical bench design: kinematic (3-point), dovetail, breadboard. Vibration isolation: air table, active damping. Thermal stability critical.",
  ],
  manufacturing: [
    "CNC machining: 3-axis (XYZ), 4-axis (add rotary), 5-axis (simultaneous). Tolerance: ±0.025mm typical, ±0.005mm precision.",
    "CNC programming: G-code (linear, circular interpolation), M-code (misc functions). CAM software generates toolpaths. Post-processing for specific machine.",
    "Tool materials: HSS (high-speed steel, 600°C max), carbide (tipped or solid, 900°C), ceramic (1500°C), CBN/diamond (2000°C+).",
    "Cutting parameters: cutting speed (SFM m/min), feed per tooth (IPT mm), depth of cut (DOC). Chip load = feed/rev/tooth.",
    "Tool life: Taylor equation VCT^n = C. Cutter wear (VB), flank wear, crater wear. Tool change: time vs cost tradeoff.",
    "Turning: lathe operations. Facing, turning, boring, parting, threading. Bar feeder for long runs. Live tooling for complex parts.",
    "Milling: end mill, face mill, slot mill. Trochoidal milling for high metal removal. HSM (high-speed machining) for surface finish.",
    "EDM (Electrical Discharge Machining): wire EDM (0.025mm kerf), sinker EDM (cavities, round holes). No tool contact, no mechanical stress.",
    "Laser cutting: CO2 (10.6 μm, thick steel), fiber (1.07 μm, thin metals, nonmetals). N₂ assist gas for clean edge, O₂ for fast.",
    "Waterjet: abrasive waterjet (AWJ) for any material. 0.1-0.5mm kerf. No heat-affected zone. 400 MPa pump pressure.",
    "Sheet metal: punch/laser combo, press brake forming, roll forming. K-factor 0.33-0.50 for bend allowance. Springback compensation.",
    "Sheet metal design: bend relief, hole-to-edge, louver, dimple. Hem (edge fold) adds stiffness. Countersunk holes for fasteners.",
    "Injection molding: 50-200 MPa injection pressure. Cycle time: fill (1-2s), pack (2-3s), cool (10-20s), eject (1s).",
    "Mold design: cavity (female), core (male), runner system, cooling channels. H13 tool steel for 1M+ shots. ejection: pins, sleeve, air.",
    "Plastic materials: ABS (impact), polycarbonate (strength), nylon (wear), PE/PP (flexible). Shrinkage 0.3-1.5% must account.",
    "3D printing: FDM (fused deposition), SLA (stereolithography), SLS (selective laser sintering), MJF (multi jet fusion), DMLS (metal).",
    "Metal 3D printing: DMLS/SLM (laser melt), EBM (electron beam). Ti-6Al-4V, AlSi10Mg, stainless steel. Post-machine critical surfaces.",
    "Additive vs subtractive: AM good for complex geometry, mass reduction, part consolidation. Jigs/fixtures, medical implants, aerospace.",
    "Quality control: CMM (coordinate measuring machine), optical scanner, surface profilometer. GD&T per ASME Y14.5.",
    "CMM probing: touch trigger (ruby sphere), scanning (continuous contact), non-contact (laser, white light). Stylus selection critical.",
    "Surface roughness: Ra (arithmetical mean), Rz (maximum peak-to-valley). Ra 1.6 μm typical for machined, Ra 0.8 for functional surfaces.",
    "Gaging: go/no-go (functional), variable (quantitative). Pin gages, thread gages, bore gages, surface plates.",
    "Statistical process control: X-bar, R charts. Cp, Cpk capability indices. Ppk < 1.33 indicates non-capable process.",
    "Tolerance analysis: worst-case (statistically impossible) vs RSS (realistic). Simulation: Monte Carlo for complex assemblies.",
    "Assembly methods: fasteners (screws, rivets), adhesives (structural, threadlocker), welding (spot, MIG, TIG, resistance), snap-fits.",
    "Fastener selection: socket head cap screw (strength), hex bolt (general), rivet (permanent). Torque-tension relationship critical.",
    "Joining: soldering (Sn63/Pb37 vs SAC305), brazing (capillary flow), welding (fusion). Flux removes oxide, promotes wetting.",
    "Quality management: ISO 9001 (QMS), IATF 16949 (automotive), AS9100 (aerospace). Audits, corrective action, continuous improvement.",
    "Lean manufacturing: eliminate waste (TIMWOODS: Transport, Inventory, Motion, Waiting, Overproduction, Overprocessing, Defects, Skills).",
    "Six Sigma: DMAIC process. 3.4 defects per million opportunities (DPMO). Statistical tools: ANOVA, regression, DOE.",
    "Kaizen: continuous improvement. Small, incremental changes. Everyone's responsibility. Suggestion system, kaizen events.",
    "Kanban: pull system for inventory. Cards signal replenishment. Reduces WIP, improves flow. Supermarket method at Toyota.",
    "5S: Sort, Set in order, Shine, Standardize, Sustain. Workplace organization. Visual management. Red tag method for sort.",
    "Poka-yoke: error-proofing. Mistake-proofing fixtures, sensors, guides. Prevent defects at source. 100% inspection via sensors.",
    "OEE (Overall Equipment Effectiveness): Availability × Performance × Quality. World-class: 85%. Availability: run time/scheduled time.",
    "SMED (Single-Minute Exchange of Die): reduce changeover time. Internal (must stop machine) vs external (can prepare while running).",
    "TPM (Total Productive Maintenance): operator-led daily maintenance. Autonomous maintenance, planned maintenance, focused improvement.",
    "Supply chain: lean (pull-based) vs agile (responsive to demand changes). Bullwhip effect: demand variance amplifies upstream.",
    "Inventory: FIFO (first-in-first-out), LIFO (last-in-first-out), ABC analysis. Turnover ratio, days on hand, carrying cost.",
    "Capacity planning: theoretical (equipment × time), effective (theoretical × utilization). Capacity requirements planning (CRP).",
    "Production scheduling: Gantt chart, finite capacity scheduling. Bottleneck scheduling. Drum-buffer-rope (DBR) for constraints.",
    "Cost of quality: prevention (training), appraisal (inspection), internal failure (rework), external failure (warranty, returns).",
    "Design for manufacturing: minimize operations, maximize symmetry, use standard components. DFM checklist, DFA analysis.",
  ],
  thermal: [
    "Conduction: Fourier's law Q = kA dT/dx. Metals (k=400 W/m·K for copper) vs insulators (k=0.02 W/m·K for foam). Contact resistance.",
    "Convection: Newton's law Q = hA ΔT. Natural (buoyancy-driven) vs forced (fan/pump). Correlations: Nusselt number Nu = hL/k.",
    "Radiation: Stefan-Boltzmann Q = εσAT⁴. Emissivity 0-1. Gray body approximation. View factor for surfaces.",
    "Heat transfer coefficient: natural convection 5-25 W/m²·K. Forced air 25-250 W/m²·K. Boiling 2,500-50,000 W/m²·K.",
    "Thermal resistance: θ = ΔT/Q. Series: add resistances. Parallel: conductance sum. Heat sink: θ_HS = θ_JC + θ_CS + θ_SA.",
    "Heat sink design: fin efficiency η_f = tanh(mL)/(mL). m = sqrt(2h/(kδ)). More fins better until diminishing returns.",
    "Thermal interface material (TIM): thermal gap filler, phase change, indium. Conductivity 1-50 W/m·K. Bond line thickness critical.",
    "Peltier (thermoelectric): Seebeck effect for power generation, Peltier effect for cooling. COP (coefficient of performance) ~0.5.",
    "Heat pipes: capillary action drives working fluid.wicked. No moving parts. 10x conductivity of solid copper. 100W-10kW capability.",
    "Joule heating: P = I²R. Resistive heating in components. Fuse blow, trace sizing, heater design.",
    "Thermal expansion: α (CTE) for materials. CTE mismatch causes stress. CTE Si=2.6, Cu=17, Al=23, FR4=14 (x10⁻⁶/°C).",
    "Bimetallic strip: two metals with different CTE bonded. Temperature measurement (thermometer), actuation (thermostat).",
    "Thermodynamics: 1st law (energy conservation), 2nd law (entropy increases). Carnot efficiency: 1 - Tc/Th. Heat engines limited.",
    "Refrigeration cycle: compressor, condenser, expansion valve, evaporator. COP = Q_L/W_in. R-134a, R-410A, CO₂ (transcritical).",
    "Heat exchangers: counterflow most efficient. LMTD (log-mean temp difference). NTU method for heat exchanger sizing.",
    "Heat exchanger types: shell-and-tube (robust), plate (compact), finned-tube (airside), regenerative (rotating matrix).",
    "Finned surfaces: increase area. Fin efficiency = tanh(mL)/(mL). Counterflow in tube, crossflow in radiator.",
    "Thermal boundary layer: δ ~ x^(1/2) for laminar. Turbulent: δ ~ x^(1/5). Nusselt number correlates to Reynolds/Prandtl.",
    "Boiling curve: natural convection → nucleate → transition → film. CHF (critical heat flux) is maximum nucleate boiling.",
    "Condensation: filmwise (most common) vs dropwise (promoted). Nusselt theory for vertical plates. Condensation coefficient γ ~ 0.7.",
    "Thermal insulation: minimizes heat flow. Fiberglass, foam, mineral wool. R-value = Δx/k. Blown insulation rated by R-value/inch.",
    "Thermal radiation in space: no convection. Heat radiates to 3K background. MLI (multi-layer insulation) blocks radiation. Heat pipes critical.",
    "Thermal management in electronics: junction temp Tj = P × θ_JA + Ta. Max Tj typically 125-150°C. Derating curves for reliability.",
    "Thermal runaway: exothermic reactions accelerate heating. Battery, chemical, nuclear. Safety: venting, containment, containment.",
    "CFD for thermal: mesh near walls fine. Turbulence model choice important. Conjugate heat transfer (solid + fluid).",
    "Thermal shock: rapid temperature change causes stress. Alumina ceramic sensitive. Quench hardening of steel. Thermal fatigue failure.",
    "Heat treatment of metals: annealing (soften), normalizing (refine grain), quenching (harden), tempering (toughen). TTT diagrams.",
    "Solder reflow: peak 235-245°C. Soak zone 150-200°C. Heating rate <3°C/sec. Cooling <6°C/sec prevent warpage.",
    "Thermal paste: silicone vs metal vs ceramic. Thermal conductivity 1-10 W/m·K. Pump-out (dry out) over time. Reapplication needed.",
    "Heat sink attachment: clip, screw, spring, thermal tape. Contact pressure affects contact resistance. TIM in between.",
    "LED thermal: lumens depreciate with Tj. 10°C rise halves lifetime. Phosphor conversion less efficient at high Tj.",
    "CPU/GPU cooling: heat spreader (IHS), heat pipe, fan (Hsf), liquid cooling (waterblock, pump, radiator). TDP rating determines sizing.",
    "Thermosyphon: passive two-phase loop. Wick structure drives circulation. Up to 500W passive. No pump needed.",
    "JEDEC standards: thermal measurement (θ_JC, θ_JA), junction temperature. JESD51 series. Thermal simulation vs实测.",
    "Thermoelectric generator (TEG): waste heat recovery. Seebeck coefficient S (V/K). ZT = S²σT/(k). Higher ZT = better efficiency.",
    "Pyrometry: non-contact temperature. Infrared thermometer, thermal camera. Emissivity setting critical for accuracy.",
    "Thermal fuse: one-time protection. Melting alloy (73°C-240°C). Overheat protection for motors, transformers, batteries.",
    "Heat dissipation in PCB: thermal vias, plane layers, thick copper (2 oz/4 oz). PCB thermal conductivity ~0.3-2 W/m·K.",
    "Cryogenic cooling: LN2 (77K), LHe (4.2K), cryocoolers (Stirling, Gifford-McMahon). Superconductivity, quantum computing.",
    "Thermal stress analysis: FEA with temperature-dependent material properties. ΔT causes strain: ε = αΔT. Constrained = stress.",
    "Fire protection: fire resistance rating (1-4 hours). Intumescent coatings expand on heat. Active (sprinklers) vs passive (barriers).",
    "Thermal energy storage: phase change materials (PCM), molten salt. Heat battery for buildings, solar thermal power plants.",
    "Heat recovery: exhaust heat recovery (HRSG), heat pump (COP >1), thermoelectric (Seebeck). Waste heat to power (WHR).",
  ],
}

/** Keywords mapped to their fact pool key */
const KEYWORD_MAP: [string[], string][] = [
  [["rocket", "thrust", "nozzle", "propellant", "engine mount", "propulsion", "launch"], "rocket"],
  [["satellite", "cubesat", "orbit", "space", "leo", "deployment", "solar panel rail"], "satellite"],
  [["drone", "uav", "quadcopter", "octocopter", "propeller", "multirotor", "gimbal"], "drone"],
  [["ev", "battery", "motor", "electric vehicle", "bms", "charging", "busbar", "cooling channel"], "ev"],
  [["robot", "arm", "joint", "actuator", "gripper", "servo", "harmonic", "encoder", "wrist"], "robot"],
  [["aircraft", "airplane", "jet", "turbine", "fuselage", "wing", "landing gear", "cockpit", "flight control", "avionics", "faa", "imo", "pilot"], "aerospace"],
  [["medical", "implant", "surgical", "device", "fda", "iso 13485", "pacemaker", "diagnostic", "therapeutic", "biocompatible", "prosthetic", "dental", "dialysis"], "medical"],
  [["ship", "vessel", "hull", "propeller", "marine", "naval", "ballast", "mooring", "cargo", "offshore", "oil rig", "submarine", "yacht"], "marine"],
  [["pcb", "circuit", "resistor", "capacitor", "transistor", "ic", "semiconductor", "solder", "voltage", "current", "analog", "digital", "rf", "emc", "esd"], "electronics"],
  [["lens", "optical", "laser", "photonics", "telescope", "microscope", "fiber", "polarization", "diffraction", "interference", "sensor", "imaging", "infrared", "imaging"], "optics"],
  [["cnc", "machining", "milling", "turning", "injection molding", "3d printing", "additive", "mold", "tooling", "quality", "gd&t", "cmi", "cmk", "oee"], "manufacturing"],
  [["thermal", "heat", "cooling", "temperature", "heat sink", "thermodynamics", "conduction", "convection", "radiation", "insulation", "hvac", "refrigeration", "heat exchanger", "thermal management"], "thermal"],
]

/**
 * Selects the best fact pool based on keyword matching in the subject string.
 */
export function selectFactPool(subject: string): string[] {
  const lower = subject.toLowerCase()
  let bestMatch = "default"
  let bestScore = 0

  for (const [keywords, poolKey] of KEYWORD_MAP) {
    const score = keywords.filter(kw => lower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestMatch = poolKey
    }
  }

  return SUBJECT_FACT_POOLS[bestMatch] ?? SUBJECT_FACT_POOLS.default
}

interface CadLabProgressProps {
  /** Array of progress status lines from the operation */
  lines: string[]
  /** Whether the operation is currently running */
  isActive: boolean
  /** Type of operation for context-specific messaging */
  operationType: "research" | "breakdown" | "generate" | "batch"
  /** The user's subject input, used for keyword-matched educational content */
  subject?: string
}

/**
 * CadLabProgress — Three-tier educational progress experience.
 *
 * @description Tier 1 explains what the AI is doing now. Tier 2 teaches
 * domain-specific engineering facts matched to the user's subject.
 * Tier 3 annotates individual progress lines with context.
 */
export function CadLabProgress({ lines, isActive, operationType, subject = "" }: CadLabProgressProps) {
  const [factIndex, setFactIndex] = useState(0)
  const [explainerIndex, setExplainerIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const factPool = useMemo(() => selectFactPool(subject), [subject])
  const explainers = useMemo(
    () => OPERATION_EXPLAINERS[operationType] ?? OPERATION_EXPLAINERS.generate,
    [operationType]
  )

  // Rotate engineering facts every 8 seconds
  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % factPool.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [isActive, factPool])

  // Rotate operation explainers every 12 seconds
  useEffect(() => {
    if (!isActive) return
    setExplainerIndex(0)
    const interval = setInterval(() => {
      setExplainerIndex((prev) => (prev + 1) % explainers.length)
    }, 12000)
    return () => clearInterval(interval)
  }, [isActive, explainers])

  // Track elapsed time
  useEffect(() => {
    if (!isActive) {
      setElapsedSeconds(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isActive])

  // Auto-scroll to latest progress line
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines.length])

  if (!isActive && lines.length === 0) return null

  // Batch operations show real per-module progress in the batch grid instead.
  const isBatch = operationType === "batch"

  // Stepped progress: for breakdown, estimate ~8 micro-steps before completion
  const estimatedSteps = operationType === "breakdown" ? 8 : operationType === "research" ? 5 : 4
  const steppedProgress = isActive
    ? Math.min(90, Math.round((lines.length / estimatedSteps) * 100))
    : (lines.length > 0 ? 100 : 0)

  return (
    <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/20 to-background overflow-hidden">
      <CardContent className="pt-6 space-y-4">
        {/* Header with operation label and elapsed timer */}
        {isActive && !isBatch && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center">
                  <Activity className="h-4 w-4 text-international-orange" />
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-international-orange animate-pulse" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {operationType === "research" ? "Researching your product" :
                   operationType === "breakdown" ? "Mapping sub-assemblies" :
                   "Generating parametric CAD"}
                </span>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono tabular-nums">
                <Clock className="h-3 w-3" />
                {elapsedSeconds}s
              </span>
            </div>

            {/* Stepped progress bar — advances as real work completes */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-international-orange rounded-full transition-all duration-700 ease-out"
                style={{ width: `${steppedProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed state header */}
        {!isActive && lines.length > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            <span className="text-sm font-medium text-foreground">
              {operationType === "research" ? "Research complete" :
               operationType === "breakdown" ? "Sub-assembly mapping complete" :
               operationType === "batch" ? "Batch generation complete" :
               "Generation complete"}
            </span>
          </div>
        )}

        {/* Tier 1: Operation explainer — what the system is doing at a high level */}
        {isActive && (
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            {explainers[explainerIndex]}
          </p>
        )}

        {/* Live activity feed — each step appears as it happens */}
        {lines.length > 0 && (
          <div
            ref={scrollRef}
            className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin"
          >
            {lines.map((line, i) => {
              const isLast = i === lines.length - 1
              const isComplete = !isLast || !isActive
              return (
                <div
                  key={`${i}-${line.slice(0, 20)}`}
                  className="flex items-start gap-2 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300"
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success flex-shrink-0 mt-0.5" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 text-international-orange animate-spin flex-shrink-0 mt-0.5" />
                  )}
                  <span className={isComplete ? "text-muted-foreground text-xs" : "text-foreground text-xs font-medium"}>
                    {line}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Tier 2: Subject-matched engineering fact */}
        {isActive && (
          <div className="flex items-start gap-2.5 pt-3 border-t border-international-orange/10">
            <GraduationCap className="h-4 w-4 text-international-orange flex-shrink-0 mt-0.5" />
            <div className="min-h-[48px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-international-orange mb-1">Engineering Insight</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {factPool[factIndex]}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

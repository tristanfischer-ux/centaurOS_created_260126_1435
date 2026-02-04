-- =============================================
-- MIGRATION: Enhance Rockets & Launch Vehicles Pack Task Descriptions
-- =============================================
-- Updates 27 task descriptions across 5 rocket packs with:
-- - What to do (actionable steps)
-- - Official resources (verified links)
-- - Key details (timeline/requirements)
-- Generated: February 2026

-- =============================================
-- PACK 1: Propulsion System Development (6 tasks)
-- Pack ID: 22222222-2222-2222-2222-000000000001
-- =============================================

-- Task 1: Define Propulsion Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Document thrust requirements: sea-level thrust, vacuum thrust, thrust-to-weight ratio target
- Specify specific impulse (Isp) targets for your propellant combination and chamber pressure
- Define burn time, throttling range (if required), and number of restarts
- Establish mass budget for complete propulsion system including tanks
- Document operating envelope: altitude, temperature, vibration environment

**Official resources:**
- [NASA SP-125: Design of Liquid Propellant Rocket Engines](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19710019929.pdf) - Classic NASA reference by Huzel & Huang
- [Rocket Propulsion Elements, 10th Ed](https://www.wiley.com/en-us/Rocket+Propulsion+Elements,+10th+Edition-p-00397021) - Sutton & Biblarz textbook (March 2026)
- [NASA Propulsion Technology Assessment](https://science.nasa.gov/resource/guidance-navigation-and-control-technology-assessment-onboard-guidance-navigation-and-control) - Latest NASA propulsion guidance

**Key details:**
- Timeline: 2-3 weeks for comprehensive requirements document
- Deliverable: Propulsion Requirements Document (PRD) with quantified values
- Requires: Mission profile, vehicle mass budget, trajectory analysis inputs
- Decision: Thrust class drives entire development timeline and cost

---
Verified: February 2026'
WHERE title = 'Define Propulsion Requirements'
AND pack_id = '22222222-2222-2222-2222-000000000001';

-- Task 2: Select Propellant Combination
UPDATE public.pack_items
SET description = '**What to do:**
- Evaluate propellant options against your Isp requirements: LOX/RP-1 (~300s), LOX/LH2 (~450s), LOX/CH4 (~360s)
- Assess handling complexity: cryogenic vs storable, toxicity, ignition characteristics
- Analyze propellant density for tank sizing and vehicle mass fraction
- Consider availability, cost, and ground support equipment requirements
- Review combustion stability characteristics for your chamber size

**Official resources:**
- [NASA SP-125: Propellant Selection](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19710019929.pdf) - Chapter 2 covers propellant properties
- [Rocket Propulsion Elements](https://www.wiley.com/en-us/Rocket+Propulsion+Elements,+10th+Edition-p-00397021) - Chapters 5-7 on liquid propellants
- [NASA LOX/RP-1 Combustion Research](https://ntrs.nasa.gov/citations/19890006608) - High-pressure calorimeter chamber test data

**Key details:**
- Timeline: 1-2 weeks for trade study, longer if testing required
- LOX/RP-1: Most common for first stages, well-understood, ~300s Isp
- LOX/CH4: Growing popularity (SpaceX Raptor, BE-4), good balance of Isp and density
- LOX/LH2: Highest Isp but lowest density, complex handling, best for upper stages
- Hypergolics: Self-igniting but toxic, used for spacecraft maneuvering

---
Verified: February 2026'
WHERE title = 'Select Propellant Combination'
AND pack_id = '22222222-2222-2222-2222-000000000001';

-- Task 3: Design Combustion Chamber
UPDATE public.pack_items
SET description = '**What to do:**
- Size chamber for target thrust and chamber pressure (typically 500-3000 psia for modern engines)
- Design injector: select pattern (impinging, coaxial, pintle), optimize atomization and mixing
- Choose cooling approach: regenerative (fuel or oxidizer), film, ablative, or radiation
- Design chamber contraction ratio and throat geometry for stable combustion
- Specify materials: copper alloys for high heat flux, nickel superalloys for structural

**Official resources:**
- [NASA SP-125: Thrust Chamber Design](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19710019929.pdf) - Chapters 4-5 on chamber and injector design
- [NASA LOX/RP-1 Heat Transfer Research](https://ntrs.nasa.gov/citations/19890006608) - Heat flux data for LOX/RP-1 at 600-2000 psia
- [NASA LOX Cooling Studies](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19900013289.pdf) - Liquid oxygen as coolant for high-pressure engines

**Key details:**
- Timeline: 4-8 weeks for preliminary design, longer for detailed CFD analysis
- Chamber pressure directly affects Isp and thrust-to-weight ratio
- Cooling design is often the most challenging aspect of engine development
- Injector design drives combustion stability and efficiency (c* efficiency)
- Plan for multiple injector iterations during development testing

---
Verified: February 2026'
WHERE title = 'Design Combustion Chamber'
AND pack_id = '22222222-2222-2222-2222-000000000001';

-- Task 4: Develop Feed System
UPDATE public.pack_items
SET description = '**What to do:**
- Design propellant tanks: select materials, calculate wall thickness for MEOP and safety factors
- Choose feed system architecture: pressure-fed, turbopump, or electric pump
- Size feed lines for required flow rates with acceptable pressure drop
- Design pressurization system: helium, autogenous, or combination
- Specify valves: main valves, isolation valves, check valves, relief valves

**Official resources:**
- [NASA SP-125: Feed System Design](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19710019929.pdf) - Chapters 6-8 on turbopumps, valves, and tanks
- [NASA-STD-5001: Structural Factors of Safety](https://standards.nasa.gov/standard/NASA/NASA-STD-5001) - Pressure vessel design requirements
- [MMPDS Handbook](https://www.mmpds.org/) - Material properties for tank design (aluminum, steel, composites)

**Key details:**
- Timeline: 4-6 weeks for preliminary design, depends on complexity
- Pressure-fed: Simple but heavy, limited to low chamber pressures (~300 psia)
- Turbopump-fed: Complex but enables high chamber pressures and better performance
- Tank mass fraction is critical to vehicle performance (aim for >90% propellant)
- Pressurization system sizing depends on tank volume and mission duration

---
Verified: February 2026'
WHERE title = 'Develop Feed System'
AND pack_id = '22222222-2222-2222-2222-000000000001';

-- Task 5: Build and Test Engine
UPDATE public.pack_items
SET description = '**What to do:**
- Manufacture engine components: chamber, injector, turbopump (if applicable), valves
- Build propellant feed system with instrumentation for pressure, temperature, flow rate
- Conduct water flow testing of injector for spray pattern verification
- Perform cold flow testing with inert propellants to verify feed system
- Execute hot-fire test series: ignition tests, short duration, full duration, off-nominal

**Official resources:**
- [NASA Stennis Space Center Hot Fire Testing](https://nasa.gov/stennis/rs-25) - RS-25 test procedures and lessons learned
- [NASA Rocket Engine Test Facility Procedures](https://nasa.gov/rocket-engine-test-facility-conducting-a-test) - Test stand operation and safety
- [NASA SP-125: Engine Testing](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19710019929.pdf) - Test planning and data analysis

**Key details:**
- Timeline: 8-16 weeks depending on test frequency and success rate
- Expect 20-50 hot-fire tests for new engine development
- Start with short burns (1-5 seconds) before attempting full duration
- Gimbaling tests validate thrust vector control if required
- Document all anomalies and conduct thorough failure analysis

---
Verified: February 2026'
WHERE title = 'Build and Test Engine'
AND pack_id = '22222222-2222-2222-2222-000000000001';

-- Task 6: Qualify Propulsion System
UPDATE public.pack_items
SET description = '**What to do:**
- Complete qualification test matrix: vibration, shock, thermal cycling, life testing
- Conduct acceptance tests on flight hardware with defined pass/fail criteria
- Execute full mission duty cycle testing including restarts if required
- Document all test results and create propulsion system databook
- Obtain range safety approval for propulsion system

**Official resources:**
- [NASA-STD-5001: Test Factors of Safety](https://standards.nasa.gov/standard/NASA/NASA-STD-5001) - Qualification and acceptance test requirements
- [14 CFR Part 450](https://www.ecfr.gov/current/title-14/chapter-III/subchapter-C/part-450) - FAA flight safety requirements for propulsion
- [ECSS-E-ST-32C: Structural Qualification](https://ecss.nl/standard/ecss-e-st-32c-rev-1-structural-general-requirements/) - European qualification standards

**Key details:**
- Timeline: 4-8 weeks for qualification test campaign
- Qualification hardware is typically not used for flight
- Flight acceptance testing performed on each flight unit
- Maintain traceability from requirements to test results
- Range safety review required before first flight

---
Verified: February 2026'
WHERE title = 'Qualify Propulsion System'
AND pack_id = '22222222-2222-2222-2222-000000000001';

-- =============================================
-- PACK 2: Avionics & Flight Computer (6 tasks)
-- Pack ID: 22222222-2222-2222-2222-000000000002
-- =============================================

-- Task 1: Define GNC Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Specify guidance accuracy: target orbit insertion accuracy (position and velocity)
- Define navigation requirements: position accuracy, velocity accuracy, update rates
- Document control requirements: stability margins, pointing accuracy, response time
- Establish sensor requirements: IMU grade, GPS/GNSS requirements, star tracker needs
- Define failure tolerance and redundancy architecture

**Official resources:**
- [NASA GNC Best Practices](https://ntrs.nasa.gov/citations/20230005922) - NASA Engineering and Safety Center guidance
- [NASA Marshall GNC Capabilities](https://www.nasa.gov/wp-content/uploads/2015/04/gnc.pdf) - GNC development processes and capabilities
- [NASA GNC Technology Assessment](https://science.nasa.gov/resource/guidance-navigation-and-control-technology-assessment-onboard-guidance-navigation-and-control) - State-of-the-art GNC technologies

**Key details:**
- Timeline: 2-3 weeks for requirements document
- Guidance: Where to go (trajectory planning, steering commands)
- Navigation: Where you are (state estimation from sensors)
- Control: How to get there (actuator commands for stability)
- Requirements drive sensor selection and computing requirements

---
Verified: February 2026'
WHERE title = 'Define GNC Requirements'
AND pack_id = '22222222-2222-2222-2222-000000000002';

-- Task 2: Select Flight Computer Hardware
UPDATE public.pack_items
SET description = '**What to do:**
- Select processor: radiation-tolerant vs COTS with fault tolerance, performance requirements
- Choose IMU: tactical grade (1 deg/hr) vs navigation grade (0.01 deg/hr) based on mission
- Specify GPS receiver: single vs dual frequency, anti-jamming requirements
- Select data bus architecture: MIL-STD-1553, SpaceWire, Ethernet, custom
- Design power distribution and filtering for avionics

**Official resources:**
- [NASA GNC Sensor Selection](https://www.nasa.gov/wp-content/uploads/2015/04/gnc.pdf) - Sensor architectures and selection criteria
- [DO-178C Software Certification](https://www.rtca.org/do-178/) - Avionics software development assurance
- [MathWorks HIL Testing Guide](https://www.mathworks.com/discovery/hardware-in-the-loop-hil.html) - Hardware selection for HIL validation

**Key details:**
- Timeline: 2-4 weeks for hardware selection and procurement planning
- COTS processors cheaper but require additional fault tolerance design
- IMU accuracy drives navigation error budget and GPS/tracking requirements
- Consider hardware obsolescence and long-term availability
- Plan for spares and ground test units in procurement

---
Verified: February 2026'
WHERE title = 'Select Flight Computer Hardware'
AND pack_id = '22222222-2222-2222-2222-000000000002';

-- Task 3: Develop Navigation Algorithms
UPDATE public.pack_items
SET description = '**What to do:**
- Implement inertial navigation: strapdown integration of accelerometer and gyro data
- Design Kalman filter for sensor fusion: IMU + GPS + optional tracking data
- Develop state estimation for position, velocity, and attitude
- Handle sensor failures: fault detection, isolation, and recovery (FDIR)
- Implement coordinate frame transformations: body to inertial to Earth-fixed

**Official resources:**
- [NASA Kalman Filter Heritage](https://www.ion.org/publications/abstract.cfm?articleID=966) - Apollo and Shuttle navigation algorithms
- [NASA Kalman Filtering for Attitude](https://ntrs.nasa.gov/citations/19820034231) - Spacecraft attitude estimation techniques
- [Adaptive Extended Kalman Filter](https://www.sciencedirect.com/science/article/abs/pii/S009457652030610X) - Modern EKF strategies for space vehicles

**Key details:**
- Timeline: 4-8 weeks for algorithm development and initial testing
- Extended Kalman Filter (EKF) is standard for nonlinear systems
- Unscented Kalman Filter (UKF) provides better accuracy for highly nonlinear cases
- Navigation accuracy typically degrades during GPS-denied phases
- Include atmospheric and gravity models appropriate for your trajectory

---
Verified: February 2026'
WHERE title = 'Develop Navigation Algorithms'
AND pack_id = '22222222-2222-2222-2222-000000000002';

-- Task 4: Build Guidance Software
UPDATE public.pack_items
SET description = '**What to do:**
- Implement trajectory guidance: powered explicit guidance (PEG) or iterative guidance
- Develop steering algorithms: pitch program, gravity turn, optimal steering
- Handle engine-out scenarios: trajectory retargeting, abort mode selection
- Create mission sequencing: event triggers, state machine for flight phases
- Implement guidance gain scheduling for changing vehicle dynamics

**Official resources:**
- [NASA Marshall Guidance Development](https://www.nasa.gov/wp-content/uploads/2015/04/gnc.pdf) - NASA guidance algorithm heritage
- [NASA GNC Technology Assessment](https://science.nasa.gov/resource/guidance-navigation-and-control-technology-assessment-onboard-guidance-navigation-and-control) - Guidance technology state-of-the-art
- [Rocket Propulsion Elements](https://www.wiley.com/en-us/Rocket+Propulsion+Elements,+10th+Edition-p-00397021) - Chapter on trajectory optimization

**Key details:**
- Timeline: 4-6 weeks for guidance software development
- Powered Explicit Guidance (PEG) is widely used for orbital insertion
- Gravity turn is simpler but less flexible for trajectory shaping
- Guidance must handle thrust variations and atmospheric effects
- Test extensively with Monte Carlo dispersions

---
Verified: February 2026'
WHERE title = 'Build Guidance Software'
AND pack_id = '22222222-2222-2222-2222-000000000002';

-- Task 5: Implement Control Laws
UPDATE public.pack_items
SET description = '**What to do:**
- Design attitude control system: rate damping, attitude hold, steering response
- Implement gain scheduling for changing vehicle dynamics (mass, CG, moments of inertia)
- Design thrust vector control (TVC) algorithms if using gimbaled engines
- Implement roll control: RCS, differential throttling, or aerodynamic surfaces
- Develop load relief algorithms for atmospheric flight (if required)

**Official resources:**
- [NASA GNC Control Systems](https://www.nasa.gov/wp-content/uploads/2015/04/gnc.pdf) - Control algorithm development and validation
- [NASA GNC Best Practices](https://ntrs.nasa.gov/citations/20230005922) - Robust GNC system design guidance
- [DO-178C Level A](https://www.rtca.org/do-178/) - Software development for flight-critical control systems

**Key details:**
- Timeline: 4-8 weeks for control law development and tuning
- Gain scheduling critical as vehicle properties change during flight
- TVC typically controls pitch and yaw, separate roll control system
- Stability margins should meet requirements with worst-case dispersions
- Include actuator dynamics and rate limits in control design

---
Verified: February 2026'
WHERE title = 'Implement Control Laws'
AND pack_id = '22222222-2222-2222-2222-000000000002';

-- Task 6: Test in Hardware-in-Loop
UPDATE public.pack_items
SET description = '**What to do:**
- Build hardware-in-the-loop (HIL) simulation with real flight hardware
- Develop high-fidelity vehicle simulation: 6-DOF dynamics, environment models
- Execute nominal mission profiles with flight software in real-time
- Test failure modes: sensor failures, actuator failures, engine anomalies
- Conduct Monte Carlo testing with flight-like dispersions

**Official resources:**
- [MathWorks HIL Testing](https://www.mathworks.com/discovery/hardware-in-the-loop-hil.html) - HIL methodology and best practices
- [NI HIL Testing Solutions](https://www.ni.com/en/solutions/hardware-in-the-loop-testing.html) - Hardware platforms for HIL
- [NASA GNC Validation](https://ntrs.nasa.gov/citations/20230005922) - V&V practices for flight software

**Key details:**
- Timeline: 4-8 weeks for HIL setup and initial testing, ongoing throughout development
- HIL allows testing of actual flight hardware and software together
- 95% of control system validation typically done in HIL before flight
- Include I/O interfaces, timing, and communication protocols in test
- Document all test cases and maintain traceability to requirements

---
Verified: February 2026'
WHERE title = 'Test in Hardware-in-Loop'
AND pack_id = '22222222-2222-2222-2222-000000000002';

-- =============================================
-- PACK 3: Ground Systems & Launch Operations (5 tasks)
-- Pack ID: 22222222-2222-2222-2222-000000000003
-- =============================================

-- Task 1: Define Ground Operations Concept
UPDATE public.pack_items
SET description = '**What to do:**
- Document launch campaign timeline: vehicle arrival to launch
- Define operations phases: receiving, integration, testing, fueling, launch
- Identify required facilities: clean room, integration bay, launch pad, blockhouse
- Specify staffing requirements and shift schedules for operations
- Create launch window constraints and scrub/recycle procedures

**Official resources:**
- [NASA LSP InfoBook 2025-2026](https://tdglobal.ksc.nasa.gov/servlet/sm.web.Fetch/LSP_InfoBook_2025-04-30.pdf) - NASA Launch Services Program guide
- [NASA KSC Spaceport Command & Control](https://www.nasa.gov/wp-content/uploads/2015/03/sp-2018-01-113-ksc_fact_sheet_spaceport_command_and_control.pdf) - Modern launch control systems
- [KSC Flight Operations Governing Documents](https://public.ksc.nasa.gov/fltops/governingdocs/) - NASA operational procedures and policies

**Key details:**
- Timeline: 2-3 weeks for concept document
- Launch campaign typically 2-8 weeks depending on vehicle complexity
- Early operations definition drives facility requirements
- Include contingency timelines for weather and technical holds
- Coordinate with range for scheduling and access requirements

---
Verified: February 2026'
WHERE title = 'Define Ground Operations Concept'
AND pack_id = '22222222-2222-2222-2222-000000000003';

-- Task 2: Design Fueling System
UPDATE public.pack_items
SET description = '**What to do:**
- Design propellant storage and transfer systems for your propellant combination
- Implement safety interlocks: pressure relief, leak detection, emergency dump
- Design electrical grounding and bonding to prevent static discharge
- Create safe approach procedures for cryogenic operations
- Specify personal protective equipment (PPE) requirements

**Official resources:**
- [NASA KSC Propellant Systems](https://www.nasa.gov/wp-content/uploads/2018/06/fs-2018-02-250-ksc-ml_umbilical_fact_sheet.pdf) - Mobile launcher umbilical systems
- [NASA LSP Services](https://public.ksc.nasa.gov/lsplaunch/services/) - Propellant loading support services
- [14 CFR Part 450: Ground Safety](https://www.ecfr.gov/current/title-14/chapter-III/subchapter-C/part-450) - FAA ground safety requirements

**Key details:**
- Timeline: 4-6 weeks for fueling system design
- Cryogenic propellants (LOX, LH2, LCH4) require special handling procedures
- Propellant loading is high-risk activity requiring strict procedures
- Remote fueling operations minimize personnel exposure
- Include propellant conditioning (subcooling) if required by vehicle

---
Verified: February 2026'
WHERE title = 'Design Fueling System'
AND pack_id = '22222222-2222-2222-2222-000000000003';

-- Task 3: Build Launch Control Software
UPDATE public.pack_items
SET description = '**What to do:**
- Develop countdown sequencing software with hold/resume capability
- Implement vehicle health monitoring and launch commit criteria (LCC)
- Create operator displays for all ground and vehicle parameters
- Build data recording system for post-flight analysis
- Implement communication interfaces with range and tracking systems

**Official resources:**
- [NASA Spaceport Command and Control System](https://www.nasa.gov/wp-content/uploads/2015/03/sp-2018-01-113-ksc_fact_sheet_spaceport_command_and_control.pdf) - NASA SCCS architecture
- [NASA KSC Launch Control Center](https://www3.nasa.gov/centers/kennedy/pdf/167416main_LC39-08.pdf) - Launch Control Center operations
- [LSP Network Services](https://public.ksc.nasa.gov/lsplaunch/services/) - Data, video, and communications support

**Key details:**
- Timeline: 6-12 weeks for launch control software development
- Countdown sequencing automates time-critical events
- Launch commit criteria are mandatory checks before launch
- Include manual override capability for critical functions
- Test extensively in simulation before real operations

---
Verified: February 2026'
WHERE title = 'Build Launch Control Software'
AND pack_id = '22222222-2222-2222-2222-000000000003';

-- Task 4: Create Operations Procedures
UPDATE public.pack_items
SET description = '**What to do:**
- Write detailed step-by-step procedures for all ground operations
- Document hazardous operations with safety requirements and controls
- Create emergency procedures for all credible emergency scenarios
- Develop troubleshooting guides for common anomalies
- Establish configuration management for procedure changes

**Official resources:**
- [NASA KSC Procedural Requirements](https://public.ksc.nasa.gov/fltops/governingdocs/) - NASA procedure development standards
- [14 CFR Part 450 Subpart C](https://www.ecfr.gov/current/title-14/chapter-III/subchapter-C/part-450) - FAA safety requirements for launch operations
- [NASA LSP Mission Operations](https://tdglobal.ksc.nasa.gov/servlet/sm.web.Fetch/LSP_InfoBook_2025-04-30.pdf) - Mission lifecycle and procedures

**Key details:**
- Timeline: 4-8 weeks for complete procedure set
- Procedures must be validated through walkthrough and practice
- Include hold points for quality verification
- Emergency procedures require training and drills
- Range coordination procedures are mandatory

---
Verified: February 2026'
WHERE title = 'Create Operations Procedures'
AND pack_id = '22222222-2222-2222-2222-000000000003';

-- Task 5: Conduct Integrated Testing
UPDATE public.pack_items
SET description = '**What to do:**
- Execute end-to-end system tests with vehicle in launch configuration
- Perform full countdown rehearsal (wet dress rehearsal if required)
- Validate all ground-vehicle interfaces: umbilicals, RF links, power
- Test emergency scenarios and abort procedures
- Conduct flight readiness review with all stakeholders

**Official resources:**
- [NASA Flight Readiness Reviews](https://public.ksc.nasa.gov/fltops/governingdocs/) - FRR process and requirements
- [NASA Integrated Testing](https://tdglobal.ksc.nasa.gov/servlet/sm.web.Fetch/LSP_InfoBook_2025-04-30.pdf) - LSP integration and test flow
- [14 CFR Part 450](https://www.ecfr.gov/current/title-14/chapter-III/subchapter-C/part-450) - Pre-launch verification requirements

**Key details:**
- Timeline: 2-4 weeks for integrated test campaign
- Wet dress rehearsal loads actual propellants without ignition
- All anomalies must be resolved before flight readiness review
- Range participation required for launch-day simulations
- Document lessons learned for future campaigns

---
Verified: February 2026'
WHERE title = 'Conduct Integrated Testing'
AND pack_id = '22222222-2222-2222-2222-000000000003';

-- =============================================
-- PACK 4: Regulatory & Range Compliance (5 tasks)
-- Pack ID: 22222222-2222-2222-2222-000000000004
-- =============================================

-- Task 1: Research Licensing Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Determine applicable regulations: FAA AST (USA), CAA (UK), or other national authority
- Review license types: vehicle operator license, launch site license, reentry license
- Identify required safety analysis and documentation
- Understand timeline and cost for license application process
- Engage with regulator early through pre-application consultation

**Official resources:**
- [14 CFR Part 450: Launch and Reentry License Requirements](https://www.ecfr.gov/current/title-14/chapter-III/subchapter-C/part-450) - FAA commercial space regulations (updated Dec 2025)
- [FAA Commercial Space Licensing Process](https://www.faa.gov/space/licenses/licensing_process) - Step-by-step application guide
- [UK CAA Space Industry Act Licensing](https://caa.co.uk/our-work/publications/documents/content/cap2209) - CAP 2209 UK license application guidance
- [UK GOV Spaceflight Regulations](https://www.gov.uk/guidance/uk-commercial-spaceflight-apply-for-a-licence) - UK launch operator license requirements

**Key details:**
- Timeline: 6-18 months for license approval (plan early!)
- FAA Part 450 replaced legacy Parts 415/431/435 for new applications
- UK requires launch operator license under Space Industry Act 2018
- Pre-application meetings highly recommended to clarify requirements
- License fees vary by complexity and mission risk

---
Verified: February 2026'
WHERE title = 'Research Licensing Requirements'
AND pack_id = '22222222-2222-2222-2222-000000000004';

-- Task 2: Prepare Safety Analysis
UPDATE public.pack_items
SET description = '**What to do:**
- Conduct flight safety analysis: debris hazard, toxic hazard, far-field blast
- Calculate expected casualty (Ec) to demonstrate public safety compliance
- Develop flight safety system requirements if flight termination required
- Perform ground safety analysis for all hazardous operations
- Document hazard analysis and risk mitigation measures

**Official resources:**
- [14 CFR Part 450 Subpart C: Flight Safety](https://www.ecfr.gov/current/title-14/chapter-III/subchapter-C/part-450) - FAA flight safety requirements
- [NASA Range Safety Operations](https://public.ksc.nasa.gov/kscsma/nasa-range-safety-operations/) - NASA range safety procedures
- [AFSPCMAN 91-710: Range Safety](https://explorers.larc.nasa.gov/2019APSMEX/MO/pdf_files/AFSPCMAN%2091-710.pdf) - DoD range safety requirements

**Key details:**
- Timeline: 8-16 weeks for complete safety analysis package
- Ec threshold typically 30 x 10^-6 (30 in a million) for public risk
- Flight termination system may be required for some trajectories
- Ground safety includes propellant handling, pressurized systems, ordnance
- Range conducts independent safety assessment

---
Verified: February 2026'
WHERE title = 'Prepare Safety Analysis'
AND pack_id = '22222222-2222-2222-2222-000000000004';

-- Task 3: Complete Environmental Review
UPDATE public.pack_items
SET description = '**What to do:**
- Determine level of NEPA review required: categorical exclusion, EA, or EIS
- Prepare environmental assessment documentation
- Address noise, air quality, water resources, biological resources
- Conduct public consultation if required for EA or EIS
- Obtain Finding of No Significant Impact (FONSI) or Record of Decision (ROD)

**Official resources:**
- [FAA Space Environmental Review](https://www.faa.gov/space/environmental) - FAA NEPA process for commercial space
- [FAA NEPA Documents Library](https://www.faa.gov/space/environmental/nepa_docs) - Example EAs and EISs for reference
- [GAO Report on FAA Environmental Reviews](https://www.gao.gov/products/gao-24-106193) - Assessment of FAA commercial space environmental processes

**Key details:**
- Timeline: 6-18 months depending on level of review required
- Environmental Assessment (EA) for less significant impacts
- Environmental Impact Statement (EIS) for major actions
- NEPA finding required before FAA can issue license
- 22 of 24 recent reviews were based on previous environmental analyses

---
Verified: February 2026'
WHERE title = 'Complete Environmental Review'
AND pack_id = '22222222-2222-2222-2222-000000000004';

-- Task 4: Submit License Application
UPDATE public.pack_items
SET description = '**What to do:**
- Compile complete license application package per regulatory requirements
- Include safety analysis, environmental review, financial responsibility evidence
- Demonstrate compliance with all applicable requirements
- Submit application through appropriate regulatory portal
- Respond to regulatory questions and requests for additional information

**Official resources:**
- [FAA Space License Application](https://www.faa.gov/space/licenses) - FAA application portal and requirements
- [FAA Commercial Space Assistance Tool](https://www.faa.gov/space/licenses/licensing_process) - Determine license type needed
- [UK CAA License Applications](https://caa.co.uk/space/licences-and-permissions) - UK application process and forms

**Key details:**
- Timeline: Application review typically 180 days for FAA after acceptance
- Financial responsibility (liability insurance) evidence required
- Safety element approvals may be submitted concurrently
- Incomplete applications will be returned, delaying timeline
- Regular communication with assigned reviewer recommended

---
Verified: February 2026'
WHERE title = 'Submit License Application'
AND pack_id = '22222222-2222-2222-2222-000000000004';

-- Task 5: Coordinate with Range
UPDATE public.pack_items
SET description = '**What to do:**
- Establish relationship with launch range: Eastern Range, Western Range, or commercial
- Submit range user requirements and mission profile
- Coordinate launch windows and range scheduling
- Agree on range safety requirements and tracking support
- Execute range agreements and obtain range clearance

**Official resources:**
- [NASA Range Safety Operations](https://public.ksc.nasa.gov/kscsma/nasa-range-safety-operations/) - NASA range coordination
- [14 CFR Part 417: Range Safety](https://www.ecfr.gov/current/title-14/chapter-III/subchapter-C/part-417) - Launch safety responsibilities
- [AFSPCMAN 91-710](https://explorers.larc.nasa.gov/2019APSMEX/MO/pdf_files/AFSPCMAN%2091-710.pdf) - DoD range requirements for all users

**Key details:**
- Timeline: 6-12 months for range coordination (start early)
- Eastern Range: Cape Canaveral and KSC (eastern trajectories)
- Western Range: Vandenberg SFB (polar and sun-synchronous orbits)
- Commercial ranges: Spaceport America, Mojave, etc.
- Range provides tracking, telemetry, and command destruct if required
- Range safety officer has authority to terminate flight

---
Verified: February 2026'
WHERE title = 'Coordinate with Range'
AND pack_id = '22222222-2222-2222-2222-000000000004';

-- =============================================
-- PACK 5: Structural Analysis & Design (5 tasks)
-- Pack ID: 22222222-2222-2222-2222-000000000005
-- =============================================

-- Task 1: Define Structural Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Document all load cases: max-Q, max-g, MECO, staging, landing (if reusable)
- Specify factors of safety per NASA-STD-5001 or ECSS-E-ST-32
- Define mass targets for each structural element and total structure
- Establish stiffness requirements for dynamic stability
- Document interface loads at all structural boundaries

**Official resources:**
- [NASA-STD-5001: Structural Design Factors of Safety](https://standards.nasa.gov/standard/NASA/NASA-STD-5001) - NASA structural requirements (current version B with Change 3)
- [ECSS-E-ST-32C: Structural General Requirements](https://ecss.nl/standard/ecss-e-st-32c-rev-1-structural-general-requirements/) - European space structural standard
- [NASA-HDBK-5026: Structural Design Handbook](https://standards.nasa.gov/sites/default/files/standards/NASA/Baseline/0/NASA-HDBK-5026-Final-8-12-2024.pdf) - Supporting design guidance

**Key details:**
- Timeline: 2-4 weeks for requirements document
- Typical factors of safety: 1.25 yield, 1.4 ultimate for human-rated vehicles
- Mass fraction (propellant mass / total mass) critical for performance
- Natural frequency requirements prevent coupling with control system
- Factor of safety may be reduced with adequate testing

---
Verified: February 2026'
WHERE title = 'Define Structural Requirements'
AND pack_id = '22222222-2222-2222-2222-000000000005';

-- Task 2: Select Materials
UPDATE public.pack_items
SET description = '**What to do:**
- Evaluate candidate materials for each structural application
- Consider aluminum alloys (2xxx, 7xxx), steel, titanium, composites
- Assess material properties at operating temperatures (cryogenic to aerodynamic heating)
- Review material availability, cost, and manufacturing compatibility
- Document material specifications and procurement requirements

**Official resources:**
- [MMPDS-2025 Handbook](https://www.mmpds.org/) - Metallic material design allowables (supersedes MIL-HDBK-5)
- [MMPDS SAE Publication](https://sae.org/publications/books/content/b-993_volume1) - Volume I: conventional materials and joint allowables
- [ECSS-E-HB-32-20: Structural Materials Handbook](https://ecss.nl/) - European material properties database

**Key details:**
- Timeline: 2-3 weeks for material trade study
- Al 2219-T87: Common for cryogenic tanks, good weldability
- Al-Li alloys: Lower density but higher cost
- Carbon fiber composites: Highest performance but complex manufacturing
- Use MMPDS A-basis or B-basis allowables for design

---
Verified: February 2026'
WHERE title = 'Select Materials'
AND pack_id = '22222222-2222-2222-2222-000000000005';

-- Task 3: Perform Structural Analysis
UPDATE public.pack_items
SET description = '**What to do:**
- Build finite element model (FEM) of complete vehicle structure
- Perform static stress analysis for all critical load cases
- Conduct buckling analysis for thin-walled structures
- Execute modal analysis for natural frequencies and mode shapes
- Perform coupled loads analysis with propulsion and control systems

**Official resources:**
- [NASA-STD-5001: Analysis Requirements](https://standards.nasa.gov/standard/NASA/NASA-STD-5001) - Structural analysis standards
- [ECSS-E-ST-32C: Analysis Methods](https://ecss.nl/standard/ecss-e-st-32c-rev-1-structural-general-requirements/) - European analysis guidance
- [ECSS Buckling Handbook](https://ecss.nl/) - Shell buckling analysis methods

**Key details:**
- Timeline: 4-8 weeks for comprehensive structural analysis
- FEA codes: NASTRAN, ABAQUS, ANSYS commonly used
- Positive margins of safety required for all load cases
- Buckling knock-down factors account for manufacturing imperfections
- Independent analysis review recommended for flight-critical structures

---
Verified: February 2026'
WHERE title = 'Perform Structural Analysis'
AND pack_id = '22222222-2222-2222-2222-000000000005';

-- Task 4: Design Joints and Interfaces
UPDATE public.pack_items
SET description = '**What to do:**
- Design stage separation system: pyrotechnic, mechanical release, or pusher
- Create payload interface per standard (e.g., ESPA, CubeSat, custom)
- Design tank-to-structure interfaces with appropriate load paths
- Specify fastener patterns and preloads for all bolted joints
- Design ground handling and transportation interfaces

**Official resources:**
- [NASA-STD-5001: Preloaded Joints](https://standards.nasa.gov/standard/NASA/NASA-STD-5001) - Bolted joint design requirements
- [ECSS Threaded Fasteners Handbook](https://ecss.nl/wp-content/uploads/2014/10/ECSS-E-ST-32-08C-Rev.1(15October2014).pdf) - European fastener design guidance
- [ECSS Insert Design Handbook](https://ecss.nl/) - Insert design for composite structures

**Key details:**
- Timeline: 3-6 weeks for joint design and analysis
- Stage separation is flight-critical with high reliability requirement
- Payload interface must meet launch vehicle user guide requirements
- Joint preload critical for fatigue life and preventing separation
- Include thermal effects on preload for cryogenic applications

---
Verified: February 2026'
WHERE title = 'Design Joints and Interfaces'
AND pack_id = '22222222-2222-2222-2222-000000000005';

-- Task 5: Qualify Structures
UPDATE public.pack_items
SET description = '**What to do:**
- Develop structural qualification test plan
- Conduct static load testing to qualification levels (typically 1.2-1.4x limit load)
- Perform vibration testing: sine sweep, random vibration, acoustic
- Execute pressure testing for tanks and pressure vessels
- Document all test results and verify positive margins

**Official resources:**
- [NASA-STD-5001: Test Factors of Safety](https://standards.nasa.gov/standard/NASA/NASA-STD-5001) - Qualification and proof test requirements
- [ECSS-E-ST-32C: Verification](https://ecss.nl/standard/ecss-e-st-32c-rev-1-structural-general-requirements/) - European structural verification standards
- [NASA-HDBK-5026: Test Guidelines](https://standards.nasa.gov/sites/default/files/standards/NASA/Baseline/0/NASA-HDBK-5026-Final-8-12-2024.pdf) - Structural test planning and execution

**Key details:**
- Timeline: 6-12 weeks for qualification test campaign
- Qualification test articles typically not used for flight
- Protoflight approach: test flight article to intermediate levels
- Proof testing of pressure vessels required before each flight
- All anomalies must be dispositioned before flight clearance

---
Verified: February 2026'
WHERE title = 'Qualify Structures'
AND pack_id = '22222222-2222-2222-2222-000000000005';

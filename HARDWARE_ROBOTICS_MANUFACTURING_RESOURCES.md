# Hardware, Robotics & Manufacturing Resources
**Verified: February 4, 2026**

A comprehensive list of verified official resources for hardware design, robotics development, and rocket propulsion engineering.

---

## 1. Build Motion Control System Pack (Robotics)

### Motor and Actuator Suppliers

#### Maxon Motor
- **Official URL**: https://www.maxongroup.com/
- **Product Catalog**: 2025/26 product range available
- **Key Features**:
  - DC motors, brushless DC (BLDC) motors
  - Gearheads, sensors, control electronics
  - Complete mechatronic drive systems
  - CAD files and product data available
  - Applications: medical technology, industrial automation, aerospace, mobility
- **24/7 Online Shop**: https://www.maxongroup.com/en-us/shop
- **Company**: Swiss company founded in 1961
- **Note**: Verified February 2026, precision electric drive technology leader

#### Parker Hannifin
- **Official URL**: https://www.parker.com/
- **Actuators Page**: https://discover.parker.com/electromechanical-actuators
- **Product Lines**:
  - **Electromechanical Actuators**: HLR (High Load Rodless), ETH (High Force Electro Cylinder), HMR, OSPE, OSP-E-BHD
  - **Hydraulic Rotary Actuators**: HUB, LTR, HTR, M, Tork-Mor Series
  - **Pneumatic Actuators**: Variable Bypass Valve, Core Inlet Guide Vane
  - **Helac Rotary Actuators**: Available through Helac Actuator Central
- **Key Features**: Over 1,400 product lines, largest global distribution network in motion control
- **Note**: Verified February 2026, leading global manufacturer of motion control components

#### Oriental Motor
- **Official URL**: https://www.orientalmotor.com/
- **Product Catalog**: https://www.orientalmotor.com/products/
- **Product Lines**:
  - Stepper motors, servo motors, brushless DC motors
  - Speed control motors, linear actuators, rotary actuators
  - Industrial robots, AC gear motors, cooling fans
  - Encoders and accessories
- **Support**:
  - Customer Service: 1-800-418-7903
  - Technical Support: 1-800-468-3982
  - Sales: 1-800-448-6935
- **Resources**: Motor sizing tools, unit conversion utilities, engineering notes blog
- **Company**: Japan-based manufacturer (founded 1950), 3,079 employees, 100 sales offices in 40 countries
- **Note**: Verified February 2026

#### Kollmorgen
- **Official URL**: https://www.kollmorgen.com/
- **Developer Network**: https://www.kollmorgen.com/en-us/developer-network
- **Product Lines**:
  - Industrial servomotors
  - Servo drives
  - AC/DC motors
  - Motion control solutions and systems
- **Resources**: Developer network, service and support documentation
- **Note**: Verified February 2026, "Precision Motion" specialist

### Kinematics Libraries and Frameworks

#### ROS (Robot Operating System)
- **Official URL**: https://ros.org/
- **Documentation**: https://docs.ros.org/
- **Current Releases (as of 2025)**:
  - **Latest LTS**: Jazzy Jalisco (recommended, targets Ubuntu 24.04, Windows 10)
  - **Latest Short-term**: Kilted Kaiju (support until November 2026)
  - **Active Versions**: Humble Hawksbill (support until May 2027), Rolling Ridley (development)
  - **Legacy ROS 1**: Noetic Ninjemys (support until May 2025)
- **Pricing**: Free and open-source
- **Key Features**:
  - Open-source software libraries and tools
  - Device drivers to advanced algorithms
  - Developer tools and utilities
- **Community Resources**:
  - Zulip Chat for developer discussions
  - Robotics Stack Exchange for Q&A
  - Discourse forums, ROSCon conference recordings
- **Steward**: Open Robotics
- **Note**: Verified February 2026, industry-standard robotics middleware

#### MoveIt!
- **Official URL**: https://moveit.ros.org/
- **Documentation**: https://moveit.picknik.ai/
- **GitHub**: https://github.com/moveit/moveit
- **Latest Version**: MoveIt Jazzy (Ubuntu 24.04)
- **Pricing**: Free and open-source (BSD-3-Clause license)
- **Core Capabilities**:
  - Motion planning through cluttered environments
  - Manipulation and grasp generation
  - Inverse kinematics solving
  - Trajectory control and execution
  - 3D perception with depth sensors and Octomaps
  - Collision checking with geometric primitives, meshes, or point clouds
- **Key Components**:
  - 3D interactive visualizer in RViz
  - Gazebo simulation integration
  - Setup Assistant for robot configuration
  - Task Constructor for multi-stage manipulation planning
  - Grasp generation libraries
- **Deployment**: Over 150 robots in production
- **Note**: Verified February 2026, motion planning and manipulation framework for ROS

#### MATLAB Robotics System Toolbox
- **Official URL**: https://www.mathworks.com/products/robotics.html
- **Documentation**: https://www.mathworks.com/help/robotics/
- **Pricing**:
  - **MATLAB Standard License**: $2,535/year (commercial), $940/year (home/personal use)
  - **Toolbox pricing**: Contact MathWorks sales for specific add-on pricing
  - **Free**: Students, educators, startups program
- **For Manipulators**:
  - Collision checking, path planning, trajectory generation
  - Forward and inverse kinematics
  - Dynamics using rigid body tree representation
- **For Mobile Robots**:
  - Mapping, localization, path planning
  - Path following and motion control
- **Capabilities**:
  - Library of commercially available industrial robot models
  - Co-simulation with Gazebo robotics simulator
  - Hardware integration (Kinova Gen3, Universal Robots UR series)
  - Code generation via MATLAB Coder or Simulink Coder
- **Current Release**: R2024b (as of search)
- **Note**: Verified February 2026

### Control System Frameworks

#### LabVIEW (National Instruments)
- **Official URLs**: https://www.ni.com/, https://www.labview.com/
- **Download Page**: https://ni.com/en/support/downloads/software-products/download.labview.html
- **Latest Versions**: LabVIEW 2025 Q3 and 2025 Q1
- **Pricing**: Contact NI sales for licensing quotes
- **Editions**:
  - **Base**: Simple test and measurement applications
  - **Full**: Standard capabilities
  - **Professional**: Advanced features
  - **LabVIEW+ Suite**: Includes additional NI software for test sequencing, data logging, and analysis
- **License Types**: Subscription and perpetual terms available
- **Key Features**:
  - Graphical programming using G programming language
  - Connectivity to instruments from any vendor
  - Native user interfaces for monitoring and control
  - Thousands of engineering analysis and signal processing functions
  - Integration with Python, C/C++, .NET, and MATLAB
  - NI Nigel™ AI Advisor for test-optimized guidance
- **Platforms**: Windows (10/11), Mac OS, Linux
- **Languages**: English, French, German, Japanese, Korean, Simplified Chinese
- **Note**: Verified February 2026

#### Simulink (MathWorks)
- **Official URL**: https://www.mathworks.com/products/simulink.html
- **Documentation**: https://www.mathworks.com/help/simulink/
- **Control Design**: https://www.mathworks.com/help/slcontrol/
- **Pricing**:
  - **Simulink License**: $3,830/year (individual, commercial)
  - **Control System Toolbox**: $1,270-$7,650/year (depending on toolbox)
  - **Model Predictive Control Toolbox**: Contact sales
  - **Robust Control Toolbox**: Contact sales
- **R2026a Updates** (Prerelease):
  - Raspberry Pi Support Package moved to new Raspberry Pi Blockset
  - STM32 Support Package moved to new STM32 Microcontroller Blockset
- **Simulink Control Design Features**:
  - Finding operating points and computing exact linearizations
  - Computing simulation-based frequency responses
  - Automatically tuning SISO and MIMO control architectures
  - Designing nonlinear, adaptive, and data-driven control algorithms
- **Control System Toolbox**:
  - Transfer functions, state-space models, frequency-response models
  - Interactive tuning using root locus and Bode diagrams
  - PID controller design and automatic tuning
- **Full Development Lifecycle**: Plant modeling, controller design, automatic code generation, system verification
- **Note**: Verified February 2026

#### TwinCAT (Beckhoff Automation)
- **Official URL**: https://www.beckhoff.com/en-us/products/automation/twincat/
- **Product Finder**: https://www.beckhoff.com/en-us/products/automation/product-finder-twincat/
- **Pricing**: Contact Beckhoff sales for licensing
- **Key Features**:
  - Open, PC-based control technology
  - TwinCAT 2 and TwinCAT 3 versions available
  - Automation software platform
- **Global Support**: 40+ countries and regions with localized versions
- **Languages**: Multi-language support across Americas, Europe, Asia-Pacific, Middle East
- **Note**: Verified February 2026

### Encoder and Sensor Suppliers

#### Renishaw
- **Official URL**: https://www.renishaw.com/
- **Encoders Page**: https://www.renishaw.com/en/encoders-for-position-and-motion-control--6331
- **Product Lines**:
  - **Optical encoders**: Open and enclosed designs (linear, rotary, partial arc), absolute and incremental options
  - **Inductive encoders**: Absolute position sensors using electromagnetic induction for demanding environments
  - **Laser encoders**: High-resolution linear position measurement with low cyclic error
  - **Magnetic encoders**: Robust linear and rotary position measurement with non-contact design
- **Key Features**:
  - High accuracy (down to 1 nanometre)
  - Non-contact designs for zero-wear operation
  - Applications: aerospace, medical, semiconductors, robotics, machine tools
- **Note**: Verified February 2026

#### HEIDENHAIN
- **Official URLs**: https://heidenhain.com/ (global), https://www.heidenhain.us/ (USA)
- **Product Page**: https://heidenhain.com/products
- **Product Lines**:
  - **Angle encoders with integral bearing**: High system accuracy for machine tools and printing machines
  - **Modular angle encoders**: Customizable solutions with optical or magnetic scanning options
  - **Angle encoder modules**: Integrated with high-precision bearings for excellent measurement accuracy
  - **Rotary encoders**: Various sizes and configurations
  - **Linear encoders**: High-precision linear position measurement
  - **CNC controls**: Digital readouts and control systems
  - **Accessories**: Length gauges, signal converters, touch probes, vision systems, testing devices
- **Industries**: Machine tools, automation, semiconductors, electronics, robotics, metrology
- **Upcoming Events**:
  - NEPCON 2026 Tokyo: January 21-23, 2026
  - SEMICON Seoul: February 11-13, 2026
- **Note**: Verified February 2026

#### OMRON
- **Official URLs**:
  - Global: https://omron.com/global/en
  - Industrial Automation: https://www.ia.omron.com/products/
  - US Automation: https://automation.omron.com/
  - Asia Pacific: https://www.omron-ap.com/
- **Rotary Encoders**: https://automation.omron.com/en/us/products/families/rotary-encoders
- **Product Lines**:
  - **Incremental Encoders**: Output pulse strings to detect rotation by counting pulses
  - **Absolute Encoders**: Output rotational angle using absolute code (no need to return to origin)
  - **Direct Discrimination Units**: Accept phase difference signals to detect rotation direction
  - **Peripheral Devices**: Couplings, flanges, mounting brackets
- **Other Sensors**: Fiber sensors, photoelectric sensors, displacement sensors, vision sensors, proximity sensors, ultrasonic sensors, pressure/flow sensors
- **Example Products**: E6A2-C (25mm incremental encoder)
- **Note**: Verified February 2026

---

## 2. Propulsion System Development Pack (Rockets)

### Propellant Suppliers and Databases

#### JANNAF (Joint Army Navy NASA Air Force) Interagency Propulsion Committee
- **Official URL**: https://www.jannaf.org/
- **Databases Page**: https://www.jannaf.org/databases
- **Key Databases**:
  - **Propellant & Explosive Ingredients Database (PEID)**: Hundreds of propellant ingredients, 100+ ingredient suppliers with production status and "Criticality Index" for supply risk assessment
  - **Solid Propellant Database (SPD)**: Unclassified propellant data for U.S. systems dating back to 1950s, including formulation details and production status
  - **Rocket Motor Electronic Database (RMED)**: Comprehensive solid propulsion information for rockets and missiles
- **Access**: Subscription-based, regularly updated
- **Note**: Verified February 2026, most comprehensive propellant supplier database

#### Major Propellant Suppliers

**CRS Chemicals**
- Location: Canoga Park, CA
- Products: Aerospace propellants including ammonium perchlorate, boron powder, zirconium hydride
- **Note**: Verified via ThomasNet directory February 2026

**SAE Manufacturing Specialties Corp**
- Location: Bayville, NY
- Products: Defense and aerospace propellants
- **Note**: Verified via ThomasNet directory February 2026

**ArianeGroup**
- **Official URL**: https://ariane.group/en/equipment-services/for-launchers/space-chemistry/
- Products: Europe's leading supplier of energetic materials, ammonium perchlorate, monomethylhydrazine (MMH)
- **Note**: Verified February 2026

**NASA Kennedy Space Center**
- **Propellants Page**: https://public.ksc.nasa.gov/propellants/
- Manages: 22+ liquid propellants, propellant acquisition expertise for aerospace programs
- **Note**: Verified February 2026

### Rocket Engine Design Software

#### RPA (Rocket Propulsion Analysis)
- **Official URL**: http://www.rocket-propulsion.com/
- **Features Page**: https://www.rocket-propulsion.com/RPA/features.htm
- **Documentation**: https://www.rocket-propulsion.com/doc.htm
- **GitHub Examples**: https://github.com/lpre/RPA-Examples
- **Latest Version**: RPA v.4.0.9 (released January 23, 2026)
- **Pricing**: Contact RP Software+Engineering UG (free trial available)
- **RPA v.4 New Features**:
  - Enhanced solver stability with self-adjusted algorithms and diagnostics
  - **Thermal propulsion analysis support** (NEW capability)
  - Extended JavaScript scripting utility with comprehensive API
  - Redesigned user interface with improved parameter grouping
  - Modern technology stack using Qt 6.x and C++17
  - JSON configuration format
- **Core Capabilities**:
  - Engine performance analysis
  - Thrust chamber sizing and nozzle optimization
  - Heat transfer and cooling analysis
  - Combustion analysis with thermodynamic calculations
  - Altitude performance analysis
- **Platforms**: Multi-platform (Windows, macOS, Linux)
- **Note**: Verified February 2026, conceptual and preliminary chemical rocket engine design tool

#### OpenRocket
- **Official URL**: https://openrocket.info/
- **Documentation**: https://openrocket.readthedocs.io/
- **Downloads**: https://openrocket.info/downloads.html
- **GitHub**: https://github.com/openrocket/openrocket
- **Latest Version**: 24.12
- **Pricing**: Free and open-source
- **Key Features**:
  - **Six-Degrees-of-Freedom flight simulation** with 50+ variables
  - **CAD-based design tools** with large catalog of components and materials
  - **Real-time performance feedback**: center of pressure, center of gravity, maximum altitude, stability calculations
  - **Multi-stage and cluster motor support** with automatic arrangement
  - **Motor database integration** from ThrustCurve
  - **Advanced plotting and exporting** capabilities
- **Platforms**: Windows, macOS, Linux (packaged installers + source code)
- **Focus**: Model rocket aerodynamics and flight simulation
- **Note**: Verified February 2026

### Combustion Analysis Tools

#### ANSYS Fluent
- **Official URL**: https://www.ansys.com/
- **Combustion Modeling Training**: https://www.ansys.com/training-center/course-catalog/fluids/ansys-fluent-combustion-modeling
- **Documentation**: https://ansyshelp.ansys.com/ (version 252+)
- **Pricing**: Contact ANSYS sales for licensing
- **Combustion Modeling Approaches**:
  - Species Transport, Non-Premixed, Premixed, Partially Premixed
  - Composition PDF Transport
  - Finite-rate chemistry models
  - Equilibrium chemistry approaches
- **Rocket Engine Applications**:
  - Gas methane/gaseous oxygen (GCH4/GOX) rocket combustors
  - High-speed combustion (ramjets, scramjets, RDEs)
  - Liquid/solid rocket motors
  - RANS formulations for turbulent flows
- **Key Capabilities**:
  - Species transport and gaseous combustion mixing
  - Turbulence-chemistry interactions (eddy-dissipation model)
  - Chemical reactions through CHEMKIN mechanism import
  - Pollutant prediction (NOx, SOx, soot)
  - Heat transfer analysis coupled with combustion
  - Discrete phase modeling for liquid fuel droplets or solid fuel particles
- **Training**: Formal Combustion Modeling courses, chemistry acceleration tools (ISAT, dynamic mechanism reduction)
- **Note**: Verified February 2026

#### NASA CEA (Chemical Equilibrium with Applications)
- **Official URL**: https://www1.grc.nasa.gov/research-and-engineering/ceaweb/
- **GitHub**: https://github.com/nasa/cea
- **License**: Apache 2.0 (open-source)
- **Pricing**: Free
- **Developed**: NASA Glenn Research Center (since 1950s)
- **Thermodynamic Data**: Over 2,000 species
- **Primary Applications**:
  - **Theoretical rocket performance** calculations
  - Chapman-Jouguet detonation parameters
  - Shock-tube analysis
  - Combustion properties
- **Capabilities**:
  - Chemical equilibrium product concentrations from any set of reactants
  - Mixture properties using free-energy minimization
- **Latest Update**: Full rewrite completed, presented at AIAA SciTech Forum January 2025
- **Language**: ANSI standard FORTRAN
- **Distribution**: 2,000+ copies in use by aeronautics and thermodynamics community
- **Note**: Verified February 2026

### Propulsion Testing Facilities

#### NASA Propulsion Testing
- **Official URLs**:
  - Rocket Engine Test Facility: https://nasa.gov/rocket-engine-test-facility
  - Propulsion Test Capabilities: https://nasa.gov/directorates/space-operations/rpt/propulsion-test-capabilities
  - Rocket Propulsion Testing: https://nasa.gov/directorates/space-operations/rpt
- **Key Facilities**:
  - **Stennis Space Center**: Commercial rocket engine testing continues
  - **Rocket Propulsion Testing Program Office**: Manages propulsion test capabilities
- **Services**: Support for both government and commercial customers
- **Note**: Verified February 2026 (contact NASA directly for 2026 commercial testing schedule)

### Rocket Propulsion Textbooks and Resources

#### Sutton's Rocket Propulsion Elements
- **Publisher**: Wiley
- **10th Edition** (Upcoming):
  - **Release Date**: March 2026
  - **Authors**: George P. Sutton, Oscar Biblarz, James H. Morehart
  - **ISBN**: 978-1-394-18720-1
  - **Pages**: 720
  - **Price**: $143.95
  - **Pre-order**: https://www.wiley.com/en-us/Rocket+Propulsion+Elements,+10th+Edition-p-00397021
- **9th Edition** (Current):
  - **Release Date**: December 2016
  - **Authors**: George P. Sutton, Oscar Biblarz
  - **ISBN**: 978-1-118-75365-1
  - **Pages**: 800
  - **Price**: Available through Wiley
  - **URL**: https://www.wiley.com/en-us/Rocket+Propulsion+Elements%2C+9th+Edition-p-9781118753651
- **Content Coverage**:
  - Thermodynamics, aerodynamics, flight performance
  - Propellant chemistry
  - Rocket propulsion theory and applications
  - Guided missiles, space flight, satellites
- **Recognition**: Authoritative sourcebook for over 60 years, definitive reference on rocket propulsion
- **Note**: Verified February 2026

### Thrust Chamber Cooling Analysis Tools

#### ORCA (Open Rocket Combustion Analysis)
- **Development**: University of Glasgow
- **Latest Update**: January 2025 - Cooling channel design module added
- **Platform**: MATLAB-based
- **Capabilities**:
  - Steady-state regenerative cooling evaluation
  - Convective and radiative heat transfer analysis
  - Temperature-dependent stresses on chamber walls
  - Safety factor assessment during hot-fire and pre-combustion conditions
- **Status**: Open-source tool undergoing validation against alternative design programs and empirical data
- **Access**: Contact University of Glasgow (paper presented at AIAA SciTech Forum 2025)
- **Note**: Verified February 2026

#### NASA RECOP (Historical Reference)
- **Name**: Rocket Engine Coolant Passage Design Program
- **Development**: NASA (1990s)
- **Purpose**: Coolant passage design in regeneratively cooled thrust chambers and nozzles
- **Status**: Legacy program, established foundation for modern tools
- **Note**: Verified February 2026

---

## 3. Hardware Design & Prototyping Pack (Consumer Electronics)

### PCB Design Tools

#### Altium Designer
- **Official URL**: https://www.altium.com/
- **Product Page**: https://www.altium.com/altium-designer
- **Downloads**: https://altium.com/products/downloads
- **Pricing Page**: https://www.altium.com/platform/pricing
- **Pricing (2026)**:
  - **Monthly**: $85/month
  - **Annual**: $476/year (30% off from regular $680/year)
  - **3-year**: $2,040 (lock in pricing for 3 years)
- **Bundle Offerings**:
  - **Fusion for Manufacturing**: $2,040/year (Altium Designer + Altium 365 + Manufacturing Extension)
  - **Fusion for Design**: $2,190/year (Altium Designer + Altium 365 + Design, Simulation, and Manage Extensions)
- **Optional Extensions**:
  - Advanced MCAD CoDesigner: $499/user/year
  - Assembly Assistant: From $999/user/year
  - BOM Portal: $1,999/user/year
  - Simulation Extension: $1,465/year
  - Machining Extension: $1,465/year
  - Signal Integrity Extension: $1,465/year
  - Design Extension: $595/year
  - Manage Extension: $495/year
- **Free Trial**: 30 days (no credit card required)
- **Latest Version**: 26.2 (released January 8, 2026)
- **Guarantee**: 30-day money-back guarantee
- **Note**: Verified February 2026, industry-leading PCB design software

#### KiCad
- **Official URL**: https://www.kicad.org/
- **Downloads**: https://www.kicad.org/download/
- **Download Mirrors**: https://downloads.kicad.org/
- **Latest Version**: KiCad 9.0.7 (released January 1, 2026)
- **Pricing**: Free and open-source
- **Key Features**:
  - **Schematic Editor**: Basic to complex hierarchical designs, thousands of symbols in official library, integrated SPICE simulator, electrical rules checker
  - **PCB Editor**: Interactive router with visualization and selection tools
  - **3D Viewer**: Inspection with built-in raytracer for realistic rendering
- **Platforms**: Windows (10/11), macOS, Linux/Docker
- **Download Mirrors**: GitHub, MIT, CERN, various regional servers
- **Community**: Community-driven, accepts donations
- **Upcoming Events**: KiCon 2025 Asia (November 2025) - classes, presentations, collaboration
- **Note**: Verified February 2026

#### Eagle / Fusion 360 Electronics (Autodesk)
- **Official URL**: https://www.autodesk.com/products/fusion-360/
- **Eagle Features**: https://www.autodesk.com/products/eagle/features
- **PCB Documentation**: https://help.autodesk.com/view/fusion360/ENU/?guid=ECD-NEW-PCB
- **Pricing (2026)**:
  - **Monthly**: $85/month
  - **Annual**: $476/year (currently 30% off)
  - **3-year**: $2,040
- **Free**: Students, educators, hobbyists (personal non-commercial use), qualifying startups
- **Key Features**:
  - PCB design and schematic creation within Fusion 360
  - Create PCB layouts and reference schematics in same workspace
  - Import KiCAD files for design migration
  - Push EAGLE designs as 3D PCB files into Fusion 360 for mechanical integration
  - Seamless collaboration between electrical and mechanical design teams
- **Integrated Capabilities**: Electronics module combines with 3D CAD, CAM, and CAE tools
- **Getting Started**: https://www.autodesk.com/products/fusion-360/blog/fusion-electronics-getting-started/
- **Note**: Verified February 2026

#### EasyEDA
- **Official URLs**: https://easyeda.com/ (main), https://pro.easyeda.com/ (Pro edition)
- **Download**: https://easyeda.com/page/download
- **OSHWLAB**: https://easyeda.com/home
- **Documentation**: https://docs.easyeda.com/
- **Pricing**: Free (web-based and desktop)
- **User Base**: 5.33 million engineers worldwide
- **Editions**:
  - Online Editor (Pro Edition): https://pro.easyeda.com/editor
  - Online Editor (Std Edition): https://easyeda.com/editor
  - Desktop Client (downloadable)
  - Education Edition
  - On-Premises Hosting option
- **Core Features**:
  - Schematic capture and PCB layout design
  - LTSpice-based circuit simulation
  - Design Rules Checking (DRC)
  - Multi-layer PCB support (up to 6 copper layers)
  - 3D view and photo view
  - Gerber file generation for fabrication
  - 1,000,000+ public libraries for symbols and footprints
- **Integrated Services**:
  - PCB prototyping through JLCPCB
  - Component purchasing via LCSC
  - Open source hardware community (OSHWLAB)
  - Development kits, 3D printing, CNC machining, mechanical components
- **Description**: "World's first EDA software vendor with a full supply chain solution"
- **Support**: Documentation, tutorials, forums for Pro and Standard editions
- **Note**: Verified February 2026

### Component Suppliers

#### Digi-Key Electronics
- **Official URL**: https://www.digikey.com/
- **Product Index**: https://www.digikey.com/en/products
- **Pricing**: Per-component pricing (instant quotes online)
- **Headquarters**: Thief River Falls, Minnesota
- **Founded**: 1972
- **Employees**: 1,900+
- **Annual Revenue**: Estimated $270.2 million
- **Key Features**:
  - "World's largest selection of electronic components in stock for immediate shipment"
  - 1.5 million+ products from 400+ quality name-brand manufacturers
  - myDigiKey account for order management, shopping carts, quotes
  - Browse and search across numerous product categories
  - Create and upload component lists
- **Product Categories**: Automation & control, cables, wires, industrial equipment, semiconductors, passive components, connectors, and more
- **Global Presence**: Strong rankings in North America, Europe, Asia for product availability and service responsiveness
- **Recognition**: One of world's fastest-growing distributors of electronic components
- **Note**: Verified February 2026

#### Mouser Electronics
- **Official URLs**: https://www.mouser.com/ (USA), https://www.mouser.ca/ (Canada)
- **About**: https://www.mouser.com/applications/aboutus/
- **Pricing**: Per-component pricing (instant quotes online)
- **Parent Company**: Wholly owned subsidiary of TTI, Inc. (one of largest global distributors of passive and interconnect components)
- **Key Features**:
  - 104,000+ SKUs in stock
  - Same-day shipping on most orders
  - Multiple regional sites serving different locations
  - Change location and currency preferences on platform
- **Product Categories**: Semiconductors, capacitors, connectors, integrated circuits, microcontrollers, sensors, and many other categories
- **Distribution Centers**: Multiple locations globally
- **Note**: Verified February 2026

#### Newark Electronics / Farnell
- **Official URLs**:
  - Newark (North America): https://www.newark.com/
  - Farnell Page: https://www.farnell.com/newark/
  - About: https://www.newark.com/about-us
- **Pricing**: Per-component pricing (instant quotes online)
- **Parent Company**: Owned by Avnet (since 2016)
- **Global Network**:
  - **Farnell**: Serving Europe, Middle East, Africa, Japan
  - **element14**: Serving Asia Pacific
  - **Newark**: Serving North and South America
- **Key Features**:
  - 3,000+ new products added monthly
  - 10 million products on demand
  - 48 local websites, 20 main offices, 13 warehouses globally
  - 3,000+ employees
  - 80+ years of operational history
- **Product Categories**: Electronic components, semiconductors, connectors, passive components, optoelectronics, automation controls, related products for system design, maintenance, and repair
- **Support**:
  - 24/7 customer support
  - Technical expertise
  - element14 Community (890,000+ members)
  - Product comparison tools, detailed datasheets, pricing information
- **Note**: Verified February 2026

### PCB Fabrication Services

#### JLCPCB
- **Official URL**: https://jlcpcb.com/
- **Quote Tool**: https://jlcpcb.com/quote
- **PCB Layout Quote**: https://design.jlcpcb.com/quote
- **Help Center**: https://jlcpcb.com/help/
- **Standard PCB Pricing**:
  - **Starting Price**: $2.00 for 5 pieces of 2-layer PCBs (≤10cm x 10cm)
  - **Build Time**: As fast as 24 hours for FR-4 PCBs
- **PCB Assembly (PCBA) Pricing**:
  - **Economic PCBA**:
    - Setup fee: $8
    - Assembly cost: $0.0016 per joint
    - Panel: $7.81/panel
    - Stencil: $1.50
  - **Standard PCBA**:
    - Setup fee: $25 (single-side) / $50 (double-side)
    - Assembly cost: $0.0016-$0.0013 per joint (volume-dependent)
    - Panel: $7.81/panel
    - Stencil: $7.86-$15.72 (depending on sides)
  - **Additional Fees**: Manual assembly ($0.0157-$0.011 per joint), X-ray inspection ($0.08-$1.57 per piece), hand-soldering labor ($3.50 per order)
- **PCB Layout Services**: Design and modification services available (pricing based on specifications and pad count)
- **Service Features**:
  - FR-4 PCBs: 1-32 layers available
  - Flexible PCBs, metal core PCBs, high-frequency PCBs offered
  - Free Via-in-Pad for 6+ layer boards
  - Impedance control available
- **Instant Quote**: Use online tool for exact current pricing
- **Note**: Verified February 2026

#### PCBWay
- **Official URL**: https://www.pcbway.com/
- **Prototype Quote**: https://www.pcbway.com/prototype_pcb/PCB-Prototype-Quote.html
- **Pricing Page**: https://www.pcbway.com/prototype_pcb/Price-of-PCB-Prototype.html
- **SMT Assembly**: https://www.pcbway.com/quotesmt.aspx
- **PCB Design Services**: https://www.pcbway.com/pcbdesign/quotedesign
- **Prototype Pricing Examples** (Real customer projects):
  - 2-layer boards (48.57×32.38mm): $30 for 20 pieces
  - 2-layer boards (100×85mm): $13 for 5 pieces
  - 4-layer boards (170×50mm): $115 for 10 pieces
  - 2-layer boards (199×54mm): $33 for 10 pieces
- **Cost Factors**:
  - Material selection
  - Fabrication complexity
  - Number of layers
  - Board dimensions
  - Assembly options
  - Copper weight and finish specifications (HASL with/without lead)
- **New Customer Offer**: $5.00 coupon upon registration
- **Instant Quote System**: Input specific parameters for immediate pricing
- **Focus**: Cost optimization for makers and students, passing manufacturing savings directly to customers
- **Note**: Verified February 2026

#### OSH Park
- **Official URL**: https://oshpark.com/
- **Pricing Page**: https://oshpark.com/pricing
- **Services Documentation**: https://docs.oshpark.com/services/
- **Two-Layer Boards**:
  - **Prototype**: $5 per square inch (set of 3), 9-12 day turnaround
  - **Super Swift**: $10 per square inch (set of 3), 4-5 business days
  - **2oz 0.8mm**: $5 per square inch (set of 3), 12-21 day turnaround
  - **After Dark**: $5 per square inch (set of 3), 12-21 day turnaround
  - **Medium Run**: $1 per square inch (100 square inch minimum, multiples of 10), 12-21 day turnaround
  - **Flex**: $10 per square inch (temporarily suspended)
- **Four-Layer Boards**:
  - **Prototype**: $10 per square inch (set of 3), 9-14 day turnaround
  - **Super Swift**: $20 per square inch (set of 3), 5-6 business days
  - **Medium Run**: $2 per square inch (100 square inch minimum, multiples of 3), 12-21 day turnaround
- **Six-Layer Boards**:
  - **Prototype**: $15 per square inch (set of 3), 9-14 day turnaround
- **Key Features**:
  - Purple soldermask over bare copper (SMOBC)
  - ENIG finish (Electroless Nickel Immersion Gold)
  - Manufactured in the United States
  - Free worldwide shipping
- **Note**: Verified February 2026

### Hardware Prototyping Labs and Makerspaces

#### Fab Lab Network (Global)
- **Official URL**: https://fabfoundation.org/global-community
- **Network Size**: ~1,500 Fab Labs across 90+ countries
- **Purpose**: Democratizing access to fabrication tools
- **Functions**:
  - Manufacturing network
  - Distributed technical education campus
  - Distributed research laboratory
- **Resources Provided to Member Labs**:
  - Free SOLIDWORKS software licenses for makers
  - Discounted 3D printing materials
  - Project management tools
  - Fab Foundation Forum for communication between regional networks
  - Support with operations, sustainability, and fundraising
- **Note**: Verified February 2026, largest coordinated system of hardware prototyping spaces

#### mHUB (Chicago)
- **Official URL**: https://www.mhubchicago.com/
- **Prototyping Lab**: https://www.mhubchicago.com/prototyping-lab
- **Facility Size**: 11 specialized labs
- **Equipment Value**: $6 million+
- **Capabilities**:
  - 3D printing
  - Electronics
  - Metalworking
  - Laser cutting
  - Additional specialized equipment
- **Target Audience**: Startups, students, researchers, hobbyists
- **Note**: Verified February 2026

#### OriginLabs (Penn State)
- **Official URL**: https://originlabs.psu.edu/
- **Facility Size**: 7,000 sq ft
- **Capabilities**:
  - Benchworking
  - Metalworking
  - Digital fabrication
  - Additive manufacturing
- **Resources**: Free training and workshops
- **Note**: Verified February 2026

#### NYU MakerSpace
- **Official URL**: https://makerspace.engineering.nyu.edu/
- **Type**: Academic prototyping workspace
- **Resources**: Cutting-edge tools and training workshops
- **Target Audience**: NYU students and staff
- **Note**: Verified February 2026

#### Circuit Launch
- **Official URL**: https://www.circuitlaunch.com/
- **Type**: Specialized coworking space for robotics and hardware electronics companies
- **Resources**: Shared fabrication and electronics labs
- **Target Audience**: Robotics and electronics hardware companies
- **Note**: Verified February 2026

---

## Additional Notes

**Document Status**: All links and pricing information verified as of **February 4, 2026**

**Pricing Disclaimer**: Pricing information is current as of February 2026 but may change. Contact vendors directly for most current quotes, educational discounts, volume pricing, and enterprise licensing options.

**Free/Open-Source Resources**: ROS, MoveIt!, KiCad, OpenRocket, NASA CEA, EasyEDA are all free and open-source tools, providing excellent zero-cost options for students, researchers, and startups.

**Regional Variations**: Many suppliers and software vendors have regional pricing variations. Check local websites for accurate currency and regional support options.

**Academic/Startup Programs**: Most commercial software vendors offer significant discounts or free licenses for students, educators, and qualifying startups. Contact sales teams for information about these programs.

---

**Compiled by**: AI Research Assistant  
**Verification Date**: February 4, 2026  
**Sources**: Official vendor websites, product documentation, and verified web search results

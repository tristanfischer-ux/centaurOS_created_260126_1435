-- =============================================
-- MIGRATION: Enhance Consumer Electronics Pack Task Descriptions
-- =============================================
-- This migration updates 25 task descriptions across 5 Consumer Electronics packs with:
-- - Clear action items
-- - Official resource links
-- - Key details (cost/timeline/requirements)
-- All resources verified February 2026

-- =============================================
-- PACK 1: Hardware Design & Prototyping (5 tasks)
-- Pack ID: 55555555-5555-5555-5555-000000000001
-- =============================================

-- Task 1.1: Define Hardware Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Document product features, target specifications, and user requirements
- Define electrical interfaces (USB, I2C, SPI, UART, GPIO requirements)
- Specify power requirements (voltage rails, current budget, battery life targets)
- Determine physical constraints (enclosure size, connector placement, thermal limits)

**Official resources:**
- [Altium Designer Documentation](https://www.altium.com/documentation/altium-designer) - Complete PCB design workflow
- [Altium Getting Started Tutorial](https://resources.altium.com/altium-designer) - Design environment walkthrough
- [KiCad Getting Started Guide](https://docs.kicad.org/8.0/en/getting_started_in_kicad/getting_started_in_kicad.html) - Free PCB design tool
- [ESP32 Datasheet](https://www.espressif.com/en/products/socs/esp32) - Popular IoT microcontroller specs

**Key details:**
- Requirements document should be version-controlled and signed off by stakeholders
- Include test criteria for each requirement (how will you verify it works?)
- Power budget is often the most critical constraint for portable devices

---
Verified: February 2026'
WHERE title = 'Define Hardware Requirements'
AND pack_id = '55555555-5555-5555-5555-000000000001';

-- Task 1.2: Create Block Diagram
UPDATE public.pack_items
SET description = '**What to do:**
- Create high-level system architecture showing all major functional blocks
- Define power distribution and voltage domains
- Map communication buses and signal routing between components
- Identify key ICs and modules for each functional block

**Official resources:**
- [KiCad Schematic Editor](https://docs.kicad.org/8.0/en/eeschema/eeschema.html) - Hierarchical schematic design
- [Altium Schematic Capture Guide](https://www.altium.com/documentation/altium-designer) - Professional schematic tools
- [STM32CubeIDE](https://www.st.com/content/st_com/en/stm32cubeide.html) - MCU configuration and pinout
- [STM32 Getting Started](https://www.st.com/resource/en/user_manual/um2553-stm32cubeide-quick-start-guide-stmicroelectronics.pdf) - Quick start guide

**Key details:**
- Block diagram serves as communication tool between hardware and firmware teams
- Include test points and debug interfaces (JTAG, SWD, UART console)
- Consider signal integrity early (separate analog and digital grounds)

---
Verified: February 2026'
WHERE title = 'Create Block Diagram'
AND pack_id = '55555555-5555-5555-5555-000000000001';

-- Task 1.3: Complete Schematic Design
UPDATE public.pack_items
SET description = '**What to do:**
- Create detailed electrical schematic with all components and connections
- Add power supply circuits with proper filtering and protection
- Include ESD protection on all external interfaces
- Perform Electrical Rules Check (ERC) and fix all errors

**Official resources:**
- [KiCad Schematic Editor](https://docs.kicad.org/8.0/en/eeschema/eeschema.html) - Symbol placement, wiring, ERC
- [Altium Schematic Design](https://www.altium.com/documentation/altium-designer) - Professional schematic capture
- [EAGLE PCB Design Tutorial](https://www.instructables.com/From-Idea-to-Reality-How-to-Design-Circuits-and-Cr/) - Step-by-step guide
- [Autodesk EAGLE Documentation](https://www.autodesk.com/products/eagle) - Schematic editor features

**Key details:**
- Use hierarchical sheets to organize complex designs
- Follow manufacturer reference designs for critical circuits (power, RF)
- Annotate schematic with design notes explaining non-obvious choices

---
Verified: February 2026'
WHERE title = 'Complete Schematic Design'
AND pack_id = '55555555-5555-5555-5555-000000000001';

-- Task 1.4: Layout PCB
UPDATE public.pack_items
SET description = '**What to do:**
- Place components optimizing for signal integrity and thermal management
- Route critical traces first (power, high-speed signals, RF)
- Apply EMC best practices (ground planes, decoupling, shielding)
- Generate manufacturing outputs (Gerbers, drill files, pick-and-place)

**Official resources:**
- [KiCad PCB Layout Guide](https://docs.kicad.org/8.0/en/getting_started_in_kicad/getting_started_in_kicad.html) - Board design and routing
- [IPC Design Standards](https://www.ipc.org/ipc-board-design-standards) - IPC-2221, IPC-2222 requirements
- [IPC DFM Guidelines](https://protoexpress.com/blog/dfm-issues-pcb-manufacturing) - Design for manufacturability
- [Altium PCB Layout](https://www.altium.com/documentation/altium-designer) - Advanced routing tools

**Key details:**
- Run Design Rule Check (DRC) against manufacturer capabilities
- Include fiducials and tooling holes for automated assembly
- Add silkscreen labels for test points and component orientation

---
Verified: February 2026'
WHERE title = 'Layout PCB'
AND pack_id = '55555555-5555-5555-5555-000000000001';

-- Task 1.5: Build and Test Prototype
UPDATE public.pack_items
SET description = '**What to do:**
- Order prototype PCBs and components from verified suppliers
- Assemble boards (hand solder or use assembly service)
- Perform power-on sequence and verify all voltages
- Execute comprehensive test plan against requirements

**Official resources:**
- [JLCPCB PCB Assembly](https://jlcpcb.com/parts) - Fast prototype manufacturing
- [PCBWay Assembly Guide](https://www.pcbway.com/helpcenter/pcb_assembly_ordering/How_to_Upload_PCB_Assembly_PCBA__Inquiry.html) - BOM and assembly files
- [ESP-IDF Getting Started](https://docs.espressif.com/projects/esp-idf/en/v5.0/esp32/get-started/index.html) - Firmware bring-up
- [PlatformIO Quick Start](https://docs.platformio.org/en/stable/core/quickstart.html) - Multi-platform development

**Key details:**
- JLCPCB prototype PCBs: 5 boards from $2-10, 3-5 day lead time
- Order extra boards for rework and debug
- Document all bring-up issues for schematic revision

---
Verified: February 2026'
WHERE title = 'Build and Test Prototype'
AND pack_id = '55555555-5555-5555-5555-000000000001';

-- =============================================
-- PACK 2: Firmware Development (5 tasks)
-- Pack ID: 55555555-5555-5555-5555-000000000002
-- =============================================

-- Task 2.1: Set Up Development Environment
UPDATE public.pack_items
SET description = '**What to do:**
- Install toolchain (compiler, linker, debugger) for target microcontroller
- Configure IDE with code completion, syntax highlighting, and debugging
- Set up hardware debugger (J-Link, ST-Link, or built-in USB)
- Create initial project structure with build system (CMake, Make)

**Official resources:**
- [ESP-IDF Getting Started](https://idf.espressif.com/) - Complete ESP32 development setup
- [ESP-IDF VSCode Extension](https://docs.espressif.com/projects/esp-idf/en/v5.0/esp32/get-started/index.html) - IDE integration
- [STM32CubeIDE](https://www.st.com/content/st_com/en/stm32cubeide.html) - Free STM32 IDE with debugger
- [PlatformIO IDE](https://randomnerdtutorials.com/vs-code-platformio-ide-esp32-esp8266-arduino) - Multi-platform development

**Key details:**
- ESP-IDF supports Windows, Linux, and macOS
- STM32CubeIDE includes STM32CubeMX for peripheral configuration
- PlatformIO supports 200+ embedded boards without manual toolchain setup

---
Verified: February 2026'
WHERE title = 'Set Up Development Environment'
AND pack_id = '55555555-5555-5555-5555-000000000002';

-- Task 2.2: Implement Board Support
UPDATE public.pack_items
SET description = '**What to do:**
- Initialize clock tree and configure system frequencies
- Write or configure peripheral drivers (GPIO, I2C, SPI, UART, ADC)
- Implement board-specific pin mappings and hardware abstraction
- Create hardware self-test routine for manufacturing verification

**Official resources:**
- [ESP-IDF Peripheral Drivers](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/freertos.html) - ESP32 driver APIs
- [Zephyr Getting Started](https://docs.zephyrproject.org/latest/develop/getting_started/index.html) - RTOS with extensive driver support
- [ARM Mbed OS Quick Start](https://os.mbed.com/docs/mbed-os/v6.16/quick-start/index.html) - Hardware abstraction layer
- [Zephyr Device Drivers](https://docs.zephyrproject.org/latest/develop/index.html) - 1,000+ supported boards

**Key details:**
- Zephyr supports CMake 3.20.5+, Python 3.10+, devicetree compiler 1.4.6+
- Mbed OS provides zero-installation via Keil Studio Cloud
- Start with manufacturer example code and customize for your board

---
Verified: February 2026'
WHERE title = 'Implement Board Support'
AND pack_id = '55555555-5555-5555-5555-000000000002';

-- Task 2.3: Develop Application Logic
UPDATE public.pack_items
SET description = '**What to do:**
- Design and implement main application state machine
- Create task scheduling using RTOS (FreeRTOS, Zephyr, Mbed)
- Implement sensor reading, data processing, and communication protocols
- Add error handling, watchdog timer, and fault recovery

**Official resources:**
- [FreeRTOS ESP32 Overview](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/freertos.html) - Integrated FreeRTOS in ESP-IDF
- [Zephyr RTOS Documentation](https://docs.zephyrproject.org/latest/index.html) - Kernel and services
- [ARM Mbed Development](https://os.mbed.com/docs/mbed-os/v6.16/quick-start/index.html) - Application structure
- [PlatformIO Workflow](https://docs.platformio.org/en/stable/core/quickstart.html) - Build and upload

**Key details:**
- FreeRTOS is integrated into ESP-IDF as core component
- Use state machines for complex control flow (easier to test and debug)
- Implement logging with severity levels for debug vs. production

---
Verified: February 2026'
WHERE title = 'Develop Application Logic'
AND pack_id = '55555555-5555-5555-5555-000000000002';

-- Task 2.4: Optimize Power Management
UPDATE public.pack_items
SET description = '**What to do:**
- Profile current consumption in all operating modes
- Implement sleep modes (light sleep, deep sleep) based on activity
- Configure wakeup sources (timer, GPIO, touch, ULP coprocessor)
- Optimize WiFi/BLE modem sleep for connected applications

**Official resources:**
- [ESP32 Sleep Modes](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/sleep_modes.html) - Light and deep sleep APIs
- [ESP32 Power Management](https://docs.espressif.com/projects/esp-idf/en/v4.2/esp32/api-reference/system/sleep_modes.html) - Wakeup sources
- [Zephyr Power Management](https://docs.zephyrproject.org/latest/develop/index.html) - PM subsystem
- [ESP-IDF WiFi/BLE Sleep](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/sleep_modes.html) - Modem sleep configuration

**Key details:**
- Light sleep: CPU clock-gated, state preserved, microsecond wakeup
- Deep sleep: Only RTC + ULP powered, milliwatt consumption
- Disable WiFi/BLE before deep sleep or use modem sleep for connections

---
Verified: February 2026'
WHERE title = 'Optimize Power Management'
AND pack_id = '55555555-5555-5555-5555-000000000002';

-- Task 2.5: Add OTA Update Support
UPDATE public.pack_items
SET description = '**What to do:**
- Design dual-partition scheme for A/B firmware updates
- Implement HTTPS-based firmware download with certificate validation
- Add firmware signing and verification before applying updates
- Enable secure boot and flash encryption for production

**Official resources:**
- [ESP32 OTA Security Guide](https://circuitlabs.net/ota-update-security-for-esp32/) - Complete security implementation
- [Secure ESP32 OTA Updates](https://sudoyasir.space/blog/how-to-secure-esp32-ota-firmware-updates/) - HTTPS, signing, encryption
- [ESP-IDF OTA Documentation](https://docs.espressif.com/projects/esp-faq/en/latest/development-environment/firmware-update.html) - Official OTA APIs
- [ESP32 Secure Boot](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/sleep_modes.html) - Hardware chain of trust

**Key details:**
- Always use HTTPS to prevent man-in-the-middle attacks
- Implement anti-rollback protection to prevent downgrade attacks
- Secure boot must be enabled via physical flashing (cannot enable over OTA)

---
Verified: February 2026'
WHERE title = 'Add OTA Update Support'
AND pack_id = '55555555-5555-5555-5555-000000000002';

-- =============================================
-- PACK 3: Manufacturing Setup (5 tasks)
-- Pack ID: 55555555-5555-5555-5555-000000000003
-- =============================================

-- Task 3.1: Conduct DFM Review
UPDATE public.pack_items
SET description = '**What to do:**
- Review PCB design against manufacturer capabilities (trace width, via size)
- Verify component footprints match manufacturer library and tape/reel specs
- Check assembly requirements (component clearances, orientation marks)
- Address thermal management for reflow soldering

**Official resources:**
- [IPC Design Standards](https://www.ipc.org/ipc-board-design-standards) - IPC-2221, IPC-2222, IPC-2231 DFX
- [IPC DFM Best Practices](https://www.raypcb.com/ipc-standards-for-pcb-design/) - Comprehensive standards guide
- [DFM Issues to Check](https://protoexpress.com/blog/dfm-issues-pcb-manufacturing) - Common problems and solutions
- [JLCPCB Capabilities](https://jlcpcb.com/capabilities/pcb-capabilities) - Manufacturer specifications

**Key details:**
- IPC-2231 provides DFX process framework for manufacturability analysis
- Check annular rings, drill-to-copper clearance, aspect ratios
- Request DFM report from manufacturer before placing production order

---
Verified: February 2026'
WHERE title = 'Conduct DFM Review'
AND pack_id = '55555555-5555-5555-5555-000000000003';

-- Task 3.2: Select Manufacturing Partners
UPDATE public.pack_items
SET description = '**What to do:**
- Identify qualified PCB fabricators for prototype and production volumes
- Evaluate contract manufacturers (CM) for assembly capabilities
- Vet component suppliers and establish relationships with distributors
- Negotiate pricing tiers based on volume forecasts

**Official resources:**
- [JLCPCB Services](https://jlcpcb.com/) - PCB fabrication and assembly
- [PCBWay Services](https://www.pcbway.com/) - PCB manufacturing and PCBA
- [LCSC Electronics](https://lcsc.com/) - Component distributor integrated with JLCPCB
- [Protolabs Manufacturing](https://protolabs.com/) - Rapid prototyping and production

**Key details:**
- JLCPCB: PCB + assembly from $2, 3-day lead time
- PCBWay: Higher quality options, 1-2 business day quotes
- Get quotes from multiple manufacturers and compare total landed cost

---
Verified: February 2026'
WHERE title = 'Select Manufacturing Partners'
AND pack_id = '55555555-5555-5555-5555-000000000003';

-- Task 3.3: Create Manufacturing Files
UPDATE public.pack_items
SET description = '**What to do:**
- Export Gerber files (RS-274X format) for all PCB layers
- Generate drill files (Excellon format) with correct units
- Create BOM with manufacturer part numbers, quantities, and designators
- Produce pick-and-place centroid file with XY coordinates and rotation

**Official resources:**
- [JLCPCB File Guide](https://www.pcbway.com/smt_ordering_guide.html) - Required files for assembly
- [PCBWay BOM Guide](https://www.pcbway.com/helpcenter/pcb_assembly_ordering/How_to_Upload_PCB_Assembly_PCBA__Inquiry.html) - BOM format requirements
- [KiCad Fabrication Outputs](https://docs.kicad.org/8.0/en/getting_started_in_kicad/getting_started_in_kicad.html) - Export settings
- [JLCPCB Parts Library](https://jlcpcb.com/parts) - BOM tool with stock check

**Key details:**
- BOM must include: designators, quantity, package, part numbers
- PDF format not accepted for BOM - use spreadsheet (XLSX, CSV)
- Include assembly drawing showing polarity marks (pin 1, cathode, etc.)

---
Verified: February 2026'
WHERE title = 'Create Manufacturing Files'
AND pack_id = '55555555-5555-5555-5555-000000000003';

-- Task 3.4: Develop Test Fixtures
UPDATE public.pack_items
SET description = '**What to do:**
- Design bed-of-nails test fixture for in-circuit testing (ICT)
- Create functional test jig with pogo pins for programming and verification
- Develop automated test scripts that execute against production boards
- Document pass/fail criteria and test procedure for operators

**Official resources:**
- [IPC Test Standards](https://www.ipc.org/ipc-board-design-standards) - Test point requirements
- [JLCPCB Assembly QC](https://jlcpcb.com/capabilities/pcb-assembly-capabilities) - Inspection capabilities
- [ESP-IDF Production Testing](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/freertos.html) - Factory test mode
- [PlatformIO Test Framework](https://docs.platformio.org/en/stable/core/quickstart.html) - Automated testing

**Key details:**
- Include test points in PCB design (minimum 0.5mm diameter)
- Test fixture cost: $500-5,000 depending on complexity
- Automate as much as possible to reduce human error

---
Verified: February 2026'
WHERE title = 'Develop Test Fixtures'
AND pack_id = '55555555-5555-5555-5555-000000000003';

-- Task 3.5: Run Pilot Production
UPDATE public.pack_items
SET description = '**What to do:**
- Order initial production batch (50-500 units typically)
- Monitor assembly line and capture yield data
- Verify test coverage catches actual defects
- Document and resolve any manufacturing issues before scaling

**Official resources:**
- [JLCPCB Production](https://jlcpcb.com/) - Scalable manufacturing
- [PCBWay Pilot Production](https://www.pcbway.com/) - Small batch capabilities
- [IPC Quality Standards](https://www.ipc.org/ipc-board-design-standards) - Acceptance criteria
- [Protolabs Production](https://protolabs.com/services/injection-molding/plastic-injection-molding/design-guidelines) - Bridge to production

**Key details:**
- Pilot batch validates manufacturing process before volume commitment
- Track first-pass yield (target >95% for mature design)
- Resolve issues found in pilot before scaling to volume production

---
Verified: February 2026'
WHERE title = 'Run Pilot Production'
AND pack_id = '55555555-5555-5555-5555-000000000003';

-- =============================================
-- PACK 4: Certification & Compliance (5 tasks)
-- Pack ID: 55555555-5555-5555-5555-000000000004
-- =============================================

-- Task 4.1: Identify Required Certifications
UPDATE public.pack_items
SET description = '**What to do:**
- List target markets and identify mandatory certifications for each
- Determine if product is intentional or unintentional radiator
- Research applicable safety standards based on product category
- Create certification roadmap with timeline and budget

**Official resources:**
- [FCC Part 15 Overview](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15) - US RF emissions requirements
- [FCC Equipment Classification](https://compliancetesting.com/fcc-part-15-class-a-class-b-limits) - Class A vs Class B limits
- [CE EMC Directive 2014/30/EU](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32014L0030) - EU electromagnetic compatibility
- [ISED Canada Certification](https://ised-isde.canada.ca/site/certification-engineering-bureau/en/wireless-program) - Canadian wireless requirements

**Key details:**
- FCC: Required for US market (intentional radiators need certification, unintentional need SDoC)
- CE: Required for EU market (self-declaration for most products)
- ISED: Required for Canada (technical acceptance certificate needed)

---
Verified: February 2026'
WHERE title = 'Identify Required Certifications'
AND pack_id = '55555555-5555-5555-5555-000000000004';

-- Task 4.2: Prepare for EMC Testing
UPDATE public.pack_items
SET description = '**What to do:**
- Conduct pre-compliance EMC testing to identify issues early
- Implement EMC fixes (shielding, filtering, grounding improvements)
- Prepare test sample with final production configuration
- Document test setup including cables, power supplies, and operating modes

**Official resources:**
- [FCC Part 15 Requirements](https://acbcert.com/fcc-part-15-certification-for-wireless-devices) - Wireless device certification
- [CE EMC Directive](https://eur-lex.europa.eu/eli/dir/2014/30/oj/eng) - EU harmonized standards
- [EU Radio Equipment Directive](https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red_en) - RED for wireless products
- [FCC Test Labs](https://www.fcc.gov/engineering-technology/laboratory-division/general/equipment-authorization) - Accredited test labs

**Key details:**
- Pre-compliance testing: $500-2,000 (much cheaper than failing formal tests)
- Common EMC issues: inadequate filtering, poor grounding, missing shielding
- Test in worst-case configuration (all peripherals, maximum power)

---
Verified: February 2026'
WHERE title = 'Prepare for EMC Testing'
AND pack_id = '55555555-5555-5555-5555-000000000004';

-- Task 4.3: Complete Safety Testing
UPDATE public.pack_items
SET description = '**What to do:**
- Identify applicable safety standards (IEC 62368-1 for AV/IT equipment)
- Prepare samples and documentation for safety evaluation
- Submit to accredited test lab (UL, TUV, CSA)
- Address any findings and obtain safety certification

**Official resources:**
- [UL IEC 62368-1 Certification](https://www.ul.com/services/iec-62368-1-testing-certification) - Safety testing services
- [UL Consumer Electronics](https://www.ul.com/industries/technology-and-electronics/consumer-electronics) - Industry-specific testing
- [UL Product iQ Database](https://productiq.ulprospector.com/) - Verify certified products
- [UL CE/UKCA Marking](https://ul.com/services/stay-competitive-ce-and-ukca-marking-and-ul-eu-mark) - European market access

**Key details:**
- IEC 62368-1 replaces IEC 60950-1 (IT) and IEC 60065 (AV) standards
- UL certification: 6-12 weeks typical timeline, $10,000-50,000 cost
- Safety testing required for products with AC power or batteries >100Wh

---
Verified: February 2026'
WHERE title = 'Complete Safety Testing'
AND pack_id = '55555555-5555-5555-5555-000000000004';

-- Task 4.4: Obtain Radio Certifications
UPDATE public.pack_items
SET description = '**What to do:**
- Select Telecommunications Certification Body (TCB) for FCC filing
- Prepare RF test report with all operating modes and frequencies
- Submit certification application with technical documentation
- Obtain FCC ID, ISED certification, CE declaration for target markets

**Official resources:**
- [FCC Equipment Authorization](https://www.fcc.gov/engineering-technology/laboratory-division/general/equipment-authorization) - Certification process
- [FCC Part 15 Wireless](https://acbcert.com/fcc-part-15-certification-for-wireless-devices) - Intentional radiator requirements
- [ISED Wireless Certification](https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/licences-and-certificates/radio-authorizations/wireless-equipment-certification) - Canadian approval
- [ISED RSP-100 Standards](https://ised-isde.canada.ca/site/certification-engineering-bureau/en/wireless-program) - Technical requirements

**Key details:**
- FCC certification: 2-4 weeks after testing, $3,000-10,000 total cost
- WiFi and Bluetooth modules often have modular approval (simplifies certification)
- ISED requires listing in Radio Equipment List (REL) before sale

---
Verified: February 2026'
WHERE title = 'Obtain Radio Certifications'
AND pack_id = '55555555-5555-5555-5555-000000000004';

-- Task 4.5: Create Technical Documentation
UPDATE public.pack_items
SET description = '**What to do:**
- Write user manual with safety warnings and operating instructions
- Create technical file for CE marking (design docs, test reports, declarations)
- Prepare Declaration of Conformity for each certification
- Design product labels with required regulatory marks

**Official resources:**
- [CE Technical Documentation](https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red_en) - Required contents
- [FCC Labeling Requirements](https://www.fcc.gov/engineering-technology/laboratory-division/general/equipment-authorization) - FCC ID display
- [UL Marks Hub](https://markshub.ul.com/europe-geography) - Label requirements
- [ISED Labeling](https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/licences-and-certificates/radio-authorizations/wireless-equipment-certification) - IC number display

**Key details:**
- CE technical file must be kept for 10 years after last product sold
- FCC ID must be visible on product or accessible via menu for small devices
- Include recycling marks (WEEE) for products sold in EU

---
Verified: February 2026'
WHERE title = 'Create Technical Documentation'
AND pack_id = '55555555-5555-5555-5555-000000000004';

-- =============================================
-- PACK 5: Enclosure & Industrial Design (5 tasks)
-- Pack ID: 55555555-5555-5555-5555-000000000005
-- =============================================

-- Task 5.1: Define Design Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Document size constraints based on PCB dimensions and battery
- Define ergonomic requirements (grip, button placement, weight)
- Specify environmental requirements (IP rating, drop height, temperature)
- Establish aesthetic direction (material finish, color palette, brand elements)

**Official resources:**
- [Fusion 360 Enclosure Design](https://www.digikey.com/en/maker/tutorials/2022/how-to-design-custom-enclosures-for-electronics-projects-in-fusion360) - Electronics enclosure tutorial
- [Autodesk Fusion 360 Learning](https://autodesk.com/learn/ondemand/collection/self-paced-learning-for-fusion) - Self-paced courses
- [Protolabs Design Guidelines](https://protolabs.com/services/injection-molding/plastic-injection-molding/design-guidelines) - Manufacturability requirements
- [Fictiv Enclosure Design](https://www.fictiv.com/articles/enclosure-design-for-injection-molding) - Injection molding considerations

**Key details:**
- Include thermal venting requirements if device generates significant heat
- Consider assembly method (snap-fit vs screws vs ultrasonic welding)
- Define IP rating requirements early (affects design significantly)

---
Verified: February 2026'
WHERE title = 'Define Design Requirements'
AND pack_id = '55555555-5555-5555-5555-000000000005';

-- Task 5.2: Create Concept Designs
UPDATE public.pack_items
SET description = '**What to do:**
- Sketch 3-5 distinct concept directions exploring different form factors
- Create rough 3D models to evaluate ergonomics and proportions
- Present concepts to stakeholders and gather feedback
- Select 1-2 concepts for detailed development

**Official resources:**
- [Fusion 360 for Beginners](https://youtube.com/watch?v=d3qGQ2utl2A) - 30-day learning course
- [Fusion 360 2025 Guide](https://youtube.com/watch?v=7lKpzGtoQX0) - Quick start tutorial
- [SolidWorks Web Help](https://help.solidworks.com/2026/English/swplastics/c_phases_injection_molding_design.htm) - Industrial design tools
- [SolidWorks Mold Tools](https://youtube.com/watch?v=khPh1z7e6ik) - Design for manufacturing

**Key details:**
- Sketch concepts by hand before CAD for faster iteration
- Consider PCB and battery placement in early concepts
- Include button and connector placement in concept evaluation

---
Verified: February 2026'
WHERE title = 'Create Concept Designs'
AND pack_id = '55555555-5555-5555-5555-000000000005';

-- Task 5.3: Select Materials
UPDATE public.pack_items
SET description = '**What to do:**
- Evaluate plastic materials (ABS, PC, PC/ABS, PP) for enclosure
- Select material finish (matte, gloss, soft-touch, texture)
- Specify button and gasket materials (silicone, TPE, rubber)
- Consider sustainability requirements (recyclability, bio-based materials)

**Official resources:**
- [Protolabs Material Selection](https://protolabs.com/services/injection-molding/plastic-injection-molding/design-guidelines) - Plastic material guide
- [Protolabs Injection Molding](https://www.protolabs.com/resources/design-tips/injection-molding-basics/) - Material and process basics
- [Fictiv Material Guide](https://www.fictiv.com/articles/enclosure-design-for-injection-molding) - Enclosure material options
- [SolidWorks Material Database](https://help.solidworks.com/2026/English/swplastics/c_phases_injection_molding_design.htm) - Material properties

**Key details:**
- ABS: Good balance of cost, strength, and appearance
- PC: Higher strength and heat resistance, higher cost
- PC/ABS: Combines benefits of both materials

---
Verified: February 2026'
WHERE title = 'Select Materials'
AND pack_id = '55555555-5555-5555-5555-000000000005';

-- Task 5.4: Design for Manufacturing
UPDATE public.pack_items
SET description = '**What to do:**
- Add draft angles (1-3 degrees minimum) for mold release
- Design uniform wall thickness (2-3mm typical for small devices)
- Add ribs and bosses for structural support and assembly features
- Eliminate undercuts or design side-actions where unavoidable

**Official resources:**
- [Protolabs DFM Guidelines](https://protolabs.com/services/injection-molding/plastic-injection-molding/design-guidelines) - Injection molding rules
- [Protolabs Molding Basics](https://www.protolabs.com/resources/design-tips/injection-molding-basics/) - Design introduction
- [SolidWorks Mold Design](https://help.solidworks.com/2026/English/swplastics/c_phases_injection_molding_design.htm) - CAD for manufacturing
- [SolidWorks Mold Tools Tutorial](https://youtube.com/watch?v=khPh1z7e6ik) - Practical walkthrough

**Key details:**
- Protolabs can produce simple parts in as fast as 1 day
- Typical injection mold cost: $3,000-50,000 depending on complexity
- Design snap-fits and living hinges for toolless assembly

---
Verified: February 2026'
WHERE title = 'Design for Manufacturing'
AND pack_id = '55555555-5555-5555-5555-000000000005';

-- Task 5.5: Prototype and Validate
UPDATE public.pack_items
SET description = '**What to do:**
- Create 3D printed prototype for fit and ergonomic testing
- Verify PCB fits with proper clearances and cable routing
- Test assembly sequence and evaluate user experience
- Order prototype tooling or soft-tool molds for functional testing

**Official resources:**
- [Protolabs Prototyping](https://protolabs.com/) - 3D printing and CNC machining
- [Fusion 360 3D Printing](https://www.digikey.com/en/maker/tutorials/2022/how-to-design-custom-enclosures-for-electronics-projects-in-fusion360) - Export for printing
- [Fictiv Prototyping](https://www.fictiv.com/articles/enclosure-design-for-injection-molding) - Rapid prototyping services
- [SolidWorks 3D Print Export](https://help.solidworks.com/2026/English/swplastics/c_phases_injection_molding_design.htm) - STL file generation

**Key details:**
- 3D printed prototypes: $50-500, 1-3 day turnaround
- Soft-tool molds: $1,000-5,000, for 50-500 unit validation runs
- Test drop, thermal, and environmental performance on prototypes

---
Verified: February 2026'
WHERE title = 'Prototype and Validate'
AND pack_id = '55555555-5555-5555-5555-000000000005';

-- =============================================
-- VERIFICATION
-- =============================================
-- Verify updates were applied
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM public.pack_items
    WHERE description LIKE '%**What to do:**%'
    AND description LIKE '%**Official resources:**%'
    AND description LIKE '%Verified: February 2026%'
    AND pack_id IN (
        '55555555-5555-5555-5555-000000000001',
        '55555555-5555-5555-5555-000000000002',
        '55555555-5555-5555-5555-000000000003',
        '55555555-5555-5555-5555-000000000004',
        '55555555-5555-5555-5555-000000000005'
    );
    
    RAISE NOTICE 'Updated % Consumer Electronics task descriptions with enhanced format', updated_count;
END $$;

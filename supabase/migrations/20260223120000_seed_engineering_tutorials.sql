-- ============================================================================
-- Seed 12 hardware-engineering tutorials for the Inspiration / Learn page
-- ============================================================================

INSERT INTO tutorials (title, slug, description, topic, difficulty, estimated_read_minutes, tags, prerequisites, tools_mentioned, sections, common_mistakes, further_reading, key_takeaways)
VALUES

-- 1. From Idea to Product Requirements Document
(
  'From Idea to Product Requirements Document',
  'idea-to-prd',
  'Turn a napkin sketch into a rigorous PRD that aligns your team, investors, and manufacturers.',
  'Concept & Requirements',
  'beginner',
  6,
  ARRAY['PRD', 'Requirements', 'Planning', 'Hardware'],
  ARRAY['Basic understanding of your product concept', 'Target market identified'],
  ARRAY['Notion', 'Google Docs', 'Git'],
  '[
    {"heading": "Why a PRD Matters", "content": "A PRD is the single source of truth that keeps founders, engineers, designers, and manufacturers aligned. Without one you will face scope creep (features multiply because nobody agreed on boundaries), miscommunication with CMs (your contract manufacturer needs precise specs, not hand-waving), and wasted prototyping cycles (building the wrong thing is the most expensive mistake in hardware).\n\nA good PRD doesn''t constrain creativity — it focuses it. Think of it as the brief an architect writes before drawing a building.", "tips": ["Write your first PRD before any CAD or schematic work begins", "It will evolve — that is fine — but starting without one is like navigating without a map"]},
    {"heading": "Anatomy of a Hardware PRD", "content": "Your PRD should contain these sections:\n\n**1. Problem Statement** — Describe the user pain point in 2–3 sentences. Be specific. \"Industrial greenhouse operators waste 15 hours per week manually adjusting ventilation\" is better than \"farming is inefficient\".\n\n**2. Target User** — Create a brief persona: who are they, what do they currently use, what would make them switch?\n\n**3. Use-Case Scenarios** — List 3–5 concrete scenarios describing how the product is used in the field, covering environment, key actions, and success criteria.\n\n**4. Functional Requirements** — Must-haves written as testable statements, e.g. \"The device shall measure temperature to ± 0.5 °C accuracy\" or \"Battery shall last ≥ 72 hours on a single charge\".\n\n**5. Non-Functional Requirements** — Performance, reliability, regulatory, and UX constraints such as operating temperature range, MTBF targets, and required certifications.\n\n**6. Physical Constraints** — Target weight, maximum envelope dimensions, and mounting requirements.\n\n**7. Target BOM Cost & Pricing** — State your target at volume and intended retail price to force early reality checks.\n\n**8. Open Questions & Risks** — List what you don''t know yet. Honest unknowns are more valuable than fake certainty.", "tips": ["Keep it concise — 3–6 pages is ideal", "Version control it with a shared tool", "Review with your CM early — they will flag manufacturability issues"]},
    {"heading": "Common Mistakes", "content": "1. **Writing features instead of requirements** — \"Has a colour screen\" is a solution. \"User shall read status at arm''s length in direct sunlight\" is a requirement.\n\n2. **Ignoring the physical environment** — Indoor lab conditions ≠ real-world deployment.\n\n3. **No acceptance criteria** — If you can''t test it, it''s not a requirement.", "tips": ["Revisit your PRD quarterly — requirements evolve", "A stale PRD is almost as bad as no PRD"]}
  ]'::jsonb,
  ARRAY['Writing features instead of requirements', 'Ignoring the physical environment', 'No acceptance criteria'],
  ARRAY['Product Requirements Document template (Notion)', 'Hardware PRD examples on GitHub'],
  ARRAY['A PRD is the single source of truth that prevents scope creep and miscommunication', 'Write testable requirements, not feature wishlists', 'Review with your CM early to catch manufacturability issues', 'Keep it to 3–6 pages and version-control it']
),

-- 2. Competitive Teardowns & Reverse Engineering
(
  'Competitive Teardowns & Reverse Engineering',
  'competitive-teardowns',
  'Learn from existing products by systematically disassembling and analysing competitor hardware.',
  'Concept & Requirements',
  'beginner',
  5,
  ARRAY['Teardown', 'Competitive Analysis', 'Research', 'Hardware'],
  ARRAY['A product idea or market segment identified', 'Basic electronics knowledge helpful'],
  ARRAY['iFixit toolkit', 'Digital callipers', 'USB microscope', 'DigiKey', 'Mouser'],
  '[
    {"heading": "Why Teardowns Matter", "content": "Before you design your product from scratch, study what already exists. A structured teardown of competitor products reveals design decisions, cost structures, and manufacturing techniques that would take months to discover on your own.\n\nKey benefits:\n- Benchmark your BOM cost against real products already in market\n- Discover proven design patterns for enclosures, PCB layout, and thermal management\n- Identify gaps where competitors cut corners — these are your differentiation opportunities\n- Learn from their certifications — check FCC/CE labels for test lab references", "tips": ["Purchase 2–4 competing or adjacent products including the market leader, a premium option, a budget option, and an adjacent product"]},
    {"heading": "The Teardown Process", "content": "**Step 1 — Document the Unboxing.** Photograph the retail packaging, included accessories, and printed materials. Note perceived build quality, weight, and first impressions. Time yourself setting it up — this is your UX benchmark.\n\n**Step 2 — External Inspection.** Before opening anything: measure overall dimensions and weight, identify screw types, snap-fit locations, gaskets, and labels, note regulatory markings (CE, FCC ID, UL file number), and photograph every angle.\n\n**Step 3 — Disassembly.** Work methodically: remove fasteners and note screw types/lengths, separate the enclosure, photograph each layer, and bag and label small parts.\n\n**Step 4 — PCB Analysis.** Identify the main IC, count PCB layers, estimate PCB area, note connector types, antenna design, and power supply topology, and look for test points and programming headers.\n\n**Step 5 — Mechanical Analysis.** Measure wall thicknesses, identify material (look for recycling stamps), note draft angles, parting lines, and gate locations.\n\n**Step 6 — BOM Estimation.** Build a rough BOM: look up IC pricing at 1k+ quantity, estimate PCB cost from area and layer count, estimate enclosure tooling and piece price.", "tips": ["Equipment needed: iFixit toolkit (£30), spudger set (£8), digital callipers (£20), USB microscope (£40), digital scale (£15), camera on tripod"]},
    {"heading": "Turning Insights into Action", "content": "After completing your teardowns, write a 1-page summary covering:\n\n1. What competitors do well that you should match or exceed\n2. Where competitors are weak — your differentiation opportunities\n3. BOM cost benchmark — what the market expects at each price point\n4. Manufacturing techniques you want to adopt or avoid\n\nThis summary feeds directly back into your PRD and early design decisions.", "tips": ["Teardowns for learning are legal in the UK and EU", "Do not copy patented mechanisms directly — use teardowns for inspiration, not duplication"]}
  ]'::jsonb,
  ARRAY['Not documenting systematically — take photos at every step', 'Focusing only on electronics and ignoring mechanical design', 'Skipping the BOM estimation step'],
  ARRAY['iFixit teardown guides for methodology examples', 'DigiKey BOM costing tools'],
  ARRAY['Study 2–4 competitors before designing from scratch', 'A structured teardown reveals cost structures and manufacturing techniques', 'Build a rough BOM from teardown findings to benchmark your target cost', 'Write a 1-page summary that feeds into your PRD']
),

-- 3. Hardware Product Development Process
(
  'Hardware Product Development Process',
  'hardware-development-process',
  'End-to-end guide: concept → prototype → EVT → DVT → PVT → production.',
  'Product Development',
  'intermediate',
  7,
  ARRAY['Hardware', 'Process', 'EVT', 'DVT', 'PVT', 'Guide'],
  ARRAY['Completed PRD', 'Basic understanding of hardware components'],
  ARRAY['CAD software', 'EDA tool', 'Test equipment', 'Contract manufacturer'],
  '[
    {"heading": "The Stages at a Glance", "content": "Taking a hardware product from concept to mass production follows a well-established stage-gate process. Each stage has specific goals, deliverables, and exit criteria. Skipping stages is how startups burn cash and miss launch dates.\n\n- **Concept** (2–4 weeks): Explore solutions → concept sketches, feasibility study\n- **Prototype** (4–8 weeks): Prove the idea works → functional prototype\n- **EVT** (6–12 weeks): Engineering Validation → 10–50 units, validated specs\n- **DVT** (6–10 weeks): Design Validation → 50–200 units, production-intent design\n- **PVT** (4–8 weeks): Production Validation → 200–1000 units, factory-ready process\n- **MP** (ongoing): Mass Production → ship to customers", "tips": ["A typical hardware product takes 12–18 months from concept to first customer shipment", "Budget 50% more time and 30% more money than your plan says"]},
    {"heading": "Concept & Prototype Stages", "content": "**Concept Stage** — Explore multiple solutions and select the most promising direction. Brainstorm 3–5 different approaches, build rough proof-of-concept models, conduct feasibility analysis. Exit criteria: concept selected, PRD finalised, project plan created.\n\n**Prototype Stage** — Build a functional prototype demonstrating the core value proposition. You typically build two kinds: a looks-like (form factor and UX) and a works-like (electronics and firmware on dev boards). When these converge into a single unit, you have an engineering prototype. Exit criteria: core functionality demonstrated, key technical risks retired.", "tips": ["Use cardboard, off-the-shelf dev boards, and 3D prints for concept models", "The prototype stage is about retiring technical risk, not perfecting the design"]},
    {"heading": "EVT — Engineering Validation Test", "content": "Build 10–50 units using production-intent (but not necessarily final) parts. PCBs fabricated from the final schematic — but enclosure tooling may be soft (3D-printed, CNC). Run full test suite: electrical, thermal, mechanical, environmental. Expect 1–3 PCB respins.\n\nKey tests: power consumption and thermal testing, wireless range and EMC pre-scan, drop/vibration/environmental stress, battery life validation, firmware feature completeness.\n\nExit criteria: all functional requirements pass, BOM cost within target, no critical open issues.", "tips": ["Bring your CM in during EVT for DFM feedback — don''t wait until DVT"]},
    {"heading": "DVT — Design Validation Test", "content": "Build 50–200 units using production tooling (injection moulds, final PCBs, final components). Conduct formal certification testing (CE, FCC, UL). Run reliability testing: accelerated life testing, HALT. Validate packaging and accessories. Begin writing manufacturing test procedures.\n\nExit criteria: certifications passed, reliability targets met, all tooling approved, manufacturing test procedures complete.", "tips": ["Plan certification testing during DVT, not after — it takes 4–8 weeks"]},
    {"heading": "PVT & Mass Production", "content": "**PVT** — Build 200–1,000 units on the actual production line at your CM. Measure yield rate, cycle time, and defect rate. Fine-tune assembly instructions and test fixtures. Train factory operators. These units may be sold as early-access or beta units. Exit criteria: yield > 95%, cycle time meets target, all operators trained.\n\n**MP** — Continuous production runs based on demand forecast. Ongoing quality monitoring, Engineering Change Orders for improvements, supplier management and BOM cost reduction.", "tips": ["Feature creep between stages is the enemy — lock the spec at each gate", "New features go into v2"]}
  ]'::jsonb,
  ARRAY['Skipping EVT and going straight to tooling', 'Underestimating certification timeline', 'Not involving CM early enough', 'Feature creep between stages', 'Ignoring test fixtures'],
  ARRAY['Ben Einstein (Bolt) hardware development guides', 'Dragon Innovation manufacturing resources'],
  ARRAY['Hardware development follows Concept → Prototype → EVT → DVT → PVT → MP', 'Each stage has clear exit criteria — do not skip stages', 'Budget 12–18 months from concept to first shipment', 'Bring your CM in during EVT, not after DVT']
),

-- 4. Your First PCB: Schematic to Fabrication
(
  'Your First PCB: Schematic to Fabrication',
  'first-pcb-schematic-to-fab',
  'A step-by-step walkthrough of designing your first printed circuit board, from schematic capture to ordering.',
  'Design & Prototyping',
  'intermediate',
  7,
  ARRAY['PCB', 'Schematic', 'KiCad', 'Electronics', 'Hardware'],
  ARRAY['Basic electronics knowledge', 'Understanding of your circuit requirements'],
  ARRAY['KiCad', 'Altium Designer', 'EasyEDA', 'JLCPCB', 'PCBWay', 'DigiKey', 'Mouser'],
  '[
    {"heading": "Choosing Your EDA Tool", "content": "For your first board, KiCad is recommended — it''s free, open-source, powerful, and widely supported with no board-size limits. Other options include Altium Designer (industry standard but expensive), EasyEDA (browser-based, integrated with LCSC/JLCPCB), and Fusion 360 Electronics (good for mechatronics integration).", "tips": ["KiCad is free with no board-size limits — ideal for startups"]},
    {"heading": "Schematic Capture & Component Selection", "content": "The schematic is the logical description of your circuit — what connects to what, without worrying about physical placement.\n\nBest practices:\n- One function per sheet — power supply on sheet 1, MCU on sheet 2, sensors on sheet 3\n- Use hierarchical labels to connect between sheets cleanly\n- Add decoupling capacitors close to every IC power pin (100 nF ceramic minimum)\n- Label every net — named nets are easier to debug\n- Run ERC (Electrical Rules Check) and fix every error before proceeding\n\nFor each component, select a specific part number (not just \"100nF capacitor\" but the actual MPN), verify the footprint matches the physical package, and check availability on DigiKey/Mouser/LCSC.", "tips": ["Follow the IC manufacturer''s reference schematic exactly — deviating is the #1 source of first-board failures", "Avoid sole-source components"]},
    {"heading": "Board Setup, Placement & Routing", "content": "Before placing components, define the board outline from mechanical constraints, set design rules (trace width, clearance, via size), and choose layer count (2 layers for simple designs, 4 for better power delivery).\n\n**Placement priorities:** Place connectors first (constrained by enclosure), place MCU centrally, group related components, keep decoupling caps within 3 mm of their IC, separate analogue from digital, and think about thermal management.\n\n**Routing tips:** Route power and ground first, keep high-speed signals short, avoid 90° trace angles, match impedance for RF and USB, and run DRC frequently.", "tips": ["Typical minimum trace width for budget fabs: 0.127 mm (5 mil), recommended 0.25 mm (10 mil)", "Use ground planes on inner layers for 4-layer boards"]},
    {"heading": "Design Review & Manufacturing Files", "content": "Before ordering, verify: DRC passes with zero errors, all footprints are correct (compare 3D view to datasheets), mounting holes align with enclosure, silkscreen is readable, no traces under antennas, and thermal relief on ground pads.\n\nExport Gerber files and drill files for the fab. Also generate a BOM and pick-and-place file if you want SMT assembly.\n\nRecommended fab houses: JLCPCB (5 boards from £1.50), PCBWay (from £4), Aisler in Germany (from £12), OSH Park in USA (from £15).", "tips": ["For your first order, consider bare boards and hand-soldering — you''ll learn far more about your design", "Budget for 2–3 PCB spins before EVT"]}
  ]'::jsonb,
  ARRAY['Wrong footprint for a component', 'Missing pull-up/pull-down resistors', 'Decoupling caps too far from IC pins', 'USB data lines swapped (D+ / D-)'],
  ARRAY['KiCad official documentation', 'Phil''s Lab YouTube channel for PCB design tutorials', 'JLCPCB design rules guide'],
  ARRAY['KiCad is the recommended free EDA tool for startups', 'Follow reference schematics from IC datasheets exactly', 'Place decoupling caps within 3 mm of their IC power pins', 'Budget for 2–3 PCB respins — your first board will have bugs']
),

-- 5. Rapid Prototyping: 3D Printing, CNC & Beyond
(
  'Rapid Prototyping: 3D Printing, CNC & Beyond',
  'rapid-prototyping',
  'Choose the right prototyping method for enclosures, brackets, and mechanical parts at every development stage.',
  'Design & Prototyping',
  'beginner',
  6,
  ARRAY['3D Printing', 'CNC', 'Prototyping', 'Mechanical', 'Hardware'],
  ARRAY['CAD model of parts to prototype', 'Understanding of material requirements'],
  ARRAY['Bambu Lab', 'Prusa', 'Xometry', 'Hubs (Protolabs)', 'Craftcloud'],
  '[
    {"heading": "Methods Compared", "content": "Choose based on stage, material needs, and budget:\n\n- **FDM 3D Printing** — Hours, £1–20/part. Best for form checks and early concepts. Weak layer adhesion, rough finish.\n- **SLA/DLP Resin** — Hours, £5–30/part. Fine detail, smooth surfaces. Brittle, UV-sensitive.\n- **SLS Nylon** — 2–5 days, £20–100/part. Functional prototypes, hinges. Powdery finish.\n- **MJF (HP)** — 2–5 days, £15–80/part. Strong functional parts.\n- **CNC Machining** — 3–7 days, £50–500/part. Metal parts, tight tolerances. Geometry limits.\n- **Silicone Moulding** — 1–3 weeks, £30–100/part. 10–100 unit batches, production-like finish.\n- **Sheet Metal** — 3–7 days, £20–200/part. Brackets, chassis, enclosures.", "tips": ["Match the method to the question you are trying to answer, not to what is convenient"]},
    {"heading": "Stage-by-Stage Guide", "content": "**Concept Stage: FDM is Your Best Friend.** Print overnight on a £200 printer. Iterate daily — print, test, modify CAD, print again. Use PLA for form checks, PETG for moderate strength, ASA for outdoor testing. Print at 0.2 mm layer height for speed.\n\n**Prototype Stage: Match Method to Question.** \"Does it fit in the hand?\" → FDM at full scale. \"Can this latch survive 10,000 cycles?\" → SLS nylon or CNC Delrin. \"What will production finish look like?\" → SLA resin or CNC + polish.\n\n**EVT Stage: Functional Prototyping.** CNC aluminium for heat sinks, SLS nylon for snap fits, silicone moulding for 20+ identical parts, laser-cut acrylic for flat enclosures.\n\n**DVT Stage: Production-Intent.** Soft tooling (aluminium moulds) for injection-moulded parts, production-grade sheet metal, final surface finishes.", "tips": ["At concept stage, don''t chase surface finish — focus on fit and proportion"]},
    {"heading": "Design Tips & Cost Optimisation", "content": "**For 3D printing:** Minimum wall thickness 1.2 mm (FDM) or 0.8 mm (SLA). Avoid large flat surfaces (they warp). Chamfer bottom edges. Orient for strength — layer adhesion is weakest along Z axis. Add 0.3 mm clearance for loose fit, 0.1 mm for press fit.\n\n**For CNC:** Inside corners need a radius ≥ 1.5 mm. Keep pocket depths ≤ 4× tool diameter. Minimum wall 1.0 mm for aluminium. Design fixtures in mind.\n\n**Cost tips:** Batch your orders, reduce machining volume, use standard materials, and tolerance only what matters.\n\nMove to tooling when: design has been stable for 2+ iterations, critical dimensions are validated, CM has reviewed and confirmed manufacturability, and certification pre-testing has passed.", "tips": ["Prototyping is addictive — at some point you need to commit to production"]}
  ]'::jsonb,
  ARRAY['Using the wrong method for the development stage', 'Chasing perfect surface finish at concept stage', 'Not adding clearance for mating parts', 'Designing parts that cannot be CNC machined (no tool access)'],
  ARRAY['Xometry instant quoting for CNC and 3D printing', 'Hubs (Protolabs) design guides'],
  ARRAY['FDM 3D printing is ideal for concept-stage iteration — print overnight, test daily', 'Match the prototyping method to the question you are trying to answer', 'Move to production tooling when design is stable for 2+ iterations', 'Budget fab houses like JLCPCB also offer 3D printing and CNC']
),

-- 6. Firmware Foundations for Hardware Startups
(
  'Firmware Foundations for Hardware Startups',
  'firmware-foundations',
  'Essential firmware architecture, development practices, and OTA update strategies for embedded products.',
  'Design & Prototyping',
  'intermediate',
  6,
  ARRAY['Firmware', 'Embedded', 'C/C++', 'OTA', 'Hardware'],
  ARRAY['Basic programming knowledge (C or C++)', 'Microcontroller selected or under evaluation'],
  ARRAY['STM32', 'ESP32', 'nRF52840', 'FreeRTOS', 'Zephyr', 'GitHub', 'Unity test framework'],
  '[
    {"heading": "Choosing a Microcontroller", "content": "Your MCU choice shapes everything else. Key options:\n\n- **Budget** (STM32F0, ESP32-C3): 48–160 MHz, 64–256 KB flash, £0.80–2.50 at 1k qty\n- **Mid-Range** (STM32F4, nRF52840): 64–168 MHz, 256 KB–1 MB flash, £2.50–5.00\n- **Premium** (STM32H7, i.MX RT): 400–600 MHz, 1–2 MB flash, £5–15\n\nFor most IoT products, the nRF52840 (BLE) or ESP32-S3 (Wi-Fi + BLE) are excellent starting points.", "tips": ["Choose based on connectivity needs first, processing power second"]},
    {"heading": "Firmware Architecture", "content": "Structure your firmware into clear layers from the start:\n\n**Hardware Abstraction Layer (HAL)** — Wraps register-level access. Use the vendor''s HAL rather than writing your own.\n\n**Driver Layer** — Modules for each peripheral (sensors, actuators, display, comms). Each driver has a clean API that hides implementation details.\n\n**Application Layer** — Your business logic. Reads sensors, makes decisions, controls outputs, manages state machines.\n\n**Communication Layer** — Handles protocols: BLE GATT services, MQTT, HTTP, or proprietary. Separate from application logic so you can swap transports.", "tips": ["Store firmware in Git alongside hardware design files", "Tag every version that goes onto a physical board"]},
    {"heading": "Essential Practices", "content": "**OTA Updates** — Non-negotiable for any connected product. Use dual-bank architecture (two firmware slots), a bootloader that selects which bank to boot, cryptographically signed images, and automatic rollback if POST fails.\n\n**Watchdog Timer** — A hardware watchdog resets the MCU if firmware hangs. Last line of defence against lockups in the field.\n\n**Structured Logging** — Log levels (ERROR, WARN, INFO, DEBUG), timestamps, UART output for development, flash ring buffer for field diagnostics.\n\n**Power Management** — For battery products: measure sleep current early and often, profile every peripheral, implement aggressive sleep strategies, and test battery life on real hardware.", "tips": ["Shipping without OTA capability is like building a house without a door", "For simple products, a bare-metal super loop is often sufficient — don''t over-engineer with an RTOS"]},
    {"heading": "Testing Firmware", "content": "**Unit Testing** — Use Unity (C) or Google Test (C++). Mock your HAL layer and test application logic on your development PC.\n\n**Hardware-in-the-Loop (HIL)** — Use a Raspberry Pi or PC to drive test sequences via UART/SPI/I2C. Automated power cycling and reset testing.\n\n**Integration Testing** — Flash the firmware, exercise every feature, verify every communication path. Create a checklist and run it before every release.", "tips": ["Yes, you can unit test embedded code — mock the HAL and test on your PC"]}
  ]'::jsonb,
  ARRAY['No OTA from the start — retrofitting is 5x harder', 'Blocking code in the main loop', 'Hardcoded configuration instead of NV storage', 'Ignoring stack overflow in limited RAM', 'No field diagnostics'],
  ARRAY['FreeRTOS documentation', 'Zephyr RTOS getting started guide', 'Embedded Artistry blog'],
  ARRAY['Design for OTA updates from day one — it is non-negotiable', 'Structure firmware into HAL, driver, application, and communication layers', 'nRF52840 (BLE) or ESP32-S3 (Wi-Fi+BLE) are excellent starting MCUs', 'Implement watchdog timer and structured logging early']
),

-- 7. Design for Manufacturing (DFM)
(
  'Design for Manufacturing (DFM)',
  'design-for-manufacturing',
  'How to design hardware that is actually manufacturable at scale — injection moulding, PCBA, and assembly.',
  'Design for Manufacturing',
  'intermediate',
  7,
  ARRAY['DFM', 'Manufacturing', 'Injection Moulding', 'PCBA', 'Hardware'],
  ARRAY['Completed EVT or near-final design', 'CAD model of enclosure and PCB layout'],
  ARRAY['SolidWorks', 'Fusion 360', 'KiCad', 'Contract manufacturer'],
  '[
    {"heading": "Why DFM Matters", "content": "Designing a product that works in the lab is one thing. Designing one that can be manufactured reliably at scale is entirely different. Every design decision has a manufacturing consequence.\n\nA snap-fit that works on your 3D print may not release from an injection mould. A PCB component placed too close to the board edge can''t be panelised. An assembly step requiring tweezers adds 30 seconds per unit (£0.15 at scale).\n\nThe cost of a design change in concept: £0. In EVT: £500. After tooling: £5,000–50,000. In production: catastrophic.", "tips": ["Send your CM the design for DFM review before committing to tooling"]},
    {"heading": "Injection Moulding DFM", "content": "**Wall Thickness** — Uniform wall thickness is the single most important rule. ABS: 1.5–3.0 mm (nominal 2.0 mm). PC: 1.5–3.5 mm. PP: 1.0–2.5 mm. Variation causes sink marks, warping, and inconsistent shrinkage.\n\n**Draft Angles** — Minimum 1° on all vertical surfaces. 2–3° for textured surfaces. Zero draft = part won''t release = mould damage.\n\n**Ribs** — Thickness: 50–60% of wall. Height: ≤ 3× wall. Add draft to sides. Ribs strengthen parts without adding wall thickness.\n\n**Bosses** — OD: 2× screw diameter. Wall: 60% of nominal. Connect to walls with ribs. Add coring to prevent sink.\n\n**Undercuts** — Avoid where possible — each requires a side-action or lifter (adds £2–10k to tooling). Use snap-fit designs that flex past the undercut instead.", "tips": ["Uniform wall thickness is the #1 rule", "Every undercut adds £2–10k to tooling cost"]},
    {"heading": "PCBA & Assembly DFM", "content": "**PCB Assembly:** Minimum 0.5 mm clearance between components (1 mm preferred). Keep components ≥ 3 mm from board edge. Orient all polarised components consistently. Add fiducial markers (3 per board minimum). Design for bed-of-nails or flying probe testing.\n\n**Assembly (DFA):** Minimise part count. Self-locating features so parts only go together one way (poka-yoke). Top-down assembly if possible. Avoid fasteners — snap fits are faster. One screw type per product if possible.\n\n**Assembly time matters:** Pick and place a part: 3–5 s (£0.015–0.025). Drive one screw: 8–12 s (£0.04–0.06). Route a cable: 15–30 s (£0.075–0.15). Every second counts at thousands of units.", "tips": ["Use Tag-Connect headers to save board space vs pin headers", "One screw type across the whole product simplifies assembly"]},
    {"heading": "DFM Review Process", "content": "1. Send 3D CAD (STEP format) and 2D drawings to your CM\n2. Request a formal DFM report — any good CM provides one within 5 business days\n3. Review every item — accept, reject, or negotiate each suggestion\n4. Update your design and send back for confirmation\n5. Get written sign-off before tooling begins\n\nThis cycle typically takes 2–3 rounds. Don''t rush it — this is where you prevent expensive production issues.", "tips": ["The DFM review cycle typically takes 2–3 rounds — build this into your timeline"]}
  ]'::jsonb,
  ARRAY['Non-uniform wall thickness causing sink marks', 'Zero draft angles on moulded parts', 'Components too close to PCB edge for panelisation', 'Too many different fastener types', 'Not involving CM in DFM review'],
  ARRAY['Proto Labs DFM design guides', 'IPC-7351 component footprint standards'],
  ARRAY['The cost of a design change rises exponentially at each stage', 'Uniform wall thickness is the most important injection moulding rule', 'Every assembly second costs money at scale — minimise part count and fasteners', 'Always get a formal DFM report from your CM before tooling']
),

-- 8. BOM Management & Component Sourcing
(
  'BOM Management & Component Sourcing',
  'bom-management-sourcing',
  'Master your Bill of Materials — the single document that defines your product''s cost and supply chain.',
  'Design for Manufacturing',
  'intermediate',
  6,
  ARRAY['BOM', 'Sourcing', 'Components', 'Supply Chain', 'Hardware'],
  ARRAY['Schematic complete or near-complete', 'Target production volume estimated'],
  ARRAY['DigiKey', 'Mouser', 'LCSC', 'Cofactr', 'Google Sheets'],
  '[
    {"heading": "Anatomy of a BOM", "content": "Your Bill of Materials is the complete list of every component needed to build one unit. Every BOM should include: line item number, internal part number, description, manufacturer, MPN (Manufacturer Part Number), package, quantity per unit, designator(s), unit cost at target volume, extended cost, supplier, alternate MPN, and category.\n\nMaintain a multi-level BOM: Level 0 (top-level assembly), Level 1 (major sub-assemblies: PCBA, enclosure, cable assembly, packaging), Level 2 (individual components — every resistor, screw, and label).", "tips": ["A flat BOM works for prototyping but fails at production scale", "Always maintain a multi-level BOM"]},
    {"heading": "Component Selection Best Practices", "content": "**Avoid single-source components.** Always identify a primary source and an alternate from a different manufacturer. If no alternate exists, flag it as a risk and stock buffer inventory.\n\n**Prefer standard packages.** 0402/0603/0805 for passives. QFN/QFP for ICs (avoid BGA for first products — harder to inspect and rework). Standard connector families (JST, Molex).\n\n**Check lifecycle status.** Active = good. NRND (Not Recommended for New Design) = avoid. Obsolete = do not use. Preview = risky for timeline.\n\n**Consider MOQs.** Some components have minimum order quantities of 1,000 or 5,000 — factor this into prototype budgets.", "tips": ["Avoid BGA packages for your first product", "Always check lifecycle status before selecting any IC"]},
    {"heading": "Sourcing Strategy & Cost Management", "content": "**Distributor tiers:** Franchise (DigiKey, Mouser, Farnell) for prototyping with 1–3 day shipping. Catalogue (LCSC, TME) for cost-optimised production. Direct from manufacturer for 10k+ volumes. Brokers for hard-to-find parts.\n\n**Cost reduction techniques:**\n1. Consolidate passives — using one value across 20 positions is cheaper than 5 different values\n2. Reduce component count — every part has a placement cost (£0.01–0.03)\n3. Switch to integrated solutions — one PMIC replacing 3 regulators may save money\n4. Volume breaks — plot BOM cost at 100, 1k, 5k, 10k units\n\n**Never buy ICs from unknown sources** — counterfeit components are a real problem. Use only authorised channels.", "tips": ["Get production quotes from LCSC and your CM''s preferred suppliers — often 30–60% cheaper than franchise distributors"]}
  ]'::jsonb,
  ARRAY['Generic descriptions instead of specific MPNs', 'No alternate sources for critical components', 'Using obsolete or NRND parts', 'Not including attrition in order quantities (add 10–15% extra)'],
  ARRAY['Cofactr BOM management tool (free tier)', 'PartsBox inventory tracking', 'IPC component standards'],
  ARRAY['Every BOM line item needs a specific MPN, not a generic description', 'Always identify alternate sources for critical components', 'Your BOM cost should decrease as you iterate from concept to production', 'Never buy ICs from unauthorised sources — counterfeits are a real problem']
),

-- 9. Finding and Qualifying a Contract Manufacturer
(
  'Finding and Qualifying a Contract Manufacturer',
  'finding-qualifying-cm',
  'How to find, evaluate, and build a productive relationship with your CM — the partner who builds your product.',
  'Design for Manufacturing',
  'intermediate',
  6,
  ARRAY['CM', 'Manufacturing', 'Sourcing', 'Quality', 'Hardware'],
  ARRAY['Design approaching DVT stage', 'Production volume forecast'],
  ARRAY['Make UK directory', 'Global Sources', 'Dragon Innovation'],
  '[
    {"heading": "When to Start & Where to Look", "content": "Begin your CM search during EVT, not after DVT. You want them involved early enough for DFM feedback before tooling.\n\nTimeline: EVT start → shortlist 3–5 CMs. Mid-EVT → send RFQs, visit top 2–3. EVT end → select CM, begin DFM reviews. DVT → first builds at CM. PVT → production trial.\n\n**For UK/EU assembly:** Make UK directory, EMS directories (CircuitWorld, NOTE), PCB fab house referrals, trade shows (Southern Manufacturing), accelerator network introductions.\n\n**For China-based:** Alibaba (vet thoroughly), Global Sources (more curated), Dragon Innovation (specialises in startups), personal introductions in Shenzhen.", "tips": ["Begin CM search during EVT — don''t wait until after DVT", "Personal introductions are worth more than any directory listing"]},
    {"heading": "The RFQ Process & Evaluation", "content": "Send your RFQ to 3–5 CMs including: product overview, 3D CAD files (STEP), PCB Gerbers and BOM, assembly drawings, target volumes (6–12 month forecast), quality requirements, and certification requirements.\n\nScore each CM on:\n- **Capability** — Can they handle your complexity? What certifications do they hold? (ISO 9001 minimum)\n- **Capacity** — Can they scale from 100 to 10,000 units? What''s current utilisation?\n- **Communication** — Response time to RFQ (>1 week is a red flag), dedicated project manager, language capability\n- **Cost** — NRE costs, unit cost breakdown, MOQ, payment terms (Net 30 is standard)\n- **Quality** — Testing capabilities, first-pass yield data, defect tracking process", "tips": ["A CM that takes more than 1 week to respond to your RFQ is a red flag"]},
    {"heading": "Factory Visits & The Agreement", "content": "**Always visit your CM before signing.** For China-based, budget £2–3k for the trip — it''s the best money you''ll spend. Look for: cleanliness and organisation, ESD controls, component storage (dry cabinets, FIFO), test equipment, worker training records, and other customers'' product quality.\n\n**Key contract terms:** IP protection (NDA + clear ownership clauses), quality standards and reject criteria, committed lead times with penalties, tooling ownership (you own the moulds), payment terms (30% deposit, 70% on shipment is common), ECO process, and exit clause for retrieving tooling.", "tips": ["Trust your instincts during the visit — if something feels off, it probably is", "You own the moulds, even if the CM stores them — make sure this is in writing"]},
    {"heading": "Building the Relationship", "content": "The best CM relationships are partnerships, not transactions:\n- Visit regularly — quarterly if local, twice yearly if overseas\n- Pay on time — startups that pay late get deprioritised\n- Share your roadmap — CMs plan capacity months ahead\n- Give feedback — both positive and constructive\n- Treat factory workers with respect — they build your product with their hands\n\nA strong CM relationship is a genuine competitive advantage.", "tips": ["Pay on time — this is the #1 way to get priority treatment from your CM"]}
  ]'::jsonb,
  ARRAY['Starting CM search too late (after DVT)', 'Not visiting the factory in person', 'Choosing purely on lowest unit price', 'No IP protection in the contract', 'Not defining tooling ownership'],
  ARRAY['Dragon Innovation CM matching service', 'Make UK manufacturing directory', 'Southern Manufacturing trade show'],
  ARRAY['Start your CM search during EVT, not after DVT', 'Always visit your CM before signing — budget £2–3k for China trips', 'Score CMs on capability, capacity, communication, cost, and quality', 'A strong CM relationship is a genuine competitive advantage']
),

-- 10. Hardware Certifications Guide
(
  'Hardware Certifications Guide',
  'hardware-certifications',
  'Navigate CE, UKCA, FCC, UL, and RoHS certifications — what is required, what it costs, and how to plan.',
  'Compliance',
  'advanced',
  7,
  ARRAY['CE', 'FCC', 'UKCA', 'RoHS', 'Certifications', 'Hardware'],
  ARRAY['Design approaching DVT stage', 'Production-intent hardware samples'],
  ARRAY['UKAS-accredited test labs', 'EMC pre-compliance equipment'],
  '[
    {"heading": "Certification Overview", "content": "Before you can legally sell a hardware product in any major market, it must pass certifications:\n\n- **UKCA** (UK): Safety + EMC, £3,000–15,000, 4–8 weeks\n- **CE** (EU/EEA): Safety + EMC, £3,000–15,000, 4–8 weeks\n- **FCC** (USA): EMC / RF emissions, £3,000–10,000, 4–6 weeks\n- **UL/ETL** (USA/Canada): Safety, £5,000–25,000, 6–12 weeks\n- **RoHS** (EU/UK): Hazardous substances, £500–2,000, 2–4 weeks\n- **REACH** (EU/UK): Chemical safety, £500–2,000, 2–4 weeks\n- **WEEE** (EU/UK): Recycling/disposal, registration fee, 2–4 weeks", "tips": ["Budget £13,500–26,500 for a typical IoT product with Bluetooth"]},
    {"heading": "CE & UKCA Marking", "content": "CE is not a single test — it''s a declaration of conformity. Common directives:\n\n**Low Voltage Directive (LVD)** — Products 50–1000 VAC or 75–1500 VDC. Safety testing to EN 62368-1. Battery-powered under 50V generally exempt.\n\n**EMC Directive** — Almost all electronic products. Tests emissions (EN 55032) and immunity (EN 55035).\n\n**Radio Equipment Directive (RED)** — Any radio transmitter (Wi-Fi, BLE, cellular, LoRa). Covers EMC + radio + safety.\n\n**RoHS Directive** — Restricts lead, mercury, cadmium, and other hazardous substances.\n\nProcess: identify applicable directives, identify harmonised standards, test at accredited lab, compile technical documentation, write Declaration of Conformity, affix CE mark.\n\nUKCA is largely identical to CE but requires UKAS-accredited labs and a UK-based Responsible Person.", "tips": ["Check GOV.UK for current CE/UKCA recognition policy — it changes frequently"]},
    {"heading": "FCC Certification & Pre-Certified Modules", "content": "**Part 15 Unintentional Radiators** — Most electronic devices. Class B (residential) or Class A (commercial). Self-declaration for most products.\n\n**Part 15 Intentional Radiators** — Wi-Fi, Bluetooth, etc. Requires FCC Certification through a TCB. More expensive.\n\n**Using pre-certified modules is the recommended approach for startups.** If you use a module with its own FCC ID (e.g., an ESP32 module), the module''s FCC ID covers the RF portion. You still test the host for unintentional emissions, but this significantly reduces cost and risk. Follow the module manufacturer''s integration guidelines exactly.", "tips": ["Use pre-certified wireless modules — designing your own RF and certifying from scratch is expensive and risky"]},
    {"heading": "Planning & Pre-Compliance", "content": "**During EVT:** Conduct EMC pre-compliance scans at a local lab (£500–1,000). These informal tests catch major issues cheaply. Fix failures before formal testing.\n\n**During DVT:** Submit production-intent samples for formal testing. Use final enclosures and production cables — certification applies to the exact configuration tested.\n\nMost EMC failures are caused by: poor grounding, unshielded cables, clock harmonics (use spread-spectrum clocking), and missing filtering on I/O lines.\n\n**Choosing a lab:** Look for UKAS/A2LA/DAkkS accreditation, experience with your product type, pre-compliance services, and reasonable turnaround (book 4–6 weeks ahead). Attending your tests is highly recommended.", "tips": ["EMC pre-compliance during EVT costs £500–1,000 and catches major issues early", "Attend your certification tests — you''ll learn more in one day at the lab than in a month reading standards"]}
  ]'::jsonb,
  ARRAY['Not budgeting for certification costs', 'Testing with non-final enclosures or cables', 'Skipping pre-compliance scans', 'Designing custom RF instead of using pre-certified modules', 'Booking test labs too late (Oct–Jan is busy season)'],
  ARRAY['GOV.UK UKCA marking guidance', 'FCC Equipment Authorization guide', 'CE marking directive finder tool'],
  ARRAY['Budget £13,500–26,500 for certifications on a typical IoT product', 'Use pre-certified wireless modules to dramatically reduce FCC cost', 'Run EMC pre-compliance scans during EVT to catch issues early', 'Certification applies to the exact configuration tested — use final parts']
),

-- 11. Your First Production Run: A Survival Guide
(
  'Your First Production Run: A Survival Guide',
  'first-production-run',
  'What to expect during your first mass production build — from pre-production checks to shipping finished goods.',
  'Production & Scale',
  'advanced',
  7,
  ARRAY['Production', 'Manufacturing', 'Quality', 'Launch', 'Hardware'],
  ARRAY['Passed DVT and PVT', 'Certifications complete', 'CM selected and ready'],
  ARRAY['AQL sampling tables', 'Test fixtures', 'Quality management system'],
  '[
    {"heading": "Pre-Production Checklist", "content": "Before giving the green light, confirm:\n- Design is frozen — no more changes, ECOs go to next revision\n- Tooling approved — all moulds produce parts within spec\n- BOM locked — every component has confirmed MPN, supplier, and lead time\n- Components on order — lead times confirmed, buffer stock for critical parts\n- Test fixtures built — functional test, programming jig, final QA station\n- Test procedures documented — step-by-step with pass/fail criteria and photos\n- Assembly instructions complete — illustrated work instructions for every station\n- Packaging designed and ordered\n- Certifications complete — CE, UKCA, FCC marks ready for labels\n- Firmware release-tagged — production binary version-controlled and signed", "tips": ["Build 5–10 golden samples on the production line before full production", "Only approve mass production after golden samples pass all checks"]},
    {"heading": "Production Day — What Happens on the Line", "content": "A typical hardware product goes through these stations:\n\n1. **SMT** — Pick-and-place machines populate PCBs\n2. **Reflow soldering** — PCBs pass through a reflow oven\n3. **AOI** — Camera system checks solder joints\n4. **Through-hole / hand soldering** — Components that can''t be machine-placed\n5. **ICT** — Electrical test of every net on the board\n6. **Programming** — Firmware flashed via test jig\n7. **Functional test** — Custom fixture validates every feature\n8. **Mechanical assembly** — PCB + enclosure + cables + fasteners\n9. **Final QA** — Visual inspection, label verification, cosmetic check\n10. **Packaging** — Product + accessories + documentation into box\n11. **Outgoing QC** — AQL sampling of finished goods", "tips": ["Be present for your first production run if at all possible"]},
    {"heading": "AQL Sampling & Common Issues", "content": "**AQL (Acceptable Quality Level)** determines how many units to inspect per batch:\n- AQL 0.65: Very low defect rate — safety-critical features\n- AQL 1.0: Low — functional defects\n- AQL 2.5: Moderate — cosmetic defects\n- AQL 4.0: Higher — minor cosmetic issues\n\nFor first runs, use AQL 1.0 functional / AQL 2.5 cosmetic.\n\n**Common first-run issues:** Yield problems (expect 85–95% first-run yield), component substitutions (always approve in writing), cosmetic issues on moulded parts (mould adjustments take 1–2 weeks), and test failures (track failure modes — is it consistent or random?).", "tips": ["Expected first-run yield is 85–95%", "A single repeated failure mode suggests a design or process issue — investigate immediately"]},
    {"heading": "After the Build", "content": "**Ship cautiously.** Send your first batch to a small group of customers. Monitor for field issues for 2–4 weeks before scaling shipments. Have a returns process in place from day one.\n\n**Document lessons learned.** Write a post-mortem: what went well, what went wrong, what you''d change next time. Your second production run will be dramatically smoother — but only if you capture and act on what you learned.", "tips": ["Monitor first batch for field issues for 2–4 weeks before scaling shipments"]}
  ]'::jsonb,
  ARRAY['Not freezing the design before production', 'Skipping golden samples', 'Not being present for the first run', 'Accepting component substitutions without verification', 'No returns process in place at launch'],
  ARRAY['AQL sampling tables (ISO 2859)', 'IPC-A-610 workmanship standards'],
  ARRAY['Build golden samples before approving full production', 'Be present for your first production run', 'Use AQL 1.0 for functional defects, AQL 2.5 for cosmetic', 'Ship first batch to a small group and monitor for 2–4 weeks before scaling']
),

-- 12. Post-Launch: Field Failures, ECOs & Continuous Improvement
(
  'Post-Launch: Field Failures, ECOs & Continuous Improvement',
  'post-launch-ecos',
  'What happens after you ship — managing returns, issuing engineering changes, and improving your product over time.',
  'Production & Scale',
  'advanced',
  6,
  ARRAY['ECO', 'Field Failures', 'Quality', 'Continuous Improvement', 'Hardware'],
  ARRAY['Product in production and shipping to customers'],
  ARRAY['Failure tracking database', 'ECO management system'],
  '[
    {"heading": "Tracking Field Failures", "content": "Set up a failure tracking system capturing: unit serial number, build date/batch, firmware version, failure date, failure mode (symptom), root cause (if known), environment, and resolution (repair, replace, refund, or no-fault-found).\n\nKey metrics to track monthly:\n- **DOA rate** (Dead On Arrival): Target < 1%\n- **Early life failure rate** (first 30 days): Target < 3%\n- **Annualised failure rate**: Depends on product category\n- **No-Fault-Found rate**: High NFF suggests user confusion, not hardware issues\n\nUse Pareto analysis: rank failure modes by frequency. Typically 80% of failures come from 20% of causes. Fix the #1 failure mode first.", "tips": ["A product with one failure mode at 5% is easier to fix than ten modes at 0.5% each"]},
    {"heading": "Engineering Change Orders (ECOs)", "content": "An ECO is a formal, documented change to your product''s design. Every change — no matter how small — must go through this process.\n\n**When to issue:** Safety issue (immediate priority, may require recall), reliability failure, cost reduction, feature addition, or regulatory change.\n\n**ECO process:** Identify the change → assess impact (certifications, test procedures, inventory) → get approval (engineering lead + product owner) → implement (update design files, BOM, docs) → validate (build and test) → deploy (phase into production) → communicate (notify CM, update tracking).\n\nEvery ECO should include: ECO number, description, affected documents, before/after comparison, revision bump (Rev A → Rev B), and effectivity (from which serial number).", "tips": ["Every change needs a formal ECO — even small ones", "Use Rev A, B, C for major changes and Rev A.1, A.2 for minor"]},
    {"heading": "Continuous Improvement", "content": "**BOM cost reduction:** Re-quote at actual volumes, consolidate suppliers, value engineer (can a £2 connector become £0.50?), eliminate components. A 10% BOM reduction at 10,000 units/year with a £30 BOM saves £30,000/year.\n\n**Process improvement:** Work with CM to improve yield (target 98%+), cycle time, test coverage, and incoming inspection.\n\n**Customer feedback loop:** Monitor support tickets for recurring issues, read reviews for unfiltered feedback, survey customers at 30/90/180 days, interview power users. The best v2 features come from real-world v1 experience.\n\n**When to release v2:** When you''ve accumulated 5+ ECOs warranting a respin, customer feedback reveals a clear gap, component obsolescence forces a redesign, or competition demands an upgrade. Don''t rush — firmware updates and minor ECOs can keep v1 competitive for 12–24 months.", "tips": ["The best v2 features come from real-world v1 customer experience", "A steady stream of firmware updates can keep v1 competitive for 12–24 months"]}
  ]'::jsonb,
  ARRAY['No field failure tracking system', 'Skipping the ECO process for small changes', 'Not doing Pareto analysis on failure modes', 'Rushing v2 before learning from v1'],
  ARRAY['ISO 2859 sampling standards', 'IPC standards for quality management'],
  ARRAY['Track DOA rate (< 1%), early life failures (< 3%), and NFF rate', 'Every design change needs a formal ECO — no exceptions', 'Use Pareto analysis: 80% of failures come from 20% of causes', 'Don''t rush v2 — firmware updates keep v1 competitive for 12–24 months']
)

ON CONFLICT (slug) DO NOTHING;

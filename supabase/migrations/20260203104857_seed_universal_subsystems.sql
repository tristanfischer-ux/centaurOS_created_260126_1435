-- =============================================
-- Seed Universal Subsystems with Detailed Content
-- =============================================
-- 20 cross-sector technical domains with comprehensive
-- primers, key questions, and objective packs.
-- =============================================

-- =============================================
-- MECHANICAL SUBSYSTEMS (1-4)
-- =============================================

-- 1. Propulsion Systems
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000001',
    'Propulsion Systems',
    'propulsion-systems',
    'Moving things forward: engines, motors, and thrust generation',
    'Propulsion systems provide the force necessary to move vehicles, spacecraft, drones, and robots. This domain covers everything from electric motors and combustion engines to rocket propulsion and novel propulsion technologies. Understanding propulsion is critical because it directly impacts range, speed, payload capacity, and operational costs.',
    'Mechanical',
    'Rocket',
    1,
    '{
        "overview": "Propulsion is the study and application of force generation for movement. Whether you''re building a car, drone, spacecraft, or underwater vehicle, the propulsion system is the heart that determines what your product can do.\n\nPropulsion systems convert stored energy (chemical, electrical, compressed gas) into kinetic energy. The choice of propulsion technology depends on your operating environment (air, space, water, ground), required performance envelope, duty cycle, and constraints like noise, emissions, and efficiency.\n\nModern propulsion is experiencing a renaissance with electric motors becoming viable for increasingly demanding applications, and novel concepts like ion drives and plasma propulsion maturing for space applications.",
        "why_it_matters": "Your propulsion system typically represents 20-40% of your product cost and determines fundamental capabilities like range, speed, and payload. A wrong choice here cascades into structural, power, and thermal design challenges. Early propulsion decisions are expensive to reverse.",
        "key_concepts": [
            "Thrust-to-weight ratio: The force generated relative to system mass - critical for flight vehicles",
            "Specific impulse (Isp): Efficiency measure for rocket engines - thrust per unit propellant consumed",
            "Power density: Power output per unit mass - determines if electric propulsion is viable",
            "Duty cycle: Operating pattern affects thermal design and component selection",
            "Regenerative braking: Recovering energy during deceleration - essential for electric vehicles",
            "Throttle response: How quickly propulsion can change output - matters for control systems"
        ],
        "decision_points": [
            "Electric vs combustion vs hybrid - driven by energy density needs and operating environment",
            "Custom vs COTS propulsion - build vs buy tradeoffs for motors, engines, thrusters",
            "Single vs distributed propulsion - one big motor vs many small ones (affects redundancy, control)",
            "Direct drive vs geared - torque-speed tradeoffs and efficiency at operating points",
            "Propellant selection (for rockets/thrusters) - performance vs handling vs cost"
        ],
        "common_mistakes": [
            "Undersizing propulsion for edge cases (thermal soaks, high altitude, degraded conditions)",
            "Ignoring thermal management requirements - propulsion generates significant waste heat",
            "Not accounting for propulsion system mass growth during development",
            "Selecting propulsion before understanding full mission profile",
            "Overlooking maintenance and serviceability requirements"
        ],
        "success_indicators": [
            "Propulsion sized with 20-30% margin for requirements growth",
            "Thermal management approach validated through analysis or test",
            "Supply chain identified for critical propulsion components",
            "Test plan includes edge cases and degraded mode operation",
            "Propulsion-structure integration points defined early"
        ],
        "terminology": {
            "ESC": "Electronic Speed Controller - manages power delivery to electric motors",
            "Gimbal": "Mechanism to point a thruster for directional control",
            "Nozzle": "Shapes exhaust flow to maximize thrust efficiency",
            "Stator/Rotor": "Fixed and rotating parts of an electric motor",
            "Brushless DC (BLDC)": "Motor type with electronic commutation - more reliable than brushed",
            "Specific impulse (Isp)": "Rocket efficiency measure in seconds",
            "Chamber pressure": "Pressure in rocket combustion chamber - drives performance"
        }
    }'::jsonb,
    '[
        {"id": "prop-1", "question": "What is your required thrust-to-weight ratio?", "context": "Flight vehicles need >1 for vertical takeoff. Ground vehicles typically 0.1-0.3.", "difficulty": "basic"},
        {"id": "prop-2", "question": "What is your target operating envelope (altitude, temperature, duration)?", "context": "Affects propulsion sizing, cooling requirements, and technology selection.", "difficulty": "basic"},
        {"id": "prop-3", "question": "Have you defined your duty cycle and mission profile?", "context": "Continuous vs burst operation dramatically changes thermal and power requirements.", "difficulty": "intermediate"},
        {"id": "prop-4", "question": "What are your noise and emissions constraints?", "context": "May preclude combustion engines or require specific electric motor designs.", "difficulty": "intermediate"},
        {"id": "prop-5", "question": "Do you need variable thrust or can you operate at fixed power levels?", "context": "Variable thrust adds complexity but enables hover, fine positioning, and efficiency optimization.", "difficulty": "advanced"},
        {"id": "prop-6", "question": "What is your propulsion redundancy strategy?", "context": "Single point of failure? Distributed propulsion? Affects safety certification.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Electric Propulsion for Space", "url": "https://www.edx.org/", "provider": "MIT OpenCourseWare"},
            {"title": "Introduction to Aerospace Propulsion", "url": "https://www.coursera.org/", "provider": "University of Colorado"}
        ],
        "books": [
            {"title": "Rocket Propulsion Elements", "author": "Sutton & Biblarz", "description": "The bible of rocket propulsion - essential for space applications"},
            {"title": "Electric Motors and Drives", "author": "Austin Hughes", "description": "Comprehensive coverage of electric motor fundamentals and selection"}
        ],
        "communities": [
            {"title": "r/rocketry", "url": "https://reddit.com/r/rocketry", "description": "Active community for amateur and professional rocket propulsion"},
            {"title": "Electric Vehicle Wiki", "url": "https://electricvehiclewiki.com/", "description": "Community knowledge base for EV propulsion"}
        ]
    }'::jsonb,
    ARRAY['aerospace', 'propulsion', 'automotive', 'robotics', 'marine'],
    ARRAY['Fractional CTO', 'VP Engineering', 'Propulsion Engineer', 'Chief Engineer'],
    ARRAY['manufacturer', 'component', 'service', 'testing_lab']
);

-- Propulsion Systems Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000001',
    'Establish Propulsion Strategy',
    'Define propulsion requirements and select the right technology for your application',
    'This objective will guide you through the critical early decisions for your propulsion system. You''ll define requirements, evaluate technology options, and establish the architecture that will drive your vehicle''s performance. Getting propulsion right early prevents costly redesigns later.',
    'intermediate',
    '3-6 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define propulsion performance requirements",
            "description": "Document your complete propulsion requirements including:\n\n**Thrust/Power Requirements:**\n- Maximum thrust or power needed\n- Continuous operating thrust\n- Thrust-to-weight ratio target\n\n**Operating Envelope:**\n- Altitude range (affects air density for props/jets)\n- Temperature range (affects motor/engine performance)\n- Operating duration per mission\n\n**Constraints:**\n- Mass budget for propulsion system\n- Volume envelope available\n- Noise limits at operator and bystander positions\n- Emissions requirements\n\n**Deliverable:** Propulsion requirements document with quantified values and rationale.",
            "role": "Executive",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Conduct propulsion technology trade study",
            "description": "Evaluate candidate propulsion technologies against your requirements:\n\n**For Each Technology Option:**\n- Electric (battery, fuel cell, hybrid)\n- Combustion (gas, diesel, turbine)\n- Specialty (rocket, compressed gas, etc.)\n\n**Evaluation Criteria:**\n- Performance envelope coverage\n- Power/thrust density achievable\n- Technology readiness level (TRL)\n- Development risk and timeline\n- Supply chain availability\n- Total cost of ownership\n- Regulatory compliance path\n\n**Deliverable:** Trade study matrix with scored options and recommended path.",
            "role": "AI_Agent",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Develop propulsion system architecture",
            "description": "Create the technical architecture for your selected propulsion approach:\n\n**Architecture Elements:**\n- Block diagram showing all propulsion components\n- Power flow from source to output\n- Control interfaces with flight/vehicle computer\n- Thermal management concept\n- Redundancy and fault tolerance approach\n\n**Integration Points:**\n- Mechanical mounting and structural loads\n- Electrical power requirements and interfaces\n- Data/control bus connections\n- Cooling system interfaces\n\n**Deliverable:** Propulsion system architecture document with diagrams.",
            "role": "Apprentice",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Identify and evaluate propulsion component suppliers",
            "description": "Build your propulsion supply chain by identifying potential component suppliers:\n\n**Components to Source:**\n- Motors/engines\n- Controllers/ESCs\n- Propellers/nozzles\n- Bearings and mechanical components\n- Sensors (RPM, temperature, pressure)\n\n**For Each Supplier:**\n- Request specifications and datasheets\n- Verify lead times and MOQs\n- Understand customization options\n- Assess quality certifications\n\n**Deliverable:** Supplier matrix with contacts, capabilities, and initial quotes.",
            "role": "Apprentice",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 5,
            "title": "Find propulsion engineering expert on CentaurOS marketplace",
            "description": "Search the CentaurOS marketplace for fractional executives and advisors with propulsion expertise:\n\n**What to Look For:**\n- Experience with your propulsion type (electric, combustion, rocket)\n- Industry background relevant to your application\n- Track record of successful propulsion programs\n- Availability for ongoing advisory or fractional role\n\n**How to Engage:**\n1. Browse the People category filtered to your propulsion domain\n2. Review portfolios and past projects\n3. Schedule intro calls with 2-3 candidates\n4. Define engagement scope (advisory hours, project review, etc.)\n\n**Why This Matters:** A seasoned propulsion engineer can save months of iteration by catching design mistakes early and guiding you through technology selection.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "propulsion", "automotive", "robotics"],
                "type": "advice",
                "subcategory": "Executive"
            }
        },
        {
            "order": 6,
            "title": "Explore propulsion component manufacturers and suppliers",
            "description": "Use the CentaurOS marketplace to discover manufacturers and service providers for propulsion components:\n\n**Types of Suppliers to Find:**\n- Motor/engine manufacturers\n- Controller and power electronics suppliers\n- Propeller/impeller manufacturers\n- Test facilities for propulsion qualification\n- Integration and assembly services\n\n**Evaluation Process:**\n1. Filter marketplace by Products and Services categories\n2. Review supplier capabilities and certifications\n3. Request quotes or RFQs through the platform\n4. Add promising suppliers to your Foundry Stack\n\n**Deliverable:** Shortlist of 3-5 potential propulsion suppliers with initial contact made.",
            "role": "Apprentice",
            "estimated_hours": 6,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "propulsion", "manufacturing"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 2. Structural Design
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000002',
    'Structural Design',
    'structural-design',
    'Building things that don''t break: loads, materials, and structural integrity',
    'Structural design ensures your product can withstand all the forces it will encounter during manufacturing, transport, and operation. This includes static loads, dynamic loads, vibration, fatigue, and environmental stresses. Good structural design balances strength, weight, cost, and manufacturability.',
    'Mechanical',
    'Construction',
    2,
    '{
        "overview": "Structural design is the art and science of creating load-bearing structures that are safe, efficient, and manufacturable. Every physical product needs structural analysis to ensure it won''t fail under expected (and unexpected) conditions.\n\nThe discipline spans material selection, load analysis, stress calculation, and verification testing. Modern structural design increasingly uses simulation tools (FEA) to predict behavior before building hardware, reducing development time and cost.\n\nStructural decisions impact every other system - propulsion mounting, electronics packaging, thermal management, and manufacturing approach all depend on structural architecture.",
        "why_it_matters": "Structural failures are catastrophic and often irreversible. Under-designed structures fail in service, while over-designed structures add unnecessary weight and cost. Finding the right balance requires systematic analysis and testing.",
        "key_concepts": [
            "Factor of Safety (FoS): Margin between design load and failure load - typically 1.25-4x depending on application",
            "Fatigue life: How many load cycles before failure - critical for anything that moves or vibrates",
            "Stress concentration: Local high-stress areas around holes, corners, and joints",
            "Modal analysis: Understanding vibration modes to avoid resonance with excitation frequencies",
            "Composite layup: For fiber-reinforced materials, ply orientation determines strength and stiffness",
            "Load path: How forces flow through the structure - affects joint design and material selection"
        ],
        "decision_points": [
            "Material selection: Metal vs composite vs hybrid - driven by performance, cost, and manufacturing",
            "Manufacturing approach: Machined vs formed vs printed vs molded - affects design features",
            "Joint design: Welded vs bolted vs bonded vs riveted - each has tradeoffs",
            "Monocoque vs space frame: Skin-stressed vs skeletal structure approaches",
            "Testing strategy: Simulation-only vs component test vs full structure test"
        ],
        "common_mistakes": [
            "Designing for static loads only, ignoring fatigue and vibration",
            "Specifying materials without understanding manufacturing constraints",
            "Ignoring thermal expansion mismatches between dissimilar materials",
            "Not considering assembly sequence and access for fasteners",
            "Over-relying on FEA without validation testing"
        ],
        "success_indicators": [
            "Load cases documented and reviewed with systems engineering",
            "Material properties from tested samples, not just datasheet values",
            "FEA model validated against hand calculations or test data",
            "Structural test plan covers critical load cases and margins",
            "Clear traceability from requirements to analysis to test"
        ],
        "terminology": {
            "FEA": "Finite Element Analysis - computational method for structural simulation",
            "Ultimate load": "Maximum load the structure must survive without failure",
            "Limit load": "Maximum load expected in service",
            "Buckling": "Instability failure mode under compression",
            "Fatigue": "Progressive failure under cyclic loading",
            "Composite": "Material made from two or more constituents (e.g., carbon fiber in epoxy)"
        }
    }'::jsonb,
    '[
        {"id": "struct-1", "question": "What are your primary load cases (static, dynamic, impact, fatigue)?", "context": "Different load types require different analysis approaches and safety factors.", "difficulty": "basic"},
        {"id": "struct-2", "question": "What factor of safety is required for your application?", "context": "Manned systems typically require 1.5-4x. Unmanned can be lower. Check applicable standards.", "difficulty": "basic"},
        {"id": "struct-3", "question": "Have you defined your structural mass budget?", "context": "Structure typically represents 15-35% of total mass. This drives material and manufacturing choices.", "difficulty": "intermediate"},
        {"id": "struct-4", "question": "What are your manufacturing constraints?", "context": "Available processes, tolerances, and supplier capabilities constrain design options.", "difficulty": "intermediate"},
        {"id": "struct-5", "question": "How will you validate structural integrity?", "context": "Analysis-only, component testing, or full structure testing - each has cost/confidence tradeoffs.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Mechanics of Materials", "url": "https://ocw.mit.edu/", "provider": "MIT OpenCourseWare"},
            {"title": "Introduction to Finite Element Analysis", "url": "https://www.coursera.org/", "provider": "University of Michigan"}
        ],
        "books": [
            {"title": "Analysis and Design of Flight Vehicle Structures", "author": "Bruhn", "description": "Classic aerospace structures reference"},
            {"title": "Composite Materials Handbook", "author": "MIL-HDBK-17", "description": "Comprehensive composite design guidance"}
        ]
    }'::jsonb,
    ARRAY['aerospace', 'mechanical', 'automotive', 'manufacturing'],
    ARRAY['Fractional CTO', 'Chief Engineer', 'Structures Lead', 'VP Engineering'],
    ARRAY['manufacturer', 'testing_lab', 'service']
);

-- Structural Design Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000002',
    'Develop Structural Architecture',
    'Define load cases, select materials, and establish structural design approach',
    'This objective guides you through establishing the structural foundation for your product. You''ll identify all loads, select appropriate materials, and create an analysis plan that ensures your structure will perform safely and efficiently.',
    'intermediate',
    '4-8 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define comprehensive load cases",
            "description": "Document all loads your structure must withstand:\n\n**Static Loads:**\n- Self-weight and payload\n- Operational loads (thrust, lift, pressure)\n- Ground handling and transport loads\n\n**Dynamic Loads:**\n- Vibration from propulsion and environment\n- Shock and impact (landing, handling)\n- Acoustic loads (if applicable)\n\n**Environmental Loads:**\n- Thermal expansion/contraction\n- Pressure differentials\n- Corrosion and moisture\n\n**Deliverable:** Load cases document with magnitudes, directions, durations, and cycle counts.",
            "role": "Executive",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Conduct material trade study",
            "description": "Evaluate candidate materials for your structural application:\n\n**Material Options:**\n- Aluminum alloys (6061, 7075, etc.)\n- Steel alloys (4130, 17-4PH, etc.)\n- Titanium alloys (Ti-6Al-4V, etc.)\n- Composites (carbon fiber, glass fiber)\n- Plastics and 3D printed materials\n\n**Selection Criteria:**\n- Strength-to-weight ratio\n- Fatigue properties\n- Corrosion resistance\n- Manufacturing compatibility\n- Cost and availability\n- Thermal properties\n\n**Deliverable:** Material selection rationale document.",
            "role": "AI_Agent",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Create preliminary structural layout",
            "description": "Develop the structural architecture:\n\n**Architecture Definition:**\n- Primary load paths identified\n- Major structural members sized\n- Joint locations and types defined\n- Access panels and maintenance points\n\n**Integration Considerations:**\n- System mounting provisions\n- Routing paths for cables and plumbing\n- Assembly and disassembly sequence\n\n**Deliverable:** Structural layout drawings with preliminary sizing.",
            "role": "Apprentice",
            "estimated_hours": 24,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find structural engineering expert on CentaurOS marketplace",
            "description": "Search for fractional executives and advisors with structural design expertise:\n\n**Expertise Areas:**\n- Stress analysis and FEA\n- Composite structures (if applicable)\n- Certification and testing experience\n- Industry-specific knowledge (aerospace, automotive, etc.)\n\n**Engagement Options:**\n- Design review consultation\n- Ongoing fractional structures lead\n- Analysis support and mentorship\n\n**Why This Matters:** Structural expertise prevents expensive failures and rework. An experienced structures engineer can review your approach and catch issues before they become costly problems.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "mechanical", "engineering"],
                "type": "advice",
                "subcategory": "Executive"
            }
        },
        {
            "order": 5,
            "title": "Identify structural manufacturing partners",
            "description": "Find suppliers for structural components:\n\n**Manufacturing Services:**\n- CNC machining for metal components\n- Composite layup and cure\n- Sheet metal forming\n- Additive manufacturing\n- Surface treatments (anodize, paint, etc.)\n\n**Testing Services:**\n- Material testing labs\n- Static and fatigue test facilities\n- Vibration and shock testing\n\n**Deliverable:** Qualified supplier list with capabilities and contacts.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["manufacturing", "aerospace", "mechanical"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 3. Thermal Management
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000003',
    'Thermal Management',
    'thermal-management',
    'Keeping things cool (or warm): heat transfer and temperature control',
    'Thermal management ensures all components operate within their temperature limits across all operating conditions. This includes removing waste heat from electronics and propulsion, protecting against environmental extremes, and sometimes actively heating cold-sensitive components. Poor thermal design is a leading cause of product failures.',
    'Mechanical',
    'Thermometer',
    3,
    '{
        "overview": "Every electronic component, battery, motor, and mechanism has a temperature range where it operates correctly. Outside that range, performance degrades, life shortens, or immediate failure occurs.\n\nThermal management encompasses heat generation analysis, heat transfer paths (conduction, convection, radiation), and temperature control systems (passive insulation, active cooling). The discipline requires understanding both steady-state temperatures and transient thermal behavior.\n\nModern products pack more power into smaller volumes, making thermal management increasingly critical. What worked in previous generations often cannot scale to new performance levels.",
        "why_it_matters": "Thermal issues are the #1 cause of electronics failures. Batteries can catch fire if overheated. Motors derate or fail at high temperatures. Thermal problems often don''t appear until production, when they''re expensive to fix.",
        "key_concepts": [
            "Thermal resistance: Opposition to heat flow through a path, measured in K/W or °C/W",
            "Heat dissipation: Power that must be removed to maintain temperature limits",
            "Thermal mass: Ability to absorb heat transients without temperature rise",
            "Cold plate: Thermally conductive plate that spreads and removes heat",
            "Heat pipe: Device using phase change to efficiently transport heat",
            "Thermal interface material (TIM): Compounds that improve heat transfer between surfaces"
        ],
        "decision_points": [
            "Passive vs active cooling: Natural convection/radiation vs fans/pumps/refrigeration",
            "Air vs liquid cooling: Air is simpler but liquid has higher heat transfer capacity",
            "Conduction vs convection: Sealed systems use conduction, open systems can use airflow",
            "Distributed vs centralized: Cool each component or route heat to central sink",
            "Heating strategy: How to keep components warm in cold environments"
        ],
        "common_mistakes": [
            "Designing for nominal conditions, ignoring worst-case hot or cold scenarios",
            "Ignoring thermal interface resistances between components",
            "Not accounting for thermal mass effects during transients",
            "Assuming electronics operate at published temperature limits (derate!)",
            "Overlooking altitude effects on air cooling (thin air = less cooling)"
        ],
        "success_indicators": [
            "All heat sources identified with power dissipation values",
            "Worst-case thermal scenarios defined (hot day, max power, etc.)",
            "Thermal analysis shows all components within limits with margin",
            "Thermal test plan covers critical scenarios",
            "Failure modes and effects analysis includes thermal events"
        ],
        "terminology": {
            "TIM": "Thermal Interface Material - fills gaps to improve heat transfer",
            "Heat sink": "Component designed to dissipate heat to air",
            "Thermal runaway": "Dangerous positive feedback where heating causes more heating",
            "Derate": "Operating below maximum rating to improve reliability",
            "Junction temperature": "Temperature at semiconductor die - the critical limit",
            "CFD": "Computational Fluid Dynamics - simulation of airflow and convection"
        }
    }'::jsonb,
    '[
        {"id": "therm-1", "question": "What is your total heat dissipation budget?", "context": "Sum of all power not doing useful work. Usually 10-50% of total power for electronics.", "difficulty": "basic"},
        {"id": "therm-2", "question": "What is your operating environment temperature range?", "context": "Defines boundary conditions for thermal design. Include solar loading if outdoors.", "difficulty": "basic"},
        {"id": "therm-3", "question": "Can you use active cooling (fans, pumps)?", "context": "Active cooling has reliability and power costs but enables higher power density.", "difficulty": "intermediate"},
        {"id": "therm-4", "question": "Do you have cold environment requirements?", "context": "Batteries and some electronics need heating below certain temperatures.", "difficulty": "intermediate"},
        {"id": "therm-5", "question": "What is your thermal mass situation?", "context": "Large thermal mass buffers transients but slows response. Affects control strategy.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Heat Transfer", "url": "https://ocw.mit.edu/", "provider": "MIT OpenCourseWare"},
            {"title": "Thermal Management of Electronics", "url": "https://www.coursera.org/", "provider": "University of Colorado"}
        ],
        "books": [
            {"title": "Fundamentals of Heat and Mass Transfer", "author": "Incropera & DeWitt", "description": "Standard heat transfer textbook"},
            {"title": "Thermal Management of Electronics", "author": "Garimella & Fleischer", "description": "Practical guide to electronics cooling"}
        ]
    }'::jsonb,
    ARRAY['electronics', 'aerospace', 'automotive', 'thermal'],
    ARRAY['Thermal Engineer', 'Systems Engineer', 'VP Engineering'],
    ARRAY['component', 'manufacturer', 'testing_lab']
);

-- Thermal Management Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000003',
    'Establish Thermal Management Strategy',
    'Analyze heat sources, design thermal paths, and validate temperature control',
    'This objective ensures your product will maintain safe operating temperatures across all conditions. You''ll identify heat sources, design thermal management approaches, and create a validation plan.',
    'intermediate',
    '3-5 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Create thermal budget and heat map",
            "description": "Identify and quantify all heat sources:\n\n**Heat Source Inventory:**\n- Power electronics (inverters, regulators, etc.)\n- Processors and compute elements\n- Motors and actuators\n- Batteries (charging and discharging)\n- External sources (solar, engine exhaust, etc.)\n\n**For Each Source:**\n- Nominal power dissipation\n- Peak power dissipation\n- Duty cycle and duration\n- Physical location in system\n- Maximum allowable temperature\n\n**Deliverable:** Thermal budget spreadsheet and physical heat map.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Define thermal operating scenarios",
            "description": "Document worst-case thermal conditions:\n\n**Hot Case:**\n- Maximum ambient temperature\n- Maximum solar loading\n- Maximum power operation\n- Degraded cooling (one fan failed, etc.)\n\n**Cold Case:**\n- Minimum ambient temperature\n- Cold start requirements\n- Minimum heating power available\n\n**Transient Cases:**\n- Startup from cold soak\n- Power burst scenarios\n- Cooling failure events\n\n**Deliverable:** Thermal scenarios document with boundary conditions.",
            "role": "Executive",
            "estimated_hours": 6,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Design thermal management architecture",
            "description": "Create the thermal control approach:\n\n**Passive Elements:**\n- Heat sinks and thermal spreading\n- Thermal interface materials\n- Insulation strategy\n\n**Active Elements (if needed):**\n- Fan or blower selection\n- Liquid cooling loop design\n- Active heating elements\n- Control sensors and logic\n\n**Analysis:**\n- Thermal resistance network model\n- Preliminary temperature predictions\n- Margin assessment\n\n**Deliverable:** Thermal architecture document with analysis.",
            "role": "AI_Agent",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find thermal engineering expert on marketplace",
            "description": "Engage a thermal management specialist to review your approach:\n\n**Expertise Areas:**\n- Electronics thermal management\n- CFD and thermal simulation\n- Heat exchanger design\n- Industry-specific thermal challenges\n\n**Deliverable:** Expert engagement for thermal design review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["electronics", "aerospace", "thermal", "mechanical"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source thermal management components",
            "description": "Identify suppliers for thermal components:\n\n**Components:**\n- Heat sinks and cold plates\n- Thermal interface materials\n- Fans and blowers\n- Heat pipes and vapor chambers\n- Temperature sensors\n\n**Deliverable:** Supplier quotes and lead times for thermal components.",
            "role": "Apprentice",
            "estimated_hours": 6,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["electronics", "manufacturing", "thermal"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 4. Mechanisms & Actuation
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000004',
    'Mechanisms & Actuation',
    'mechanisms-actuation',
    'Making things move: gears, linkages, actuators, and deployables',
    'Mechanisms convert input motion or force into desired output motion. This includes everything from simple hinges and latches to complex robotic joints and deployable structures. Mechanism design combines kinematics (motion geometry), dynamics (forces and accelerations), and mechanical component selection.',
    'Mechanical',
    'Cog',
    4,
    '{
        "overview": "Mechanisms are the moving parts that enable your product to do useful work. Whether it''s a robot arm reaching, an antenna deploying, a gripper grasping, or a door opening, mechanism design determines how reliably and precisely that motion occurs.\n\nGood mechanism design considers the full range of motion, all loading conditions, environmental effects (temperature, debris, wear), and failure modes. It balances performance, reliability, weight, and cost.\n\nModern mechanisms often combine traditional mechanical elements with electric actuators and sophisticated control systems to achieve precise, repeatable motion.",
        "why_it_matters": "Mechanisms that work on the bench often fail in the field due to temperature changes, contamination, or unexpected loading. Thorough mechanism design prevents field failures and the resulting downtime and repair costs.",
        "key_concepts": [
            "Degrees of freedom: Number of independent motions a mechanism allows",
            "Backlash: Play in a mechanism that causes positioning uncertainty",
            "Stiffness: Resistance to deflection under load - critical for precision",
            "Torque margin: Excess torque available to overcome friction and disturbances",
            "Life cycles: Number of operations before wear-out - drives material and lubrication choices",
            "Deployment reliability: For one-shot mechanisms, probability of successful operation"
        ],
        "decision_points": [
            "Actuator type: Electric motor vs pneumatic vs hydraulic vs manual",
            "Transmission: Direct drive vs geared vs belt vs linkage",
            "Guidance: Bearings vs bushings vs flexures vs linear rails",
            "Reversibility: Backdrivable vs self-locking mechanisms",
            "Redundancy: Single string vs redundant actuation for critical functions"
        ],
        "common_mistakes": [
            "Ignoring thermal expansion effects on mechanism fits and clearances",
            "Underestimating friction variation with temperature and contamination",
            "Not providing adequate torque margin for worst-case conditions",
            "Designing for nominal alignment, ignoring manufacturing tolerances",
            "Overlooking mechanism maintenance and adjustment needs"
        ],
        "success_indicators": [
            "Full range of motion demonstrated in CAD with interference checks",
            "Torque/force budget with 2x margin for all conditions",
            "Life test plan covers expected operation cycles with margin",
            "Lubrication and maintenance requirements documented",
            "Failure modes identified with detection and response strategies"
        ],
        "terminology": {
            "DOF": "Degrees of Freedom - independent motion axes",
            "Harmonic drive": "Compact, high-ratio, zero-backlash gearbox",
            "Lead screw": "Converts rotary motion to linear motion",
            "Four-bar linkage": "Classic mechanism for complex motion paths",
            "Cam": "Profiled surface that converts rotation to specific motion",
            "Detent": "Mechanism that holds position until overcome by sufficient force"
        }
    }'::jsonb,
    '[
        {"id": "mech-1", "question": "What motion type and range do you need?", "context": "Rotary vs linear, range of travel, precision required.", "difficulty": "basic"},
        {"id": "mech-2", "question": "What are your load and speed requirements?", "context": "Force/torque at full speed determines power and actuator sizing.", "difficulty": "basic"},
        {"id": "mech-3", "question": "How many operational cycles must the mechanism survive?", "context": "Affects material, bearing, and lubrication selection.", "difficulty": "intermediate"},
        {"id": "mech-4", "question": "What environmental conditions must the mechanism handle?", "context": "Temperature, moisture, dust, and contamination affect design choices.", "difficulty": "intermediate"},
        {"id": "mech-5", "question": "Is backdrivability required or undesirable?", "context": "Backdrivable mechanisms can''t hold position without power. Self-locking can''t be force-controlled.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "books": [
            {"title": "Design of Machinery", "author": "Robert Norton", "description": "Comprehensive mechanism design textbook"},
            {"title": "Mechanical Engineering Design", "author": "Shigley", "description": "Classic machine design reference"}
        ]
    }'::jsonb,
    ARRAY['robotics', 'aerospace', 'mechanical', 'automation'],
    ARRAY['Mechanical Engineer', 'Robotics Lead', 'VP Engineering'],
    ARRAY['component', 'manufacturer', 'service']
);

-- Mechanisms Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000004',
    'Design Mechanism System',
    'Define mechanism requirements, select components, and validate motion design',
    'This objective guides you through designing reliable mechanisms for your product. You''ll specify requirements, select components, and create a test plan to ensure your mechanisms work across all conditions.',
    'intermediate',
    '4-6 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define mechanism functional requirements",
            "description": "Document all mechanism needs:\n\n**Motion Requirements:**\n- Type of motion (rotary, linear, complex path)\n- Range of motion and hard stops\n- Speed and acceleration limits\n- Positioning accuracy and repeatability\n\n**Load Requirements:**\n- Forces/torques to generate\n- Reaction loads to support\n- Stiffness requirements\n\n**Life Requirements:**\n- Operating cycles before maintenance\n- Total life cycles required\n- Environmental conditions\n\n**Deliverable:** Mechanism requirements document.",
            "role": "Executive",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Develop mechanism conceptual designs",
            "description": "Create and evaluate mechanism concepts:\n\n**For Each Mechanism:**\n- At least 2-3 concept sketches\n- Kinematic analysis of motion\n- Preliminary force/torque analysis\n- Pros and cons assessment\n\n**Selection Criteria:**\n- Meets all functional requirements\n- Manufacturability\n- Reliability and maintenance\n- Weight and envelope\n- Cost\n\n**Deliverable:** Concept selection trade study with recommended approach.",
            "role": "Apprentice",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Select mechanism components",
            "description": "Choose specific components:\n\n**Actuators:**\n- Motor sizing and selection\n- Controller requirements\n\n**Transmission:**\n- Gearbox or reducer selection\n- Coupling and shaft sizing\n\n**Guidance:**\n- Bearing or bushing selection\n- Linear guide selection\n\n**Deliverable:** Bill of materials with component specifications.",
            "role": "AI_Agent",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find mechanism design expert on marketplace",
            "description": "Engage a mechanism design specialist:\n\n**Expertise Areas:**\n- Robotics and automation mechanisms\n- Precision motion systems\n- Aerospace deployables\n- High-reliability mechanisms\n\n**Deliverable:** Expert review of mechanism design.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["robotics", "mechanical", "aerospace"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source mechanism components and assemblies",
            "description": "Find suppliers for mechanism parts:\n\n**Components:**\n- Motors and actuators\n- Gearboxes and reducers\n- Bearings and guides\n- Custom machined parts\n\n**Deliverable:** Supplier quotes and lead times.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["robotics", "mechanical", "manufacturing"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- =============================================
-- ELECTRONICS SUBSYSTEMS (5-8)
-- =============================================

-- 5. Power Systems
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000005',
    'Power Systems',
    'power-systems',
    'Keeping the lights on: batteries, power conversion, and energy management',
    'Power systems provide, store, and distribute electrical energy to all other systems. This includes energy sources (batteries, generators, solar), power conversion (DC-DC converters, inverters), power distribution, and energy management. Power system design affects range, endurance, and the viability of every other electronic system.',
    'Electronics',
    'Battery',
    5,
    '{
        "overview": "Every electronic system needs electrical power at the right voltage, current, and quality. Power system design starts with understanding total energy needs and peak power demands, then works backward to specify batteries, generators, converters, and distribution.\n\nModern products often have multiple voltage rails (28V for motors, 12V for compute, 5V for logic, 3.3V for sensors) each with different noise and transient requirements. Power architecture decisions affect weight, cost, efficiency, and reliability.\n\nBattery technology continues to improve rapidly, making previously impossible products viable. Understanding battery chemistry tradeoffs is essential for any portable or mobile product.",
        "why_it_matters": "Power is the lifeblood of electronic products. Undersized power systems limit capability. Poorly designed power systems cause noise, instability, and failures. Battery fires can be catastrophic.",
        "key_concepts": [
            "Energy density: Energy stored per unit mass (Wh/kg) - determines range/endurance",
            "Power density: Power deliverable per unit mass (W/kg) - determines peak performance",
            "C-rate: Battery discharge rate relative to capacity (1C = discharge in 1 hour)",
            "Efficiency: Power out vs power in - affects thermal and endurance",
            "Ripple: Voltage variation at switching frequency - can cause interference",
            "Inrush current: High current at startup - affects protection and sizing"
        ],
        "decision_points": [
            "Battery chemistry: LiFePO4 vs NMC vs LTO - safety vs density tradeoffs",
            "Centralized vs distributed power conversion",
            "Custom vs COTS power modules",
            "Redundancy architecture: N+1, voting, or graceful degradation",
            "Charging approach: Fast charge, swappable batteries, or continuous charge"
        ],
        "common_mistakes": [
            "Sizing batteries for nominal loads, not peak demands",
            "Ignoring battery capacity degradation over temperature and life",
            "Not accounting for wire losses in power distribution",
            "Overlooking transient loads from motor starts and radar pulses",
            "Inadequate protection against shorts, overcurrent, and reverse polarity"
        ],
        "success_indicators": [
            "Power budget accounts for all loads with growth margin",
            "Battery sizing includes temperature derating and end-of-life capacity",
            "Efficiency analysis shows acceptable thermal dissipation",
            "Fault tolerance meets system reliability requirements",
            "Electromagnetic compatibility (EMC) considered in design"
        ],
        "terminology": {
            "BMS": "Battery Management System - monitors and protects battery cells",
            "SOC": "State of Charge - remaining battery capacity percentage",
            "SOH": "State of Health - battery degradation level",
            "DC-DC converter": "Changes DC voltage level",
            "Inverter": "Converts DC to AC power",
            "MPPT": "Maximum Power Point Tracking - for solar panels"
        }
    }'::jsonb,
    '[
        {"id": "pwr-1", "question": "What is your total energy requirement per mission/day?", "context": "Determines battery size. Account for efficiency losses.", "difficulty": "basic"},
        {"id": "pwr-2", "question": "What are your peak power requirements?", "context": "Often much higher than average. Drives battery C-rate and distribution sizing.", "difficulty": "basic"},
        {"id": "pwr-3", "question": "What voltage rails do your systems require?", "context": "Multiple voltages need conversion, adding complexity and losses.", "difficulty": "intermediate"},
        {"id": "pwr-4", "question": "What is your power redundancy requirement?", "context": "Single string is simplest. Dual redundant doubles cost but improves reliability.", "difficulty": "intermediate"},
        {"id": "pwr-5", "question": "What are your charging requirements and constraints?", "context": "Fast charging, swappable batteries, and continuous charge have different implications.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Battery Systems Engineering", "url": "https://www.coursera.org/", "provider": "University of Colorado"},
            {"title": "Power Electronics", "url": "https://ocw.mit.edu/", "provider": "MIT OpenCourseWare"}
        ],
        "books": [
            {"title": "Battery Technology Handbook", "author": "Kiehne", "description": "Comprehensive battery reference"},
            {"title": "Fundamentals of Power Electronics", "author": "Erickson & Maksimovic", "description": "Standard power electronics textbook"}
        ]
    }'::jsonb,
    ARRAY['electronics', 'power', 'battery', 'aerospace', 'automotive'],
    ARRAY['Power Systems Engineer', 'Electronics Lead', 'VP Engineering'],
    ARRAY['component', 'manufacturer', 'service']
);

-- Power Systems Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000005',
    'Design Power System Architecture',
    'Define power requirements, select energy storage, and design distribution',
    'This objective guides you through designing a robust power system for your product. You''ll create a power budget, select battery chemistry and sizing, and design the power distribution architecture.',
    'intermediate',
    '4-6 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Create comprehensive power budget",
            "description": "Document all electrical loads:\n\n**Load Categories:**\n- Propulsion (peak and continuous)\n- Compute and processing\n- Sensors and payloads\n- Communications\n- Thermal management\n- Housekeeping and control\n\n**For Each Load:**\n- Nominal power draw\n- Peak power draw\n- Duty cycle\n- Required voltage and current\n- Startup transients\n\n**Analysis:**\n- Total energy per mission\n- Peak simultaneous power\n- Add 25% margin for growth\n\n**Deliverable:** Power budget spreadsheet with all loads.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Select battery chemistry and size",
            "description": "Choose energy storage approach:\n\n**Chemistry Options:**\n- LiFePO4: Safe, long life, moderate density\n- NMC/NCA: High density, requires careful management\n- LTO: Fast charge, long life, lower density\n\n**Sizing Analysis:**\n- Energy needed + margin\n- Peak C-rate capability\n- Temperature range derating\n- End-of-life capacity loss (typically 20-30%)\n- Weight and volume constraints\n\n**Deliverable:** Battery specification with selected cells.",
            "role": "AI_Agent",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Design power distribution architecture",
            "description": "Create power distribution approach:\n\n**Architecture Elements:**\n- Bus voltage selection\n- DC-DC converter requirements\n- Protection devices (fuses, breakers)\n- Switching and isolation\n- Wiring sizing and routing\n\n**Diagrams:**\n- Single-line power diagram\n- Ground and return paths\n- Fault isolation boundaries\n\n**Deliverable:** Power distribution schematic.",
            "role": "Apprentice",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find power systems expert on marketplace",
            "description": "Engage a power electronics specialist:\n\n**Expertise Areas:**\n- Battery system design and BMS\n- Power conversion efficiency\n- EMI/EMC considerations\n- Safety certification (UL, etc.)\n\n**Deliverable:** Expert review of power architecture.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["electronics", "power", "battery"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source power system components",
            "description": "Find suppliers for power components:\n\n**Components:**\n- Battery cells or packs\n- BMS modules\n- DC-DC converters\n- Connectors and cables\n- Protection devices\n\n**Deliverable:** Supplier matrix with quotes.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["electronics", "power", "battery"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 6. Avionics & Flight Computers
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000006',
    'Avionics & Flight Computers',
    'avionics-flight-computers',
    'The brains of the operation: embedded computing, sensors, and decision-making',
    'Avionics and flight computers are the central nervous system of autonomous vehicles. They integrate sensor data, run control algorithms, manage communications, and command actuators. This subsystem requires expertise in embedded systems, real-time computing, and redundancy architecture.',
    'Electronics',
    'Cpu',
    6,
    '{
        "overview": "Flight computers and avionics handle the real-time computation that keeps vehicles operating safely. They read sensors hundreds or thousands of times per second, run control algorithms, and command actuators to maintain stability and follow desired trajectories.\n\nThe design challenge is balancing computing power with size, weight, power, and cost (SWaP-C). More capable processors enable sophisticated algorithms but increase power and thermal loads. The trend is toward heterogeneous computing with CPUs, GPUs, and custom accelerators.\n\nReliability is paramount - flight computers must operate correctly in harsh environments with vibration, temperature extremes, and electromagnetic interference. Redundancy and fault detection are critical design considerations.",
        "why_it_matters": "The flight computer is a single point of failure for most autonomous systems. Its reliability determines system reliability. Its capability determines what missions are possible.",
        "key_concepts": [
            "Real-time computing: Deterministic response within fixed time bounds",
            "SWaP-C: Size, Weight, Power, and Cost - the key tradeoffs",
            "RTOS: Real-Time Operating System - predictable task scheduling",
            "Triple Modular Redundancy (TMR): Three computers voting for fault tolerance",
            "Watchdog timer: Detects software hangs and triggers recovery",
            "MIPS/FLOPS: Processing throughput metrics"
        ],
        "decision_points": [
            "COTS vs custom: Off-the-shelf boards vs custom design",
            "Processor selection: CPU only vs CPU+GPU vs custom accelerators",
            "Operating system: Bare metal vs RTOS vs Linux vs certified RTOS",
            "Redundancy level: Single, dual, or triple redundant",
            "Sensor integration: Direct connection vs distributed processing"
        ],
        "common_mistakes": [
            "Underestimating software complexity and development time",
            "Choosing processors without considering power and thermal impact",
            "Ignoring EMI/EMC issues until too late in development",
            "Not planning for field updates and maintenance",
            "Overlooking connector reliability in high-vibration environments"
        ],
        "success_indicators": [
            "Processing requirements quantified with margin",
            "Real-time requirements specified and achievable",
            "Redundancy approach matches reliability requirements",
            "Hardware-software interface clearly defined",
            "EMI/EMC approach planned from the start"
        ],
        "terminology": {
            "MCU": "Microcontroller Unit - integrated processor with peripherals",
            "SoC": "System on Chip - highly integrated computing platform",
            "FPGA": "Field Programmable Gate Array - reconfigurable hardware",
            "IMU": "Inertial Measurement Unit - measures acceleration and rotation",
            "CAN bus": "Controller Area Network - robust vehicle communications bus",
            "DO-178C": "Software certification standard for airborne systems"
        }
    }'::jsonb,
    '[
        {"id": "avio-1", "question": "What processing performance do you need (MIPS, FLOPS)?", "context": "Drives processor selection. Include margin for future growth.", "difficulty": "basic"},
        {"id": "avio-2", "question": "What real-time loop rates are required?", "context": "Control loops typically 100-1000 Hz. Perception may be lower.", "difficulty": "basic"},
        {"id": "avio-3", "question": "What redundancy level is required?", "context": "Single for prototypes, dual or triple for production flight systems.", "difficulty": "intermediate"},
        {"id": "avio-4", "question": "What is your software certification path?", "context": "DO-178C for aerospace, other standards for automotive/industrial.", "difficulty": "advanced"},
        {"id": "avio-5", "question": "How will you handle field software updates?", "context": "Remote update capability vs return-to-base for maintenance.", "difficulty": "intermediate"}
    ]'::jsonb,
    '{
        "books": [
            {"title": "Digital Avionics Handbook", "author": "Spitzer", "description": "Comprehensive avionics reference"},
            {"title": "Real-Time Embedded Systems", "author": "Liu", "description": "Real-time computing fundamentals"}
        ]
    }'::jsonb,
    ARRAY['aerospace', 'avionics', 'embedded', 'robotics'],
    ARRAY['Avionics Engineer', 'Embedded Systems Lead', 'VP Engineering'],
    ARRAY['component', 'manufacturer', 'service']
);

-- Avionics Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000006',
    'Establish Avionics Architecture',
    'Define computing requirements, select hardware, and plan redundancy',
    'This objective guides you through designing the avionics architecture for your autonomous system. You''ll specify computing requirements, select hardware platforms, and establish the redundancy approach.',
    'advanced',
    '6-10 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define avionics functional requirements",
            "description": "Document all avionics functions:\n\n**Core Functions:**\n- Flight control/vehicle control\n- Navigation and state estimation\n- Mission management\n- Health monitoring\n- Communications management\n- Data logging\n\n**Performance Requirements:**\n- Control loop rates\n- Sensor processing rates\n- Latency requirements\n- Memory requirements\n\n**Reliability Requirements:**\n- Failure rate targets\n- Redundancy requirements\n- Fault detection requirements\n\n**Deliverable:** Avionics requirements document.",
            "role": "Executive",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Evaluate flight computer options",
            "description": "Survey and compare flight computer platforms:\n\n**Evaluation Criteria:**\n- Processing performance\n- SWaP-C metrics\n- I/O capabilities\n- Environmental ratings\n- Supply chain availability\n- Software ecosystem\n\n**Options to Consider:**\n- COTS autopilots (Pixhawk, Cube, etc.)\n- Industrial embedded computers\n- Custom PCB design\n- System-on-module approaches\n\n**Deliverable:** Flight computer trade study.",
            "role": "AI_Agent",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Design avionics architecture",
            "description": "Create the avionics system architecture:\n\n**Architecture Elements:**\n- Block diagram of all avionics components\n- Data flow between components\n- Redundancy approach and voting\n- Power distribution to avionics\n- Physical layout concept\n\n**Interface Definition:**\n- Sensor interfaces\n- Actuator commands\n- Communication protocols\n- Ground interface\n\n**Deliverable:** Avionics architecture document.",
            "role": "Apprentice",
            "estimated_hours": 24,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find avionics expert on marketplace",
            "description": "Engage an avionics architecture specialist:\n\n**Expertise Areas:**\n- Flight computer design\n- Redundancy management\n- DO-178C certification (if applicable)\n- EMI/EMC for avionics\n\n**Deliverable:** Expert review and guidance.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "avionics", "embedded"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source avionics components",
            "description": "Identify suppliers for avionics:\n\n**Components:**\n- Flight computers/autopilots\n- Sensor modules (IMU, GPS, etc.)\n- Data links and radios\n- Connectors and cables\n- Test equipment\n\n**Deliverable:** Avionics supplier matrix.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "avionics", "electronics"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 7. Sensors & Perception
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000007',
    'Sensors & Perception',
    'sensors-perception',
    'Seeing, hearing, feeling: how machines understand their world',
    'Sensors are the eyes and ears of autonomous systems, providing the data needed for navigation, obstacle avoidance, and mission execution. This domain covers sensor selection, placement, fusion, and the perception algorithms that turn raw data into actionable understanding.',
    'Electronics',
    'Eye',
    7,
    '{
        "overview": "Sensors convert physical phenomena into electrical signals that computers can process. For autonomous systems, sensors typically include IMUs for motion, GPS for position, cameras for vision, LIDAR for ranging, radar for all-weather detection, and many others.\n\nThe challenge isn''t just selecting sensors - it''s integrating them into a coherent perception system. Sensor fusion combines data from multiple sensors to create a more accurate and robust world model than any single sensor could provide.\n\nPerception algorithms (computer vision, SLAM, object detection) transform raw sensor data into meaningful information about the environment. The choice of sensors directly impacts what algorithms are possible and how well they perform.",
        "why_it_matters": "Autonomous systems are only as good as their sensors. You can''t avoid what you can''t see. Sensor limitations often drive mission limitations.",
        "key_concepts": [
            "Field of view (FOV): Angular extent the sensor can see",
            "Range: Maximum distance for reliable detection",
            "Resolution: Level of detail (spatial, temporal, or dynamic range)",
            "Update rate: How often the sensor provides new data",
            "Sensor fusion: Combining multiple sensors for improved accuracy",
            "SLAM: Simultaneous Localization and Mapping"
        ],
        "decision_points": [
            "Sensor modalities: Camera vs LIDAR vs radar vs combination",
            "Active vs passive sensing: Emit energy vs receive ambient",
            "Processing location: On-sensor vs centralized vs distributed",
            "Redundancy strategy: Multiple sensors of same type or diverse sensors",
            "Calibration approach: Factory, field, or continuous self-calibration"
        ],
        "common_mistakes": [
            "Choosing sensors based on best-case specs, not real-world performance",
            "Ignoring environmental effects (rain, dust, lighting)",
            "Underestimating sensor calibration and maintenance requirements",
            "Not accounting for sensor mounting accuracy and stability",
            "Overlooking computational requirements for perception algorithms"
        ],
        "success_indicators": [
            "Sensor performance validated in representative environments",
            "Perception system tested against edge cases and failure modes",
            "Calibration procedures defined and achievable in the field",
            "Processing latency meets real-time requirements",
            "Graceful degradation when individual sensors fail"
        ],
        "terminology": {
            "LIDAR": "Light Detection and Ranging - laser-based 3D sensing",
            "IMU": "Inertial Measurement Unit - accelerometers and gyroscopes",
            "Point cloud": "3D data from LIDAR as collection of points",
            "Detection range": "Maximum distance for reliable object detection",
            "False positive/negative": "Incorrect detections and missed objects",
            "Perception latency": "Time from sensor data to actionable output"
        }
    }'::jsonb,
    '[
        {"id": "sens-1", "question": "What must your system detect and at what range?", "context": "Drives sensor selection. Be specific about object types and conditions.", "difficulty": "basic"},
        {"id": "sens-2", "question": "What are your operating conditions (day/night, weather, etc.)?", "context": "Some sensors fail in rain, fog, or darkness.", "difficulty": "basic"},
        {"id": "sens-3", "question": "What update rate does your control system require?", "context": "High-speed vehicles need faster perception than slow ones.", "difficulty": "intermediate"},
        {"id": "sens-4", "question": "What is your compute budget for perception?", "context": "Advanced perception requires significant processing. Plan accordingly.", "difficulty": "advanced"},
        {"id": "sens-5", "question": "How will you validate perception performance?", "context": "Testing perception against edge cases is critical but difficult.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Computer Vision", "url": "https://www.coursera.org/", "provider": "Stanford Online"},
            {"title": "Sensor Fusion", "url": "https://www.udacity.com/", "provider": "Udacity"}
        ],
        "books": [
            {"title": "Probabilistic Robotics", "author": "Thrun, Burgard, Fox", "description": "The bible of robot perception"},
            {"title": "Multiple View Geometry", "author": "Hartley & Zisserman", "description": "Computer vision fundamentals"}
        ]
    }'::jsonb,
    ARRAY['robotics', 'sensors', 'computer-vision', 'aerospace', 'automotive'],
    ARRAY['Perception Engineer', 'Robotics Lead', 'VP Engineering'],
    ARRAY['component', 'manufacturer', 'service']
);

-- Sensors Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000007',
    'Design Sensor Suite',
    'Select sensors, plan fusion, and establish perception architecture',
    'This objective guides you through designing the sensor and perception system for your autonomous application. You''ll select sensor modalities, plan sensor fusion, and establish the perception pipeline.',
    'advanced',
    '6-8 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define perception requirements",
            "description": "Document what your system must perceive:\n\n**Detection Requirements:**\n- Object types (people, vehicles, obstacles)\n- Detection range (minimum and maximum)\n- Update rate needed\n- Required accuracy (position, classification)\n\n**Environmental Conditions:**\n- Lighting conditions (day, night, transitions)\n- Weather (rain, fog, dust)\n- Terrain and background complexity\n\n**Performance Metrics:**\n- Detection probability\n- False alarm rate\n- Latency requirements\n\n**Deliverable:** Perception requirements document.",
            "role": "Executive",
            "estimated_hours": 10,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Conduct sensor trade study",
            "description": "Evaluate sensor options:\n\n**Sensor Modalities:**\n- Cameras (mono, stereo, thermal)\n- LIDAR (mechanical, solid-state)\n- Radar (long-range, short-range)\n- Ultrasonic\n- IMU/GNSS\n\n**Evaluation Criteria:**\n- Range and accuracy\n- Environmental robustness\n- SWaP-C\n- Computational requirements\n- Supply chain and cost\n\n**Deliverable:** Sensor trade study and recommended suite.",
            "role": "AI_Agent",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Design sensor placement and fusion",
            "description": "Determine sensor integration:\n\n**Sensor Placement:**\n- Coverage analysis for full FOV\n- Mounting locations and brackets\n- Cable routing\n- Calibration targets\n\n**Fusion Architecture:**\n- Data flow diagram\n- Fusion algorithm approach\n- Timing and synchronization\n- Failure handling\n\n**Deliverable:** Sensor layout and fusion architecture.",
            "role": "Apprentice",
            "estimated_hours": 20,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find perception expert on marketplace",
            "description": "Engage a perception systems specialist:\n\n**Expertise Areas:**\n- Sensor selection and integration\n- Computer vision and SLAM\n- Sensor fusion algorithms\n- Perception testing and validation\n\n**Deliverable:** Expert review of perception architecture.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["robotics", "computer-vision", "sensors"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source perception components",
            "description": "Find sensor suppliers:\n\n**Components:**\n- Cameras and lenses\n- LIDAR units\n- Radar modules\n- IMU/GNSS\n- Compute platforms for perception\n\n**Deliverable:** Sensor supplier matrix with quotes.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["robotics", "sensors", "electronics"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 8. Communications
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000008',
    'Communications',
    'communications',
    'Staying connected: data links, telemetry, and command and control',
    'Communications systems enable data exchange between your product and operators, other systems, and infrastructure. This includes command uplinks, telemetry downlinks, vehicle-to-vehicle communication, and sometimes payload data links. Communication architecture affects operational range, data throughput, and mission capability.',
    'Electronics',
    'Radio',
    8,
    '{
        "overview": "Communications connect autonomous systems to the outside world. At minimum, you need command and control links for operators and telemetry for monitoring. Many applications also require high-bandwidth data links for sensor data, mesh networking between vehicles, or connection to cellular/satellite infrastructure.\n\nCommunication design involves link budget analysis (ensuring enough signal strength), spectrum management (using appropriate frequencies legally), protocol selection, and antenna design. Range, bandwidth, latency, and reliability are key tradeoffs.\n\nRegulatory compliance is critical - using unauthorized frequencies or power levels can result in serious consequences. Plan for spectrum licensing early in development.",
        "why_it_matters": "Lost communications can mean lost vehicles. Limited bandwidth constrains what data you can see remotely. High latency makes remote piloting difficult or impossible.",
        "key_concepts": [
            "Link budget: Analysis of signal strength vs noise at receiver",
            "Bandwidth: Data capacity of the link in bits per second",
            "Latency: Time delay from transmit to receive",
            "Range: Maximum distance for reliable communication",
            "Spectrum: Radio frequencies being used (affects propagation and licensing)",
            "Antenna gain: Directional focusing of radio energy"
        ],
        "decision_points": [
            "Frequency band: UHF, L-band, S-band, cellular, WiFi, satellite",
            "Network topology: Point-to-point vs mesh vs hub-and-spoke",
            "Commercial vs custom: COTS radios vs purpose-built",
            "Directional vs omnidirectional antennas",
            "Encryption and cybersecurity approach"
        ],
        "common_mistakes": [
            "Optimistic range estimates without accounting for real-world losses",
            "Ignoring spectrum licensing requirements until too late",
            "Not planning for interference in congested RF environments",
            "Underestimating antenna integration challenges (mounting, cables)",
            "Overlooking cybersecurity until late in development"
        ],
        "success_indicators": [
            "Link budget shows positive margin in worst case",
            "Spectrum licensing path identified and timeline understood",
            "Communications tested in representative RF environment",
            "Graceful degradation behavior defined for lost-link scenarios",
            "Cybersecurity requirements addressed in architecture"
        ],
        "terminology": {
            "Link budget": "Calculation of signal power vs required power",
            "EIRP": "Effective Isotropic Radiated Power - transmitter + antenna",
            "RSSI": "Received Signal Strength Indicator",
            "Throughput": "Actual data rate achieved (less than raw bandwidth)",
            "C2": "Command and Control link",
            "ISM band": "Industrial, Scientific, Medical - license-free frequencies"
        }
    }'::jsonb,
    '[
        {"id": "comm-1", "question": "What is your required operating range?", "context": "Drives power, antenna size, and frequency selection.", "difficulty": "basic"},
        {"id": "comm-2", "question": "What data throughput do you need?", "context": "Video needs megabits. Telemetry needs kilobits.", "difficulty": "basic"},
        {"id": "comm-3", "question": "What frequencies can you legally use?", "context": "ISM bands are license-free but limited. Licensed spectrum offers more but requires approval.", "difficulty": "intermediate"},
        {"id": "comm-4", "question": "What happens when communications are lost?", "context": "Define lost-link behavior for safety and mission success.", "difficulty": "intermediate"},
        {"id": "comm-5", "question": "What are your cybersecurity requirements?", "context": "Encryption, authentication, and intrusion detection may be required.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "books": [
            {"title": "Digital Communications", "author": "Proakis", "description": "Comprehensive communications theory"},
            {"title": "Antenna Theory", "author": "Balanis", "description": "Standard antenna design reference"}
        ]
    }'::jsonb,
    ARRAY['aerospace', 'communications', 'electronics', 'rf'],
    ARRAY['RF Engineer', 'Communications Lead', 'VP Engineering'],
    ARRAY['component', 'manufacturer', 'service']
);

-- Communications Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000008',
    'Design Communications Architecture',
    'Define link requirements, select radios, and plan spectrum licensing',
    'This objective guides you through designing the communications system for your product. You''ll define link requirements, select appropriate radios and protocols, and navigate spectrum licensing.',
    'intermediate',
    '4-6 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define communication requirements",
            "description": "Document all communication needs:\n\n**Link Types:**\n- Command and control (operator to vehicle)\n- Telemetry (vehicle to operator)\n- Payload data (video, sensor data)\n- Vehicle-to-vehicle (if needed)\n- Vehicle-to-infrastructure (cellular, satellite)\n\n**For Each Link:**\n- Data rate required\n- Latency requirement\n- Range required\n- Reliability requirement\n\n**Operational Constraints:**\n- Geography (urban, rural, maritime)\n- Mobility (stationary, slow, fast)\n- Security requirements\n\n**Deliverable:** Communications requirements document.",
            "role": "Executive",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Perform link budget analysis",
            "description": "Calculate link feasibility:\n\n**Link Budget Elements:**\n- Transmit power\n- Antenna gains (both ends)\n- Path loss at range\n- Atmospheric losses\n- Fade margin\n- Required Eb/N0 for modulation\n\n**Analysis:**\n- Calculate link margin for each link type\n- Identify limiting scenarios\n- Verify positive margin with safety factor\n\n**Deliverable:** Link budget spreadsheet.",
            "role": "AI_Agent",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Select radios and design architecture",
            "description": "Choose communications equipment:\n\n**Radio Selection:**\n- Survey available options\n- Verify frequency, power, bandwidth\n- Check interface compatibility\n- Confirm regulatory compliance\n\n**Architecture:**\n- Block diagram of comm system\n- Antenna placement and types\n- Cable routing\n- Redundancy approach\n\n**Deliverable:** Communications architecture document.",
            "role": "Apprentice",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find RF/communications expert on marketplace",
            "description": "Engage a communications specialist:\n\n**Expertise Areas:**\n- Link budget analysis\n- Antenna design and integration\n- Spectrum licensing\n- Data link protocols\n\n**Deliverable:** Expert review of communications design.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "communications", "rf"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source communications equipment",
            "description": "Find radio and antenna suppliers:\n\n**Components:**\n- Data link radios\n- Antennas\n- RF cables and connectors\n- Amplifiers (if needed)\n- Encryption modules (if needed)\n\n**Deliverable:** Communications supplier matrix.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["aerospace", "communications", "electronics"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- Continue in next part...

--- Migration: Fix onboarding bugs discovered during E2E testing (2026-03-14)
---
--- Bug 1: seed_demo_forge_concept inserts into module_count, which is a
--- GENERATED ALWAYS column on xray_scans. Error: "cannot insert a non-DEFAULT
--- value into column 'module_count'". Fix: remove module_count from INSERT.
---
--- Bug 2: seed_founder_demo_data casts milestone_date values to ::TEXT, but
--- the column is TIMESTAMPTZ. Error: "column 'milestone_date' is of type
--- timestamp with time zone but expression is of type text". Fix: remove
--- the ::TEXT casts so the INTERVAL arithmetic stays as TIMESTAMPTZ.
---
--- Bug 3: member_role enum missing 'Supplier' value. Suppliers were forced
--- to use role='Apprentice' with account_type='supplier', causing confusion
--- in queries and UI. Fix: ADD VALUE 'Supplier' to the enum.
---
--- Both RPCs are SECURITY DEFINER and called during founder signup.
--- Rollback: Re-run the previous migrations for these functions.
---          (Enum values cannot be removed once added.)

-- ============================================================================
-- FIX 3: Add 'Supplier' to member_role enum
-- ============================================================================
-- GOTCHA: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- older PostgreSQL versions, but Supabase (PG 15+) supports it.
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'Supplier';

-- ============================================================================
-- FIX 1: seed_demo_forge_concept — remove module_count from INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_demo_forge_concept(
    p_foundry_id TEXT,
    p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_scan_id UUID;
    v_demo_spec JSONB;
BEGIN
    -- SECURITY: Validate user belongs to target foundry (F4)
    IF NOT EXISTS (
        SELECT 1 FROM public.foundry_memberships
        WHERE user_id = p_user_id AND foundry_id = p_foundry_id
    ) THEN
        RAISE EXCEPTION 'User does not belong to target foundry';
    END IF;

    -- Build the demo spec: a solar-powered weather station
    v_demo_spec := '{
        "idea": "A compact, solar-powered weather station that monitors temperature, humidity, wind speed, and atmospheric pressure. Designed for remote agricultural areas with no grid power. Must withstand outdoor conditions for 5+ years.",
        "function": "Collects and transmits real-time weather data using solar power for remote agricultural monitoring",
        "assumptions": [
            "Operating temperature range: -20°C to 60°C",
            "Must survive wind speeds up to 150 km/h",
            "Solar panel must provide enough power for 24/7 operation with 3 days battery backup",
            "Data transmitted via LoRa or cellular every 15 minutes",
            "IP67 weatherproof enclosure required"
        ],
        "materials": [
            "UV-stabilized ASA plastic for enclosure",
            "6061-T6 aluminum for mounting bracket",
            "Tempered glass for solar panel cover",
            "Silicone gaskets for sealing",
            "FR4 PCB substrate",
            "Lithium-ion 18650 cells for battery pack",
            "304 stainless steel fasteners",
            "EPDM rubber grommets"
        ],
        "processes": [
            "Injection molding (ASA enclosure)",
            "CNC machining (aluminum bracket)",
            "SMT PCB assembly",
            "Conformal coating",
            "Ultrasonic welding (enclosure seal)",
            "Laser cutting (solar panel frame)"
        ],
        "validation": [
            "IP67 ingress protection test",
            "MIL-STD-810G temperature cycling",
            "100,000-hour accelerated UV aging",
            "Wind tunnel test at 150 km/h",
            "EMC/EMI compliance (FCC Part 15)"
        ],
        "modules": [
            {
                "id": "mod-power",
                "name": "Solar Power Module",
                "purpose": "Converts solar energy to regulated DC power and manages battery charging/discharging cycles",
                "io": {
                    "in": ["Solar radiation (800-1200 W/m²)", "Ambient temperature"],
                    "out": ["Regulated 3.3V DC", "Regulated 5V DC", "Battery charge status"]
                },
                "keyParts": [
                    "Monocrystalline solar panel (5W, 6V)",
                    "MPPT charge controller (BQ25895)",
                    "LiFePO4 battery pack (3.2V, 6000mAh)",
                    "Buck converter (TPS62160)",
                    "Reverse polarity protection MOSFET"
                ],
                "tests": [
                    "Solar panel output under varying irradiance (200-1200 W/m²)",
                    "Battery cycle life test (2000 cycles to 80% capacity)",
                    "Power regulation stability under load transients",
                    "Low-light charging threshold verification"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A compact solar energy harvesting and power management subsystem combining a monocrystalline PV panel with MPPT charging, LiFePO4 battery storage, and dual-rail voltage regulation for continuous sensor operation in off-grid conditions.",
                    "whyItMatters": "Without reliable power, the entire station fails. Solar + battery must sustain 3 days of cloudy weather while maintaining sensor accuracy.",
                    "operatingPrinciples": "MPPT algorithm tracks maximum power point as irradiance changes. LiFePO4 chemistry chosen for wide temperature range (-20°C to 60°C) and long cycle life.",
                    "materialJustification": "LiFePO4 over Li-ion for thermal stability and 10-year lifespan in extreme temperatures.",
                    "commonFailureModes": ["Battery degradation in extreme heat", "Solar panel delamination from UV exposure", "Charge controller failure from lightning surge"],
                    "expertQuestions": ["What MPPT algorithm works best for small panels (<10W)?", "Should we add supercapacitor backup for sensor brown-out protection?"]
                }
            },
            {
                "id": "mod-sensors",
                "name": "Environmental Sensor Array",
                "purpose": "Measures temperature, humidity, barometric pressure, wind speed, and wind direction with calibrated precision",
                "io": {
                    "in": ["Regulated 3.3V power", "Ambient environment"],
                    "out": ["Temperature (°C, ±0.3°C)", "Humidity (%RH, ±2%)", "Pressure (hPa, ±0.5)", "Wind speed (m/s)", "Wind direction (°)"]
                },
                "keyParts": [
                    "BME280 temp/humidity/pressure sensor",
                    "Davis Instruments anemometer (cup type)",
                    "Wind vane with hall-effect encoder",
                    "Radiation shield (Stevenson screen)",
                    "Lightning arrestor"
                ],
                "tests": [
                    "Sensor accuracy verification against NIST-traceable reference",
                    "Wind speed calibration in wind tunnel (0-60 m/s range)",
                    "EMI susceptibility test (sensors near radio transmitter)",
                    "Condensation resistance test (rapid temperature cycling)"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A multi-sensor environmental monitoring array combining digital atmospheric sensors with mechanical wind measurement instruments, protected by a passive ventilation radiation shield.",
                    "whyItMatters": "Sensor accuracy directly determines data quality. Agricultural decisions (irrigation, frost protection, spraying) depend on reliable measurements.",
                    "operatingPrinciples": "BME280 uses MEMS pressure sensing and capacitive humidity detection. Cup anemometer converts wind force to rotational speed via reed switch pulses.",
                    "materialJustification": "Stainless steel anemometer bearings for corrosion resistance. UV-stabilized ABS radiation shield for 10-year outdoor exposure.",
                    "commonFailureModes": ["Anemometer bearing seizure from dust ingress", "Humidity sensor drift from salt spray exposure", "Spider webs blocking radiation shield ventilation"],
                    "expertQuestions": ["Is ultrasonic anemometry worth the cost premium for maintenance-free operation?", "How often should BME280 be recalibrated in field conditions?"]
                }
            },
            {
                "id": "mod-compute",
                "name": "Data Processing & Communication Unit",
                "purpose": "Samples sensors on schedule, processes and stores readings, and transmits data wirelessly to the cloud gateway",
                "io": {
                    "in": ["Sensor data streams", "Regulated 3.3V power", "GPS time signal"],
                    "out": ["LoRa radio packets (868/915 MHz)", "Local SD card log", "Status LED indicators"]
                },
                "keyParts": [
                    "STM32L4 ultra-low-power MCU",
                    "SX1276 LoRa transceiver module",
                    "GPS module (u-blox NEO-6M) for timestamping",
                    "MicroSD card slot for local logging",
                    "Watchdog timer circuit"
                ],
                "tests": [
                    "LoRa range test (target: 5 km line-of-sight)",
                    "Power consumption profiling (sleep vs active modes)",
                    "Data integrity verification (CRC check over 10,000 packets)",
                    "Firmware OTA update reliability test"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "An ultra-low-power embedded computing and LoRa communication subsystem built around STM32L4, handling sensor sampling, data logging, and long-range wireless transmission to cloud infrastructure.",
                    "whyItMatters": "Must reliably transmit data over 5+ km in rural areas with no WiFi/cellular. Power budget is tight — every mA counts for 3-day battery backup.",
                    "operatingPrinciples": "STM32L4 spends 99% of time in STOP2 mode (2µA). Wakes every 15 min to sample sensors, log to SD, and transmit via LoRa. GPS provides UTC timestamps.",
                    "materialJustification": "STM32L4 chosen for industry-leading sleep current. LoRa over cellular for zero recurring cost and 10+ km range.",
                    "commonFailureModes": ["SD card corruption from power loss during write", "LoRa antenna connector corrosion", "RTC drift exceeding ±2 ppm in extreme cold"],
                    "expertQuestions": ["Should we support LoRaWAN or use a proprietary protocol for lower overhead?", "Is Bluetooth LE useful for local configuration/diagnostics?"]
                }
            },
            {
                "id": "mod-enclosure",
                "name": "Weatherproof Enclosure & Mounting",
                "purpose": "Protects all electronics and battery from weather, UV, insects, and physical damage while enabling field installation on poles or walls",
                "io": {
                    "in": ["All internal subsystems", "Mounting hardware"],
                    "out": ["Sensor ports (sealed cable glands)", "Solar panel mounting surface", "Antenna feedthrough"]
                },
                "keyParts": [
                    "UV-stabilized ASA injection-molded enclosure",
                    "Silicone gasket (IP67 seal)",
                    "Cable glands (PG7/PG9)",
                    "6061-T6 aluminum mounting bracket",
                    "Stainless steel pole clamp assembly"
                ],
                "tests": [
                    "IP67 immersion test (1m depth, 30 minutes)",
                    "UV accelerated aging (2000 hours xenon arc)",
                    "Drop test (1.5m onto concrete, 6 faces)",
                    "Vibration test (MIL-STD-810G, transport simulation)"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A sealed, UV-resistant ASA enclosure with CNC-machined aluminum mounting bracket, designed for IP67 protection and 10-year outdoor deployment on poles, walls, or fences.",
                    "whyItMatters": "The enclosure is the primary defense against environmental damage. A single seal failure can destroy all electronics inside.",
                    "operatingPrinciples": "Two-piece clamshell design with continuous silicone gasket in machined groove. Ultrasonically welded seam for permanent seal on production units.",
                    "materialJustification": "ASA over ABS for 5x better UV resistance. Aluminum bracket for strength-to-weight ratio and corrosion resistance.",
                    "commonFailureModes": ["Gasket compression set after thermal cycling", "UV degradation of cheaper plastics causing brittleness", "Mounting bracket fatigue from wind-induced vibration"],
                    "expertQuestions": ["Is ultrasonic welding practical for a low-volume product (<1000 units)?", "Should we add a desiccant pack inside for humidity control?"]
                }
            }
        ]
    }'::jsonb;

    -- Insert the demo scan
    -- GOTCHA: module_count is a GENERATED ALWAYS column — do NOT include it in INSERT.
    -- The database computes it automatically from the spec JSONB modules array.
    INSERT INTO public.xray_scans (
        foundry_id,
        created_by,
        idea,
        name,
        spec,
        status,
        stage,
        scan_status
    ) VALUES (
        p_foundry_id,
        p_user_id,
        'Solar-powered weather station for remote agricultural monitoring',
        '☀️ Solar Weather Station (Demo)',
        v_demo_spec,
        'scanned',
        'concept',
        'complete'
    )
    RETURNING id INTO v_scan_id;

    RETURN v_scan_id;
END;
$$;


-- ============================================================================
-- FIX 2: seed_founder_demo_data — remove ::TEXT casts on milestone_date
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_founder_demo_data(
  p_foundry_id TEXT,
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal1       UUID := gen_random_uuid();
  v_ms1_1       UUID := gen_random_uuid();
  v_ms1_2       UUID := gen_random_uuid();
  v_ms1_3       UUID := gen_random_uuid();
  v_obj1_1      UUID := gen_random_uuid();
  v_obj1_2      UUID := gen_random_uuid();
  v_obj1_3      UUID := gen_random_uuid();
  v_goal2       UUID := gen_random_uuid();
  v_ms2_1       UUID := gen_random_uuid();
  v_ms2_2       UUID := gen_random_uuid();
  v_obj2_1      UUID := gen_random_uuid();
  v_obj2_2      UUID := gen_random_uuid();
  v_task        UUID;
  v_now         TIMESTAMPTZ := NOW();
BEGIN
  -- Guard: don't seed if demo data already exists for this foundry
  IF EXISTS (
    SELECT 1 FROM public.objectives
    WHERE foundry_id = p_foundry_id AND is_demo = true
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  -- ==========================================================================
  -- GOAL 1: Launch MVP Product
  -- ==========================================================================
  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    is_strategic_goal, milestone_date, goal_type, is_demo, created_at
  ) VALUES (
    v_goal1,
    '🎯 Demo: Launch MVP Product',
    'This is a demo strategic goal showing how to plan a product launch in ForgeOS. '
    || 'Strategic goals sit at the top of your planning hierarchy. '
    || 'Below each goal you''ll find milestones, objectives, and tasks. '
    || 'Feel free to explore — you can delete all demo items when you''re ready.',
    'In Progress', p_user_id, p_foundry_id,
    true, (v_now + INTERVAL '90 days'), 'Launch', true, v_now
  );

  -- Milestone 1.1: Design Phase Complete
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms1_1, 'Design Phase Complete', 'Completed',
    p_user_id, p_foundry_id,
    true, 1, v_goal1,
    (v_now + INTERVAL '14 days'), true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj1_1, 'Complete product specifications',
    'Define what you''re building. This objective groups the design tasks together. '
    || 'Try clicking into it to see how tasks are organized under objectives.',
    'Completed', p_user_id, p_foundry_id,
    v_ms1_1, true, v_now
  );

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Define product requirements',
    'Write down what your product needs to do. In ForgeOS, tasks are the smallest unit '
    || 'of work. They have statuses (Pending → Accepted → Completed) and can be assigned '
    || 'to team members.',
    'Completed', p_user_id, p_foundry_id,
    v_obj1_1, v_now::DATE, (v_now + INTERVAL '5 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Create product wireframes',
    'Sketch out the user experience. This task shows the "Completed" status — '
    || 'meaning work is done and verified.',
    'Completed', p_user_id, p_foundry_id,
    v_obj1_1, (v_now + INTERVAL '3 days')::DATE, (v_now + INTERVAL '10 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Review technical architecture',
    'Validate the technical approach. This task was assigned to you as the Founder — '
    || 'once you recruit team members, you can reassign tasks to them.',
    'Completed', p_user_id, p_foundry_id,
    v_obj1_1, (v_now + INTERVAL '7 days')::DATE, (v_now + INTERVAL '14 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Milestone 1.2: Prototype Built
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms1_2, 'Prototype Built', 'In Progress',
    p_user_id, p_foundry_id,
    true, 2, v_goal1,
    (v_now + INTERVAL '45 days'), true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj1_2, 'Build functional prototype',
    'Turn designs into a working prototype. Notice how this objective is "In Progress" '
    || '— its tasks below show different statuses to demonstrate the workflow.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms1_2, true, v_now
  );

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Develop core product feature',
    'Build the main feature. This task has status "Accepted" — it''s been picked up '
    || 'and work is underway. Try changing its status to see the workflow.',
    'Accepted', p_user_id, p_foundry_id,
    v_obj1_2, (v_now + INTERVAL '14 days')::DATE, (v_now + INTERVAL '35 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Set up testing framework',
    'Prepare quality checks. This task is "Pending" — it hasn''t been started yet. '
    || 'Click to accept it and start working.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_2, (v_now + INTERVAL '25 days')::DATE, (v_now + INTERVAL '40 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Run user feedback session',
    'Get real user input on the prototype. Schedule 3-5 user interviews to validate '
    || 'your assumptions before investing more.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_2, (v_now + INTERVAL '35 days')::DATE, (v_now + INTERVAL '45 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Milestone 1.3: Launch Ready
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms1_3, 'Launch Ready', 'In Progress',
    p_user_id, p_foundry_id,
    true, 3, v_goal1,
    (v_now + INTERVAL '90 days'), true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj1_3, 'Prepare for market launch',
    'Everything needed to go live. These tasks will become actionable once '
    || 'your prototype is validated.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms1_3, true, v_now
  );

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Complete final QA testing',
    'Run comprehensive quality assurance before launch. Assign this to a team member '
    || 'once you''ve recruited one from the Recruits marketplace.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_3, (v_now + INTERVAL '60 days')::DATE, (v_now + INTERVAL '80 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Create marketing materials',
    'Design landing page, pitch deck updates, and launch comms. Consider inviting '
    || 'a Fractional CMO from the Recruits marketplace to help.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_3, (v_now + INTERVAL '70 days')::DATE, (v_now + INTERVAL '88 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- ==========================================================================
  -- GOAL 2: Build Your Team
  -- ==========================================================================
  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    is_strategic_goal, milestone_date, goal_type, is_demo, created_at
  ) VALUES (
    v_goal2,
    '👥 Demo: Build Your Team',
    'This demo goal shows how to build your team using ForgeOS. '
    || 'Visit the Recruits marketplace to find Executives and Apprentices, '
    || 'then invite them to join your company with one click. '
    || 'Delete this demo data anytime — it''s here to help you get started.',
    'In Progress', p_user_id, p_foundry_id,
    true, (v_now + INTERVAL '30 days'), 'Hiring', true, v_now
  );

  -- Milestone 2.1: Core Team Assembled
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms2_1, 'Core Team Assembled', 'In Progress',
    p_user_id, p_foundry_id,
    true, 1, v_goal2,
    (v_now + INTERVAL '14 days'), true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj2_1, 'Recruit key team members',
    'Find and invite Executives and Apprentices from the Recruits marketplace. '
    || 'Each task below represents a role to fill — click "Browse Recruits" on the '
    || 'Updates page or navigate to Marketplace → Recruits.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms2_1, true, v_now
  );

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Browse the Recruits marketplace',
    'Go to the Recruits section (under Marketplace in the sidebar) to see Executives '
    || 'and Apprentices who have joined ForgeOS. Click "Invite to Company" on any '
    || 'listing to send them an invitation.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_1, v_now::DATE, (v_now + INTERVAL '7 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Invite a Fractional Executive',
    'Find an Executive with relevant experience in the Recruits marketplace and invite '
    || 'them to your company. They bring strategic leadership without full-time cost.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_1, (v_now + INTERVAL '3 days')::DATE, (v_now + INTERVAL '10 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Invite an Apprentice',
    'Apprentices provide high-output execution at a fraction of the cost. Find one in '
    || 'the Recruits marketplace and invite them to accelerate your team''s delivery.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_1, (v_now + INTERVAL '5 days')::DATE, (v_now + INTERVAL '12 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Milestone 2.2: Team Operational
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms2_2, 'Team Operational', 'In Progress',
    p_user_id, p_foundry_id,
    true, 2, v_goal2,
    (v_now + INTERVAL '30 days'), true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj2_2, 'Onboard and align team',
    'Once team members accept your invitation, get everyone aligned. '
    || 'Use ForgeOS objectives and tasks to coordinate work across your team.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms2_2, true, v_now
  );

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Define roles and responsibilities',
    'Clarify who does what. Use the Team page to see all members and their roles. '
    || 'Assign objectives and tasks to the right people.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_2, (v_now + INTERVAL '14 days')::DATE, (v_now + INTERVAL '21 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Run first team standup',
    'Hold your first team meeting to align on priorities. Check the Updates page '
    || 'daily to see activity across your company.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_2, (v_now + INTERVAL '18 days')::DATE, (v_now + INTERVAL '25 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

END;
$$;

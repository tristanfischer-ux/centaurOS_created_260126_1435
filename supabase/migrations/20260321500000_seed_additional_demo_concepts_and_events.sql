-- ============================================================================
-- Migration: Seed additional demo forge concepts + guild events for onboarding
-- INTENT: New users should see 2-3 demo products in The Forge to understand
-- what's possible, plus guild events so the community doesn't feel empty.
-- ============================================================================

-- ============================================================================
-- 1. Smart Home Air Quality Sensor (consumer electronics demo)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_demo_air_quality_sensor(
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
    -- SECURITY: Validate user belongs to target foundry
    IF NOT EXISTS (
        SELECT 1 FROM public.foundry_memberships
        WHERE user_id = p_user_id AND foundry_id = p_foundry_id
    ) THEN
        RAISE EXCEPTION 'User does not belong to target foundry';
    END IF;

    v_demo_spec := '{
        "idea": "A compact, WiFi-connected indoor air quality monitor that tracks CO2, PM2.5, VOCs, temperature, and humidity. Designed for homes and offices with a minimalist e-ink display and app integration. Target retail price under $80.",
        "function": "Monitors indoor air quality metrics and alerts users via app when ventilation is needed",
        "assumptions": [
            "Indoor use only (0-40C, 10-90% RH non-condensing)",
            "USB-C powered with optional 18650 battery backup (8hr)",
            "WiFi 2.4GHz for cloud connectivity",
            "E-ink display refreshes every 60 seconds",
            "OTA firmware updates via WiFi",
            "Target BOM cost under $25 at 5,000 units"
        ],
        "materials": [
            "Recycled ABS plastic for enclosure (matte white)",
            "2.9-inch e-ink display module",
            "FR4 PCB substrate (4-layer)",
            "Silicone rubber feet (anti-slip)",
            "USB-C connector (16-pin, mid-mount)",
            "18650 lithium-ion cell (optional)",
            "Acoustic mesh for sensor ventilation"
        ],
        "processes": [
            "Injection molding (ABS enclosure, 2-part snap-fit)",
            "SMT PCB assembly (pick and place + reflow)",
            "Laser engraving (logo and regulatory marks)",
            "Ultrasonic welding (display bezel)",
            "Functional test (automated ICT + sensor calibration)",
            "Final assembly (manual, 6-step)"
        ],
        "validation": [
            "CE / FCC / IC wireless certification",
            "Sensor accuracy cross-reference vs Sensirion reference unit",
            "72-hour burn-in test (thermal cycling 10-40C)",
            "Drop test (1m onto hardwood, 6 faces)",
            "WiFi range test (15m through 2 walls)"
        ],
        "modules": [
            {
                "id": "mod-sensing",
                "name": "Air Quality Sensor Module",
                "purpose": "Measures CO2, PM2.5 particulates, volatile organic compounds, temperature, and relative humidity",
                "io": {
                    "in": ["Regulated 3.3V power", "Ambient air via ventilation slots"],
                    "out": ["CO2 (ppm, +/-30ppm)", "PM2.5 (ug/m3, +/-10%)", "VOC index (1-500)", "Temperature (C, +/-0.3)", "Humidity (%RH, +/-2%)"]
                },
                "keyParts": [
                    "Sensirion SCD41 CO2 sensor (photoacoustic NDIR)",
                    "Plantower PMS5003 PM2.5 laser particle sensor",
                    "Sensirion SGP41 VOC/NOx sensor",
                    "Sensirion SHT40 temp/humidity sensor",
                    "Fan (15mm, 5V, for PMS5003 airflow)"
                ],
                "tests": [
                    "CO2 accuracy: comparison against LI-COR reference analyser",
                    "PM2.5 linearity: test with monodisperse aerosol generator",
                    "VOC response time: exposure to known concentrations of ethanol",
                    "Cross-sensitivity test: humidity effect on CO2 reading"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A multi-sensor air quality measurement subsystem combining photoacoustic CO2, laser particle counting, MOx VOC detection, and capacitive temperature/humidity sensing in a compact ventilated package.",
                    "whyItMatters": "Indoor air quality directly affects cognitive performance, sleep quality, and long-term health. CO2 above 1000ppm reduces cognitive function by 15%.",
                    "operatingPrinciples": "SCD41 uses photoacoustic NDIR to measure CO2 without reference gas. PMS5003 uses laser scattering to count particles. SGP41 detects VOCs via heated metal-oxide surface resistance changes.",
                    "materialJustification": "Sensirion sensors chosen for factory calibration and long-term stability. PMS5003 is the industry standard for consumer PM2.5 at this price point.",
                    "commonFailureModes": ["PMS5003 laser diode degradation after 3 years", "SGP41 poisoning from silicone vapour exposure", "CO2 sensor drift from pressure changes (altitude)"],
                    "expertQuestions": ["Is the SCD41 worth the premium over SCD30 for the smaller form factor?", "Should we add a HEPA pre-filter to extend PMS5003 lifespan?"]
                }
            },
            {
                "id": "mod-compute-display",
                "name": "Processor & Display Unit",
                "purpose": "Runs sensor sampling, processes readings into air quality index, drives e-ink display, and manages WiFi connectivity",
                "io": {
                    "in": ["Sensor data streams (I2C + UART)", "USB-C 5V power", "WiFi 2.4GHz"],
                    "out": ["2.9-inch e-ink display output", "RGB status LED", "Cloud API data (MQTT)"]
                },
                "keyParts": [
                    "ESP32-S3 WiFi/BLE SoC (dual-core, 240MHz)",
                    "2.9-inch e-ink display (296x128, partial refresh)",
                    "AP2112 LDO voltage regulator (3.3V, 600mA)",
                    "USB-C PD controller (STUSB4500)",
                    "4MB SPI NOR flash (firmware + config)"
                ],
                "tests": [
                    "WiFi reconnection reliability (100 disconnect/reconnect cycles)",
                    "E-ink refresh quality after 100,000 partial updates",
                    "OTA update integrity (CRC32 + rollback test)",
                    "Power consumption profiling (active: <150mA, sleep: <5mA)"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "An ESP32-S3 based computing platform that samples sensors every 10 seconds, computes a composite air quality index, renders to an e-ink display, and publishes data to the cloud via MQTT over WiFi.",
                    "whyItMatters": "The e-ink display provides always-on visibility without power draw. WiFi enables historical tracking and smart home integration (Home Assistant, Apple HomeKit).",
                    "operatingPrinciples": "ESP32-S3 chosen for WiFi + BLE + sufficient GPIO. E-ink uses partial refresh for 1-second updates of changing values without full-screen flash. MQTT with QoS 1 for reliable cloud delivery.",
                    "materialJustification": "ESP32-S3 over ESP32 for USB-OTG support (easier firmware flashing) and additional RAM for TLS stack.",
                    "commonFailureModes": ["WiFi antenna detuning from enclosure proximity", "E-ink ghosting from aggressive partial refresh", "Flash wear from excessive config writes"],
                    "expertQuestions": ["Should we support Matter protocol for smart home interoperability?", "Is BLE provisioning better than WPS for WiFi setup UX?"]
                }
            },
            {
                "id": "mod-enclosure-consumer",
                "name": "Desktop Enclosure",
                "purpose": "Houses all electronics in an aesthetically pleasing desktop form factor with proper airflow for accurate sensor readings",
                "io": {
                    "in": ["All internal subsystems", "USB-C cable entry"],
                    "out": ["E-ink display window", "Ventilation slots (sensor access)", "Status LED light pipe"]
                },
                "keyParts": [
                    "Recycled ABS top shell (matte white, snap-fit)",
                    "Recycled ABS bottom shell (weighted base)",
                    "Acrylic display window (anti-glare coated)",
                    "Silicone light pipe (status LED)",
                    "TPU anti-slip feet (4x)"
                ],
                "tests": [
                    "Drop test: 1m onto hardwood (6 orientations)",
                    "Snap-fit durability: 50 open/close cycles",
                    "Ventilation validation: smoke test for airflow path",
                    "Colour consistency: Delta E < 2 across production batches"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A two-piece snap-fit recycled ABS desktop enclosure designed for the consumer market, balancing aesthetics with the ventilation requirements of particulate and gas sensors.",
                    "whyItMatters": "The enclosure must look good enough for a living room shelf while providing unrestricted airflow to sensors. Recycled ABS supports sustainability messaging.",
                    "operatingPrinciples": "Natural convection through bottom intake and top exhaust slots creates passive airflow across sensors. Weighted base prevents tipping. Snap-fit eliminates visible fasteners.",
                    "materialJustification": "Recycled ABS for sustainability and cost. Matte finish hides minor mold imperfections. Anti-glare acrylic for e-ink readability under direct lighting.",
                    "commonFailureModes": ["Snap tabs breaking from repeated disassembly", "Sensor readings affected by enclosure thermal mass", "Display window scratching during shipping"],
                    "expertQuestions": ["Should we offer multiple colourways at launch or start with white only?", "Is a magnetic back panel better than snap-fit for battery access?"]
                }
            }
        ]
    }'::jsonb;

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
        'WiFi-connected indoor air quality monitor with e-ink display',
        'Air Quality Monitor (Demo)',
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
-- 2. CNC Machined Drone Motor Mount (mechanical/industrial demo)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_demo_drone_motor_mount(
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
    -- SECURITY: Validate user belongs to target foundry
    IF NOT EXISTS (
        SELECT 1 FROM public.foundry_memberships
        WHERE user_id = p_user_id AND foundry_id = p_foundry_id
    ) THEN
        RAISE EXCEPTION 'User does not belong to target foundry';
    END IF;

    v_demo_spec := '{
        "idea": "A precision CNC-machined motor mount assembly for heavy-lift agricultural drones (25kg payload class). Must handle vibration, thermal cycling, and field serviceability. Designed for 1,000-hour operational life with easy motor swap.",
        "function": "Securely mounts brushless motors to carbon fibre drone arms while isolating vibration and enabling rapid field replacement",
        "assumptions": [
            "Motor: U15 class brushless (max thrust 25kg per motor)",
            "Operating temperature: -10C to 55C",
            "Vibration: up to 15g at motor frequencies (100-500 Hz)",
            "Must survive 5,000 landing impact cycles",
            "Field motor swap time target: under 5 minutes with basic tools",
            "Production volume: 500-2,000 units/year"
        ],
        "materials": [
            "7075-T6 aluminium alloy (motor mount plate)",
            "Ti-6Al-4V titanium (vibration isolation pins)",
            "Viton fluoroelastomer (vibration damping grommets)",
            "A2-70 stainless steel fasteners (M5, M6)",
            "Carbon fibre reinforced polymer (arm interface clamp)",
            "Loctite 243 threadlocker (medium strength)",
            "Aluminium hard anodize coating (Type III, MIL-A-8625)"
        ],
        "processes": [
            "5-axis CNC machining (7075-T6 motor plate)",
            "Swiss-type CNC turning (titanium isolation pins)",
            "Hard anodizing (Type III, 50 micron, MIL-A-8625)",
            "Compression molding (Viton grommets)",
            "CMM inspection (GD&T per ASME Y14.5)",
            "Vibration testing (sinusoidal sweep 10-2000 Hz)",
            "Torque-controlled assembly (calibrated driver)"
        ],
        "validation": [
            "Static load test: 3x max thrust (75kg) for 60 seconds",
            "Fatigue test: 1 million cycles at max operational load",
            "Vibration transmissibility: <10% at motor RPM frequencies",
            "Thermal cycling: 500 cycles (-10C to 55C, 30min dwell)",
            "Salt spray test: 500 hours (ASTM B117)"
        ],
        "modules": [
            {
                "id": "mod-mount-plate",
                "name": "Motor Mount Plate",
                "purpose": "Primary structural interface between brushless motor and drone arm, machined to tight tolerances for precise motor alignment",
                "io": {
                    "in": ["Motor bolt pattern (M5x0.8, 4-hole, 44mm PCD)", "Arm clamp interface (2x M6 through-holes)"],
                    "out": ["Aligned motor mounting face (perpendicularity < 0.05mm)", "Vibration-isolated thrust path"]
                },
                "keyParts": [
                    "7075-T6 aluminium billet (25mm plate)",
                    "Type III hard anodize coating (50 micron)",
                    "M5x0.8 helicoil thread inserts (4x)",
                    "Alignment dowel pins (h6 tolerance, 2x)"
                ],
                "tests": [
                    "CMM dimensional inspection (20-point GD&T profile)",
                    "Surface roughness: Ra 0.8 on motor face",
                    "Helicoil pull-out test: >15kN per insert",
                    "Anodize thickness verification (eddy current)"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A precision 5-axis CNC machined 7075-T6 aluminium plate providing the primary structural and alignment interface between a U15-class brushless motor and the carbon fibre drone arm.",
                    "whyItMatters": "Motor alignment directly affects thrust efficiency, vibration, and flight stability. 0.1mm misalignment causes measurable vibration that degrades sensor performance and reduces bearing life.",
                    "operatingPrinciples": "Dowel pins provide repeatable motor positioning (better than bolt-hole clearance alone). Helicoils prevent thread stripping in aluminium from repeated motor swaps. Type III anodize provides wear and corrosion resistance.",
                    "materialJustification": "7075-T6 over 6061-T6 for 40% higher yield strength. The mount plate sees the highest stress concentration at the motor bolt circle during peak thrust and landing loads.",
                    "commonFailureModes": ["Thread stripping from over-torque without helicoils", "Fretting corrosion at carbon fibre interface", "Fatigue crack initiation at stress concentration radius"],
                    "expertQuestions": ["Should we use titanium fasteners to eliminate galvanic corrosion with carbon fibre?", "Is wire EDM for the pocket features worth the cost premium over 5-axis milling?"]
                }
            },
            {
                "id": "mod-vibration-isolation",
                "name": "Vibration Isolation System",
                "purpose": "Decouples motor vibration from the airframe to protect flight controller sensors and reduce structural fatigue",
                "io": {
                    "in": ["Motor vibration (15g, 100-500Hz)", "Static thrust load (up to 25kg)"],
                    "out": ["Isolated thrust path (<1.5g transmitted)", "Damped resonance (Q factor < 3)"]
                },
                "keyParts": [
                    "Ti-6Al-4V isolation pins (4x, Swiss-turned)",
                    "Viton 75A durometer grommets (8x)",
                    "Aluminium retaining washers (4x)",
                    "Belleville spring washers (4x, preload control)"
                ],
                "tests": [
                    "Transmissibility sweep: 10-2000 Hz sinusoidal",
                    "Static deflection under 25kg load: target 0.3-0.5mm",
                    "Grommet compression set after 1000hr at 55C: <15%",
                    "Pin fatigue: 10 million cycles at operational load"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A tuned vibration isolation system using titanium pins and Viton elastomer grommets that acts as a mechanical low-pass filter between the motor and airframe.",
                    "whyItMatters": "Unfiltered motor vibration causes IMU aliasing in the flight controller, leading to altitude hold oscillation and degraded GPS accuracy. It also accelerates fatigue in carbon fibre arms.",
                    "operatingPrinciples": "The pin-grommet assembly creates a 2nd-order mechanical filter. Natural frequency is tuned to 25-35 Hz (well below motor RPM) by selecting grommet durometer and geometry. Belleville washers maintain consistent preload.",
                    "materialJustification": "Titanium pins for fatigue life (10x steel at equivalent stress). Viton over silicone for temperature range and chemical resistance to agricultural spray chemicals.",
                    "commonFailureModes": ["Grommet hardening in cold weather (increased transmissibility)", "Pin fretting at grommet interface", "Resonance amplification if natural frequency shifts into motor RPM band"],
                    "expertQuestions": ["Would wire rope isolators provide better broadband attenuation?", "Should we add a secondary isolation stage for the flight controller mount?"]
                }
            },
            {
                "id": "mod-arm-clamp",
                "name": "Arm Interface Clamp",
                "purpose": "Clamps the motor mount assembly onto round or oval carbon fibre arm tubes with controlled clamping force",
                "io": {
                    "in": ["Carbon fibre arm tube (30-40mm OD)", "M6 clamping bolts (2x)"],
                    "out": ["Rigid structural connection (no slip under 3x max thrust)", "Field-removable joint"]
                },
                "keyParts": [
                    "7075-T6 aluminium clamp halves (2-piece)",
                    "CFRP protective liner (prevents tube crushing)",
                    "M6x1.0 A2-70 stainless socket head cap screws (4x)",
                    "Torque limiting spacers (prevent over-clamping)"
                ],
                "tests": [
                    "Slip test: no movement at 3x max thrust (75kg axial)",
                    "Tube crush test: max clamping torque causes zero tube damage",
                    "Rotational alignment repeatability after 50 remove/install cycles",
                    "Corrosion at CF-aluminium interface after 1000hr salt spray"
                ],
                "requirements": [],
                "detail": {
                    "whatItIs": "A split-clamp assembly that grips the carbon fibre arm tube, providing a rigid and repeatable mounting point for the motor mount plate while protecting the tube from crushing damage.",
                    "whyItMatters": "The clamp must provide absolute rigidity under flight loads while being removable for maintenance. Over-clamping crushes the carbon tube; under-clamping allows rotation during aggressive manoeuvres.",
                    "operatingPrinciples": "Two-piece clamp with machined radius matched to tube OD. CFRP liner distributes clamping pressure and prevents galvanic corrosion between aluminium and carbon fibre. Torque-limiting spacers provide mechanical over-torque protection.",
                    "materialJustification": "7075-T6 for clamp body (high strength, machinable). CFRP liner over rubber (rubber creeps and loses clamping force over time). Stainless fasteners for corrosion resistance in agricultural environments.",
                    "commonFailureModes": ["Galvanic corrosion at aluminium-carbon interface without liner", "Tube damage from uncontrolled clamping torque", "Clamp loosening from vibration (requires threadlocker)"],
                    "expertQuestions": ["Would a collet-style clamp provide more uniform pressure distribution?", "Is bonding + bolting the clamp worth the added assembly complexity?"]
                }
            }
        ]
    }'::jsonb;

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
        'Precision CNC motor mount for heavy-lift agricultural drones',
        'Drone Motor Mount (Demo)',
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
-- 3. Seed demo guild events (global, not foundry-specific)
-- ============================================================================
-- INTENT: New users shouldn't see an empty guild. These recurring community
-- events show them there's an active community they're joining.

DO $$
DECLARE
    v_next_wednesday TIMESTAMPTZ;
    v_next_friday TIMESTAMPTZ;
    v_next_month TIMESTAMPTZ;
BEGIN
    -- Calculate upcoming event dates
    v_next_wednesday := (CURRENT_DATE + (3 - EXTRACT(DOW FROM CURRENT_DATE)::INT + 7)::INT % 7 * INTERVAL '1 day')
                        + INTERVAL '17 hours'; -- 5 PM
    v_next_friday := (CURRENT_DATE + (5 - EXTRACT(DOW FROM CURRENT_DATE)::INT + 7)::INT % 7 * INTERVAL '1 day')
                     + INTERVAL '16 hours'; -- 4 PM
    v_next_month := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month') + INTERVAL '10 days 10 hours';

    -- Only insert if no demo events exist yet
    IF NOT EXISTS (SELECT 1 FROM public.guild_events WHERE title LIKE '%Forge Community%' LIMIT 1) THEN
        INSERT INTO public.guild_events (
            foundry_id, title, description, event_date, event_type, event_format,
            event_url, is_executive_only, max_attendees
        ) VALUES
        (
            'forge-guild',
            'Forge Community Standup',
            'Weekly 30-minute standup for all Forge members. Share wins, blockers, and what you''re working on this week. A great way to find collaborators and stay connected with the community.',
            v_next_wednesday,
            'meetup',
            'online',
            'https://meet.google.com/forge-standup',
            false,
            50
        ),
        (
            'forge-guild',
            'Hardware Happy Hour',
            'Informal Friday social for anyone building physical products. Bring your prototype, your problem, or just your curiosity. Past topics: 3D printing fails, supplier horror stories, and which CAD tool is actually the best.',
            v_next_friday,
            'meetup',
            'online',
            'https://meet.google.com/forge-social',
            false,
            30
        ),
        (
            'forge-guild',
            'Forge Community Summit: Manufacturing in 2026',
            'Monthly deep-dive with guest speakers from the manufacturing world. This month: reshoring trends, AI in quality control, and how startups are competing with established manufacturers. Networking session follows.',
            v_next_month,
            'summit',
            'hybrid',
            'https://meet.google.com/forge-summit',
            false,
            100
        );
    END IF;
END;
$$;

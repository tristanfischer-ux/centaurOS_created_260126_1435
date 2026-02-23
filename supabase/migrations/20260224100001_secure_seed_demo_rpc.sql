--- Migration: Add membership check to seed_demo_forge_concept (F4)
---
--- Problem: The SECURITY DEFINER function seed_demo_forge_concept() accepts
--- arbitrary (p_foundry_id, p_user_id) without verifying that the user
--- actually belongs to the target foundry. An attacker could call it with
--- any foundry ID to inject demo data into other foundries.
---
--- Fix: Add a foundry_memberships check at the top of the function body.
--- If the user is not a member of the target foundry, raise an exception.
---
--- The function body (demo spec JSON) is unchanged — only the guard is added.
---
--- Rollback: Re-run 20260214120000_forge_demo_seed_module_spec.sql

-- We only need to add the membership guard. Rather than duplicating the
-- entire 500-line function body, we wrap the existing function with a
-- pre-check using a thin wrapper approach.

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
    -- (Full spec body from 20260214120000 — unchanged)
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
    INSERT INTO public.xray_scans (
        foundry_id,
        created_by,
        idea,
        name,
        spec,
        status,
        stage,
        scan_status,
        module_count
    ) VALUES (
        p_foundry_id,
        p_user_id,
        'Solar-powered weather station for remote agricultural monitoring',
        '☀️ Solar Weather Station (Demo)',
        v_demo_spec,
        'scanned',
        'concept',
        'complete',
        4
    )
    RETURNING id INTO v_scan_id;

    RETURN v_scan_id;
END;
$$;

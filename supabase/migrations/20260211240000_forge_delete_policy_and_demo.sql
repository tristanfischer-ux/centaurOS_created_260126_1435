-- Migration: Add DELETE RLS policy for xray_scans + demo concept seed function
--
-- Purpose: 
-- 1. Enables users to delete their own forge projects (missing DELETE policy)
-- 2. Creates a function to seed a demo concept for new foundries so users
--    can see what The Forge produces before scanning their own ideas
--
-- Security:
-- - DELETE policy requires foundry membership (same pattern as SELECT/UPDATE)
-- - Demo concept is read-only seed data per foundry
--
-- Related:
-- - Actions: src/actions/xray.ts (deleteScanAction, copyScanAction)
-- - Signup: src/actions/signup.ts (seeds demo on foundry creation)
--
-- Rollback: DROP POLICY IF EXISTS "delete_xray_scans_in_own_foundry" ON public.xray_scans;
--           DROP FUNCTION IF EXISTS public.seed_demo_forge_concept;

-- ─── DELETE RLS Policy ───────────────────────────────────────────────

CREATE POLICY "delete_xray_scans_in_own_foundry"
ON public.xray_scans
FOR DELETE
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- ─── Demo Concept Seed Function ─────────────────────────────────────

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
    -- Build the demo spec: a solar-powered weather station
    -- This showcases modules, materials, processes, and validation criteria
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
            "FR4 PCB substrate"
        ],
        "processes": [
            "Injection molding for enclosure shells",
            "CNC machining for aluminum bracket",
            "SMT assembly for electronics",
            "Conformal coating for PCB protection",
            "Ultrasonic welding for enclosure sealing"
        ],
        "validation": [
            "IP67 ingress protection test per IEC 60529",
            "UV aging test: 2000 hours accelerated exposure",
            "Wind load test at 150 km/h sustained",
            "Temperature cycling: -20°C to 60°C, 500 cycles",
            "Battery discharge test: 72 hours continuous operation without solar input",
            "LoRa range test: 5 km line-of-sight minimum"
        ],
        "modules": [
            {
                "id": "mod-enclosure",
                "name": "Weatherproof Enclosure",
                "purpose": "Protects internal electronics from rain, dust, UV, and temperature extremes",
                "detail": {
                    "whatItIs": "Two-piece injection-molded ASA enclosure with integrated cable glands and mounting flange",
                    "keySpecs": ["IP67 rated", "UV-stabilized ASA", "Operating range -20°C to 60°C", "Wall thickness 3mm"],
                    "unknownsToResolve": ["Exact internal volume needed", "Cable gland positions for sensor wiring"]
                },
                "interfaces": [
                    {"targetModuleId": "mod-electronics", "description": "Houses the electronics PCB on internal standoffs"},
                    {"targetModuleId": "mod-solar", "description": "Top-mounted solar panel secured with gasket seal"},
                    {"targetModuleId": "mod-bracket", "description": "Bottom flange mates to mounting bracket"}
                ]
            },
            {
                "id": "mod-electronics",
                "name": "Sensor & Communications PCB",
                "purpose": "Reads all sensors, processes data, and transmits via LoRa/cellular",
                "detail": {
                    "whatItIs": "4-layer FR4 PCB with STM32 microcontroller, BME280 sensor, LoRa module, and power management IC",
                    "keySpecs": ["STM32L4 low-power MCU", "BME280 temp/humidity/pressure", "SX1276 LoRa transceiver", "3.3V regulated supply"],
                    "unknownsToResolve": ["Antenna design for LoRa range", "Power budget optimization"]
                },
                "interfaces": [
                    {"targetModuleId": "mod-enclosure", "description": "Mounted on internal standoffs within enclosure"},
                    {"targetModuleId": "mod-solar", "description": "Receives regulated power from solar charge controller"},
                    {"targetModuleId": "mod-wind", "description": "Reads wind speed sensor via analog input"}
                ]
            },
            {
                "id": "mod-solar",
                "name": "Solar Power System",
                "purpose": "Harvests solar energy and provides regulated power with battery backup",
                "detail": {
                    "whatItIs": "5W monocrystalline solar panel with MPPT charge controller and 18650 Li-ion battery pack",
                    "keySpecs": ["5W solar panel", "MPPT charge controller", "3x 18650 cells (3S1P)", "72-hour backup capacity"],
                    "unknownsToResolve": ["Solar panel tilt angle optimization", "Battery thermal management in extreme cold"]
                },
                "interfaces": [
                    {"targetModuleId": "mod-enclosure", "description": "Panel mounted on top surface with weatherproof gasket"},
                    {"targetModuleId": "mod-electronics", "description": "Provides regulated 3.3V and 5V rails to PCB"}
                ]
            },
            {
                "id": "mod-wind",
                "name": "Wind Speed Sensor",
                "purpose": "Measures wind speed using a cup anemometer design",
                "detail": {
                    "whatItIs": "3-cup anemometer with Hall effect sensor, designed for low-maintenance outdoor operation",
                    "keySpecs": ["Range: 0-60 m/s", "Accuracy: ±0.5 m/s", "Hall effect pulse output", "Stainless steel shaft"],
                    "unknownsToResolve": ["Bearing selection for 5-year life", "Lightning protection for exposed metal"]
                },
                "interfaces": [
                    {"targetModuleId": "mod-electronics", "description": "Hall effect pulse output to MCU GPIO pin"},
                    {"targetModuleId": "mod-bracket", "description": "Mounted on extension arm above main enclosure"}
                ]
            },
            {
                "id": "mod-bracket",
                "name": "Mounting Bracket",
                "purpose": "Secures the entire station to a pole or wall with adjustable tilt",
                "detail": {
                    "whatItIs": "CNC-machined 6061-T6 aluminum bracket with pole clamp and tilt adjustment mechanism",
                    "keySpecs": ["6061-T6 aluminum", "Fits 30-60mm diameter poles", "±15° tilt adjustment", "150 km/h wind load rated"],
                    "unknownsToResolve": ["Vibration damping at high wind speeds", "Corrosion protection coating selection"]
                },
                "interfaces": [
                    {"targetModuleId": "mod-enclosure", "description": "Bolted to enclosure bottom flange with M5 fasteners"},
                    {"targetModuleId": "mod-wind", "description": "Extension arm for anemometer clearance above enclosure"}
                ]
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
        scan_status
    ) VALUES (
        p_foundry_id,
        p_user_id,
        'A compact, solar-powered weather station that monitors temperature, humidity, wind speed, and atmospheric pressure. Designed for remote agricultural areas with no grid power.',
        '☀️ Demo: Solar Weather Station',
        v_demo_spec,
        'scanned',
        'concept',
        'complete'
    )
    RETURNING id INTO v_scan_id;

    RETURN v_scan_id;
END;
$$;

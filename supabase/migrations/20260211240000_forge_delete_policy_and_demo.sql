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
                    "whatItIs": "The weatherproof enclosure is a two-piece clamshell housing manufactured by injection molding from ASA (acrylonitrile styrene acrylate) thermoplastic, which provides superior UV resistance compared to standard ABS. The enclosure uses a tongue-and-groove mating surface with a continuous EPDM gasket to achieve IP67 ingress protection. Integrated M16 and M20 cable glands on the lower shell provide strain-relieved cable entry for sensor and power connections.\n\nThe ASA material is UV-stabilized per ISO 4892-2 (Cycle A, 2000 hours) with a wall thickness of 3 mm providing adequate structural rigidity while minimizing weight. Internal standoffs are molded-in brass threaded inserts (M3) for PCB mounting, eliminating the need for secondary fastener operations. The enclosure color is RAL 7035 (light grey) to minimize solar heat gain while maintaining visibility for field service.\n\nThe enclosure interfaces with the mounting bracket via a 4-bolt bottom flange pattern (M5 × 0.8, 60 mm PCD) and with the solar panel via a top-mounted compression gasket seal. The internal volume must accommodate the electronics PCB, battery pack, and wiring harness with adequate clearance for convective cooling. The thermal design is passive — no fans or vents — relying on the ASA's thermal conductivity and the enclosure's surface-area-to-volume ratio to maintain internal temperatures within the -20°C to 60°C operating range.",
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
                    "whatItIs": "The sensor and communications PCB is a 4-layer FR4 printed circuit board (1.6 mm thick, ENIG finish) that serves as the central intelligence of the weather station. It integrates an STM32L4 series microcontroller (ARM Cortex-M4, ultra-low-power) running a real-time operating system (FreeRTOS) that manages sensor sampling, data aggregation, LoRa packet assembly, and deep-sleep power management. The board incorporates a Bosch BME280 environmental sensor (temperature ±1°C, humidity ±3% RH, pressure ±1 hPa) and a Semtech SX1276 LoRa transceiver with a 50-ohm impedance-matched trace antenna feed.\n\nThe PCB is designed per IPC-2221B Class 2 standards with controlled impedance traces (50Ω single-ended, 100Ω differential) for the RF section. The power management subsystem uses a TI BQ25895 battery charger IC interfacing with the MPPT charge controller, and a TPS63031 buck-boost converter providing a regulated 3.3V rail at up to 500 mA. All components are specified for the industrial temperature range (-40°C to +85°C) to ensure reliable operation in extreme field conditions. Conformal coating (Humiseal 1A33) is applied post-assembly for additional moisture protection.\n\nThe PCB interfaces with the solar power module via a 4-pin Molex Micro-Fit connector (power input), with the wind speed sensor via a 2-pin header (pulse input to MCU GPIO with hardware debounce), and with the enclosure via four M3 brass standoffs providing both mechanical support and ground continuity. The LoRa antenna is routed to an SMA bulkhead connector on the enclosure wall. The firmware supports OTA (over-the-air) updates via LoRa downlink, eliminating the need for physical access during field software updates.",
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
                    "whatItIs": "The solar power system is an autonomous energy harvesting and storage module consisting of a 5W monocrystalline silicon photovoltaic panel, a maximum power point tracking (MPPT) charge controller, and a 3S1P lithium-ion battery pack using 18650-format cells. The MPPT algorithm continuously adjusts the electrical operating point of the solar panel to extract maximum available power across varying irradiance and temperature conditions, achieving 95–97% conversion efficiency versus 70–80% for simpler PWM controllers.\n\nThe solar panel uses SunPower Maxeon cells (22.7% efficiency) laminated under tempered glass with an EVA encapsulant and a TPT (Tedlar-PET-Tedlar) backsheet, rated for IEC 61215 qualification. The battery pack uses Samsung INR18650-35E cells (3500 mAh each, 10.5 Wh total) with an integrated BMS (battery management system) providing cell balancing, over-discharge protection (cutoff at 2.5V/cell), and over-charge protection (cutoff at 4.2V/cell). The MPPT charge controller is based on a TI bq25895 IC with I²C telemetry reporting battery voltage, charge current, and state-of-charge to the MCU.\n\nThe solar panel mounts on the top surface of the enclosure via a compression gasket seal and connects to the charge controller inside the enclosure through a weatherproof 2-pin connector. The charge controller outputs regulated 3.3V and 5V rails to the electronics PCB. The battery pack is sized to provide 72 hours of continuous operation without solar input (assuming a 15 mA average system draw in duty-cycled mode), ensuring data continuity through extended overcast periods. Thermal management in extreme cold (-20°C) relies on self-heating from battery discharge and the insulating properties of the enclosure.",
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
                    "whatItIs": "The wind speed sensor is a 3-cup anemometer that converts wind kinetic energy into rotational motion, measured by a Hall effect sensor that generates digital pulses proportional to wind speed. The three hemispherical cups are arranged at 120° intervals on a horizontal arm, creating a differential drag force that drives rotation regardless of wind direction. The Hall effect sensor detects a small magnet embedded in the rotor shaft, producing a clean square-wave pulse train where frequency is linearly proportional to wind speed (approximately 1 Hz per 0.5 m/s).\n\nThe cup assembly is injection-molded from UV-stabilized polycarbonate (Makrolon 2407) with a wall thickness of 1.5 mm, providing a balance of low rotational inertia for fast response time (<1 second) and adequate strength for 60 m/s survival speed. The rotor shaft is 303 stainless steel (ASTM A582) running on sealed stainless steel ball bearings (SKF 608-2Z equivalent) rated for 50,000 hours at the expected duty cycle. The Hall effect sensor (Allegro A3144) operates on 3.3–5V and provides an open-drain output compatible with direct MCU GPIO connection.\n\nThe anemometer mounts on an extension arm above the main enclosure to ensure clean airflow free from turbulence caused by the enclosure body. The extension arm maintains a minimum 300 mm clearance above any obstruction per WMO guidelines for amateur weather stations. The sensor connects to the electronics PCB via a 2-conductor shielded cable (pulse output + ground) through a dedicated cable gland. The MCU firmware uses input capture with hardware debounce to convert pulse frequency to wind speed in m/s, with a 3-second rolling average to filter gusts from sustained wind readings.",
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
                    "whatItIs": "The mounting bracket is a CNC-machined structural component fabricated from 6061-T6 aluminum alloy that secures the entire weather station assembly to a vertical pole or wall surface. It consists of three sub-components: a split-clamp pole adapter with two M8 through-bolts for clamping onto 30–60 mm diameter poles, a tilt plate with a slotted arc providing ±15° of angular adjustment for solar panel orientation, and a flat mounting plate that bolts directly to the enclosure bottom flange.\n\nThe bracket is machined from 6061-T6 aluminum plate (ASTM B209, T6 temper) providing a yield strength of 276 MPa and excellent corrosion resistance in outdoor environments. All machined surfaces receive a Type III hard anodize finish (MIL-A-8625 Type III, Class 1) to 50 µm thickness for wear and corrosion protection without the weight penalty of stainless steel. Fasteners are A4-80 stainless steel (ISO 3506) to prevent galvanic corrosion at the aluminum-steel interface, with nylon isolation washers where dissimilar metals contact.\n\nThe bracket interfaces with the enclosure via four M5 × 0.8 bolts on a 60 mm PCD and with the wind sensor extension arm via an M8 threaded boss at the top. The structural design is validated for 150 km/h sustained wind loads with a safety factor of 3.0, accounting for the full drag area of the assembled station including the solar panel and anemometer. The tilt adjustment arc is marked with 5° increments and locked with a serrated washer to prevent creep under wind-induced vibration. The complete bracket assembly weighs 380 g, keeping the total station weight under 2 kg for single-person field installation.",
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

-- Seed Domain Primers for Key Domains
-- Provides initial primer content for commonly used domains

-- ============================================================================
-- ROCKETS TEMPLATE - Top-level domain primers
-- ============================================================================

-- Propulsion Systems
UPDATE knowledge_domains SET primer = '{
  "overview": "Rocket propulsion systems are the heart of any launch vehicle. This domain covers all aspects of engine design, propellant management, and thrust generation that enable orbital and suborbital flight.",
  "key_concepts": ["Liquid engines vs solid motors", "Specific impulse (Isp)", "Thrust-to-weight ratio", "Propellant combinations", "Combustion efficiency"],
  "decision_points": ["Propellant type selection", "Engine cycle architecture", "Thrust level sizing", "Redundancy approach"],
  "terminology": {
    "Isp": "Specific impulse - a measure of propulsion efficiency in seconds",
    "TWR": "Thrust-to-weight ratio - determines acceleration capability"
  },
  "ai_generated": false,
  "last_updated": "2026-02-01"
}'::jsonb
WHERE id = '00000005-1000-4000-8000-000000000001';

-- Liquid Engines
UPDATE knowledge_domains SET primer = '{
  "overview": "Liquid rocket engines use stored liquid propellants (fuel and oxidizer) that are fed into a combustion chamber. They offer high performance, throttleability, and restart capability compared to solid motors.",
  "key_concepts": ["LOX/RP-1 kerosene", "LOX/LH2 hydrogen", "Hypergolic propellants", "Turbopump cycles", "Regenerative cooling"],
  "decision_points": ["Propellant combination for your mission profile", "Engine cycle selection (gas generator, staged combustion, expander)", "Thrust and Isp targets", "Restart capability requirements"],
  "terminology": {
    "LOX": "Liquid oxygen - the most common oxidizer",
    "RP-1": "Refined kerosene rocket propellant",
    "LH2": "Liquid hydrogen - high performance but cryogenic"
  },
  "ai_generated": false,
  "last_updated": "2026-02-01"
}'::jsonb
WHERE id = '00000005-1100-4000-8000-000000000001';

-- Vehicle Structures
UPDATE knowledge_domains SET primer = '{
  "overview": "Vehicle structures encompass all load-bearing elements of a launch vehicle including tanks, airframe, interstages, and fairings. The structural design must withstand launch loads, vibration, and thermal environments.",
  "key_concepts": ["Structural mass fraction", "Load paths", "Safety factors", "Material selection", "Structural testing"],
  "decision_points": ["Structural architecture (monocoque, semi-monocoque, truss)", "Material selection (aluminum, composites, steel)", "Tank configuration", "Manufacturing approach"],
  "terminology": {
    "PMF": "Propellant mass fraction - ratio of propellant to total stage mass",
    "Max-Q": "Maximum dynamic pressure during flight"
  },
  "ai_generated": false,
  "last_updated": "2026-02-01"
}'::jsonb
WHERE id = '00000005-2000-4000-8000-000000000001';

-- Avionics & Electronics
UPDATE knowledge_domains SET primer = '{
  "overview": "Avionics systems provide the electronic brains of the launch vehicle, handling flight computers, sensors, power distribution, communications, and pyrotechnic control. Reliability and redundancy are paramount.",
  "key_concepts": ["Flight computers", "Power distribution", "Telemetry systems", "RF communications", "Pyrotechnic control"],
  "decision_points": ["Redundancy architecture (single-string, dual, triple)", "Processor selection (rad-hard vs commercial)", "Communication bands", "Power system sizing"],
  "terminology": {
    "FCS": "Flight Control System",
    "TM": "Telemetry - data transmitted from vehicle to ground"
  },
  "ai_generated": false,
  "last_updated": "2026-02-01"
}'::jsonb
WHERE id = '00000005-3000-4000-8000-000000000001';

-- GNC
UPDATE knowledge_domains SET primer = '{
  "overview": "Guidance, Navigation, and Control (GNC) determines where the vehicle is, where it needs to go, and how to get there. This domain covers navigation sensors, guidance algorithms, and attitude control systems.",
  "key_concepts": ["Inertial navigation", "GPS integration", "Guidance algorithms", "Control laws", "Thrust vector control"],
  "decision_points": ["Navigation sensor grade (tactical, navigation, strategic)", "Guidance algorithm complexity", "Control approach (TVC, RCS, aerodynamic)", "Autonomy level"],
  "terminology": {
    "IMU": "Inertial Measurement Unit - senses acceleration and rotation",
    "TVC": "Thrust Vector Control - engine gimbaling for attitude control"
  },
  "ai_generated": false,
  "last_updated": "2026-02-01"
}'::jsonb
WHERE id = '00000005-4000-4000-8000-000000000001';

-- Flight Software
UPDATE knowledge_domains SET primer = '{
  "overview": "Flight software is the codebase that runs on the vehicle flight computers, implementing GNC algorithms, sequencing, fault management, and telemetry. Real-time performance and reliability are critical.",
  "key_concepts": ["Real-time operating systems", "Flight software architecture", "Fault management", "Software verification", "Hardware-in-the-loop testing"],
  "decision_points": ["Programming language (C, C++, Ada)", "RTOS vs bare-metal", "Software verification approach", "Simulation fidelity"],
  "terminology": {
    "RTOS": "Real-Time Operating System",
    "HIL": "Hardware-in-the-loop testing"
  },
  "ai_generated": false,
  "last_updated": "2026-02-01"
}'::jsonb
WHERE id = '00000005-5000-4000-8000-000000000001';

-- ============================================================================
-- ROBOTICS TEMPLATE - Sample primers (if template exists)
-- ============================================================================

-- Check if Robotics template exists and update domains
DO $$
DECLARE
  robotics_template_id UUID;
BEGIN
  SELECT id INTO robotics_template_id FROM blueprint_templates WHERE product_category = 'robotics' LIMIT 1;
  
  IF robotics_template_id IS NOT NULL THEN
    -- Motors & Actuators (if exists)
    UPDATE knowledge_domains SET primer = '{
      "overview": "Motors and actuators provide the physical movement capability of robotic systems. This domain covers motor selection, drive electronics, and actuation strategies for various robotic applications.",
      "key_concepts": ["DC motors", "Stepper motors", "Servo motors", "Brushless DC (BLDC)", "Gear ratios and torque"],
      "decision_points": ["Motor type for your application", "Position vs velocity control", "Gearbox selection", "Driver electronics"],
      "ai_generated": false,
      "last_updated": "2026-02-01"
    }'::jsonb
    WHERE template_id = robotics_template_id AND name ILIKE '%motor%' AND depth = 0;
    
    -- Sensing & Perception (if exists)
    UPDATE knowledge_domains SET primer = '{
      "overview": "Sensing and perception enable robots to understand their environment. This covers sensor selection, sensor fusion, and perception algorithms for navigation, manipulation, and interaction.",
      "key_concepts": ["LiDAR", "Cameras and vision", "Encoders", "Force/torque sensors", "Sensor fusion"],
      "decision_points": ["Sensor modalities for your use case", "Sensor fusion approach", "Processing location (edge vs cloud)", "Latency requirements"],
      "ai_generated": false,
      "last_updated": "2026-02-01"
    }'::jsonb
    WHERE template_id = robotics_template_id AND name ILIKE '%sensing%' OR name ILIKE '%perception%' AND depth = 0;
    
    -- Control Systems (if exists)
    UPDATE knowledge_domains SET primer = '{
      "overview": "Control systems govern how robots move and interact with their environment. This domain covers control theory, motion planning, and real-time control implementation.",
      "key_concepts": ["PID control", "Model predictive control", "Motion planning", "Trajectory generation", "Feedback loops"],
      "decision_points": ["Control architecture", "Planning horizon", "Real-time requirements", "Safety constraints"],
      "ai_generated": false,
      "last_updated": "2026-02-01"
    }'::jsonb
    WHERE template_id = robotics_template_id AND name ILIKE '%control%' AND depth = 0;
  END IF;
END $$;

-- Log the update
SELECT 
  'Updated primers for ' || COUNT(*) || ' domains' as result 
FROM knowledge_domains 
WHERE primer IS NOT NULL AND primer != '{}'::jsonb;

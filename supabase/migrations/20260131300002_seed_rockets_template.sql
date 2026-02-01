-- Seed Rockets & Launch Vehicles Blueprint Template
-- Template for orbital and suborbital launch vehicles, rocket engines, and launch services

-- ============================================================================
-- ROCKETS & LAUNCH VEHICLES TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000005-0000-4000-8000-000000000001',
    'Rockets & Launch Vehicles',
    'For orbital and suborbital launch vehicles, rocket engines, and launch services',
    'rockets',
    'rocket',
    65,
    195,
    true,
    '{"tags": ["space", "aerospace", "propulsion", "launch"], "difficulty": "advanced"}'
);

-- Propulsion Systems domains (1xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-1000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Propulsion Systems', 'Rocket propulsion and engine systems', 'Electronics', 0, 1, 'critical', '[]', ARRAY['Propulsion Engineer', 'Aerospace Engineer'], NULL),

('00000005-1100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1000-4000-8000-000000000001', 'Liquid Engines', 'Liquid-fueled rocket engines', 'Electronics', 1, 1, 'critical',
 '[{"id": "le1", "question": "What propellant combination (LOX/RP-1, LOX/LH2, hypergolic)?", "context": "Affects performance, handling, and infrastructure"}, {"id": "le2", "question": "What is your target thrust level?", "context": "Determines engine size and complexity"}, {"id": "le3", "question": "What is your target specific impulse (Isp)?", "context": "Key performance metric for efficiency"}]',
 ARRAY['Propulsion Engineer', 'Combustion Engineer'], '8-12 weeks'),

('00000005-1110-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1100-4000-8000-000000000001', 'Turbopumps', 'Turbomachinery for propellant delivery', 'Mechanical', 2, 1, 'critical',
 '[{"id": "tp1", "question": "What pump type (centrifugal, axial)?", "context": "Affects performance and complexity"}, {"id": "tp2", "question": "What is your required flow rate and pressure?", "context": "Determines pump sizing"}]',
 ARRAY['Turbomachinery Engineer'], '12-16 weeks'),

('00000005-1120-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1100-4000-8000-000000000001', 'Combustion Chambers', 'Combustion chamber and injector design', 'Mechanical', 2, 2, 'critical',
 '[{"id": "cc1", "question": "What injector pattern (pintle, coaxial, impinging)?", "context": "Affects mixing and combustion efficiency"}, {"id": "cc2", "question": "What chamber pressure?", "context": "Drives structural and thermal design"}]',
 ARRAY['Combustion Engineer'], '10-14 weeks'),

('00000005-1130-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1100-4000-8000-000000000001', 'Nozzle Design', 'Rocket nozzle aerodynamics and design', 'Mechanical', 2, 3, 'critical',
 '[{"id": "nd1", "question": "Fixed or altitude-compensating nozzle?", "context": "Affects efficiency across flight regime"}, {"id": "nd2", "question": "What expansion ratio?", "context": "Optimized for target altitude"}]',
 ARRAY['Propulsion Engineer'], '6-10 weeks'),

('00000005-1200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1000-4000-8000-000000000001', 'Solid Motors', 'Solid rocket motors', 'Mechanical', 1, 2, 'important',
 '[{"id": "sm1", "question": "What propellant grain geometry?", "context": "Determines thrust profile"}, {"id": "sm2", "question": "What total impulse requirement?", "context": "Drives motor size"}]',
 ARRAY['Propulsion Engineer'], '8-12 weeks'),

('00000005-1300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1000-4000-8000-000000000001', 'Fuel Systems', 'Propellant storage and feed systems', 'Mechanical', 1, 3, 'critical',
 '[{"id": "fs1", "question": "What propellant storage temperature and pressure?", "context": "Affects tank design and insulation"}, {"id": "fs2", "question": "Pressure-fed or pump-fed system?", "context": "Fundamental architecture choice"}]',
 ARRAY['Propulsion Engineer', 'Mechanical Engineer'], '6-10 weeks'),

('00000005-1400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1000-4000-8000-000000000001', 'Ignition Systems', 'Engine ignition and startup', 'Electronics', 1, 4, 'critical',
 '[{"id": "is1", "question": "Pyrotechnic or hypergolic ignition?", "context": "Affects reliability and complexity"}, {"id": "is2", "question": "Single-start or restartable?", "context": "Mission profile requirement"}]',
 ARRAY['Propulsion Engineer'], '4-8 weeks');

-- Vehicle Structures domains (2xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-2000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Vehicle Structures', 'Structural design and airframe', 'Mechanical', 0, 2, 'critical', '[]', ARRAY['Structures Engineer', 'Aerospace Engineer'], NULL),

('00000005-2100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-2000-4000-8000-000000000001', 'Airframe Design', 'Primary vehicle structure', 'Mechanical', 1, 1, 'critical',
 '[{"id": "ad1", "question": "Monocoque, semi-monocoque, or truss structure?", "context": "Fundamental structural approach"}, {"id": "ad2", "question": "What are your design load factors?", "context": "Safety margin and structural mass"}]',
 ARRAY['Structures Engineer'], '8-12 weeks'),

('00000005-2200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-2000-4000-8000-000000000001', 'Propellant Tanks', 'Fuel and oxidizer tanks', 'Mechanical', 1, 2, 'critical',
 '[{"id": "pt1", "question": "Integral or separate tank structure?", "context": "Affects mass efficiency"}, {"id": "pt2", "question": "What tank pressurization approach?", "context": "Ullage pressure management"}]',
 ARRAY['Structures Engineer', 'Propulsion Engineer'], '10-14 weeks'),

('00000005-2300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-2000-4000-8000-000000000001', 'Interstage', 'Stage separation structure', 'Mechanical', 1, 3, 'important',
 '[{"id": "is1", "question": "Hot or cold staging?", "context": "Affects interstage design and mass"}, {"id": "is2", "question": "What separation mechanism (pyro, pneumatic)?", "context": "Reliability and complexity"}]',
 ARRAY['Structures Engineer'], '6-10 weeks'),

('00000005-2400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-2000-4000-8000-000000000001', 'Fairing Design', 'Payload fairing aerodynamics and structure', 'Mechanical', 1, 4, 'critical',
 '[{"id": "fd1", "question": "What is your payload envelope?", "context": "Determines fairing diameter and length"}, {"id": "fd2", "question": "Jettison altitude and mechanism?", "context": "Affects loads and aerodynamics"}]',
 ARRAY['Structures Engineer', 'Aerodynamics Engineer'], '8-12 weeks'),

('00000005-2500-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-2000-4000-8000-000000000001', 'Materials Selection', 'Structural materials and composites', 'Mechanical', 1, 5, 'critical',
 '[{"id": "ms1", "question": "Aluminum, composite, or hybrid structure?", "context": "Mass vs cost vs manufacturability"}, {"id": "ms2", "question": "What are your temperature requirements?", "context": "Affects material selection"}]',
 ARRAY['Materials Engineer'], '4-8 weeks'),

('00000005-2600-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-2000-4000-8000-000000000001', 'Loads Analysis', 'Structural loads and dynamics', 'Mechanical', 1, 6, 'critical',
 '[{"id": "la1", "question": "What are your max-Q loads?", "context": "Peak dynamic pressure drives structural sizing"}, {"id": "la2", "question": "What vibration and acoustic environment?", "context": "Affects payload qualification"}]',
 ARRAY['Structures Engineer', 'Loads Engineer'], '6-10 weeks'),

('00000005-2700-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-2000-4000-8000-000000000001', 'Thermal Protection System', 'TPS for reentry or aerothermal loads', 'Mechanical', 1, 7, 'important',
 '[{"id": "tps1", "question": "Ablative or reusable TPS?", "context": "Depends on reusability goals"}, {"id": "tps2", "question": "What peak heat flux?", "context": "Drives TPS thickness"}]',
 ARRAY['Thermal Engineer'], '8-12 weeks');

-- Avionics & Electronics domains (3xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-3000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Avionics & Electronics', 'Flight avionics and electronics systems', 'Electronics', 0, 3, 'critical', '[]', ARRAY['Avionics Engineer', 'Electrical Engineer'], NULL),

('00000005-3100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-3000-4000-8000-000000000001', 'Flight Computers', 'Flight control computers and processors', 'Electronics', 1, 1, 'critical',
 '[{"id": "fc1", "question": "Single or redundant flight computers?", "context": "Affects reliability and cost"}, {"id": "fc2", "question": "Rad-hard or commercial processors?", "context": "Depends on radiation environment"}]',
 ARRAY['Avionics Engineer'], '8-12 weeks'),

('00000005-3200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-3000-4000-8000-000000000001', 'Power Systems', 'Electrical power generation and distribution', 'Electronics', 1, 2, 'critical',
 '[{"id": "ps1", "question": "Battery or ground power?", "context": "Depends on mission duration"}, {"id": "ps2", "question": "What voltage rails required?", "context": "Determines power architecture"}]',
 ARRAY['Power Electronics Engineer'], '6-10 weeks'),

('00000005-3300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-3000-4000-8000-000000000001', 'Telemetry', 'Data acquisition and downlink', 'Electronics', 1, 3, 'critical',
 '[{"id": "tm1", "question": "What telemetry data rate?", "context": "Affects RF system design"}, {"id": "tm2", "question": "Real-time or recorded data?", "context": "Affects storage requirements"}]',
 ARRAY['Telemetry Engineer'], '4-8 weeks'),

('00000005-3400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-3000-4000-8000-000000000001', 'RF Communications', 'Command and telemetry RF systems', 'Electronics', 1, 4, 'critical',
 '[{"id": "rf1", "question": "S-band, UHF, or other frequency?", "context": "Affects range and licensing"}, {"id": "rf2", "question": "Omnidirectional or directional antennas?", "context": "Affects link budget"}]',
 ARRAY['RF Engineer'], '6-10 weeks'),

('00000005-3500-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-3000-4000-8000-000000000001', 'Sensors & Instrumentation', 'Flight sensors and measurements', 'Electronics', 1, 5, 'critical',
 '[{"id": "si1", "question": "What sensors required (IMU, pressure, temp)?", "context": "Depends on control requirements"}, {"id": "si2", "question": "Redundancy level for critical sensors?", "context": "Affects reliability"}]',
 ARRAY['Avionics Engineer', 'Sensor Engineer'], '4-8 weeks'),

('00000005-3600-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-3000-4000-8000-000000000001', 'Pyrotechnics', 'Pyrotechnic actuation devices', 'Electronics', 1, 6, 'critical',
 '[{"id": "py1", "question": "What pyro events (stage sep, fairing, etc.)?", "context": "Determines pyro channel count"}, {"id": "py2", "question": "Redundant firing circuits?", "context": "Affects reliability"}]',
 ARRAY['Avionics Engineer'], '2-4 weeks');

-- Guidance Navigation & Control domains (4xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-4000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Guidance Navigation & Control', 'GNC algorithms and flight control', 'Software', 0, 4, 'critical', '[]', ARRAY['GNC Engineer', 'Flight Dynamics Engineer'], NULL),

('00000005-4100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-4000-4000-8000-000000000001', 'GNC Algorithms', 'Flight control algorithms', 'Software', 1, 1, 'critical',
 '[{"id": "gnc1", "question": "Open-loop or closed-loop guidance?", "context": "Affects targeting accuracy"}, {"id": "gnc2", "question": "What control frequency?", "context": "Determines computational requirements"}]',
 ARRAY['GNC Engineer'], '10-16 weeks'),

('00000005-4200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-4000-4000-8000-000000000001', 'Trajectory Design', 'Launch trajectory and mission design', 'Software', 1, 2, 'critical',
 '[{"id": "td1", "question": "What target orbit?", "context": "Determines delta-v and trajectory"}, {"id": "td2", "question": "Launch azimuth constraints?", "context": "Affects range safety and performance"}]',
 ARRAY['Flight Dynamics Engineer'], '8-12 weeks'),

('00000005-4300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-4000-4000-8000-000000000001', 'Attitude Control', 'Vehicle attitude control systems', 'Software', 1, 3, 'critical',
 '[{"id": "ac1", "question": "TVC, RCS, or aerodynamic control?", "context": "Fundamental control approach"}, {"id": "ac2", "question": "What attitude accuracy required?", "context": "Affects sensor and actuator sizing"}]',
 ARRAY['GNC Engineer'], '8-12 weeks'),

('00000005-4400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-4000-4000-8000-000000000001', 'Inertial Navigation', 'IMU and navigation systems', 'Electronics', 1, 4, 'critical',
 '[{"id": "in1", "question": "What IMU grade (tactical, navigation, strategic)?", "context": "Affects accuracy and cost"}, {"id": "in2", "question": "GPS-aided or inertial-only?", "context": "Affects accuracy over time"}]',
 ARRAY['Navigation Engineer'], '6-10 weeks'),

('00000005-4500-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-4000-4000-8000-000000000001', 'GPS Integration', 'GPS receiver and integration', 'Electronics', 1, 5, 'important',
 '[{"id": "gps1", "question": "Commercial or military GPS receiver?", "context": "Affects accuracy and export control"}, {"id": "gps2", "question": "Dual-frequency GPS?", "context": "Improves accuracy"}]',
 ARRAY['Navigation Engineer'], '4-8 weeks'),

('00000005-4600-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-4000-4000-8000-000000000001', 'Thrust Vector Control', 'Engine gimbaling and TVC', 'Mechanical', 1, 6, 'critical',
 '[{"id": "tvc1", "question": "Gimbal range and rate?", "context": "Determines control authority"}, {"id": "tvc2", "question": "Electromechanical or hydraulic actuators?", "context": "Affects power and complexity"}]',
 ARRAY['GNC Engineer', 'Mechanical Engineer'], '8-12 weeks');

-- Flight Software domains (5xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-5000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Flight Software', 'Onboard and ground software systems', 'Software', 0, 5, 'critical', '[]', ARRAY['Flight Software Engineer', 'Software Engineer'], NULL),

('00000005-5100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-5000-4000-8000-000000000001', 'Embedded Software', 'Real-time flight software', 'Software', 1, 1, 'critical',
 '[{"id": "es1", "question": "What programming language (C, C++, Ada)?", "context": "Affects toolchain and certification"}, {"id": "es2", "question": "RTOS or bare-metal?", "context": "Determines architecture"}]',
 ARRAY['Flight Software Engineer'], '12-20 weeks'),

('00000005-5200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-5000-4000-8000-000000000001', 'Simulation & Modeling', 'Flight simulation and analysis tools', 'Software', 1, 2, 'critical',
 '[{"id": "sm1", "question": "6DOF or 3DOF simulation?", "context": "Determines fidelity"}, {"id": "sm2", "question": "Hardware-in-the-loop testing?", "context": "Affects validation approach"}]',
 ARRAY['Simulation Engineer'], '10-16 weeks'),

('00000005-5300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-5000-4000-8000-000000000001', 'Mission Planning', 'Launch planning and operations software', 'Software', 1, 3, 'important',
 '[{"id": "mp1", "question": "Automated or manual mission planning?", "context": "Affects operational complexity"}, {"id": "mp2", "question": "Real-time trajectory optimization?", "context": "Requires significant compute"}]',
 ARRAY['Mission Planner', 'Software Engineer'], '8-12 weeks'),

('00000005-5400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-5000-4000-8000-000000000001', 'Data Processing', 'Telemetry processing and analysis', 'Software', 1, 4, 'important',
 '[{"id": "dp1", "question": "Real-time or post-flight analysis?", "context": "Affects processing architecture"}, {"id": "dp2", "question": "What data retention requirements?", "context": "Affects storage sizing"}]',
 ARRAY['Data Engineer'], '6-10 weeks'),

('00000005-5500-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-5000-4000-8000-000000000001', 'Ground Software', 'Ground control and monitoring systems', 'Software', 1, 5, 'critical',
 '[{"id": "gs1", "question": "Custom or COTS ground system?", "context": "Affects development time and cost"}, {"id": "gs2", "question": "Remote or on-site operations?", "context": "Affects network requirements"}]',
 ARRAY['Ground Software Engineer'], '10-16 weeks');

-- Manufacturing & Test domains (6xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-6000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Manufacturing & Test', 'Production and testing processes', 'Manufacturing', 0, 6, 'critical', '[]', ARRAY['Manufacturing Engineer', 'Test Engineer'], NULL),

('00000005-6100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-6000-4000-8000-000000000001', 'Composite Fabrication', 'Composite structures manufacturing', 'Manufacturing', 1, 1, 'important',
 '[{"id": "cf1", "question": "Hand layup or automated fiber placement?", "context": "Affects quality and throughput"}, {"id": "cf2", "question": "Autoclave or out-of-autoclave cure?", "context": "Affects tooling investment"}]',
 ARRAY['Composites Engineer'], '10-16 weeks'),

('00000005-6200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-6000-4000-8000-000000000001', 'Welding & Metalwork', 'Metal fabrication and joining', 'Manufacturing', 1, 2, 'critical',
 '[{"id": "wm1", "question": "What welding processes (TIG, friction stir)?", "context": "Affects quality and certification"}, {"id": "wm2", "question": "What NDT requirements?", "context": "Quality assurance approach"}]',
 ARRAY['Welding Engineer', 'Manufacturing Engineer'], '8-12 weeks'),

('00000005-6300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-6000-4000-8000-000000000001', 'Assembly & Integration', 'Vehicle assembly and integration', 'Manufacturing', 1, 3, 'critical',
 '[{"id": "ai1", "question": "Vertical or horizontal integration?", "context": "Affects facility requirements"}, {"id": "ai2", "question": "What clean room requirements?", "context": "Affects contamination control"}]',
 ARRAY['Integration Engineer'], '6-10 weeks'),

('00000005-6400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-6000-4000-8000-000000000001', 'Static Fire Testing', 'Engine and stage static fire tests', 'Manufacturing', 1, 4, 'critical',
 '[{"id": "sft1", "question": "Full duration or short duration tests?", "context": "Validation approach"}, {"id": "sft2", "question": "What test stand instrumentation?", "context": "Affects data quality"}]',
 ARRAY['Test Engineer', 'Propulsion Engineer'], '8-12 weeks'),

('00000005-6500-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-6000-4000-8000-000000000001', 'Engine Testing', 'Component and development testing', 'Manufacturing', 1, 5, 'critical',
 '[{"id": "et1", "question": "Altitude simulation capability?", "context": "Affects nozzle testing"}, {"id": "et2", "question": "What test article instrumentation?", "context": "Determines data quality"}]',
 ARRAY['Test Engineer'], '10-16 weeks'),

('00000005-6600-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-6000-4000-8000-000000000001', 'Environmental Testing', 'Vibration, thermal, and qualification tests', 'Manufacturing', 1, 6, 'critical',
 '[{"id": "et1", "question": "What environmental test levels?", "context": "Based on flight environment"}, {"id": "et2", "question": "Protoflight or qualification test approach?", "context": "Affects test philosophy"}]',
 ARRAY['Test Engineer'], '6-10 weeks');

-- Regulatory & Compliance domains (7xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-7000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Regulatory & Compliance', 'Launch licensing and regulatory compliance', 'Regulatory', 0, 7, 'critical', '[]', ARRAY['Regulatory Affairs Manager', 'Compliance Officer'], NULL),

('00000005-7100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'UK Space Agency Licensing', 'UK launch and range licensing', 'Regulatory', 1, 1, 'critical',
 '[{"id": "uksa1", "question": "Have you engaged with the UK Space Agency for launch licensing?", "context": "Required for UK launches"}, {"id": "uksa2", "question": "What is your compliance approach for the UK Outer Space Act?", "context": "Fundamental legal requirement"}, {"id": "uksa3", "question": "What liability insurance coverage do you have?", "context": "UK Space Industry Act requirement"}]',
 ARRAY['Regulatory Affairs Manager'], '12-20 weeks'),

('00000005-7200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'CAA Regulations', 'UK Civil Aviation Authority compliance', 'Regulatory', 1, 2, 'critical',
 '[{"id": "caa1", "question": "What airspace coordination is required?", "context": "CAA manages UK airspace"}, {"id": "caa2", "question": "What NOTAM procedures will you follow?", "context": "Required for launch operations"}]',
 ARRAY['Regulatory Affairs Manager', 'Operations Manager'], '8-12 weeks'),

('00000005-7300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'EU Space Regulation', 'European space law compliance', 'Regulatory', 1, 3, 'critical',
 '[{"id": "eu1", "question": "What is your approach to EU space debris mitigation requirements?", "context": "EU Space Surveillance and Tracking requirements"}, {"id": "eu2", "question": "How do you comply with EU export control regulations?", "context": "Dual-use technology controls"}]',
 ARRAY['Regulatory Affairs Manager'], '10-16 weeks'),

('00000005-7400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'Luxembourg Space Law', 'Luxembourg space resource and satellite law', 'Regulatory', 1, 4, 'important',
 '[{"id": "lux1", "question": "Have you considered Luxembourg as a licensing jurisdiction?", "context": "Many EU space companies use Luxembourg"}, {"id": "lux2", "question": "What is your approach to space resource rights under Luxembourg law?", "context": "Unique legal framework"}]',
 ARRAY['Legal Counsel', 'Regulatory Affairs Manager'], '6-10 weeks'),

('00000005-7500-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'ITAR & Export Control', 'US export control compliance', 'Regulatory', 1, 5, 'critical',
 '[{"id": "itar1", "question": "What ITAR/export control classifications apply to your technology?", "context": "Affects international collaboration"}, {"id": "itar2", "question": "Do you need Technical Assistance Agreements (TAAs)?", "context": "Required for US technology transfer"}]',
 ARRAY['Export Control Officer'], '8-12 weeks'),

('00000005-7600-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'Range Safety', 'Launch range safety and flight termination', 'Regulatory', 1, 6, 'critical',
 '[{"id": "rs1", "question": "What range safety system (autonomous or ground-commanded)?", "context": "Regulatory requirement"}, {"id": "rs2", "question": "What are your destruct system qualification requirements?", "context": "Ensures public safety"}]',
 ARRAY['Range Safety Officer'], '10-16 weeks'),

('00000005-7700-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'Environmental Impact', 'Environmental assessment and compliance', 'Regulatory', 1, 7, 'important',
 '[{"id": "ei1", "question": "What environmental impact assessment is required?", "context": "UK and EU requirements"}, {"id": "ei2", "question": "What are your emissions and noise mitigation plans?", "context": "Local environmental regulations"}]',
 ARRAY['Environmental Compliance Officer'], '8-12 weeks'),

('00000005-7800-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-7000-4000-8000-000000000001', 'Insurance Requirements', 'Launch liability insurance', 'Regulatory', 1, 8, 'critical',
 '[{"id": "ins1", "question": "What third-party liability insurance coverage?", "context": "Regulatory requirement"}, {"id": "ins2", "question": "What payload insurance requirements?", "context": "Customer contract requirement"}]',
 ARRAY['Risk Manager'], '4-8 weeks');

-- Business & Operations domains (8xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000005-8000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Business & Operations', 'Commercial operations and business model', 'Business', 0, 8, 'important', '[]', ARRAY['Business Development', 'Operations Manager'], NULL),

('00000005-8100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-8000-4000-8000-000000000001', 'Launch Services', 'Commercial launch service offerings', 'Business', 1, 1, 'important',
 '[{"id": "ls1", "question": "What is your target launch cadence?", "context": "Affects facility and workforce sizing"}, {"id": "ls2", "question": "Dedicated or rideshare missions?", "context": "Affects business model"}]',
 ARRAY['Business Development Manager'], '4-8 weeks'),

('00000005-8200-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-8000-4000-8000-000000000001', 'Pricing Model', 'Launch pricing and cost structure', 'Business', 1, 2, 'important',
 '[{"id": "pm1", "question": "What is your target price per kg to orbit?", "context": "Market positioning"}, {"id": "pm2", "question": "Fixed or market-based pricing?", "context": "Revenue model"}]',
 ARRAY['Pricing Analyst', 'Business Development'], '2-4 weeks'),

('00000005-8300-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-8000-4000-8000-000000000001', 'Customer Contracts', 'Launch service agreements', 'Business', 1, 3, 'important',
 '[{"id": "cc1", "question": "What are your standard contract terms?", "context": "Legal and commercial structure"}, {"id": "cc2", "question": "What payload integration support do you provide?", "context": "Customer service offering"}]',
 ARRAY['Contracts Manager'], '4-8 weeks'),

('00000005-8400-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-8000-4000-8000-000000000001', 'Range Operations', 'Launch site and range operations', 'Operations', 1, 4, 'critical',
 '[{"id": "ro1", "question": "What launch site(s) will you use?", "context": "Affects regulatory and logistics"}, {"id": "ro2", "question": "What ground support infrastructure is required?", "context": "Capital investment planning"}]',
 ARRAY['Operations Manager', 'Launch Director'], '8-12 weeks'),

('00000005-8500-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-8000-4000-8000-000000000001', 'Ground Support Equipment', 'GSE and launch facilities', 'Operations', 1, 5, 'important',
 '[{"id": "gse1", "question": "Mobile or fixed GSE?", "context": "Affects operational flexibility"}, {"id": "gse2", "question": "What propellant ground systems are required?", "context": "Safety and infrastructure"}]',
 ARRAY['GSE Engineer', 'Operations Manager'], '6-10 weeks');

-- Update template counts
UPDATE blueprint_templates SET
  estimated_domains = (SELECT COUNT(*) FROM knowledge_domains WHERE template_id = '00000005-0000-4000-8000-000000000001'),
  estimated_questions = (SELECT COUNT(*) FROM knowledge_domains kd, jsonb_array_elements(kd.key_questions) WHERE kd.template_id = '00000005-0000-4000-8000-000000000001')
WHERE id = '00000005-0000-4000-8000-000000000001';

-- Seed Satellites & Spacecraft Blueprint Template
-- Template for satellites, spacecraft, and orbital systems

-- ============================================================================
-- SATELLITES & SPACECRAFT TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000006-0000-4000-8000-000000000001',
    'Satellites & Spacecraft',
    'For satellites, spacecraft, and orbital vehicle systems',
    'satellites',
    'satellite',
    70,
    210,
    true,
    '{"tags": ["space", "aerospace", "orbital", "spacecraft"], "difficulty": "advanced"}'
);

-- Payload Systems domains (1xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-1000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Payload Systems', 'Satellite payload and mission instruments', 'Electronics', 0, 1, 'critical', '[]', ARRAY['Payload Engineer', 'Systems Engineer'], NULL),

('00000006-1100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-1000-4000-8000-000000000001', 'Imaging Sensors', 'Earth observation and infrared sensors', 'Electronics', 1, 1, 'critical',
 '[{"id": "is1", "question": "Optical, infrared, or SAR imaging?", "context": "Determines sensor type and design"}, {"id": "is2", "question": "What ground sample distance (GSD)?", "context": "Affects optics and altitude"}, {"id": "is3", "question": "What swath width requirement?", "context": "Determines scanning mechanism"}]',
 ARRAY['Payload Engineer', 'Optical Engineer'], '12-20 weeks'),

('00000006-1200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-1000-4000-8000-000000000001', 'Communications Payload', 'Communications transponders and payloads', 'Electronics', 1, 2, 'critical',
 '[{"id": "cp1", "question": "Bent-pipe or regenerative payload?", "context": "Affects complexity and flexibility"}, {"id": "cp2", "question": "What frequency bands (C, Ku, Ka)?", "context": "Determines antenna and RF design"}, {"id": "cp3", "question": "What total bandwidth?", "context": "Affects transponder count"}]',
 ARRAY['Payload Engineer', 'RF Engineer'], '12-20 weeks'),

('00000006-1300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-1000-4000-8000-000000000001', 'Scientific Instruments', 'Science mission instruments', 'Electronics', 1, 3, 'important',
 '[{"id": "sci1", "question": "What scientific measurements are required?", "context": "Determines instrument type"}, {"id": "sci2", "question": "What data rate and resolution?", "context": "Affects downlink requirements"}]',
 ARRAY['Science Payload Engineer'], '16-24 weeks'),

('00000006-1400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-1000-4000-8000-000000000001', 'Antenna Systems', 'Payload antennas and RF systems', 'Electronics', 1, 4, 'critical',
 '[{"id": "ant1", "question": "Fixed or steerable antennas?", "context": "Affects pointing requirements"}, {"id": "ant2", "question": "What antenna gain and beamwidth?", "context": "Determines antenna size"}]',
 ARRAY['Antenna Engineer', 'RF Engineer'], '10-16 weeks'),

('00000006-1500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-1000-4000-8000-000000000001', 'Data Processing Unit', 'Onboard data processing', 'Electronics', 1, 5, 'critical',
 '[{"id": "dpu1", "question": "What processing capabilities required?", "context": "Determines processor selection"}, {"id": "dpu2", "question": "Onboard compression and encryption?", "context": "Affects data rate and security"}]',
 ARRAY['Payload Engineer', 'Electronics Engineer'], '8-12 weeks');

-- Spacecraft Bus domains (2xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-2000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Spacecraft Bus', 'Spacecraft platform and bus systems', 'Mechanical', 0, 2, 'critical', '[]', ARRAY['Bus Engineer', 'Systems Engineer'], NULL),

('00000006-2100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-2000-4000-8000-000000000001', 'Structure & Mechanisms', 'Spacecraft structure and deployment mechanisms', 'Mechanical', 1, 1, 'critical',
 '[{"id": "sm1", "question": "What is your launch vehicle interface?", "context": "Determines adapter design"}, {"id": "sm2", "question": "What deployable mechanisms (solar arrays, antennas)?", "context": "Affects mechanism design"}]',
 ARRAY['Structures Engineer', 'Mechanisms Engineer'], '10-16 weeks'),

('00000006-2200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-2000-4000-8000-000000000001', 'ADCS', 'Attitude determination and control system', 'Electronics', 1, 2, 'critical',
 '[{"id": "adcs1", "question": "Three-axis or spin-stabilized?", "context": "Fundamental attitude control approach"}, {"id": "adcs2", "question": "What pointing accuracy required?", "context": "Determines sensor and actuator precision"}, {"id": "adcs3", "question": "What actuators (reaction wheels, thrusters, magnetorquers)?", "context": "Affects control approach"}]',
 ARRAY['ADCS Engineer', 'GNC Engineer'], '12-20 weeks'),

('00000006-2300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-2000-4000-8000-000000000001', 'Propulsion System', 'Electric or chemical propulsion', 'Mechanical', 1, 3, 'important',
 '[{"id": "prop1", "question": "Electric or chemical propulsion?", "context": "Affects delta-v and mission design"}, {"id": "prop2", "question": "What total delta-v requirement?", "context": "Determines propellant mass"}, {"id": "prop3", "question": "Station-keeping or orbit transfer?", "context": "Affects thruster sizing"}]',
 ARRAY['Propulsion Engineer'], '10-16 weeks'),

('00000006-2400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-2000-4000-8000-000000000001', 'Thermal Control', 'Passive and active thermal management', 'Mechanical', 1, 4, 'critical',
 '[{"id": "tc1", "question": "Passive or active thermal control?", "context": "Affects complexity and power"}, {"id": "tc2", "question": "What thermal operating range?", "context": "Determines thermal design approach"}]',
 ARRAY['Thermal Engineer'], '8-12 weeks'),

('00000006-2500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-2000-4000-8000-000000000001', 'Harness & Connectors', 'Electrical harness and interconnects', 'Electronics', 1, 5, 'important',
 '[{"id": "hc1", "question": "What data bus architecture (CAN, SpaceWire)?", "context": "Affects harness design"}, {"id": "hc2", "question": "Redundant power distribution?", "context": "Determines harness complexity"}]',
 ARRAY['Harness Engineer', 'Electrical Engineer'], '6-10 weeks');

-- Power Systems domains (3xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-3000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Power Systems', 'Electrical power generation and distribution', 'Electronics', 0, 3, 'critical', '[]', ARRAY['Power Systems Engineer', 'Electrical Engineer'], NULL),

('00000006-3100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-3000-4000-8000-000000000001', 'Solar Arrays', 'Photovoltaic power generation', 'Electronics', 1, 1, 'critical',
 '[{"id": "sa1", "question": "Body-mounted or deployable arrays?", "context": "Affects power generation and design"}, {"id": "sa2", "question": "What end-of-life power requirement?", "context": "Determines array sizing"}, {"id": "sa3", "question": "What solar cell technology?", "context": "Affects efficiency and radiation tolerance"}]',
 ARRAY['Power Systems Engineer'], '8-12 weeks'),

('00000006-3200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-3000-4000-8000-000000000001', 'Batteries', 'Energy storage system', 'Electronics', 1, 2, 'critical',
 '[{"id": "bat1", "question": "What battery chemistry (Li-ion)?", "context": "Affects energy density and life"}, {"id": "bat2", "question": "What eclipse duration?", "context": "Determines battery capacity"}, {"id": "bat3", "question": "What depth of discharge?", "context": "Affects battery life"}]',
 ARRAY['Power Systems Engineer', 'Battery Engineer'], '6-10 weeks'),

('00000006-3300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-3000-4000-8000-000000000001', 'Power Distribution Unit', 'PDU and power switching', 'Electronics', 1, 3, 'critical',
 '[{"id": "pdu1", "question": "Centralized or distributed power?", "context": "Affects architecture"}, {"id": "pdu2", "question": "What fault protection required?", "context": "Determines switching logic"}]',
 ARRAY['Power Systems Engineer'], '6-10 weeks'),

('00000006-3400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-3000-4000-8000-000000000001', 'Power Management', 'Power regulation and conditioning', 'Electronics', 1, 4, 'important',
 '[{"id": "pm1", "question": "Regulated or direct energy transfer?", "context": "Affects efficiency and complexity"}, {"id": "pm2", "question": "What bus voltage?", "context": "Determines converter design"}]',
 ARRAY['Power Systems Engineer'], '4-8 weeks'),

('00000006-3500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-3000-4000-8000-000000000001', 'Eclipse Operations', 'Power management during eclipse', 'Operations', 1, 5, 'important',
 '[{"id": "eo1", "question": "What is your worst-case eclipse duration?", "context": "Affects battery sizing"}, {"id": "eo2", "question": "Load shedding strategy?", "context": "Affects operational procedures"}]',
 ARRAY['Power Systems Engineer', 'Operations Engineer'], '2-4 weeks');

-- Communications & Data domains (4xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-4000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Communications & Data', 'TT&C and data handling systems', 'Electronics', 0, 4, 'critical', '[]', ARRAY['Communications Engineer', 'RF Engineer'], NULL),

('00000006-4100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-4000-4000-8000-000000000001', 'Ground Station Network', 'Ground station network and scheduling', 'Operations', 1, 1, 'critical',
 '[{"id": "gsn1", "question": "Own or third-party ground stations?", "context": "Affects capital and operations"}, {"id": "gsn2", "question": "What contact frequency required?", "context": "Determines station count and location"}, {"id": "gsn3", "question": "What geographic coverage?", "context": "Affects station locations"}]',
 ARRAY['Ground Systems Engineer'], '8-12 weeks'),

('00000006-4200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-4000-4000-8000-000000000001', 'Link Budget Analysis', 'RF link budget and margin', 'Electronics', 1, 2, 'critical',
 '[{"id": "lba1", "question": "What data rates (uplink and downlink)?", "context": "Determines RF system sizing"}, {"id": "lba2", "question": "What link margin required?", "context": "Affects reliability"}]',
 ARRAY['RF Engineer', 'Link Budget Analyst'], '4-8 weeks'),

('00000006-4300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-4000-4000-8000-000000000001', 'Frequency Coordination', 'ITU spectrum coordination', 'Regulatory', 1, 3, 'critical',
 '[{"id": "fc1", "question": "What frequency bands will you use?", "context": "Determines ITU filing requirements"}, {"id": "fc2", "question": "What orbit slots?", "context": "Affects coordination complexity"}, {"id": "fc3", "question": "ITU filing jurisdiction (consider Luxembourg)?", "context": "Many EU operators file via Luxembourg"}]',
 ARRAY['Spectrum Manager', 'Regulatory Affairs'], '12-24 weeks'),

('00000006-4400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-4000-4000-8000-000000000001', 'Data Downlink', 'Mission data downlink system', 'Electronics', 1, 4, 'critical',
 '[{"id": "dd1", "question": "What peak data rate?", "context": "Determines transmitter and antenna"}, {"id": "dd2", "question": "Onboard storage capacity?", "context": "Affects data buffering"}]',
 ARRAY['Communications Engineer'], '6-10 weeks'),

('00000006-4500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-4000-4000-8000-000000000001', 'Command & Telemetry', 'TT&C subsystem', 'Electronics', 1, 5, 'critical',
 '[{"id": "ct1", "question": "Redundant TT&C radios?", "context": "Affects reliability"}, {"id": "ct2", "question": "Command encryption and authentication?", "context": "Security requirement"}]',
 ARRAY['Communications Engineer'], '6-10 weeks'),

('00000006-4600-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-4000-4000-8000-000000000001', 'Inter-Satellite Links', 'Crosslinks for constellation', 'Electronics', 1, 6, 'nice-to-have',
 '[{"id": "isl1", "question": "Optical or RF crosslinks?", "context": "Affects data rate and pointing"}, {"id": "isl2", "question": "What constellation topology?", "context": "Determines link architecture"}]',
 ARRAY['Communications Engineer', 'RF Engineer'], '12-20 weeks');

-- Software & Flight Systems domains (5xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-5000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Software & Flight Systems', 'Flight software and ground systems', 'Software', 0, 5, 'critical', '[]', ARRAY['Flight Software Engineer', 'Software Engineer'], NULL),

('00000006-5100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-5000-4000-8000-000000000001', 'Flight Software', 'Onboard flight software', 'Software', 1, 1, 'critical',
 '[{"id": "fsw1", "question": "Heritage flight software or new development?", "context": "Affects schedule and risk"}, {"id": "fsw2", "question": "What operating system or RTOS?", "context": "Determines software architecture"}, {"id": "fsw3", "question": "Software safety criticality level?", "context": "Affects verification requirements"}]',
 ARRAY['Flight Software Engineer'], '16-24 weeks'),

('00000006-5200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-5000-4000-8000-000000000001', 'Fault Detection & Recovery', 'FDIR and autonomy', 'Software', 1, 2, 'critical',
 '[{"id": "fdir1", "question": "What level of onboard autonomy?", "context": "Affects software complexity"}, {"id": "fdir2", "question": "Automatic safe mode entry?", "context": "Reliability approach"}]',
 ARRAY['Flight Software Engineer', 'Systems Engineer'], '10-16 weeks'),

('00000006-5300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-5000-4000-8000-000000000001', 'Autonomous Operations', 'Onboard autonomy and planning', 'Software', 1, 3, 'important',
 '[{"id": "ao1", "question": "Autonomous orbit maintenance?", "context": "Reduces ground operations"}, {"id": "ao2", "question": "Onboard scheduling and planning?", "context": "Affects software complexity"}]',
 ARRAY['Autonomy Engineer', 'Flight Software Engineer'], '12-20 weeks'),

('00000006-5400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-5000-4000-8000-000000000001', 'Ground Segment Software', 'Mission operations software', 'Software', 1, 4, 'critical',
 '[{"id": "gss1", "question": "COTS or custom ground system?", "context": "Affects development time"}, {"id": "gss2", "question": "What automation level for operations?", "context": "Affects staffing"}]',
 ARRAY['Ground Software Engineer'], '12-20 weeks'),

('00000006-5500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-5000-4000-8000-000000000001', 'Mission Planning', 'Orbit and mission planning tools', 'Software', 1, 5, 'important',
 '[{"id": "mp1", "question": "What mission planning tools required?", "context": "Determines software development"}, {"id": "mp2", "question": "Automated scheduling?", "context": "Affects operations efficiency"}]',
 ARRAY['Mission Planner', 'Software Engineer'], '8-12 weeks');

-- Manufacturing & AIT domains (6xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-6000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Manufacturing & AIT', 'Assembly, integration, and test', 'Manufacturing', 0, 6, 'critical', '[]', ARRAY['AIT Engineer', 'Manufacturing Engineer'], NULL),

('00000006-6100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-6000-4000-8000-000000000001', 'Cleanroom Operations', 'Cleanroom facilities and procedures', 'Manufacturing', 1, 1, 'critical',
 '[{"id": "co1", "question": "What ISO cleanroom class required?", "context": "Affects facility requirements"}, {"id": "co2", "question": "ESD protection requirements?", "context": "Affects procedures and equipment"}]',
 ARRAY['AIT Engineer', 'Quality Engineer'], '4-8 weeks'),

('00000006-6200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-6000-4000-8000-000000000001', 'Integration & Test', 'Spacecraft I&T process', 'Manufacturing', 1, 2, 'critical',
 '[{"id": "it1", "question": "What I&T flow and schedule?", "context": "Affects resource planning"}, {"id": "it2", "question": "Parallel or serial subsystem integration?", "context": "Affects schedule"}]',
 ARRAY['AIT Engineer', 'Integration Engineer'], '12-20 weeks'),

('00000006-6300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-6000-4000-8000-000000000001', 'Environmental Testing', 'TVAC, vibration, and qualification', 'Manufacturing', 1, 3, 'critical',
 '[{"id": "et1", "question": "What environmental test levels?", "context": "Based on launch vehicle and orbit"}, {"id": "et2", "question": "TVAC chamber access?", "context": "May require facility or third-party"}, {"id": "et3", "question": "Sine, random, and shock vibration?", "context": "Comprehensive mechanical qualification"}]',
 ARRAY['Test Engineer'], '10-16 weeks'),

('00000006-6400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-6000-4000-8000-000000000001', 'Launch Integration', 'Launch vehicle integration', 'Manufacturing', 1, 4, 'important',
 '[{"id": "li1", "question": "What launch site integration time?", "context": "Affects logistics and schedule"}, {"id": "li2", "question": "Fueling and final closeout procedures?", "context": "Safety and operations"}]',
 ARRAY['Launch Integration Engineer'], '4-8 weeks'),

('00000006-6500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-6000-4000-8000-000000000001', 'Shipping & Handling', 'Transportation and logistics', 'Manufacturing', 1, 5, 'important',
 '[{"id": "sh1", "question": "What shipping container requirements?", "context": "Protects spacecraft during transport"}, {"id": "sh2", "question": "International or domestic shipping?", "context": "Affects customs and regulations"}]',
 ARRAY['Logistics Engineer'], '2-4 weeks');

-- Regulatory & Licensing domains (7xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-7000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Regulatory & Licensing', 'Satellite licensing and spectrum', 'Regulatory', 0, 7, 'critical', '[]', ARRAY['Regulatory Affairs Manager', 'Spectrum Manager'], NULL),

('00000006-7100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-7000-4000-8000-000000000001', 'UK Space Agency Operator License', 'UK Outer Space Act compliance', 'Regulatory', 1, 1, 'critical',
 '[{"id": "uksa1", "question": "Have you applied for a UK Outer Space Act license?", "context": "Required for UK satellite operators"}, {"id": "uksa2", "question": "What is your in-orbit insurance coverage?", "context": "UK licensing requirement"}, {"id": "uksa3", "question": "Third-party liability insurance arranged?", "context": "Legal requirement"}]',
 ARRAY['Regulatory Affairs Manager'], '16-24 weeks'),

('00000006-7200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-7000-4000-8000-000000000001', 'Ofcom Spectrum Licensing', 'UK spectrum authorization', 'Regulatory', 1, 2, 'critical',
 '[{"id": "ofcom1", "question": "Have you obtained Ofcom authorization for your frequencies?", "context": "Required for UK spectrum use"}, {"id": "ofcom2", "question": "What frequency bands and bandwidth?", "context": "Determines licensing process"}]',
 ARRAY['Spectrum Manager', 'Regulatory Affairs'], '12-20 weeks'),

('00000006-7300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-7000-4000-8000-000000000001', 'ITU Coordination', 'International spectrum coordination', 'Regulatory', 1, 3, 'critical',
 '[{"id": "itu1", "question": "What is your ITU filing strategy (consider Luxembourg for EU filings)?", "context": "Luxembourg is a major EU space law jurisdiction"}, {"id": "itu2", "question": "What orbit slots and frequencies?", "context": "Determines coordination requirements"}, {"id": "itu3", "question": "Coordination with neighboring satellites?", "context": "ITU Radio Regulations requirement"}]',
 ARRAY['Spectrum Manager', 'Regulatory Affairs'], '18-36 weeks'),

('00000006-7400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-7000-4000-8000-000000000001', 'EU Space Surveillance', 'EU SST and space situational awareness', 'Regulatory', 1, 4, 'important',
 '[{"id": "eusst1", "question": "What is your EU Space Surveillance and Tracking compliance?", "context": "EU space object monitoring"}, {"id": "eusst2", "question": "Conjunction assessment procedures?", "context": "Collision avoidance operations"}]',
 ARRAY['Operations Engineer', 'Regulatory Affairs'], '4-8 weeks'),

('00000006-7500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-7000-4000-8000-000000000001', 'Debris Mitigation', '25-year deorbit rule compliance', 'Regulatory', 1, 5, 'critical',
 '[{"id": "dm1", "question": "What is your debris mitigation and end-of-life disposal plan?", "context": "25-year deorbit rule"}, {"id": "dm2", "question": "Active deorbit or natural decay?", "context": "Affects propulsion sizing"}, {"id": "dm3", "question": "Passivation procedures?", "context": "End-of-life safety requirement"}]',
 ARRAY['Mission Design Engineer', 'Regulatory Affairs'], '6-10 weeks'),

('00000006-7600-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-7000-4000-8000-000000000001', 'Export Control', 'ITAR and dual-use export regulations', 'Regulatory', 1, 6, 'important',
 '[{"id": "ec1", "question": "What export control classifications?", "context": "Affects international sales and partnerships"}, {"id": "ec2", "question": "EU dual-use export controls?", "context": "Technology transfer restrictions"}]',
 ARRAY['Export Control Officer'], '4-8 weeks'),

('00000006-7700-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-7000-4000-8000-000000000001', 'Third-Party Liability', 'Liability insurance and indemnification', 'Regulatory', 1, 7, 'critical',
 '[{"id": "tpl1", "question": "What liability insurance coverage?", "context": "Required by UK Outer Space Act"}, {"id": "tpl2", "question": "Launch vehicle and launch site indemnification?", "context": "Commercial requirement"}]',
 ARRAY['Risk Manager', 'Legal Counsel'], '4-8 weeks');

-- Mission Operations domains (8xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000006-8000-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', NULL, 'Mission Operations', 'Satellite operations and mission control', 'Operations', 0, 8, 'critical', '[]', ARRAY['Mission Operations Manager', 'Spacecraft Operator'], NULL),

('00000006-8100-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-8000-4000-8000-000000000001', 'Mission Control Centre', 'MOC facilities and staffing', 'Operations', 1, 1, 'critical',
 '[{"id": "mcc1", "question": "In-house or outsourced MOC?", "context": "Affects capital and operations"}, {"id": "mcc2", "question": "24/7 or business hours coverage?", "context": "Determines staffing"}]',
 ARRAY['Mission Operations Manager'], '8-12 weeks'),

('00000006-8200-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-8000-4000-8000-000000000001', 'Spacecraft Operations', 'Routine operations procedures', 'Operations', 1, 2, 'critical',
 '[{"id": "so1", "question": "What operational procedures are required?", "context": "Determines training and documentation"}, {"id": "so2", "question": "Command authorization levels?", "context": "Safety and security"}]',
 ARRAY['Spacecraft Operator', 'Flight Director'], '6-10 weeks'),

('00000006-8300-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-8000-4000-8000-000000000001', 'Anomaly Response', 'Fault response and recovery', 'Operations', 1, 3, 'critical',
 '[{"id": "ar1", "question": "What anomaly response procedures?", "context": "Prepared recovery plans"}, {"id": "ar2", "question": "On-call engineering support?", "context": "24/7 response capability"}]',
 ARRAY['Mission Operations Manager', 'Systems Engineer'], '4-8 weeks'),

('00000006-8400-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-8000-4000-8000-000000000001', 'Constellation Management', 'Multi-satellite fleet operations', 'Operations', 1, 4, 'important',
 '[{"id": "cm1", "question": "How many satellites in constellation?", "context": "Affects operations scaling"}, {"id": "cm2", "question": "Automated constellation management?", "context": "Reduces operational burden"}]',
 ARRAY['Constellation Manager', 'Operations Engineer'], '10-16 weeks'),

('00000006-8500-4000-8000-000000000001', '00000006-0000-4000-8000-000000000001', '00000006-8000-4000-8000-000000000001', 'End-of-Life Disposal', 'Deorbit and disposal operations', 'Operations', 1, 5, 'important',
 '[{"id": "eol1", "question": "What is your deorbit strategy?", "context": "Compliance with 25-year rule"}, {"id": "eol2", "question": "Controlled or uncontrolled reentry?", "context": "Affects propellant budget"}]',
 ARRAY['Mission Design Engineer', 'Operations Manager'], '2-4 weeks');

-- Update template counts
UPDATE blueprint_templates SET
  estimated_domains = (SELECT COUNT(*) FROM knowledge_domains WHERE template_id = '00000006-0000-4000-8000-000000000001'),
  estimated_questions = (SELECT COUNT(*) FROM knowledge_domains kd, jsonb_array_elements(kd.key_questions) WHERE kd.template_id = '00000006-0000-4000-8000-000000000001')
WHERE id = '00000006-0000-4000-8000-000000000001';

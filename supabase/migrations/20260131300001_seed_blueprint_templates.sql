-- Seed Blueprint Templates and Knowledge Domains
-- This creates system templates for common product categories

-- ============================================================================
-- CONSUMER ELECTRONICS TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000001-0000-4000-8000-000000000001',
    'Consumer Electronics',
    'For WiFi/BLE devices, wearables, smart home products, and consumer gadgets',
    'consumer-electronics',
    'smartphone',
    47,
    156,
    true,
    '{"tags": ["hardware", "iot", "consumer"], "difficulty": "advanced"}'
);

-- Electronics Design domains (1xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000001-1000-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', NULL, 'Electronics Design', 'Core electronic systems design', 'Electronics', 0, 1, 'critical', '[]', ARRAY['Electrical Engineer', 'Hardware Engineer'], NULL),

('00000001-1100-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1000-4000-8000-000000000001', 'Power Systems', 'Power management and distribution', 'Electronics', 1, 1, 'critical', 
 '[{"id": "ps1", "question": "What is your power source (battery, mains, USB)?", "context": "This determines your entire power architecture"}, {"id": "ps2", "question": "What voltage rails do you need?", "context": "Different ICs need different voltages"}, {"id": "ps3", "question": "What is your total power budget?", "context": "Affects battery life and thermal design"}]',
 ARRAY['Power Electronics Engineer'], '2-4 weeks'),

('00000001-1110-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1100-4000-8000-000000000001', 'Battery Management', 'BMS design and battery selection', 'Electronics', 2, 1, 'critical',
 '[{"id": "bm1", "question": "What battery chemistry will you use (Li-ion, LiPo, etc.)?", "context": "Chemistry affects capacity, safety, and charging"}, {"id": "bm2", "question": "How many cells and what configuration (series/parallel)?", "context": "Determines voltage and capacity"}, {"id": "bm3", "question": "What is your charging strategy (CC/CV, fast charge)?", "context": "Affects charging time and battery life"}]',
 ARRAY['Battery Engineer', 'Power Engineer'], '3-4 weeks'),

('00000001-1120-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1100-4000-8000-000000000001', 'Power Conversion', 'DC-DC and AC-DC conversion', 'Electronics', 2, 2, 'important',
 '[{"id": "pc1", "question": "What efficiency targets do you have?", "context": "Affects component selection and thermal design"}, {"id": "pc2", "question": "What is your input voltage range?", "context": "Determines converter topology"}]',
 ARRAY['Power Electronics Engineer'], '2-3 weeks'),

('00000001-1200-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1000-4000-8000-000000000001', 'Signal Processing', 'Analog and digital signal handling', 'Electronics', 1, 2, 'important',
 '[{"id": "sp1", "question": "What sensors are you interfacing with?", "context": "Determines ADC requirements"}, {"id": "sp2", "question": "What sample rates do you need?", "context": "Affects processor selection"}]',
 ARRAY['Analog Engineer', 'Signal Processing Engineer'], '2-3 weeks'),

('00000001-1300-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1000-4000-8000-000000000001', 'PCB Design', 'Circuit board design and layout', 'Electronics', 1, 3, 'critical',
 '[{"id": "pcb1", "question": "How many layers do you need?", "context": "Affects cost and EMI performance"}, {"id": "pcb2", "question": "What are your impedance requirements?", "context": "Critical for high-speed signals"}, {"id": "pcb3", "question": "What is your target board size?", "context": "Affects component density and thermal"}]',
 ARRAY['PCB Designer', 'Layout Engineer'], '4-6 weeks'),

('00000001-1400-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1000-4000-8000-000000000001', 'Wireless Connectivity', 'WiFi, BLE, and other wireless', 'Electronics', 1, 4, 'critical',
 '[{"id": "wc1", "question": "What wireless protocols do you need?", "context": "WiFi, BLE, Zigbee, Thread, etc."}, {"id": "wc2", "question": "What range requirements do you have?", "context": "Affects antenna and power"}, {"id": "wc3", "question": "What data throughput do you need?", "context": "Affects protocol selection"}]',
 ARRAY['RF Engineer', 'Wireless Engineer'], '3-4 weeks'),

('00000001-1410-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1400-4000-8000-000000000001', 'Antenna Design', 'Antenna selection and matching', 'Electronics', 2, 1, 'important',
 '[{"id": "ad1", "question": "What antenna type (PCB, chip, external)?", "context": "Affects performance and cost"}, {"id": "ad2", "question": "What is your available antenna volume?", "context": "Constrains antenna options"}]',
 ARRAY['RF Engineer', 'Antenna Engineer'], '2-3 weeks'),

('00000001-1500-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-1000-4000-8000-000000000001', 'Embedded Systems', 'MCU and firmware architecture', 'Electronics', 1, 5, 'critical',
 '[{"id": "es1", "question": "What MCU family are you using?", "context": "ARM Cortex-M, ESP32, Nordic, etc."}, {"id": "es2", "question": "What RTOS if any?", "context": "FreeRTOS, Zephyr, bare metal"}]',
 ARRAY['Firmware Engineer', 'Embedded Engineer'], '4-8 weeks');

-- Mechanical Engineering domains (2xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000001-2000-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', NULL, 'Mechanical Engineering', 'Physical product design', 'Mechanical', 0, 2, 'critical', '[]', ARRAY['Mechanical Engineer', 'Industrial Designer'], NULL),

('00000001-2100-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-2000-4000-8000-000000000001', 'Industrial Design', 'Product aesthetics and form', 'Mechanical', 1, 1, 'important',
 '[{"id": "id1", "question": "What is your target user and use environment?", "context": "Drives form factor decisions"}, {"id": "id2", "question": "What is your brand language?", "context": "Affects visual design"}]',
 ARRAY['Industrial Designer', 'Product Designer'], '4-8 weeks'),

('00000001-2200-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-2000-4000-8000-000000000001', 'Enclosure Design', 'Housing and mechanical structure', 'Mechanical', 1, 2, 'critical',
 '[{"id": "ed1", "question": "What material (plastic, metal, hybrid)?", "context": "Affects cost, durability, and manufacturing"}, {"id": "ed2", "question": "What IP rating do you need?", "context": "Water and dust resistance"}]',
 ARRAY['Mechanical Engineer'], '4-6 weeks'),

('00000001-2300-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-2000-4000-8000-000000000001', 'Thermal Management', 'Heat dissipation and thermal design', 'Mechanical', 1, 3, 'important',
 '[{"id": "tm1", "question": "What is your total heat dissipation?", "context": "Determines cooling strategy"}, {"id": "tm2", "question": "What is your ambient temperature range?", "context": "Affects thermal margin"}]',
 ARRAY['Thermal Engineer', 'Mechanical Engineer'], '2-4 weeks'),

('00000001-2400-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-2000-4000-8000-000000000001', 'DFM Review', 'Design for manufacturability', 'Mechanical', 1, 4, 'important',
 '[{"id": "dfm1", "question": "What manufacturing process (injection molding, CNC)?", "context": "Affects design constraints"}, {"id": "dfm2", "question": "What are your draft angle requirements?", "context": "For injection molded parts"}]',
 ARRAY['DFM Engineer', 'Manufacturing Engineer'], '1-2 weeks');

-- Software domains (3xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000001-3000-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', NULL, 'Software & Firmware', 'Device and companion software', 'Software', 0, 3, 'critical', '[]', ARRAY['Software Engineer', 'Firmware Engineer'], NULL),

('00000001-3100-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-3000-4000-8000-000000000001', 'Firmware Development', 'Embedded device software', 'Software', 1, 1, 'critical',
 '[{"id": "fw1", "question": "What programming language (C, C++, Rust)?", "context": "Affects toolchain and team skills"}, {"id": "fw2", "question": "What is your OTA update strategy?", "context": "Critical for field updates"}]',
 ARRAY['Firmware Engineer'], '8-12 weeks'),

('00000001-3200-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-3000-4000-8000-000000000001', 'Mobile App Development', 'Companion iOS/Android apps', 'Software', 1, 2, 'important',
 '[{"id": "ma1", "question": "Native or cross-platform (Flutter, React Native)?", "context": "Affects development speed and performance"}, {"id": "ma2", "question": "What features need to work offline?", "context": "Affects architecture"}]',
 ARRAY['Mobile Developer', 'App Developer'], '6-10 weeks'),

('00000001-3300-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-3000-4000-8000-000000000001', 'Cloud Backend', 'Server infrastructure and APIs', 'Software', 1, 3, 'important',
 '[{"id": "cb1", "question": "What cloud provider (AWS, GCP, Azure)?", "context": "Affects services available"}, {"id": "cb2", "question": "What data do you need to store and process?", "context": "Affects database and compute choices"}]',
 ARRAY['Backend Engineer', 'Cloud Architect'], '4-8 weeks');

-- Manufacturing domains (4xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000001-4000-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', NULL, 'Manufacturing', 'Production and assembly', 'Manufacturing', 0, 4, 'critical', '[]', ARRAY['Manufacturing Engineer', 'Operations'], NULL),

('00000001-4100-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-4000-4000-8000-000000000001', 'PCB Assembly', 'SMT and through-hole assembly', 'Manufacturing', 1, 1, 'critical',
 '[{"id": "pa1", "question": "What volume are you planning?", "context": "Affects CM selection and pricing"}, {"id": "pa2", "question": "What is your target cost?", "context": "Drives component and process choices"}]',
 ARRAY['Manufacturing Engineer'], '2-4 weeks'),

('00000001-4200-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-4000-4000-8000-000000000001', 'Injection Molding', 'Plastic part production', 'Manufacturing', 1, 2, 'important',
 '[{"id": "im1", "question": "What is your expected volume?", "context": "Determines tooling investment"}, {"id": "im2", "question": "What surface finish do you need?", "context": "Affects tooling and cost"}]',
 ARRAY['Tooling Engineer', 'Manufacturing Engineer'], '8-12 weeks'),

('00000001-4300-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-4000-4000-8000-000000000001', 'Final Assembly', 'Product assembly and test', 'Manufacturing', 1, 3, 'critical',
 '[{"id": "fa1", "question": "What is your assembly sequence?", "context": "Affects line layout"}, {"id": "fa2", "question": "What functional tests are required?", "context": "Affects test fixture design"}]',
 ARRAY['Manufacturing Engineer', 'Test Engineer'], '2-4 weeks'),

('00000001-4400-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-4000-4000-8000-000000000001', 'Quality & Testing', 'QA processes and reliability', 'Manufacturing', 1, 4, 'critical',
 '[{"id": "qt1", "question": "What quality standards apply (ISO, IPC)?", "context": "Affects processes and documentation"}, {"id": "qt2", "question": "What reliability testing do you need?", "context": "Affects timeline and cost"}]',
 ARRAY['Quality Engineer', 'Test Engineer'], '4-8 weeks');

-- Regulatory domains (5xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000001-5000-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', NULL, 'Regulatory & Compliance', 'Certifications and regulations', 'Regulatory', 0, 5, 'critical', '[]', ARRAY['Regulatory Engineer', 'Compliance Manager'], NULL),

('00000001-5100-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-5000-4000-8000-000000000001', 'FCC Certification', 'US wireless emissions compliance', 'Regulatory', 1, 1, 'critical',
 '[{"id": "fcc1", "question": "Is your device intentional or unintentional radiator?", "context": "Determines Part 15 subpart"}, {"id": "fcc2", "question": "What frequencies do you transmit on?", "context": "Affects test requirements"}]',
 ARRAY['EMC Engineer', 'Regulatory Consultant'], '4-8 weeks'),

('00000001-5200-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-5000-4000-8000-000000000001', 'CE Marking', 'EU compliance (RED, EMC, LVD)', 'Regulatory', 1, 2, 'critical',
 '[{"id": "ce1", "question": "Which EU directives apply?", "context": "RED for wireless, EMC, LVD for electrical"}, {"id": "ce2", "question": "Do you need a Notified Body?", "context": "For certain radio equipment"}]',
 ARRAY['Regulatory Engineer'], '4-8 weeks'),

('00000001-5300-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-5000-4000-8000-000000000001', 'Safety Certification', 'UL, CSA, TUV product safety', 'Regulatory', 1, 3, 'important',
 '[{"id": "sc1", "question": "What safety standard applies (UL 62368, etc.)?", "context": "Depends on product type"}, {"id": "sc2", "question": "What is your power source?", "context": "Affects safety requirements"}]',
 ARRAY['Safety Engineer'], '6-12 weeks'),

('00000001-5400-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-5000-4000-8000-000000000001', 'Environmental Compliance', 'RoHS, REACH, battery regulations', 'Regulatory', 1, 4, 'important',
 '[{"id": "ec1", "question": "Are all your components RoHS compliant?", "context": "Required for EU and many other markets"}, {"id": "ec2", "question": "Do you have batteries?", "context": "UN38.3 and regional battery laws"}]',
 ARRAY['Environmental Compliance Specialist'], '2-4 weeks');

-- Business domains (6xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000001-6000-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', NULL, 'Business & Go-to-Market', 'Commercial aspects', 'Business', 0, 6, 'important', '[]', ARRAY['Product Manager', 'Business Development'], NULL),

('00000001-6100-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-6000-4000-8000-000000000001', 'Cost Analysis', 'BOM and landed cost modeling', 'Business', 1, 1, 'important',
 '[{"id": "ca1", "question": "What is your target retail price?", "context": "Works back to BOM cost target"}, {"id": "ca2", "question": "What margins do you need?", "context": "Affects pricing and costs"}]',
 ARRAY['Cost Engineer', 'Product Manager'], '1-2 weeks'),

('00000001-6200-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-6000-4000-8000-000000000001', 'Supply Chain', 'Sourcing and logistics', 'Business', 1, 2, 'important',
 '[{"id": "sc1", "question": "Where will you manufacture?", "context": "Affects logistics and duties"}, {"id": "sc2", "question": "What is your inventory strategy?", "context": "Affects cash flow and availability"}]',
 ARRAY['Supply Chain Manager'], '2-4 weeks'),

('00000001-6300-4000-8000-000000000001', '00000001-0000-4000-8000-000000000001', '00000001-6000-4000-8000-000000000001', 'Distribution', 'Sales channels and fulfillment', 'Business', 1, 3, 'nice-to-have',
 '[{"id": "ds1", "question": "Direct, retail, or both?", "context": "Affects packaging and logistics"}, {"id": "ds2", "question": "What retailers are you targeting?", "context": "May have specific requirements"}]',
 ARRAY['Sales Manager', 'Channel Manager'], '2-4 weeks');


-- ============================================================================
-- SAAS PLATFORM TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000002-0000-4000-8000-000000000001',
    'SaaS Platform',
    'For cloud software, APIs, and web applications',
    'saas',
    'server',
    38,
    124,
    true,
    '{"tags": ["software", "cloud", "saas"], "difficulty": "intermediate"}'
);

-- Infrastructure domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000002-1000-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', NULL, 'Infrastructure', 'Cloud and hosting infrastructure', 'Software', 0, 1, 'critical', '[]', ARRAY['DevOps Engineer', 'SRE'], NULL),

('00000002-1100-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-1000-4000-8000-000000000001', 'Cloud Provider', 'AWS, GCP, Azure selection', 'Software', 1, 1, 'critical',
 '[{"id": "cp1", "question": "Which cloud provider will you use?", "context": "Affects all infrastructure decisions"}, {"id": "cp2", "question": "What regions do you need to serve?", "context": "Affects latency and compliance"}]',
 ARRAY['Cloud Architect'], '1-2 weeks'),

('00000002-1200-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-1000-4000-8000-000000000001', 'Compute & Containers', 'Servers, Kubernetes, serverless', 'Software', 1, 2, 'critical',
 '[{"id": "cc1", "question": "VMs, containers, or serverless?", "context": "Affects scaling and cost model"}, {"id": "cc2", "question": "What orchestration (K8s, ECS)?", "context": "Affects operational complexity"}]',
 ARRAY['DevOps Engineer', 'Platform Engineer'], '2-4 weeks'),

('00000002-1300-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-1000-4000-8000-000000000001', 'Database', 'Data storage and management', 'Software', 1, 3, 'critical',
 '[{"id": "db1", "question": "SQL or NoSQL (or both)?", "context": "Depends on data model"}, {"id": "db2", "question": "What scale do you need?", "context": "Affects database selection"}]',
 ARRAY['Database Administrator', 'Backend Engineer'], '2-4 weeks'),

('00000002-1400-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-1000-4000-8000-000000000001', 'CI/CD', 'Build and deployment pipelines', 'Software', 1, 4, 'important',
 '[{"id": "ci1", "question": "What CI/CD platform?", "context": "GitHub Actions, GitLab CI, Jenkins, etc."}, {"id": "ci2", "question": "What is your deployment strategy?", "context": "Blue-green, canary, rolling"}]',
 ARRAY['DevOps Engineer'], '1-2 weeks');

-- Backend domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000002-2000-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', NULL, 'Backend Development', 'Server-side application code', 'Software', 0, 2, 'critical', '[]', ARRAY['Backend Engineer'], NULL),

('00000002-2100-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-2000-4000-8000-000000000001', 'API Design', 'REST, GraphQL, gRPC', 'Software', 1, 1, 'critical',
 '[{"id": "api1", "question": "REST or GraphQL?", "context": "Affects client flexibility and caching"}, {"id": "api2", "question": "What authentication method?", "context": "JWT, OAuth, API keys"}]',
 ARRAY['API Designer', 'Backend Engineer'], '2-3 weeks'),

('00000002-2200-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-2000-4000-8000-000000000001', 'Authentication', 'User auth and identity', 'Software', 1, 2, 'critical',
 '[{"id": "auth1", "question": "Build or buy (Auth0, Cognito)?", "context": "Affects development time and cost"}, {"id": "auth2", "question": "What auth methods (password, SSO, MFA)?", "context": "Affects UX and security"}]',
 ARRAY['Security Engineer', 'Backend Engineer'], '2-4 weeks'),

('00000002-2300-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-2000-4000-8000-000000000001', 'Background Jobs', 'Async processing and queues', 'Software', 1, 3, 'important',
 '[{"id": "bj1", "question": "What needs to run asynchronously?", "context": "Emails, reports, integrations"}, {"id": "bj2", "question": "What job queue (SQS, Redis, etc.)?", "context": "Affects reliability and monitoring"}]',
 ARRAY['Backend Engineer'], '1-2 weeks');

-- Frontend domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000002-3000-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', NULL, 'Frontend Development', 'Web application UI', 'Software', 0, 3, 'critical', '[]', ARRAY['Frontend Engineer'], NULL),

('00000002-3100-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-3000-4000-8000-000000000001', 'Framework', 'React, Vue, Angular, etc.', 'Software', 1, 1, 'critical',
 '[{"id": "fw1", "question": "What frontend framework?", "context": "Affects hiring and ecosystem"}, {"id": "fw2", "question": "SSR, CSR, or hybrid?", "context": "Affects SEO and performance"}]',
 ARRAY['Frontend Engineer'], '1-2 weeks'),

('00000002-3200-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-3000-4000-8000-000000000001', 'Design System', 'UI components and styling', 'Software', 1, 2, 'important',
 '[{"id": "ds1", "question": "Build or use existing (Tailwind, Material)?", "context": "Affects consistency and speed"}, {"id": "ds2", "question": "What is your design process?", "context": "Figma handoff, design tokens"}]',
 ARRAY['Frontend Engineer', 'Designer'], '2-4 weeks'),

('00000002-3300-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-3000-4000-8000-000000000001', 'State Management', 'Client-side data handling', 'Software', 1, 3, 'important',
 '[{"id": "sm1", "question": "What state management approach?", "context": "Redux, Zustand, React Query, etc."}, {"id": "sm2", "question": "How do you handle caching?", "context": "Affects UX and server load"}]',
 ARRAY['Frontend Engineer'], '1-2 weeks');

-- Security domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000002-4000-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', NULL, 'Security', 'Application and infrastructure security', 'Software', 0, 4, 'critical', '[]', ARRAY['Security Engineer'], NULL),

('00000002-4100-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-4000-4000-8000-000000000001', 'Data Encryption', 'Encryption at rest and in transit', 'Software', 1, 1, 'critical',
 '[{"id": "de1", "question": "What data needs encryption at rest?", "context": "PII, financial, health data"}, {"id": "de2", "question": "Who manages encryption keys?", "context": "KMS, Vault, etc."}]',
 ARRAY['Security Engineer'], '1-2 weeks'),

('00000002-4200-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-4000-4000-8000-000000000001', 'Access Control', 'RBAC, permissions, audit', 'Software', 1, 2, 'critical',
 '[{"id": "ac1", "question": "What roles and permissions do you need?", "context": "Affects data model and UI"}, {"id": "ac2", "question": "What audit logging is required?", "context": "Compliance requirements"}]',
 ARRAY['Security Engineer', 'Backend Engineer'], '2-3 weeks');

-- Compliance domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000002-5000-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', NULL, 'Compliance', 'Regulatory and standards compliance', 'Regulatory', 0, 5, 'important', '[]', ARRAY['Compliance Manager'], NULL),

('00000002-5100-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-5000-4000-8000-000000000001', 'SOC 2', 'Service organization controls', 'Regulatory', 1, 1, 'important',
 '[{"id": "soc1", "question": "Do you need SOC 2?", "context": "Required for many enterprise sales"}, {"id": "soc2", "question": "Type I or Type II?", "context": "Type II takes longer but is more valuable"}]',
 ARRAY['Compliance Manager', 'Security Engineer'], '3-6 months'),

('00000002-5200-4000-8000-000000000001', '00000002-0000-4000-8000-000000000001', '00000002-5000-4000-8000-000000000001', 'GDPR', 'EU data protection', 'Regulatory', 1, 2, 'important',
 '[{"id": "gdpr1", "question": "Do you process EU user data?", "context": "Triggers GDPR requirements"}, {"id": "gdpr2", "question": "What is your lawful basis?", "context": "Consent, contract, legitimate interest"}]',
 ARRAY['Privacy Officer', 'Legal'], '2-4 weeks');


-- ============================================================================
-- ROBOTICS & AUTOMATION TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000003-0000-4000-8000-000000000001',
    'Robotics & Automation',
    'For robots, automated systems, and industrial automation',
    'robotics',
    'bot',
    68,
    215,
    true,
    '{"tags": ["hardware", "robotics", "automation", "industrial"], "difficulty": "advanced"}'
);

-- Motors & Actuators domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000003-1000-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', NULL, 'Motors & Actuators', 'Motion systems and actuation', 'Electronics', 0, 1, 'critical', '[]', ARRAY['Motion Control Engineer', 'Mechanical Engineer'], NULL),

('00000003-1100-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-1000-4000-8000-000000000001', 'Motor Selection', 'DC, stepper, servo, BLDC', 'Electronics', 1, 1, 'critical',
 '[{"id": "ms1", "question": "What motion profile do you need?", "context": "Speed, torque, precision"}, {"id": "ms2", "question": "What motor type (stepper, servo, DC)?", "context": "Affects control complexity"}]',
 ARRAY['Motion Control Engineer'], '2-4 weeks'),

('00000003-1200-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-1000-4000-8000-000000000001', 'Motor Drivers', 'H-bridge, servo drives, VFDs', 'Electronics', 1, 2, 'critical',
 '[{"id": "md1", "question": "What voltage and current do you need?", "context": "Determines driver selection"}, {"id": "md2", "question": "What control interface (PWM, step/dir, CAN)?", "context": "Affects integration"}]',
 ARRAY['Electronics Engineer'], '2-3 weeks'),

('00000003-1300-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-1000-4000-8000-000000000001', 'Linear Actuators', 'Lead screws, ball screws, linear motors', 'Mechanical', 1, 3, 'important',
 '[{"id": "la1", "question": "What force and speed do you need?", "context": "Determines actuator type"}, {"id": "la2", "question": "What stroke length?", "context": "Affects mechanism design"}]',
 ARRAY['Mechanical Engineer'], '2-3 weeks');

-- Control Systems domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000003-2000-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', NULL, 'Control Systems', 'Motion control and feedback', 'Software', 0, 2, 'critical', '[]', ARRAY['Controls Engineer'], NULL),

('00000003-2100-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-2000-4000-8000-000000000001', 'PID Control', 'Feedback control loops', 'Software', 1, 1, 'critical',
 '[{"id": "pid1", "question": "What needs closed-loop control?", "context": "Position, velocity, force"}, {"id": "pid2", "question": "What is your control loop rate?", "context": "Affects latency and stability"}]',
 ARRAY['Controls Engineer'], '2-4 weeks'),

('00000003-2200-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-2000-4000-8000-000000000001', 'Motion Planning', 'Trajectory and path planning', 'Software', 1, 2, 'important',
 '[{"id": "mp1", "question": "What motion primitives do you need?", "context": "Linear, circular, spline"}, {"id": "mp2", "question": "Multi-axis coordination?", "context": "Affects controller complexity"}]',
 ARRAY['Robotics Engineer'], '4-8 weeks');

-- Sensing domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000003-3000-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', NULL, 'Sensing & Perception', 'Sensors and perception systems', 'Electronics', 0, 3, 'critical', '[]', ARRAY['Sensor Engineer', 'Perception Engineer'], NULL),

('00000003-3100-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-3000-4000-8000-000000000001', 'Position Sensing', 'Encoders, resolvers, limit switches', 'Electronics', 1, 1, 'critical',
 '[{"id": "ps1", "question": "What resolution do you need?", "context": "Determines encoder selection"}, {"id": "ps2", "question": "Absolute or incremental?", "context": "Affects homing and power-off behavior"}]',
 ARRAY['Sensor Engineer'], '1-2 weeks'),

('00000003-3200-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-3000-4000-8000-000000000001', 'Computer Vision', 'Cameras and image processing', 'Software', 1, 2, 'important',
 '[{"id": "cv1", "question": "What do you need to detect/track?", "context": "Objects, markers, features"}, {"id": "cv2", "question": "What frame rate and resolution?", "context": "Affects processing requirements"}]',
 ARRAY['Vision Engineer', 'ML Engineer'], '4-8 weeks'),

('00000003-3300-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-3000-4000-8000-000000000001', 'Force/Torque Sensing', 'Load cells and force sensors', 'Electronics', 1, 3, 'important',
 '[{"id": "ft1", "question": "What forces need to be measured?", "context": "Determines sensor range"}, {"id": "ft2", "question": "What accuracy do you need?", "context": "Affects sensor selection and cost"}]',
 ARRAY['Sensor Engineer'], '1-2 weeks');

-- Safety domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000003-4000-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', NULL, 'Safety Systems', 'Machine safety and risk mitigation', 'Regulatory', 0, 4, 'critical', '[]', ARRAY['Safety Engineer'], NULL),

('00000003-4100-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-4000-4000-8000-000000000001', 'Risk Assessment', 'Hazard identification and mitigation', 'Regulatory', 1, 1, 'critical',
 '[{"id": "ra1", "question": "What are the primary hazards?", "context": "Pinch points, sharp edges, high speed"}, {"id": "ra2", "question": "Who will interact with the robot?", "context": "Operators, bystanders, collaborative"}]',
 ARRAY['Safety Engineer'], '2-4 weeks'),

('00000003-4200-4000-8000-000000000001', '00000003-0000-4000-8000-000000000001', '00000003-4000-4000-8000-000000000001', 'E-Stop & Interlocks', 'Emergency stop and safety circuits', 'Electronics', 1, 2, 'critical',
 '[{"id": "es1", "question": "What safety category (ISO 13849)?", "context": "Determines circuit architecture"}, {"id": "es2", "question": "What interlocks are needed?", "context": "Door switches, light curtains"}]',
 ARRAY['Safety Engineer', 'Controls Engineer'], '2-4 weeks');


-- ============================================================================
-- MOBILE APP TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000004-0000-4000-8000-000000000001',
    'Mobile Application',
    'For iOS and Android mobile apps',
    'mobile',
    'smartphone',
    29,
    87,
    true,
    '{"tags": ["software", "mobile", "ios", "android"], "difficulty": "intermediate"}'
);

-- App Development domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000004-1000-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001', NULL, 'App Development', 'Mobile application code', 'Software', 0, 1, 'critical', '[]', ARRAY['Mobile Developer'], NULL),

('00000004-1100-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001', '00000004-1000-4000-8000-000000000001', 'Platform Strategy', 'iOS, Android, or both', 'Software', 1, 1, 'critical',
 '[{"id": "ps1", "question": "Which platforms do you need?", "context": "iOS, Android, or both"}, {"id": "ps2", "question": "Native or cross-platform?", "context": "React Native, Flutter, or native"}]',
 ARRAY['Mobile Developer', 'Product Manager'], '1-2 weeks'),

('00000004-1200-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001', '00000004-1000-4000-8000-000000000001', 'iOS Development', 'Swift and iOS SDK', 'Software', 1, 2, 'critical',
 '[{"id": "ios1", "question": "SwiftUI or UIKit?", "context": "Affects minimum iOS version"}, {"id": "ios2", "question": "What iOS features do you need?", "context": "HealthKit, HomeKit, ARKit, etc."}]',
 ARRAY['iOS Developer'], '4-8 weeks'),

('00000004-1300-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001', '00000004-1000-4000-8000-000000000001', 'Android Development', 'Kotlin and Android SDK', 'Software', 1, 3, 'critical',
 '[{"id": "and1", "question": "Compose or Views?", "context": "Affects minimum Android version"}, {"id": "and2", "question": "What minimum SDK level?", "context": "Affects device compatibility"}]',
 ARRAY['Android Developer'], '4-8 weeks');

-- App Store domains
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000004-2000-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001', NULL, 'App Store', 'Store submission and compliance', 'Business', 0, 2, 'critical', '[]', ARRAY['Product Manager'], NULL),

('00000004-2100-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001', '00000004-2000-4000-8000-000000000001', 'App Store Guidelines', 'Apple review compliance', 'Regulatory', 1, 1, 'critical',
 '[{"id": "asg1", "question": "Do you have in-app purchases?", "context": "Must use Apple IAP"}, {"id": "asg2", "question": "What data do you collect?", "context": "Privacy labels required"}]',
 ARRAY['Product Manager'], '1-2 weeks'),

('00000004-2200-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001', '00000004-2000-4000-8000-000000000001', 'Play Store Policies', 'Google Play compliance', 'Regulatory', 1, 2, 'critical',
 '[{"id": "psp1", "question": "What permissions do you need?", "context": "Must justify each permission"}, {"id": "psp2", "question": "What data do you collect?", "context": "Data safety section required"}]',
 ARRAY['Product Manager'], '1-2 weeks');


-- Update template counts
UPDATE blueprint_templates SET
  estimated_domains = (SELECT COUNT(*) FROM knowledge_domains WHERE template_id = blueprint_templates.id),
  estimated_questions = (SELECT COUNT(*) FROM knowledge_domains kd, jsonb_array_elements(kd.key_questions) WHERE kd.template_id = blueprint_templates.id);

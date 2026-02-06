-- Migration: Review Gates, Sector Skills, Manufacturing Upgrade
-- Purpose: Add human-in-the-loop review gates, sector-linked skills,
--          manufacturing objective packs, RFQ templates, and manufacturing marketplace listings

-- ============================================================================
-- 1. REVIEW GATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.review_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id uuid NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  objective_id uuid REFERENCES public.objectives(id) ON DELETE CASCADE,
  gate_type text NOT NULL CHECK (gate_type IN (
    'expert_review', 'peer_review', 'quality_gate',
    'safety_review', 'manufacturing_review', 'compliance_review'
  )),
  title text NOT NULL,
  description text,
  required_skills text[] DEFAULT '{}',
  sector text,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_review', 'approved', 'rejected', 'waived'
  )),
  review_notes text,
  reviewed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT review_gates_target_check CHECK (
    task_id IS NOT NULL OR objective_id IS NOT NULL
  )
);

-- Indexes
CREATE INDEX idx_review_gates_foundry ON public.review_gates(foundry_id);
CREATE INDEX idx_review_gates_task ON public.review_gates(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_review_gates_objective ON public.review_gates(objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX idx_review_gates_reviewer ON public.review_gates(reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX idx_review_gates_status ON public.review_gates(status);

-- RLS
ALTER TABLE public.review_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_gates_select" ON public.review_gates
  FOR SELECT USING (
    foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "review_gates_insert" ON public.review_gates
  FOR INSERT WITH CHECK (
    foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "review_gates_update" ON public.review_gates
  FOR UPDATE USING (
    foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "review_gates_delete" ON public.review_gates
  FOR DELETE USING (
    foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

-- ============================================================================
-- 2. SECTOR SKILLS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sector_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector text NOT NULL,
  skill_name text NOT NULL,
  skill_category text NOT NULL CHECK (skill_category IN (
    'engineering', 'manufacturing', 'regulatory', 'business', 'software', 'operations'
  )),
  is_expert_level boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(sector, skill_name)
);

CREATE INDEX idx_sector_skills_sector ON public.sector_skills(sector);
CREATE INDEX idx_sector_skills_category ON public.sector_skills(skill_category);

-- RLS: public read, no user writes (seed data only)
ALTER TABLE public.sector_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sector_skills_select" ON public.sector_skills
  FOR SELECT USING (true);

-- ============================================================================
-- 3. RFQ TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rfq_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sector text,
  rfq_type text NOT NULL DEFAULT 'custom',
  category text,
  default_specifications jsonb DEFAULT '{}',
  description text,
  is_manufacturing boolean DEFAULT false,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rfq_templates_sector ON public.rfq_templates(sector);
CREATE INDEX idx_rfq_templates_manufacturing ON public.rfq_templates(is_manufacturing) WHERE is_manufacturing = true;

-- RLS: public read
ALTER TABLE public.rfq_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfq_templates_select" ON public.rfq_templates
  FOR SELECT USING (true);

-- ============================================================================
-- 4. SEED SECTOR SKILLS (all 8 sectors)
-- ============================================================================

-- ROBOTICS
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('robotics', 'Motion Control', 'engineering', true),
  ('robotics', 'Kinematics & Dynamics', 'engineering', true),
  ('robotics', 'Sensor Integration', 'engineering', false),
  ('robotics', 'Computer Vision', 'software', true),
  ('robotics', 'ROS/ROS2', 'software', false),
  ('robotics', 'PLC Programming', 'engineering', false),
  ('robotics', 'Embedded Systems', 'engineering', false),
  ('robotics', 'Robot Cell Design', 'manufacturing', true),
  ('robotics', 'Safety Systems (ISO 10218)', 'regulatory', true),
  ('robotics', 'CNC Machining', 'manufacturing', false),
  ('robotics', 'Welding Automation', 'manufacturing', false),
  ('robotics', 'Quality Assurance', 'manufacturing', false),
  ('robotics', 'Supply Chain Management', 'operations', false),
  ('robotics', 'Product Management', 'business', false),
  ('robotics', 'CE/UKCA Marking', 'regulatory', false);

-- ROCKETS
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('rockets', 'Propulsion Engineering', 'engineering', true),
  ('rockets', 'Structural Analysis (FEA)', 'engineering', true),
  ('rockets', 'Avionics Design', 'engineering', true),
  ('rockets', 'GNC Algorithms', 'software', true),
  ('rockets', 'Flight Software', 'software', false),
  ('rockets', 'Composites Manufacturing', 'manufacturing', true),
  ('rockets', 'Additive Manufacturing', 'manufacturing', false),
  ('rockets', 'Hot-Fire Testing', 'engineering', true),
  ('rockets', 'Launch Operations', 'operations', true),
  ('rockets', 'FAA/AST Licensing', 'regulatory', true),
  ('rockets', 'ITAR Compliance', 'regulatory', true),
  ('rockets', 'Range Safety', 'regulatory', false),
  ('rockets', 'Systems Engineering', 'engineering', false),
  ('rockets', 'Mission Analysis', 'engineering', false),
  ('rockets', 'Propellant Handling', 'operations', true);

-- SATELLITES
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('satellites', 'Spacecraft Design', 'engineering', true),
  ('satellites', 'Orbital Mechanics', 'engineering', true),
  ('satellites', 'RF/Communications', 'engineering', true),
  ('satellites', 'Power Systems', 'engineering', false),
  ('satellites', 'Thermal Control', 'engineering', false),
  ('satellites', 'ADCS', 'engineering', true),
  ('satellites', 'Space-Grade Electronics', 'manufacturing', true),
  ('satellites', 'Cleanroom Assembly', 'manufacturing', true),
  ('satellites', 'Radiation Hardening', 'engineering', true),
  ('satellites', 'Ground Station Operations', 'operations', false),
  ('satellites', 'ITU Frequency Coordination', 'regulatory', true),
  ('satellites', 'Space Debris Compliance', 'regulatory', false),
  ('satellites', 'Mission Operations', 'operations', false),
  ('satellites', 'Integration & Test', 'manufacturing', false),
  ('satellites', 'Embedded Flight Software', 'software', false);

-- CONSUMER ELECTRONICS
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('consumer-electronics', 'PCB Design', 'engineering', false),
  ('consumer-electronics', 'Industrial Design', 'engineering', true),
  ('consumer-electronics', 'Injection Molding', 'manufacturing', true),
  ('consumer-electronics', 'SMT Assembly', 'manufacturing', false),
  ('consumer-electronics', 'Firmware Development', 'software', false),
  ('consumer-electronics', 'Mobile App Development', 'software', false),
  ('consumer-electronics', 'DFM Review', 'manufacturing', true),
  ('consumer-electronics', 'UL/CE Certification', 'regulatory', true),
  ('consumer-electronics', 'FCC Testing', 'regulatory', false),
  ('consumer-electronics', 'Supply Chain Sourcing', 'operations', false),
  ('consumer-electronics', 'Factory Audit', 'manufacturing', true),
  ('consumer-electronics', 'Reliability Testing', 'manufacturing', false),
  ('consumer-electronics', 'Packaging Design', 'engineering', false),
  ('consumer-electronics', 'Cost Engineering', 'business', false),
  ('consumer-electronics', 'Product Marketing', 'business', false);

-- PHARMACEUTICALS
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('pharmaceuticals', 'Drug Formulation', 'engineering', true),
  ('pharmaceuticals', 'Clinical Trials (GCP)', 'regulatory', true),
  ('pharmaceuticals', 'GMP Manufacturing', 'manufacturing', true),
  ('pharmaceuticals', 'Analytical Chemistry', 'engineering', true),
  ('pharmaceuticals', 'Process Validation (IQ/OQ/PQ)', 'manufacturing', true),
  ('pharmaceuticals', 'Regulatory Affairs (FDA/EMA)', 'regulatory', true),
  ('pharmaceuticals', 'Pharmacovigilance', 'regulatory', false),
  ('pharmaceuticals', 'Quality Control', 'manufacturing', false),
  ('pharmaceuticals', 'Bioinformatics', 'software', false),
  ('pharmaceuticals', 'Supply Chain (Cold Chain)', 'operations', true),
  ('pharmaceuticals', 'Medical Writing', 'regulatory', false),
  ('pharmaceuticals', 'LIMS Systems', 'software', false),
  ('pharmaceuticals', 'Batch Record Management', 'manufacturing', false),
  ('pharmaceuticals', 'Drug Safety', 'regulatory', false),
  ('pharmaceuticals', 'Patent Strategy', 'business', true);

-- AI DATA CENTRES
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('ai-datacentre', 'Data Centre Design', 'engineering', true),
  ('ai-datacentre', 'GPU Cluster Architecture', 'engineering', true),
  ('ai-datacentre', 'High-Performance Networking', 'engineering', true),
  ('ai-datacentre', 'Cooling Systems', 'engineering', false),
  ('ai-datacentre', 'Power Distribution', 'engineering', false),
  ('ai-datacentre', 'MLOps & Training Infra', 'software', true),
  ('ai-datacentre', 'Kubernetes / HPC', 'software', false),
  ('ai-datacentre', 'Rack Assembly & Cabling', 'manufacturing', false),
  ('ai-datacentre', 'Server Manufacturing', 'manufacturing', true),
  ('ai-datacentre', 'Environmental Compliance', 'regulatory', false),
  ('ai-datacentre', 'Energy Procurement', 'operations', true),
  ('ai-datacentre', 'Fire Suppression Systems', 'engineering', false),
  ('ai-datacentre', 'Physical Security', 'operations', false),
  ('ai-datacentre', 'Site Selection & Permitting', 'business', true),
  ('ai-datacentre', 'Capacity Planning', 'operations', false);

-- SAAS
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('saas', 'Full-Stack Development', 'software', false),
  ('saas', 'Cloud Architecture (AWS/GCP)', 'software', true),
  ('saas', 'DevOps / CI-CD', 'software', false),
  ('saas', 'Database Design', 'software', false),
  ('saas', 'UI/UX Design', 'engineering', false),
  ('saas', 'Security Engineering', 'software', true),
  ('saas', 'SOC 2 Compliance', 'regulatory', true),
  ('saas', 'GDPR Compliance', 'regulatory', false),
  ('saas', 'Product Management', 'business', false),
  ('saas', 'Growth Marketing', 'business', false),
  ('saas', 'Customer Success', 'operations', false),
  ('saas', 'Sales Engineering', 'business', false),
  ('saas', 'API Design', 'software', false),
  ('saas', 'Performance Engineering', 'software', true),
  ('saas', 'Incident Management', 'operations', false);

-- MOBILE
INSERT INTO public.sector_skills (sector, skill_name, skill_category, is_expert_level) VALUES
  ('mobile', 'iOS Development (Swift)', 'software', false),
  ('mobile', 'Android Development (Kotlin)', 'software', false),
  ('mobile', 'React Native / Flutter', 'software', false),
  ('mobile', 'Mobile UI/UX Design', 'engineering', false),
  ('mobile', 'App Store Optimization', 'business', false),
  ('mobile', 'Push Notification Systems', 'software', false),
  ('mobile', 'Mobile Security', 'software', true),
  ('mobile', 'App Store Compliance', 'regulatory', false),
  ('mobile', 'Accessibility (WCAG)', 'regulatory', false),
  ('mobile', 'Analytics Integration', 'software', false),
  ('mobile', 'Backend API Development', 'software', false),
  ('mobile', 'Mobile QA / Testing', 'software', false),
  ('mobile', 'Product Management', 'business', false),
  ('mobile', 'User Research', 'business', false),
  ('mobile', 'Growth Hacking', 'business', false);

-- ============================================================================
-- 5. SEED MANUFACTURING OBJECTIVE PACKS
-- ============================================================================

INSERT INTO public.objective_packs (id, title, description, category, product_category, difficulty, estimated_duration, icon_name) VALUES
  ('mfg00000-0000-0000-0000-000000000001', 'DFM Review Process', 'Run a Design for Manufacturing review to ensure your product is optimized for production. Covers material selection, tolerance analysis, and supplier feedback loops.', 'Manufacturing', NULL, 'Medium', '2-3 Weeks', 'Factory'),
  ('mfg00000-0000-0000-0000-000000000002', 'Manufacturing Quality System (ISO 9001)', 'Establish a quality management system aligned with ISO 9001 requirements. Covers documentation, process control, corrective actions, and audit readiness.', 'Manufacturing', NULL, 'Hard', '6-8 Weeks', 'ShieldCheck'),
  ('mfg00000-0000-0000-0000-000000000003', 'Production Readiness Review', 'Assess whether your product and supply chain are ready for volume production. Covers tooling, process validation, and capacity planning.', 'Manufacturing', NULL, 'Hard', '4-6 Weeks', 'CheckCircle'),
  ('mfg00000-0000-0000-0000-000000000004', 'Supply Chain Qualification', 'Qualify and onboard suppliers for critical components. Covers supplier audits, first article inspection, and ongoing quality monitoring.', 'Manufacturing', NULL, 'Medium', '3-4 Weeks', 'Truck'),
  ('mfg00000-0000-0000-0000-000000000005', 'First Article Inspection Process', 'Set up and execute a First Article Inspection (FAI) process per AS9102 or equivalent. Covers inspection planning, measurement, and reporting.', 'Manufacturing', NULL, 'Medium', '1-2 Weeks', 'Search');

-- DFM Review Process items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
  ('mfg00000-0000-0000-0000-000000000001', 'Gather Design Files and BOM', 'Collect CAD files, drawings, bill of materials, and specification documents for review.', 'Apprentice', 1),
  ('mfg00000-0000-0000-0000-000000000001', 'Identify Manufacturing Methods', 'Determine which manufacturing processes will be used (injection molding, CNC, PCB assembly, etc.).', 'Executive', 2),
  ('mfg00000-0000-0000-0000-000000000001', 'Conduct Tolerance Analysis', 'Review tolerances against manufacturing capabilities and flag any that are unnecessarily tight or unreachable.', 'Apprentice', 3),
  ('mfg00000-0000-0000-0000-000000000001', 'Review Material Selections', 'Validate material choices for availability, cost, and suitability for the production method.', 'Apprentice', 4),
  ('mfg00000-0000-0000-0000-000000000001', 'Get Supplier DFM Feedback', 'Send designs to 2-3 potential suppliers for their DFM feedback and recommendations. (Marketplace: Find Supplier)', 'Executive', 5),
  ('mfg00000-0000-0000-0000-000000000001', 'Expert Review of DFM Report', 'Have a manufacturing expert review all DFM findings and approve the design for production. (Marketplace: Hire Expert)', 'Executive', 6);

-- Manufacturing Quality System items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
  ('mfg00000-0000-0000-0000-000000000002', 'Define Quality Policy and Objectives', 'Establish the organisations quality policy and measurable quality objectives.', 'Executive', 1),
  ('mfg00000-0000-0000-0000-000000000002', 'Document Core Processes', 'Map and document all core business processes including design, production, and delivery.', 'Apprentice', 2),
  ('mfg00000-0000-0000-0000-000000000002', 'Create Work Instructions', 'Write detailed work instructions for manufacturing operations and quality checks.', 'Apprentice', 3),
  ('mfg00000-0000-0000-0000-000000000002', 'Implement Inspection Procedures', 'Set up incoming, in-process, and final inspection procedures with acceptance criteria.', 'Apprentice', 4),
  ('mfg00000-0000-0000-0000-000000000002', 'Establish CAPA Process', 'Create a Corrective and Preventive Action process for handling non-conformances.', 'Apprentice', 5),
  ('mfg00000-0000-0000-0000-000000000002', 'Hire Quality Expert for Audit Prep', 'Engage a quality management expert to review your QMS and prepare for certification audit. (Marketplace: Hire Expert)', 'Executive', 6);

-- Production Readiness Review items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
  ('mfg00000-0000-0000-0000-000000000003', 'Complete Design Freeze Checklist', 'Verify all design changes are incorporated and the design is frozen for production.', 'Executive', 1),
  ('mfg00000-0000-0000-0000-000000000003', 'Validate Production Tooling', 'Confirm all tooling is built, tested, and producing parts within specification.', 'Apprentice', 2),
  ('mfg00000-0000-0000-0000-000000000003', 'Run Process Validation (IQ/OQ/PQ)', 'Execute Installation, Operational, and Performance Qualification of production equipment.', 'Apprentice', 3),
  ('mfg00000-0000-0000-0000-000000000003', 'Verify Supply Chain Readiness', 'Confirm all suppliers are qualified and can meet volume and lead time requirements.', 'Apprentice', 4),
  ('mfg00000-0000-0000-0000-000000000003', 'Conduct Pilot Production Run', 'Run a pilot batch to validate yield, cycle time, and quality at near-production volumes.', 'Apprentice', 5),
  ('mfg00000-0000-0000-0000-000000000003', 'Expert Production Readiness Sign-off', 'Manufacturing expert reviews all evidence and approves the transition to volume production. (Marketplace: Hire Expert)', 'Executive', 6);

-- Supply Chain Qualification items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
  ('mfg00000-0000-0000-0000-000000000004', 'Identify Critical Suppliers', 'List all suppliers for critical components and classify by risk level.', 'Executive', 1),
  ('mfg00000-0000-0000-0000-000000000004', 'Create RFQ for Key Components', 'Issue RFQs to multiple qualified suppliers for competitive pricing. (Use RFQ System)', 'Executive', 2),
  ('mfg00000-0000-0000-0000-000000000004', 'Conduct Supplier Audits', 'Visit or remotely audit suppliers quality systems and manufacturing capabilities.', 'Executive', 3),
  ('mfg00000-0000-0000-0000-000000000004', 'Execute First Article Inspection', 'Receive and inspect first production samples against specifications.', 'Apprentice', 4),
  ('mfg00000-0000-0000-0000-000000000004', 'Set Up Quality Agreements', 'Establish quality agreements, inspection criteria, and reject/return procedures with each supplier.', 'Apprentice', 5),
  ('mfg00000-0000-0000-0000-000000000004', 'Expert Review of Supplier Portfolio', 'Have a supply chain expert review the supplier base for risk, redundancy, and cost. (Marketplace: Hire Expert)', 'Executive', 6);

-- First Article Inspection items
INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
  ('mfg00000-0000-0000-0000-000000000005', 'Create FAI Plan', 'Define which characteristics will be inspected, methods, and acceptance criteria.', 'Apprentice', 1),
  ('mfg00000-0000-0000-0000-000000000005', 'Prepare Inspection Equipment', 'Calibrate measurement tools and set up inspection fixtures.', 'Apprentice', 2),
  ('mfg00000-0000-0000-0000-000000000005', 'Measure and Record Results', 'Inspect all balloon-noted dimensions and record results on FAI forms.', 'Apprentice', 3),
  ('mfg00000-0000-0000-0000-000000000005', 'Document Material Certifications', 'Collect and verify material certificates and test reports from suppliers.', 'Apprentice', 4),
  ('mfg00000-0000-0000-0000-000000000005', 'Expert Review and Approval', 'Quality expert reviews the completed FAI package and signs off. (Marketplace: Hire Expert)', 'Executive', 5);

-- ============================================================================
-- 6. SEED RFQ TEMPLATES
-- ============================================================================

INSERT INTO public.rfq_templates (title, sector, rfq_type, category, default_specifications, description, is_manufacturing, display_order) VALUES
  -- Cross-sector manufacturing templates
  ('CNC Machined Parts', NULL, 'custom', 'Custom Manufacturing', '{"fields": ["material", "quantity", "finish", "tolerances", "drawing_attached"]}', 'Request quotes for CNC machined components. Include drawings and material specs.', true, 1),
  ('3D Printed Prototypes', NULL, 'commodity', 'Prototyping', '{"fields": ["material", "quantity", "technology", "finish", "file_format"]}', 'Get quotes for additive manufacturing prototypes in various materials and processes.', true, 2),
  ('PCB Assembly (PCBA)', NULL, 'custom', 'Electronics', '{"fields": ["quantity", "board_layers", "component_count", "smt_bga", "testing_requirements"]}', 'Request quotes for printed circuit board assembly including SMT and through-hole.', true, 3),
  ('Injection Molded Parts', NULL, 'custom', 'Custom Manufacturing', '{"fields": ["material", "quantity", "part_weight", "annual_volume", "surface_finish"]}', 'Get quotes for injection molding tooling and production parts.', true, 4),
  ('Quality Testing Services', NULL, 'service', 'Quality Testing', '{"fields": ["test_type", "standards", "quantity", "turnaround"]}', 'Request quotes for testing, inspection, and certification services.', true, 5),

  -- Robotics-specific
  ('Robot Cell Components', 'robotics', 'custom', 'Components', '{"fields": ["robot_type", "payload", "reach", "components_needed"]}', 'Request quotes for robot cell components including actuators, sensors, and end effectors.', true, 10),
  ('Safety System Integration', 'robotics', 'service', 'Services', '{"fields": ["cell_description", "standards_required", "timeline"]}', 'Get quotes for safety system design and integration per ISO 10218.', true, 11),

  -- Rockets-specific
  ('Propulsion Components', 'rockets', 'custom', 'Custom Manufacturing', '{"fields": ["material", "pressure_rating", "temperature_rating", "quantity"]}', 'Request quotes for propulsion system components (chambers, injectors, valves).', true, 20),
  ('Composite Structures', 'rockets', 'custom', 'Custom Manufacturing', '{"fields": ["material_system", "layup_method", "size", "quantity"]}', 'Get quotes for composite structural components (fairings, interstages, payload adapters).', true, 21),

  -- Satellites-specific
  ('Space-Grade Electronics', 'satellites', 'custom', 'Electronics', '{"fields": ["radiation_tolerance", "temperature_range", "component_list", "quantity"]}', 'Request quotes for radiation-hardened or space-grade electronic components.', true, 30),
  ('Cleanroom Assembly Services', 'satellites', 'service', 'Assembly Services', '{"fields": ["cleanliness_class", "assembly_type", "duration", "certification"]}', 'Get quotes for cleanroom integration and test services.', true, 31),

  -- Consumer Electronics
  ('Contract Manufacturing (EMS)', 'consumer-electronics', 'custom', 'Custom Manufacturing', '{"fields": ["product_type", "annual_volume", "certifications_needed", "packaging"]}', 'Request quotes from contract manufacturers for volume production.', true, 40),
  ('Product Certification Testing', 'consumer-electronics', 'service', 'Quality Testing', '{"fields": ["standards", "markets", "product_type", "timeline"]}', 'Get quotes for CE, FCC, UL, and other product certification testing.', true, 41),

  -- Pharmaceuticals
  ('GMP Contract Manufacturing', 'pharmaceuticals', 'custom', 'Custom Manufacturing', '{"fields": ["dosage_form", "batch_size", "gmp_class", "regulatory_markets"]}', 'Request quotes for GMP pharmaceutical manufacturing services.', true, 50),
  ('Analytical Testing Services', 'pharmaceuticals', 'service', 'Quality Testing', '{"fields": ["test_types", "pharmacopeia", "sample_count", "turnaround"]}', 'Get quotes for pharmaceutical analytical testing and stability studies.', true, 51),

  -- AI Data Centres
  ('Server Rack Assembly', 'ai-datacentre', 'custom', 'Components', '{"fields": ["rack_units", "power_per_rack", "cooling_type", "quantity"]}', 'Request quotes for custom server rack assembly and integration.', true, 60),

  -- General (non-manufacturing)
  ('Hire Fractional Executive', NULL, 'service', 'People', '{"fields": ["role", "hours_per_week", "duration", "industry_experience"]}', 'Find and hire a fractional executive (CTO, CFO, CPO, etc.) for your team.', false, 100),
  ('Hire Technical Apprentice', NULL, 'service', 'People', '{"fields": ["skills_needed", "hours_per_week", "duration", "experience_level"]}', 'Find and onboard a technical apprentice for hands-on project work.', false, 101),
  ('Legal Services', NULL, 'service', 'Services', '{"fields": ["service_type", "jurisdiction", "urgency", "description"]}', 'Request quotes for IP, corporate, or regulatory legal services.', false, 110);

-- ============================================================================
-- 7. SEED MANUFACTURING MARKETPLACE LISTINGS
-- ============================================================================

-- Manufacturing experts (People category)
INSERT INTO public.marketplace_listings (id, title, description, category, subcategory, provider_type, headline, skills, day_rate, response_time, is_verified)
VALUES
  ('mfg-expert-0000-0000-000000000001', 'Manufacturing Process Engineer', 'Experienced manufacturing engineer specialising in DFM review, process validation, and production ramp. Expertise in injection molding, CNC, and sheet metal across consumer electronics and robotics.', 'People', 'Executive', 'Specialist', 'Manufacturing Excellence | DFM | Process Validation', ARRAY['DFM Review', 'Process Validation', 'Injection Molding', 'CNC Machining', 'Quality Systems'], 850, '24 hours', true),
  ('mfg-expert-0000-0000-000000000002', 'Quality Systems Expert (ISO 9001 / AS9100)', 'Certified lead auditor with 15+ years building and certifying quality management systems for hardware startups. Specialises in ISO 9001, AS9100, and ISO 13485.', 'People', 'Executive', 'Specialist', 'Quality Management | ISO Certification | Audit Ready', ARRAY['ISO 9001', 'AS9100', 'Quality Auditing', 'CAPA', 'Supplier Quality'], 900, '48 hours', true),
  ('mfg-expert-0000-0000-000000000003', 'Supply Chain Strategist', 'Deep tech supply chain expert. Helps startups build resilient supply chains, qualify suppliers, and negotiate manufacturing contracts. Experience in aerospace, robotics, and consumer hardware.', 'People', 'Executive', 'Specialist', 'Supply Chain | Sourcing | Supplier Qualification', ARRAY['Supply Chain', 'Sourcing', 'Supplier Audit', 'Cost Engineering', 'Risk Management'], 800, '24 hours', true),
  ('mfg-expert-0000-0000-000000000004', 'Manufacturing Apprentice - Mechanical', 'Hands-on apprentice skilled in CAD, GD&T interpretation, inspection, and factory floor support. Ready to assist with DFM documentation, FAI, and supplier coordination.', 'People', 'Apprentice', 'Apprentice', 'CAD | GD&T | Inspection | Factory Support', ARRAY['SolidWorks', 'GD&T', 'Inspection', 'FAI', 'Documentation'], 250, '4 hours', false),
  ('mfg-expert-0000-0000-000000000005', 'Manufacturing Apprentice - Electronics', 'Electronics apprentice with PCB layout, testing, and assembly experience. Supports PCBA bring-up, test fixture development, and production documentation.', 'People', 'Apprentice', 'Apprentice', 'PCB Layout | Test Development | Assembly', ARRAY['PCB Layout', 'Soldering', 'Test Fixtures', 'Documentation', 'Component Sourcing'], 250, '4 hours', false)
ON CONFLICT (id) DO NOTHING;

-- Manufacturing services (Services category)
INSERT INTO public.marketplace_listings (id, title, description, category, subcategory, provider_type, headline, skills, day_rate, response_time, is_verified)
VALUES
  ('mfg-svc-0000-0000-000000000001', 'DFM Review Service', 'Comprehensive Design for Manufacturing review for your product. We analyse your CAD, BOM, and specifications to identify manufacturing risks, cost savings, and process improvements.', 'Services', 'Manufacturing', 'Specialist', 'DFM Analysis | Cost Reduction | Risk Mitigation', ARRAY['DFM', 'Tolerance Analysis', 'Material Selection', 'Cost Engineering'], 1200, '48 hours', true),
  ('mfg-svc-0000-0000-000000000002', 'Production Readiness Assessment', 'End-to-end assessment of your production readiness. Reviews tooling, process validation, supply chain, and quality systems to confirm you are ready for volume manufacturing.', 'Services', 'Manufacturing', 'Specialist', 'Production Readiness | Process Validation | Quality', ARRAY['Process Validation', 'Quality Systems', 'Supply Chain', 'Production Planning'], 1500, '72 hours', true),
  ('mfg-svc-0000-0000-000000000003', 'Supplier Audit & Qualification', 'On-site or remote supplier audits covering quality systems, capacity, financial stability, and compliance. Delivers detailed audit report with risk rating and recommendations.', 'Services', 'Manufacturing', 'Specialist', 'Supplier Audit | Quality Assessment | Risk Rating', ARRAY['Supplier Audit', 'Quality Assessment', 'Risk Management', 'Compliance'], 1000, '1 week', true)
ON CONFLICT (id) DO NOTHING;

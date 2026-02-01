# Agent Handover Document
**Date:** January 31, 2026
**Task:** Create 4 new industry blueprint templates (Rockets, Satellites, AI Data Centres, Pharmaceuticals)
**Status:** Planning complete, implementation ready to start

---

## Context

The user requested investigation of the existing blueprint system and creation of 4 new industry-specific blueprint templates. I analysed the existing system, understood the data structures, and created a comprehensive plan. **Important: Centaur Dynamics is UK-based, so all regulatory domains must include UK and EU regulations. For space-related blueprints, note that much of EU space law is based in Luxembourg.**

---

## COMPLETED ✅

### Investigation & Analysis
- Explored the complete blueprint system architecture
- Identified data structures in `src/types/blueprints.ts`
- Found existing templates in `supabase/migrations/20260131300001_seed_blueprint_templates.sql`
- Documented the 4 existing templates: Consumer Electronics, SaaS Platform, Robotics & Automation, Mobile Application

### Planning
- Designed domain hierarchies for all 4 new templates
- Identified ~265 total domains across the 4 templates
- Planned UUID scheme (00000005 for rockets, 00000006 for satellites, 00000007 for AI data centres, 00000008 for pharmaceuticals)
- User approved the plan

---

## KEY FILES

| File | Purpose |
|------|---------|
| `src/types/blueprints.ts` | TypeScript types for blueprints, domains, coverage |
| `supabase/migrations/20260131300001_seed_blueprint_templates.sql` | Existing 4 template definitions - **USE AS REFERENCE FORMAT** |
| `supabase/migrations/20260131300000_blueprints.sql` | Database schema for blueprint tables |
| `src/actions/blueprints.ts` | Server actions for blueprint CRUD |
| `src/components/blueprints/` | UI components for blueprints |

---

## REMAINING TASKS 🔧

### Priority 1: Create SQL Migration for New Templates

**Problem:** Need to create a new SQL migration file with 4 new blueprint templates and their knowledge domains

**File to create:** `supabase/migrations/20260131300002_seed_new_blueprint_templates.sql`

**Approach:**
1. Copy the format from `20260131300001_seed_blueprint_templates.sql`
2. Create 4 template records in `blueprint_templates` table
3. Create hierarchical `knowledge_domains` records for each template

---

## THE 4 NEW TEMPLATES TO CREATE

### Template 1: Rockets & Launch Vehicles (`00000005-0000-4000-8000-000000000001`)
**Slug:** `rockets` | **Icon:** `rocket` | **~65 domains**
**Tags:** `space`, `aerospace`, `propulsion`, `launch`

**Domain Hierarchy:**

| ID Prefix | Category | Root Domain | Critical Sub-domains |
|-----------|----------|-------------|----------------------|
| 1xxx | Propulsion | Propulsion Systems | Liquid Engines, Solid Motors, Turbopumps, Combustion Chambers, Nozzle Design, Fuel Systems, Ignition Systems |
| 2xxx | Structures | Vehicle Structures | Airframe Design, Propellant Tanks, Interstage, Fairing Design, Materials Selection, Loads Analysis, Thermal Protection (TPS) |
| 3xxx | Avionics | Avionics & Electronics | Flight Computers, Power Systems, Telemetry, RF Communications, Sensors & Instrumentation, Pyrotechnics |
| 4xxx | GNC | Guidance Navigation & Control | GNC Algorithms, Trajectory Design, Attitude Control, Inertial Navigation, GPS Integration, Thrust Vector Control |
| 5xxx | Software | Flight Software | Embedded Software, Simulation & Modeling, Mission Planning, Data Processing, Ground Software |
| 6xxx | Manufacturing | Manufacturing & Test | Composite Fabrication, Welding & Metalwork, Assembly & Integration, Static Fire Testing, Engine Testing, Environmental Testing |
| 7xxx | Regulatory | **Regulatory & Compliance** | **UK Space Agency Licensing**, **CAA Regulations**, **EU Space Regulation**, **Luxembourg Space Law**, ITAR/Export Control, Range Safety, Environmental Impact, Insurance Requirements |
| 8xxx | Business | Business & Operations | Launch Services, Pricing Model, Customer Contracts, Range Operations, Ground Support Equipment |

**Key Regulatory Questions to Include:**
- "Have you engaged with the UK Space Agency for launch licensing?"
- "What is your approach to EU space debris mitigation requirements?"
- "Have you considered Luxembourg as a licensing jurisdiction?"
- "What ITAR/export control classifications apply to your technology?"

---

### Template 2: Satellites & Spacecraft (`00000006-0000-4000-8000-000000000001`)
**Slug:** `satellites` | **Icon:** `satellite` | **~70 domains**
**Tags:** `space`, `aerospace`, `orbital`, `spacecraft`

**Domain Hierarchy:**

| ID Prefix | Category | Root Domain | Critical Sub-domains |
|-----------|----------|-------------|----------------------|
| 1xxx | Payload | Payload Systems | Imaging Sensors (EO/IR), Communications Payload, Scientific Instruments, Antenna Systems, Data Processing Unit |
| 2xxx | Bus | Spacecraft Bus | Structure & Mechanisms, Attitude Determination & Control (ADCS), Propulsion (electric/chemical), Thermal Control, Harness & Connectors |
| 3xxx | Power | Power Systems | Solar Arrays, Batteries (Li-ion), Power Distribution Unit, Power Management, Eclipse Operations |
| 4xxx | Comms | Communications & Data | Ground Station Network, Link Budget Analysis, Frequency Coordination, Data Downlink, Command & Telemetry, Inter-Satellite Links |
| 5xxx | Software | Software & Flight Systems | Flight Software, Fault Detection & Recovery, Autonomous Operations, Ground Segment Software, Mission Planning |
| 6xxx | Manufacturing | Manufacturing & AIT | Cleanroom Operations, Integration & Test, Environmental Testing (TVAC, vibration), Launch Integration, Shipping & Handling |
| 7xxx | Regulatory | **Regulatory & Licensing** | **UK Space Agency Operator License**, **Ofcom Spectrum Licensing**, **ITU Coordination (Luxembourg)**, **EU Space Surveillance**, Debris Mitigation (25-year rule), Export Control, Third-Party Liability |
| 8xxx | Operations | Mission Operations | Mission Control Centre, Spacecraft Operations, Anomaly Response, Constellation Management, End-of-Life Disposal |

**Key Regulatory Questions to Include:**
- "Have you applied for a UK Outer Space Act license?"
- "What is your ITU filing strategy (consider Luxembourg for EU filings)?"
- "Have you obtained Ofcom authorization for your frequencies?"
- "What is your debris mitigation and end-of-life disposal plan?"

---

### Template 3: AI Data Centres (`00000007-0000-4000-8000-000000000001`)
**Slug:** `ai-datacentre` | **Icon:** `server-cog` | **~55 domains**
**Tags:** `infrastructure`, `AI`, `computing`, `cloud`

**Domain Hierarchy:**

| ID Prefix | Category | Root Domain | Critical Sub-domains |
|-----------|----------|-------------|----------------------|
| 1xxx | Compute | Compute Infrastructure | GPU Clusters (NVIDIA H100/B200), TPU/ASIC Systems, CPU Servers, High-Bandwidth Memory, Storage Systems (NVMe, object storage) |
| 2xxx | Power | Power Infrastructure | Power Delivery Architecture, UPS Systems, Backup Generators, Power Distribution Units (PDU), Power Usage Effectiveness (PUE), Grid Connection |
| 3xxx | Cooling | Cooling Systems | Direct Liquid Cooling (DLC), Rear-Door Heat Exchangers, Immersion Cooling, CRAC/CRAH Units, Hot/Cold Aisle Containment, Chillers & Cooling Towers |
| 4xxx | Network | Network Infrastructure | High-Speed Interconnects (InfiniBand, RoCE), Network Switches (400GbE), Structured Cabling, Network Topology (spine-leaf), Load Balancing |
| 5xxx | Software | Software Platform | ML Frameworks (PyTorch, JAX), Cluster Orchestration (Kubernetes, Slurm), Model Serving (Triton, vLLM), Monitoring & Observability, Data Pipeline (ETL) |
| 6xxx | Security | Security & Access | Physical Security, Cybersecurity (SOC), Access Control (biometric), DDoS Protection, Compliance Monitoring, Incident Response |
| 7xxx | Regulatory | **Regulatory & Compliance** | **UK Planning Permission**, **UK Building Regulations**, **UK Grid Connection (National Grid ESO)**, **EU AI Act Compliance**, **UK/EU GDPR**, Energy Efficiency Regulations, Environmental Impact Assessment |
| 8xxx | Business | Business & Operations | Site Selection, Capacity Planning, Customer Contracts, SLA Management, Pricing Models, Sustainability Reporting |

**Key Regulatory Questions to Include:**
- "Have you obtained UK planning permission for the data centre?"
- "What is your grid connection agreement with National Grid ESO?"
- "How does your facility comply with UK GDPR and EU GDPR?"
- "What is your approach to EU AI Act compliance for hosted models?"

---

### Template 4: Pharmaceuticals & Drug Development (`00000008-0000-4000-8000-000000000001`)
**Slug:** `pharmaceuticals` | **Icon:** `pill` | **~75 domains**
**Tags:** `healthcare`, `biotech`, `drug`, `clinical`

**Domain Hierarchy:**

| ID Prefix | Category | Root Domain | Critical Sub-domains |
|-----------|----------|-------------|----------------------|
| 1xxx | Discovery | Drug Discovery | Target Identification & Validation, Lead Optimization, High-Throughput Screening, Medicinal Chemistry, Biologics Discovery (mAbs, ADCs), Computational Drug Design |
| 2xxx | Preclinical | Preclinical Development | Toxicology Studies (GLP), Pharmacology, Formulation Development, ADME Studies, Animal Models, Biomarker Development |
| 3xxx | Clinical | Clinical Development | Phase I Trials (First-in-Human), Phase II Trials, Phase III Trials, Biostatistics, CRO Management, Patient Recruitment, Clinical Operations |
| 4xxx | Manufacturing | Manufacturing (CMC) | API Synthesis (small molecule), Biologics Manufacturing, Formulation & Drug Product, Fill/Finish, Packaging & Labeling, Scale-up & Tech Transfer, Process Development |
| 5xxx | Quality | Quality & Compliance | GMP Compliance, Quality Assurance, Quality Control (analytical), Validation (process, cleaning, computer), Stability Studies (ICH), Deviation & CAPA Management |
| 6xxx | Regulatory | **Regulatory Affairs** | **MHRA (UK) Submissions**, **EMA (EU) Submissions**, **IMPD/CTA for Clinical Trials**, **Marketing Authorisation (UK/EU)**, Labeling Requirements, Post-Market Surveillance, Pharmacovigilance |
| 7xxx | Commercial | Commercial Operations | Market Access, **NICE/SMC Health Technology Assessment**, Pricing & Reimbursement, Medical Affairs, Distribution & Cold Chain, Key Opinion Leader Management |
| 8xxx | IP | Intellectual Property | Patent Strategy, Freedom to Operate, Data Exclusivity, Supplementary Protection Certificates (SPC) |

**Key Regulatory Questions to Include:**
- "Have you submitted a Clinical Trial Authorisation (CTA) to MHRA?"
- "What is your EMA centralised vs national procedure strategy?"
- "Have you engaged with NICE for health technology assessment?"
- "What is your pharmacovigilance system for UK/EU?"

---

## SQL FORMAT REFERENCE

Use this format from the existing migration (see `20260131300001_seed_blueprint_templates.sql`):

```sql
-- Template record
INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000005-0000-4000-8000-000000000001',
    'Rockets & Launch Vehicles',
    'For orbital and suborbital launch vehicles, rocket engines, and launch services',
    'rockets',
    'rocket',
    65,
    200,
    true,
    '{"tags": ["space", "aerospace", "propulsion", "launch"], "difficulty": "advanced"}'
);

-- Domain records (hierarchical)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
-- Root domain (depth 0, no parent)
('00000005-1000-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', NULL, 'Propulsion Systems', 'Rocket propulsion and engines', 'Electronics', 0, 1, 'critical', '[]', ARRAY['Propulsion Engineer'], NULL),

-- Child domain (depth 1, has parent)
('00000005-1100-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1000-4000-8000-000000000001', 'Liquid Engines', 'Liquid-fueled rocket engines', 'Electronics', 1, 1, 'critical',
 '[{"id": "le1", "question": "What propellant combination (LOX/RP-1, LOX/LH2, hypergolic)?", "context": "Affects performance, handling, and infrastructure"}, {"id": "le2", "question": "What is your target thrust level?", "context": "Determines engine size and complexity"}]',
 ARRAY['Propulsion Engineer', 'Combustion Engineer'], '8-12 weeks'),

-- Grandchild domain (depth 2)
('00000005-1110-4000-8000-000000000001', '00000005-0000-4000-8000-000000000001', '00000005-1100-4000-8000-000000000001', 'Turbopumps', 'Turbomachinery for propellant delivery', 'Electronics', 2, 1, 'critical',
 '[{"id": "tp1", "question": "What pump type (centrifugal, axial)?", "context": "Affects performance and complexity"}]',
 ARRAY['Turbomachinery Engineer'], '12-16 weeks');
```

**UUID Scheme:**
- Template ID: `0000000X-0000-4000-8000-000000000001` (X = 5,6,7,8)
- Domain IDs: `0000000X-YYYY-4000-8000-000000000001`
  - YYYY = 1000, 2000, 3000... for root domains
  - YYYY = 1100, 1200... for level-1 children
  - YYYY = 1110, 1120... for level-2 grandchildren

---

## USEFUL COMMANDS

```bash
# Apply migration to local Supabase
supabase db push

# Or run migration directly
supabase migration up

# Check TypeScript types
npx tsc --noEmit

# Start dev server to test
npm run dev
```

---

## QUICK START FOR NEXT AGENT

1. **Read this document** and understand the 4 template structures above
2. **Read the reference file** `supabase/migrations/20260131300001_seed_blueprint_templates.sql` for exact SQL format
3. **Create new migration** `supabase/migrations/20260131300002_seed_new_blueprint_templates.sql`
4. **Start with Template 1 (Rockets)** - copy format from existing, create template record + all domains
5. **Continue with Templates 2, 3, 4** in order
6. **Include UK/EU regulatory focus** in all regulatory domains (MHRA, UKSA, Ofcom, NICE, EMA, etc.)
7. **Test by running migration** and verifying templates appear in the app

---

## IMPORTANT NOTES

- **UK-Based Company**: All regulatory domains MUST include UK agencies (MHRA, UKSA, Ofcom, NICE, CAA, etc.) and EU equivalents (EMA, ESA, etc.)
- **Luxembourg Space Law**: For space templates, include Luxembourg as a jurisdiction option (many space companies use Luxembourg for EU satellite filings and ITU coordination)
- **Categories**: Use existing categories from `DomainCategory` type: `Electronics`, `Mechanical`, `Software`, `Manufacturing`, `Regulatory`, `Business`, `Operations`
- **Key Questions**: Each leaf domain should have 2-5 key questions with context
- **Typical Roles**: Include relevant job titles for each domain
- **Criticality**: Mark propulsion, structures, avionics, GNC as `critical` for space; core compliance as `critical` for pharma

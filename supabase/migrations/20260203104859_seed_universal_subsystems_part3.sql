-- =============================================
-- Seed Universal Subsystems Part 3
-- Regulatory and Operations
-- =============================================

-- =============================================
-- REGULATORY SUBSYSTEMS (17-19)
-- =============================================

-- 17. Certification & Compliance
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000017',
    'Certification & Compliance',
    'certification-compliance',
    'Getting permission: regulatory approval, standards compliance, and type certification',
    'Certification and compliance ensure your product meets regulatory requirements and can legally be sold and operated. This includes product safety certification (CE, FCC, UL), industry-specific approvals (FAA, FDA), and environmental compliance (RoHS, REACH). Certification is often on the critical path to market.',
    'Regulatory',
    'FileCheck',
    17,
    '{
        "overview": "Every product must meet certain regulatory requirements to be sold. These requirements vary by product type, industry, and geography. Common examples include CE marking for European markets, FCC certification for radio devices in the US, and FAA certification for aircraft.\n\nCertification processes range from self-declaration (CE for many products) to extensive type certification programs (new aircraft designs). Understanding the certification path early is critical because it affects design decisions, testing requirements, and timeline.\n\nWorking with certification bodies, Designated Engineering Representatives (DERs), and compliance consultants can accelerate the process and avoid expensive mistakes.",
        "why_it_matters": "You cannot sell uncertified products. Certification can take months to years. Design decisions made early affect certification path and cost.",
        "key_concepts": [
            "Type certification: Formal approval that design meets requirements",
            "Conformity assessment: Process to demonstrate compliance",
            "Standards: Published requirements (DO-178C, IEC 61508, etc.)",
            "Designated Engineering Representative: FAA-authorized approval authority",
            "CE marking: European conformity declaration",
            "Certification basis: Specific requirements that apply to your product"
        ],
        "decision_points": [
            "Certification path: Which certifications are required for your markets",
            "Standards selection: Which standards to certify against",
            "Timeline: Serial vs parallel certification activities",
            "Internal vs external: Build certification capability vs use consultants",
            "Design decisions: Accept constraints that simplify certification"
        ],
        "common_mistakes": [
            "Assuming certification can happen at the end of development",
            "Not understanding certification basis before design",
            "Underestimating documentation requirements",
            "Not engaging certification authorities early",
            "Making design changes without understanding certification impact"
        ],
        "success_indicators": [
            "Certification basis documented and agreed with authorities",
            "Compliance matrix shows requirements coverage",
            "Certification schedule integrated with development schedule",
            "Documentation standards established from project start",
            "Relationships established with certification authorities"
        ],
        "terminology": {
            "TC": "Type Certificate - approval of design",
            "DER": "Designated Engineering Representative",
            "STC": "Supplemental Type Certificate",
            "DAH": "Design Approval Holder",
            "EMC": "Electromagnetic Compatibility",
            "NRTL": "Nationally Recognized Testing Laboratory"
        }
    }'::jsonb,
    '[
        {"id": "cert-1", "question": "What certifications are required for your target markets?", "context": "Different markets have different requirements. Know your market entry requirements.", "difficulty": "basic"},
        {"id": "cert-2", "question": "What is your certification timeline?", "context": "Some certifications take 2+ years. Start early.", "difficulty": "basic"},
        {"id": "cert-3", "question": "What standards will you certify against?", "context": "Standards choice affects design, testing, and documentation.", "difficulty": "intermediate"},
        {"id": "cert-4", "question": "Do you need external certification support (DERs, consultants)?", "context": "External experts can accelerate process but cost money.", "difficulty": "intermediate"},
        {"id": "cert-5", "question": "How will design changes be managed during certification?", "context": "Changes during certification can reset progress. Have a process.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "Introduction to Systems Engineering", "url": "https://www.coursera.org/", "provider": "UNSW"},
            {"title": "Product Development and Management", "url": "https://www.coursera.org/", "provider": "University of Virginia"}
        ],
        "books": [
            {"title": "Certification of Aircraft", "author": "EASA/FAA", "description": "Official certification guidance"},
            {"title": "IEC 61508 Explained", "author": "Safety systems standard guide", "description": "Functional safety standard"}
        ]
    }'::jsonb,
    ARRAY['regulatory', 'certification', 'compliance', 'aerospace'],
    ARRAY['Regulatory Affairs Manager', 'VP Engineering', 'Chief Engineer'],
    ARRAY['service']
);

-- Certification Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000017',
    'Develop Certification Strategy',
    'Identify requirements, establish certification basis, and create compliance roadmap',
    'This objective guides you through developing your certification strategy. You''ll identify required certifications, establish the certification basis, and create a roadmap for compliance.',
    'advanced',
    '4-8 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Identify certification requirements",
            "description": "Map certification landscape:\n\n**By Market:**\n- US requirements (FCC, FAA, UL, etc.)\n- European requirements (CE, EASA, etc.)\n- Other target markets\n\n**By Product Type:**\n- Safety certifications\n- EMC certifications\n- Industry-specific approvals\n- Environmental compliance\n\n**Deliverable:** Certification requirements matrix.",
            "role": "Executive",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Establish certification basis and standards",
            "description": "Define certification approach:\n\n**Certification Basis:**\n- Applicable regulations\n- Standards to comply with\n- Means of compliance\n- Exemptions or special conditions\n\n**Standards Selection:**\n- Safety standards (DO-178C, etc.)\n- EMC standards (FCC Part 15, etc.)\n- Environmental standards (RoHS, REACH)\n\n**Deliverable:** Certification basis document.",
            "role": "AI_Agent",
            "estimated_hours": 20,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Create compliance matrix and roadmap",
            "description": "Plan certification activities:\n\n**Compliance Matrix:**\n- Each requirement\n- Means of compliance\n- Evidence required\n- Responsible party\n\n**Certification Roadmap:**\n- Milestones and gates\n- Testing requirements\n- Documentation deliverables\n- Authority engagement points\n\n**Deliverable:** Compliance matrix and roadmap.",
            "role": "Apprentice",
            "estimated_hours": 24,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find certification expert on marketplace",
            "description": "Engage a certification specialist:\n\n**Expertise Areas:**\n- Regulatory affairs\n- Industry-specific certification (aerospace, medical, etc.)\n- DER services\n- Compliance documentation\n\n**Deliverable:** Expert certification strategy review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["regulatory", "certification", "aerospace"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source certification services",
            "description": "Find certification support:\n\n**Services:**\n- Testing laboratories (EMC, safety)\n- DER and DAR services\n- Certification consultants\n- Documentation support\n\n**Deliverable:** Certification service provider list.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["regulatory", "certification", "testing"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 18. Safety Systems
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000018',
    'Safety Systems',
    'safety-systems',
    'Keeping people safe: hazard analysis, risk mitigation, and safety design',
    'Safety systems identify and mitigate hazards to prevent injury, death, or major damage. This includes system safety analysis (hazard identification, risk assessment), safety-critical design (redundancy, fail-safes), and operational safety procedures. Safety is not just ethics - it''s often legally required.',
    'Regulatory',
    'ShieldCheck',
    18,
    '{
        "overview": "Safety engineering systematically identifies what can go wrong and implements measures to prevent or mitigate harm. For autonomous systems, safety is particularly important because there''s no human operator to catch problems.\n\nThe safety process starts with hazard analysis - identifying all the ways the system could cause harm. Each hazard is assessed for severity and likelihood, then mitigation measures are designed. This continues throughout development and operations.\n\nSafety-critical functions require special design approaches: redundancy, monitoring, fail-safe modes, and sometimes formal verification. The level of rigor depends on the criticality of the function.",
        "why_it_matters": "Safety failures can kill people, destroy companies, and set back entire industries. Safety is a legal and ethical requirement. Good safety engineering enables rather than constrains innovation.",
        "key_concepts": [
            "Hazard: Condition that could lead to harm",
            "Risk: Combination of severity and probability",
            "Mitigation: Action to reduce risk",
            "Safety-critical: Function whose failure could cause harm",
            "Fail-safe: Design that fails to a safe state",
            "Independence: Separation between systems for redundancy"
        ],
        "decision_points": [
            "Safety standards: Which safety standards apply (DO-254, IEC 61508, etc.)",
            "Criticality levels: How to assign DAL/SIL to functions",
            "Mitigation approach: Eliminate, reduce, or accept with controls",
            "Redundancy architecture: Hot/cold standby, voting, dissimilar",
            "Safety case: How to document safety argumentation"
        ],
        "common_mistakes": [
            "Treating safety as a documentation exercise, not design discipline",
            "Not identifying hazards until late in development",
            "Assuming redundancy provides independence",
            "Not testing safety-critical functions to failure",
            "Underestimating common cause failures"
        ],
        "success_indicators": [
            "Hazard analysis complete and maintained",
            "Safety requirements traced through design and test",
            "Safety-critical functions designed with appropriate rigor",
            "Independent safety review completed",
            "Residual risks documented and accepted at appropriate level"
        ],
        "terminology": {
            "FMEA": "Failure Modes and Effects Analysis",
            "FTA": "Fault Tree Analysis",
            "DAL": "Design Assurance Level (DO-178C)",
            "SIL": "Safety Integrity Level (IEC 61508)",
            "HAZOP": "Hazard and Operability Study",
            "Residual risk": "Risk remaining after mitigations"
        }
    }'::jsonb,
    '[
        {"id": "safe-1", "question": "What hazards can your system cause?", "context": "Systematic hazard identification is the foundation of safety.", "difficulty": "basic"},
        {"id": "safe-2", "question": "What safety standards apply to your product?", "context": "DO-178C, IEC 61508, ISO 26262 have different requirements.", "difficulty": "basic"},
        {"id": "safe-3", "question": "What are your safety-critical functions?", "context": "These need special design and verification rigor.", "difficulty": "intermediate"},
        {"id": "safe-4", "question": "What is your redundancy and fail-safe strategy?", "context": "How the system fails when things go wrong.", "difficulty": "intermediate"},
        {"id": "safe-5", "question": "How will you demonstrate safety to regulators/customers?", "context": "Safety cases, analysis reports, test results.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "courses": [
            {"title": "System Safety Engineering", "url": "https://www.udemy.com/", "provider": "Various"},
            {"title": "Functional Safety", "url": "https://www.coursera.org/", "provider": "TU Munich"}
        ],
        "books": [
            {"title": "System Safety Engineering and Risk Assessment", "author": "Bahr", "description": "Comprehensive system safety guide"},
            {"title": "Engineering a Safer World", "author": "Nancy Leveson", "description": "Modern systems thinking for safety"}
        ]
    }'::jsonb,
    ARRAY['safety', 'regulatory', 'aerospace', 'automotive'],
    ARRAY['Safety Engineer', 'Chief Engineer', 'VP Engineering'],
    ARRAY['service']
);

-- Safety Systems Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000018',
    'Implement Safety Program',
    'Conduct hazard analysis, design safety features, and build safety case',
    'This objective guides you through implementing a safety program for your product. You''ll conduct hazard analysis, design safety features, and build the documentation to demonstrate safety.',
    'advanced',
    '8-12 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Conduct preliminary hazard analysis",
            "description": "Identify system hazards:\n\n**Hazard Identification:**\n- Brainstorm potential hazards\n- Review similar systems for lessons\n- Consider all lifecycle phases\n- Include software and hardware hazards\n\n**For Each Hazard:**\n- Description and cause\n- Potential effects\n- Preliminary severity assessment\n- Initial mitigation ideas\n\n**Deliverable:** Preliminary hazard list.",
            "role": "Executive",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Perform detailed hazard analysis and risk assessment",
            "description": "Analyze risks:\n\n**Analysis Methods:**\n- FMEA for component failures\n- FTA for critical events\n- HAZOP for operational hazards\n\n**Risk Assessment:**\n- Severity classification\n- Probability estimation\n- Risk ranking\n- Mitigation requirements\n\n**Deliverable:** Hazard analysis report with risk matrix.",
            "role": "AI_Agent",
            "estimated_hours": 32,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Design and verify safety mitigations",
            "description": "Implement safety:\n\n**Safety Design:**\n- Safety architecture\n- Redundancy implementation\n- Fail-safe modes\n- Safety monitoring\n\n**Verification:**\n- Safety requirements\n- Test cases for safety functions\n- Analysis for untestable cases\n- Independent review\n\n**Deliverable:** Safety design documentation.",
            "role": "Apprentice",
            "estimated_hours": 48,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find safety expert on marketplace",
            "description": "Engage a safety specialist:\n\n**Expertise Areas:**\n- System safety analysis\n- Functional safety standards\n- Safety cases and argumentation\n- Regulatory safety requirements\n\n**Deliverable:** Expert safety review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["safety", "regulatory", "aerospace"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source safety analysis services",
            "description": "Find safety support:\n\n**Services:**\n- Safety analysis support\n- Independent safety assessment\n- Tool qualification\n- Training\n\n**Deliverable:** Safety service provider list.",
            "role": "Apprentice",
            "estimated_hours": 6,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["safety", "regulatory"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- 19. Environmental Compliance
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000019',
    'Environmental Compliance',
    'environmental-compliance',
    'Going green: hazardous materials, emissions, and environmental regulations',
    'Environmental compliance ensures your product meets regulations governing hazardous materials, emissions, and environmental impact. This includes RoHS/REACH compliance for materials, emissions regulations, and increasingly ESG (Environmental, Social, Governance) requirements. Non-compliance can block market access.',
    'Regulatory',
    'Leaf',
    19,
    '{
        "overview": "Environmental regulations restrict hazardous substances, limit emissions, and require responsible end-of-life handling. The European RoHS and REACH regulations are the most impactful, restricting substances like lead, cadmium, and certain chemicals in products sold in Europe.\n\nCompliance requires understanding what''s in your product down to the component level. This means collecting material declarations from all suppliers and maintaining a database of substances. It''s a supply chain challenge as much as a technical one.\n\nBeyond regulations, customers and investors increasingly expect ESG (Environmental, Social, Governance) performance. Sustainability is becoming a competitive differentiator.",
        "why_it_matters": "Non-compliance blocks market access. Supply chain due diligence is legally required. ESG performance affects funding and customer decisions.",
        "key_concepts": [
            "RoHS: Restriction of Hazardous Substances - EU directive",
            "REACH: Registration, Evaluation, Authorization of Chemicals - EU regulation",
            "SVHC: Substances of Very High Concern - REACH restricted list",
            "Material declaration: Documentation of substances in components",
            "Conflict minerals: Tin, tantalum, tungsten, gold from conflict regions",
            "ESG: Environmental, Social, Governance performance metrics"
        ],
        "decision_points": [
            "Compliance scope: Which markets and regulations apply",
            "Material data collection: How to get declarations from suppliers",
            "Lead-free strategy: Some exemptions still allow lead",
            "End-of-life: WEEE compliance and take-back programs",
            "ESG commitment: What sustainability goals to set"
        ],
        "common_mistakes": [
            "Assuming suppliers are compliant without verification",
            "Not tracking material changes in components over time",
            "Ignoring conflict minerals requirements",
            "Waiting until production to address compliance",
            "Not documenting compliance evidence for audits"
        ],
        "success_indicators": [
            "Material declarations collected from all suppliers",
            "Compliance status tracked for all BOM items",
            "Non-compliant materials identified with alternatives",
            "Documentation ready for customer due diligence requests",
            "Process for ongoing compliance monitoring established"
        ],
        "terminology": {
            "RoHS": "Restriction of Hazardous Substances",
            "REACH": "Registration, Evaluation, Authorization of Chemicals",
            "WEEE": "Waste Electrical and Electronic Equipment directive",
            "IPC-1752": "Material declaration standard",
            "Full material disclosure": "Complete substance breakdown",
            "Prop 65": "California''s Safe Drinking Water Act"
        }
    }'::jsonb,
    '[
        {"id": "env-1", "question": "Which environmental regulations apply to your product?", "context": "RoHS/REACH for EU, Prop 65 for California, others for specific markets.", "difficulty": "basic"},
        {"id": "env-2", "question": "Do you have material declarations from all suppliers?", "context": "Cannot verify compliance without substance data.", "difficulty": "basic"},
        {"id": "env-3", "question": "Do any components contain restricted substances?", "context": "Some exemptions exist. Need to track and plan for phase-outs.", "difficulty": "intermediate"},
        {"id": "env-4", "question": "What are your conflict minerals obligations?", "context": "SEC reporting required for public companies. Due diligence for all.", "difficulty": "intermediate"},
        {"id": "env-5", "question": "What ESG commitments are expected by customers/investors?", "context": "Sustainability increasingly required for B2B and fundraising.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "resources": [
            {"title": "European Chemicals Agency (ECHA)", "url": "https://echa.europa.eu/", "description": "Official REACH guidance"},
            {"title": "IPC-1752A Standard", "url": "https://www.ipc.org/", "description": "Material declaration format"}
        ]
    }'::jsonb,
    ARRAY['regulatory', 'compliance', 'environmental'],
    ARRAY['Compliance Manager', 'VP Operations', 'Sustainability Lead'],
    ARRAY['service']
);

-- Environmental Compliance Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000019',
    'Achieve Environmental Compliance',
    'Collect material data, verify compliance, and establish ongoing monitoring',
    'This objective guides you through achieving environmental compliance for your product. You''ll collect material declarations, verify compliance status, and establish processes for ongoing monitoring.',
    'intermediate',
    '4-6 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Identify applicable environmental regulations",
            "description": "Map regulatory requirements:\n\n**By Market:**\n- EU: RoHS, REACH, WEEE\n- US: Prop 65, TSCA, conflict minerals\n- Other target markets\n\n**Requirements:**\n- Substance restrictions\n- Documentation requirements\n- Labeling requirements\n- Reporting obligations\n\n**Deliverable:** Environmental compliance requirements matrix.",
            "role": "Executive",
            "estimated_hours": 8,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Collect material declarations from suppliers",
            "description": "Gather compliance data:\n\n**For Each Supplier:**\n- Request IPC-1752 or equivalent declaration\n- Request RoHS compliance statement\n- Request REACH SVHC disclosure\n- Request conflict minerals data\n\n**Data Management:**\n- Track response status\n- File declarations systematically\n- Flag non-responses and gaps\n\n**Deliverable:** Material declaration database.",
            "role": "Apprentice",
            "estimated_hours": 24,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Analyze compliance status and gaps",
            "description": "Assess compliance:\n\n**Analysis:**\n- Check each BOM item against restrictions\n- Identify restricted substances present\n- Evaluate exemption applicability\n- Flag items needing alternatives\n\n**Gap Closure:**\n- Identify alternative components\n- Plan for exemption sunsets\n- Document compliance evidence\n\n**Deliverable:** Compliance status report with gap closure plan.",
            "role": "AI_Agent",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find environmental compliance expert on marketplace",
            "description": "Engage a compliance specialist:\n\n**Expertise Areas:**\n- RoHS/REACH compliance\n- Material data management\n- Conflict minerals due diligence\n- ESG reporting\n\n**Deliverable:** Expert compliance review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["regulatory", "compliance", "environmental"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source compliance management tools",
            "description": "Find compliance resources:\n\n**Tools:**\n- Compliance database software\n- Material declaration portals\n- SVHC screening tools\n\n**Services:**\n- Third-party testing\n- Compliance audits\n- Declaration collection services\n\n**Deliverable:** Compliance tools and services selected.",
            "role": "Apprentice",
            "estimated_hours": 6,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["regulatory", "compliance"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- =============================================
-- OPERATIONS SUBSYSTEMS (20)
-- =============================================

-- 20. Operations & Support
INSERT INTO public.universal_subsystems (
    id, name, slug, tagline, description, category, icon_name, display_order,
    primer, key_questions, learning_resources,
    marketplace_categories, recommended_executive_roles, recommended_supplier_types
) VALUES (
    '10000001-0000-4000-8000-000000000020',
    'Operations & Support',
    'operations-support',
    'Keeping it running: maintenance, field support, and operational efficiency',
    'Operations and support encompasses everything needed to keep your product working in the field. This includes maintenance procedures, spare parts strategy, field service, customer support, and operational data analysis. Good operations design starts during product development, not after launch.',
    'Operations',
    'Wrench',
    20,
    '{
        "overview": "Operations is where the product actually delivers value. All the engineering effort culminates in products that work reliably in the field, are maintainable when issues arise, and continuously improve based on operational experience.\n\nDesigning for operations means considering supportability from the start: access for maintenance, diagnostic capabilities, training requirements, and spare parts strategy. Products designed without operations input are often difficult and expensive to support.\n\nOperational data is increasingly valuable. Telemetry from deployed products enables predictive maintenance, performance optimization, and product improvement. Plan for data collection and analysis from the beginning.",
        "why_it_matters": "Operations cost often exceeds development cost over product lifetime. Poor supportability creates customer dissatisfaction. Operational data drives competitive advantage.",
        "key_concepts": [
            "MTBF: Mean Time Between Failures - reliability metric",
            "MTTR: Mean Time To Repair - maintainability metric",
            "LRU: Line Replaceable Unit - field-swappable component",
            "Spare parts: Inventory strategy for maintenance",
            "Predictive maintenance: Using data to anticipate failures",
            "Technical publications: Manuals, procedures, parts catalogs"
        ],
        "decision_points": [
            "Support model: Self-service, field service, or depot repair",
            "Spare parts strategy: What to stock, where, how much",
            "Training approach: Classroom, on-the-job, or self-paced",
            "Data strategy: What operational data to collect and analyze",
            "Continuous improvement: How to incorporate field feedback"
        ],
        "common_mistakes": [
            "Not considering maintainability during design",
            "Underestimating field support infrastructure needs",
            "Not collecting operational data from deployed products",
            "Inadequate technical documentation for field teams",
            "No process for incorporating field feedback into design"
        ],
        "success_indicators": [
            "Maintenance concepts influence design decisions",
            "LRUs defined with replacement procedures",
            "Spare parts stocking plan based on reliability analysis",
            "Field service capabilities ready at product launch",
            "Operational data collection infrastructure in place"
        ],
        "terminology": {
            "LRU": "Line Replaceable Unit",
            "SRU": "Shop Replaceable Unit",
            "ILS": "Integrated Logistics Support",
            "PHM": "Prognostics and Health Management",
            "FRACAS": "Failure Reporting, Analysis, and Corrective Action System",
            "Tech pubs": "Technical publications (manuals, etc.)"
        }
    }'::jsonb,
    '[
        {"id": "ops-1", "question": "What is your support model (self-service, field service, depot)?", "context": "Affects product design, infrastructure, and staffing needs.", "difficulty": "basic"},
        {"id": "ops-2", "question": "What maintenance access does your product need?", "context": "Drives physical design. Hard to fix after design freeze.", "difficulty": "basic"},
        {"id": "ops-3", "question": "What spare parts strategy will you use?", "context": "Reliability analysis drives stocking decisions.", "difficulty": "intermediate"},
        {"id": "ops-4", "question": "What operational data will you collect?", "context": "Enables predictive maintenance and product improvement.", "difficulty": "intermediate"},
        {"id": "ops-5", "question": "How will you train field service technicians?", "context": "Training scales with deployment. Plan early.", "difficulty": "advanced"}
    ]'::jsonb,
    '{
        "books": [
            {"title": "Reliability Engineering", "author": "O''Connor", "description": "Comprehensive reliability and maintainability"},
            {"title": "Product Support", "author": "INCOSE Systems Engineering Handbook", "description": "ILS and support engineering"}
        ]
    }'::jsonb,
    ARRAY['operations', 'support', 'maintenance', 'field-service'],
    ARRAY['VP Operations', 'Head of Customer Success', 'Field Service Manager'],
    ARRAY['service']
);

-- Operations Objective Pack
INSERT INTO public.subsystem_objective_packs (
    subsystem_id, title, summary, extended_description, difficulty, estimated_duration, is_default,
    tasks
) VALUES (
    '10000001-0000-4000-8000-000000000020',
    'Design Operations & Support Strategy',
    'Define support model, plan maintenance approach, and establish field infrastructure',
    'This objective guides you through designing the operations and support strategy for your product. You''ll define the support model, plan maintenance approach, and establish the infrastructure for field support.',
    'intermediate',
    '4-6 weeks',
    true,
    '[
        {
            "order": 1,
            "title": "Define support concept and requirements",
            "description": "Establish support approach:\n\n**Support Model:**\n- Self-service capabilities\n- Field service requirements\n- Depot repair approach\n- Customer support channels\n\n**Requirements:**\n- Response time targets\n- Availability targets\n- Geographic coverage\n- Spare parts availability\n\n**Deliverable:** Support concept document.",
            "role": "Executive",
            "estimated_hours": 12,
            "is_marketplace_task": false
        },
        {
            "order": 2,
            "title": "Design for maintainability",
            "description": "Incorporate supportability:\n\n**Design Inputs:**\n- LRU/SRU partitioning\n- Access requirements\n- Diagnostic capabilities\n- Calibration needs\n\n**Analysis:**\n- Reliability predictions (MTBF)\n- Maintainability analysis (MTTR)\n- Spare parts demand modeling\n\n**Deliverable:** Maintainability design requirements.",
            "role": "AI_Agent",
            "estimated_hours": 16,
            "is_marketplace_task": false
        },
        {
            "order": 3,
            "title": "Develop maintenance procedures and training",
            "description": "Create support documentation:\n\n**Procedures:**\n- Scheduled maintenance tasks\n- Troubleshooting guides\n- Replacement procedures\n- Calibration procedures\n\n**Training:**\n- Training curriculum\n- Training materials\n- Certification requirements\n\n**Deliverable:** Draft maintenance documentation and training plan.",
            "role": "Apprentice",
            "estimated_hours": 32,
            "is_marketplace_task": false
        },
        {
            "order": 4,
            "title": "Find operations expert on marketplace",
            "description": "Engage an operations specialist:\n\n**Expertise Areas:**\n- Field service operations\n- Spare parts management\n- Support infrastructure\n- Customer success\n\n**Deliverable:** Expert operations review.",
            "role": "Executive",
            "estimated_hours": 4,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["operations", "support", "field-service"],
                "type": "advice"
            }
        },
        {
            "order": 5,
            "title": "Source field service infrastructure",
            "description": "Find operations support:\n\n**Services:**\n- Field service networks\n- Spare parts logistics\n- Customer support platforms\n- Training delivery\n\n**Deliverable:** Operations service providers identified.",
            "role": "Apprentice",
            "estimated_hours": 8,
            "is_marketplace_task": true,
            "marketplace_filter": {
                "categories": ["operations", "support"],
                "type": "supplier"
            }
        }
    ]'::jsonb
);

-- =============================================
-- Create indexes for efficient querying
-- =============================================

-- Index for marketplace category searches
CREATE INDEX IF NOT EXISTS idx_universal_subsystems_marketplace 
ON public.universal_subsystems USING gin(marketplace_categories);

-- Full text search on subsystem content
CREATE INDEX IF NOT EXISTS idx_universal_subsystems_search 
ON public.universal_subsystems USING gin(
    to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(tagline, ''))
);

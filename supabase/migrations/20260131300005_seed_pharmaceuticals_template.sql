-- Seed Pharmaceuticals & Drug Development Blueprint Template
-- Template for pharmaceutical drug discovery, development, and commercialization

-- ============================================================================
-- PHARMACEUTICALS & DRUG DEVELOPMENT TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000008-0000-4000-8000-000000000001',
    'Pharmaceuticals & Drug Development',
    'For pharmaceutical drug discovery, clinical development, and manufacturing',
    'pharmaceuticals',
    'pill',
    75,
    225,
    true,
    '{"tags": ["healthcare", "biotech", "drug", "clinical"], "difficulty": "advanced"}'
);

-- Drug Discovery domains (1xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-1000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Drug Discovery', 'Target identification and lead discovery', 'Software', 0, 1, 'critical', '[]', ARRAY['Discovery Scientist', 'Medicinal Chemist'], NULL),

('00000008-1100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-1000-4000-8000-000000000001', 'Target Identification & Validation', 'Biological target selection', 'Software', 1, 1, 'critical',
 '[{"id": "tiv1", "question": "What disease indication and mechanism?", "context": "Determines target selection"}, {"id": "tiv2", "question": "Target validation approach (genetic, biochemical)?", "context": "Validation strategy"}, {"id": "tiv3", "question": "Druggability assessment completed?", "context": "Target feasibility"}]',
 ARRAY['Discovery Scientist', 'Biologist'], '12-24 weeks'),

('00000008-1200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-1000-4000-8000-000000000001', 'Lead Optimization', 'Chemical lead optimization', 'Software', 1, 2, 'critical',
 '[{"id": "lo1", "question": "Hit-to-lead or lead optimization stage?", "context": "Development phase"}, {"id": "lo2", "question": "What are your optimization criteria (potency, ADME, safety)?", "context": "Design goals"}, {"id": "lo3", "question": "Structure-activity relationship (SAR) established?", "context": "Chemical understanding"}]',
 ARRAY['Medicinal Chemist'], '16-32 weeks'),

('00000008-1300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-1000-4000-8000-000000000001', 'High-Throughput Screening', 'HTS and assay development', 'Software', 1, 3, 'important',
 '[{"id": "hts1", "question": "Biochemical or cell-based screening?", "context": "Assay type"}, {"id": "hts2", "question": "What library size (compounds screened)?", "context": "Hit rate expectations"}]',
 ARRAY['Screening Scientist'], '8-16 weeks'),

('00000008-1400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-1000-4000-8000-000000000001', 'Medicinal Chemistry', 'Chemical synthesis and optimization', 'Software', 1, 4, 'critical',
 '[{"id": "mc1", "question": "Small molecule or peptide drug?", "context": "Chemistry approach"}, {"id": "mc2", "question": "Synthetic feasibility and scalability?", "context": "Manufacturing viability"}]',
 ARRAY['Medicinal Chemist', 'Synthetic Chemist'], '20-40 weeks'),

('00000008-1500-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-1000-4000-8000-000000000001', 'Biologics Discovery', 'Antibodies, ADCs, and biologics', 'Software', 1, 5, 'important',
 '[{"id": "bd1", "question": "Monoclonal antibody (mAb) or bispecific?", "context": "Modality selection"}, {"id": "bd2", "question": "Antibody-drug conjugate (ADC) approach?", "context": "Payload strategy"}, {"id": "bd3", "question": "Humanization required?", "context": "Immunogenicity risk"}]',
 ARRAY['Biologics Scientist', 'Antibody Engineer'], '24-48 weeks'),

('00000008-1600-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-1000-4000-8000-000000000001', 'Computational Drug Design', 'In silico design and modeling', 'Software', 1, 6, 'nice-to-have',
 '[{"id": "cdd1", "question": "Structure-based or ligand-based design?", "context": "Computational approach"}, {"id": "cdd2", "question": "AI/ML drug design tools?", "context": "Technology adoption"}]',
 ARRAY['Computational Chemist'], '8-16 weeks');

-- Preclinical Development domains (2xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-2000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Preclinical Development', 'Toxicology and preclinical studies', 'Regulatory', 0, 2, 'critical', '[]', ARRAY['Toxicologist', 'Preclinical Scientist'], NULL),

('00000008-2100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-2000-4000-8000-000000000001', 'Toxicology Studies', 'GLP toxicology and safety assessment', 'Regulatory', 1, 1, 'critical',
 '[{"id": "ts1", "question": "What GLP toxicology studies required?", "context": "Regulatory pathway (IND, CTA)"}, {"id": "ts2", "question": "Single-dose and repeat-dose tox?", "context": "Safety package"}, {"id": "ts3", "question": "Genotoxicity and carcinogenicity studies?", "context": "Long-term safety"}]',
 ARRAY['Toxicologist', 'Safety Scientist'], '24-48 weeks'),

('00000008-2200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-2000-4000-8000-000000000001', 'Pharmacology', 'Efficacy and mechanism studies', 'Software', 1, 2, 'critical',
 '[{"id": "ph1", "question": "In vitro and in vivo pharmacology models?", "context": "Efficacy demonstration"}, {"id": "ph2", "question": "Proof-of-concept studies completed?", "context": "Clinical rationale"}]',
 ARRAY['Pharmacologist'], '16-32 weeks'),

('00000008-2300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-2000-4000-8000-000000000001', 'Formulation Development', 'Drug product formulation', 'Manufacturing', 1, 3, 'critical',
 '[{"id": "fd1", "question": "Oral, injectable, or other route?", "context": "Formulation type"}, {"id": "fd2", "question": "Immediate or controlled release?", "context": "Release profile"}, {"id": "fd3", "question": "Excipient selection and compatibility?", "context": "Formulation stability"}]',
 ARRAY['Formulation Scientist'], '12-24 weeks'),

('00000008-2400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-2000-4000-8000-000000000001', 'ADME Studies', 'Absorption, distribution, metabolism, excretion', 'Software', 1, 4, 'critical',
 '[{"id": "adme1", "question": "Pharmacokinetics (PK) characterization?", "context": "Dosing regimen design"}, {"id": "adme2", "question": "Metabolite identification and profiling?", "context": "Safety assessment"}, {"id": "adme3", "question": "Drug-drug interaction potential?", "context": "Clinical risk"}]',
 ARRAY['DMPK Scientist'], '12-24 weeks'),

('00000008-2500-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-2000-4000-8000-000000000001', 'Animal Models', 'Disease models and efficacy studies', 'Software', 1, 5, 'important',
 '[{"id": "am1", "question": "What animal species and models?", "context": "Regulatory requirements"}, {"id": "am2", "question": "Transgenic or xenograft models?", "context": "Disease relevance"}]',
 ARRAY['In Vivo Scientist'], '16-32 weeks'),

('00000008-2600-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-2000-4000-8000-000000000001', 'Biomarker Development', 'Biomarker identification and validation', 'Software', 1, 6, 'important',
 '[{"id": "bm1", "question": "Pharmacodynamic biomarkers identified?", "context": "Target engagement"}, {"id": "bm2", "question": "Predictive or prognostic biomarkers?", "context": "Patient selection"}]',
 ARRAY['Biomarker Scientist'], '12-24 weeks');

-- Clinical Development domains (3xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-3000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Clinical Development', 'Clinical trials and human studies', 'Regulatory', 0, 3, 'critical', '[]', ARRAY['Clinical Development Manager', 'Medical Director'], NULL),

('00000008-3100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-3000-4000-8000-000000000001', 'Phase I Trials', 'First-in-human safety studies', 'Regulatory', 1, 1, 'critical',
 '[{"id": "p1t1", "question": "Single ascending dose (SAD) and multiple ascending dose (MAD)?", "context": "Phase I design"}, {"id": "p1t2", "question": "Healthy volunteers or patients?", "context": "Trial population"}, {"id": "p1t3", "question": "What is your dose escalation strategy?", "context": "Safety monitoring"}]',
 ARRAY['Clinical Development Manager', 'Medical Monitor'], '12-18 months'),

('00000008-3200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-3000-4000-8000-000000000001', 'Phase II Trials', 'Proof-of-concept and dose-finding', 'Regulatory', 1, 2, 'critical',
 '[{"id": "p2t1", "question": "What are your primary and secondary endpoints?", "context": "Trial design"}, {"id": "p2t2", "question": "Adaptive trial design?", "context": "Flexibility"}, {"id": "p2t3", "question": "Patient population and inclusion criteria?", "context": "Target indication"}]',
 ARRAY['Clinical Development Manager', 'Medical Director'], '18-36 months'),

('00000008-3300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-3000-4000-8000-000000000001', 'Phase III Trials', 'Pivotal efficacy and safety trials', 'Regulatory', 1, 3, 'critical',
 '[{"id": "p3t1", "question": "Pivotal trial design and endpoints?", "context": "Marketing authorization basis"}, {"id": "p3t2", "question": "How many Phase III trials required?", "context": "Regulatory strategy"}, {"id": "p3t3", "question": "International or regional trial sites?", "context": "Global strategy"}]',
 ARRAY['Clinical Development Director', 'Medical Affairs'], '24-48 months'),

('00000008-3400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-3000-4000-8000-000000000001', 'Biostatistics', 'Statistical design and analysis', 'Software', 1, 4, 'critical',
 '[{"id": "bs1", "question": "Statistical analysis plan (SAP) finalized?", "context": "Trial design"}, {"id": "bs2", "question": "Sample size and power calculation?", "context": "Trial sizing"}, {"id": "bs3", "question": "Interim analysis planned?", "context": "Adaptive design"}]',
 ARRAY['Biostatistician'], '6-12 months'),

('00000008-3500-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-3000-4000-8000-000000000001', 'CRO Management', 'Contract Research Organization oversight', 'Business', 1, 5, 'important',
 '[{"id": "cro1", "question": "In-house or CRO-managed trials?", "context": "Resource model"}, {"id": "cro2", "question": "CRO selection and oversight process?", "context": "Quality assurance"}]',
 ARRAY['Clinical Operations Manager'], '3-6 months'),

('00000008-3600-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-3000-4000-8000-000000000001', 'Patient Recruitment', 'Patient enrollment strategies', 'Operations', 1, 6, 'important',
 '[{"id": "pr1", "question": "Patient recruitment strategy?", "context": "Enrollment timelines"}, {"id": "pr2", "question": "Site selection criteria?", "context": "Enrollment capability"}]',
 ARRAY['Clinical Trial Manager'], '6-12 months'),

('00000008-3700-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-3000-4000-8000-000000000001', 'Clinical Operations', 'Trial execution and monitoring', 'Operations', 1, 7, 'critical',
 '[{"id": "co1", "question": "Clinical trial monitoring approach?", "context": "Quality and compliance"}, {"id": "co2", "question": "Data management and EDC system?", "context": "Data quality"}]',
 ARRAY['Clinical Operations Manager', 'CRA'], '12-24 months');

-- Manufacturing (CMC) domains (4xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-4000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Manufacturing (CMC)', 'Chemistry, manufacturing, and controls', 'Manufacturing', 0, 4, 'critical', '[]', ARRAY['CMC Manager', 'Manufacturing Scientist'], NULL),

('00000008-4100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-4000-4000-8000-000000000001', 'API Synthesis', 'Active pharmaceutical ingredient synthesis', 'Manufacturing', 1, 1, 'critical',
 '[{"id": "api1", "question": "Synthetic route and process chemistry?", "context": "Manufacturing feasibility"}, {"id": "api2", "question": "API purity specifications?", "context": "Quality standards"}, {"id": "api3", "question": "Scale-up strategy (lab to commercial)?", "context": "Tech transfer"}]',
 ARRAY['Process Chemist', 'CMC Manager'], '16-32 weeks'),

('00000008-4200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-4000-4000-8000-000000000001', 'Biologics Manufacturing', 'Cell culture and bioreactor processes', 'Manufacturing', 1, 2, 'critical',
 '[{"id": "bm1", "question": "Cell line and expression system?", "context": "Biologics production"}, {"id": "bm2", "question": "Upstream and downstream process design?", "context": "Manufacturing process"}, {"id": "bm3", "question": "Purification strategy?", "context": "Product purity"}]',
 ARRAY['Biologics Manufacturing Scientist'], '24-48 weeks'),

('00000008-4300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-4000-4000-8000-000000000001', 'Formulation & Drug Product', 'Final drug product manufacturing', 'Manufacturing', 1, 3, 'critical',
 '[{"id": "fdp1", "question": "Drug product formulation finalized?", "context": "Commercial formulation"}, {"id": "fdp2", "question": "Manufacturing process (wet granulation, lyophilization)?", "context": "Production method"}, {"id": "fdp3", "question": "Stability-indicating formulation?", "context": "Shelf life"}]',
 ARRAY['Formulation Scientist'], '12-24 weeks'),

('00000008-4400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-4000-4000-8000-000000000001', 'Fill/Finish', 'Sterile filling and finishing operations', 'Manufacturing', 1, 4, 'important',
 '[{"id": "ff1", "question": "Sterile or non-sterile product?", "context": "Cleanroom requirements"}, {"id": "ff2", "question": "Primary packaging (vials, syringes, blisters)?", "context": "Fill/finish design"}]',
 ARRAY['Manufacturing Engineer'], '8-16 weeks'),

('00000008-4500-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-4000-4000-8000-000000000001', 'Packaging & Labeling', 'Secondary packaging and labeling', 'Manufacturing', 1, 5, 'important',
 '[{"id": "pl1", "question": "Packaging design and materials?", "context": "Product protection"}, {"id": "pl2", "question": "Serialization and track-and-trace?", "context": "Regulatory requirement"}]',
 ARRAY['Packaging Engineer'], '4-8 weeks'),

('00000008-4600-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-4000-4000-8000-000000000001', 'Scale-up & Tech Transfer', 'Process scale-up and technology transfer', 'Manufacturing', 1, 6, 'critical',
 '[{"id": "st1", "question": "Tech transfer from development to manufacturing?", "context": "Production readiness"}, {"id": "st2", "question": "Process validation strategy?", "context": "Commercial release"}]',
 ARRAY['Tech Transfer Manager'], '12-24 weeks'),

('00000008-4700-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-4000-4000-8000-000000000001', 'Process Development', 'Manufacturing process optimization', 'Manufacturing', 1, 7, 'important',
 '[{"id": "pd1", "question": "Process characterization and optimization?", "context": "Robustness"}, {"id": "pd2", "question": "Critical process parameters identified?", "context": "Process control"}]',
 ARRAY['Process Development Scientist'], '12-24 weeks');

-- Quality & Compliance domains (5xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-5000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Quality & Compliance', 'GMP quality systems', 'Regulatory', 0, 5, 'critical', '[]', ARRAY['QA Manager', 'Quality Engineer'], NULL),

('00000008-5100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-5000-4000-8000-000000000001', 'GMP Compliance', 'Good Manufacturing Practice compliance', 'Regulatory', 1, 1, 'critical',
 '[{"id": "gmp1", "question": "GMP-compliant manufacturing facility?", "context": "Regulatory requirement"}, {"id": "gmp2", "question": "EU GMP and UK GMP compliance?", "context": "Regional regulations"}, {"id": "gmp3", "question": "Quality Management System (QMS)?", "context": "Documentation and procedures"}]',
 ARRAY['QA Manager', 'Compliance Officer'], '12-24 months'),

('00000008-5200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-5000-4000-8000-000000000001', 'Quality Assurance', 'QA systems and procedures', 'Regulatory', 1, 2, 'critical',
 '[{"id": "qa1", "question": "Batch release procedures and criteria?", "context": "Product quality"}, {"id": "qa2", "question": "Quality oversight and audits?", "context": "Compliance monitoring"}]',
 ARRAY['QA Manager'], '8-16 weeks'),

('00000008-5300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-5000-4000-8000-000000000001', 'Quality Control', 'Analytical testing and release', 'Manufacturing', 1, 3, 'critical',
 '[{"id": "qc1", "question": "Analytical methods validated?", "context": "QC testing"}, {"id": "qc2", "question": "Release and stability testing strategy?", "context": "Product quality"}, {"id": "qc3", "question": "Out-of-specification (OOS) procedures?", "context": "Quality events"}]',
 ARRAY['QC Manager', 'Analytical Chemist'], '12-24 weeks'),

('00000008-5400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-5000-4000-8000-000000000001', 'Validation', 'Process, cleaning, and computer validation', 'Regulatory', 1, 4, 'critical',
 '[{"id": "val1", "question": "Process validation strategy (concurrent, prospective)?", "context": "Validation approach"}, {"id": "val2", "question": "Cleaning validation for shared equipment?", "context": "Cross-contamination control"}, {"id": "val3", "question": "Computer system validation (CSV)?", "context": "GAMP compliance"}]',
 ARRAY['Validation Engineer'], '12-24 weeks'),

('00000008-5500-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-5000-4000-8000-000000000001', 'Stability Studies', 'ICH stability testing', 'Manufacturing', 1, 5, 'critical',
 '[{"id": "ss1", "question": "ICH stability protocol defined?", "context": "Shelf life determination"}, {"id": "ss2", "question": "Accelerated and long-term stability?", "context": "Storage conditions"}, {"id": "ss3", "question": "Photostability testing?", "context": "Light exposure"}]',
 ARRAY['Stability Manager'], '12-36 months'),

('00000008-5600-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-5000-4000-8000-000000000001', 'Deviation & CAPA', 'Deviation and corrective action management', 'Regulatory', 1, 6, 'important',
 '[{"id": "dc1", "question": "Deviation management system?", "context": "Quality event handling"}, {"id": "dc2", "question": "CAPA process and effectiveness checks?", "context": "Continuous improvement"}]',
 ARRAY['QA Manager'], '4-8 weeks');

-- Regulatory Affairs domains (6xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-6000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Regulatory Affairs', 'UK and EU regulatory submissions', 'Regulatory', 0, 6, 'critical', '[]', ARRAY['Regulatory Affairs Manager', 'Regulatory Scientist'], NULL),

('00000008-6100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-6000-4000-8000-000000000001', 'MHRA Submissions', 'UK Medicines and Healthcare products Regulatory Agency', 'Regulatory', 1, 1, 'critical',
 '[{"id": "mhra1", "question": "Have you submitted a Clinical Trial Authorisation (CTA) to MHRA?", "context": "Required for UK clinical trials"}, {"id": "mhra2", "question": "MHRA scientific advice obtained?", "context": "Regulatory strategy"}, {"id": "mhra3", "question": "UK Marketing Authorisation Application (MAA) strategy?", "context": "National procedure"}]',
 ARRAY['Regulatory Affairs Manager'], '12-24 months'),

('00000008-6200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-6000-4000-8000-000000000001', 'EMA Submissions', 'European Medicines Agency submissions', 'Regulatory', 1, 2, 'critical',
 '[{"id": "ema1", "question": "What is your EMA centralised vs national procedure strategy?", "context": "EU approval pathway"}, {"id": "ema2", "question": "EMA scientific advice and protocol assistance?", "context": "Regulatory guidance"}, {"id": "ema3", "question": "Rapporteur and co-rapporteur selection?", "context": "Centralised procedure"}]',
 ARRAY['Regulatory Affairs Manager'], '18-36 months'),

('00000008-6300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-6000-4000-8000-000000000001', 'IMPD & CTA', 'Investigational Medicinal Product Dossier', 'Regulatory', 1, 3, 'critical',
 '[{"id": "impd1", "question": "IMPD compiled for CTA submission?", "context": "Clinical trial authorization"}, {"id": "impd2", "question": "QTPP (Quality Target Product Profile)?", "context": "Development strategy"}, {"id": "impd3", "question": "Ethics committee approval obtained?", "context": "Trial authorization"}]',
 ARRAY['Regulatory Affairs Manager', 'CMC Regulatory'], '6-12 months'),

('00000008-6400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-6000-4000-8000-000000000001', 'Marketing Authorisation', 'UK and EU marketing approval', 'Regulatory', 1, 4, 'critical',
 '[{"id": "ma1", "question": "MAA dossier preparation (CTD format)?", "context": "Regulatory submission"}, {"id": "ma2", "question": "Post-approval commitments and obligations?", "context": "Conditional approval"}, {"id": "ma3", "question": "Pediatric Investigation Plan (PIP)?", "context": "EU requirement"}]',
 ARRAY['Regulatory Affairs Manager'], '12-18 months'),

('00000008-6500-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-6000-4000-8000-000000000001', 'Labeling Requirements', 'Product labeling and patient information', 'Regulatory', 1, 5, 'important',
 '[{"id": "lr1", "question": "Summary of Product Characteristics (SmPC)?", "context": "UK/EU labeling"}, {"id": "lr2", "question": "Patient Information Leaflet (PIL)?", "context": "Regulatory requirement"}]',
 ARRAY['Regulatory Affairs Manager'], '3-6 months'),

('00000008-6600-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-6000-4000-8000-000000000001', 'Post-Market Surveillance', 'Safety monitoring after approval', 'Regulatory', 1, 6, 'critical',
 '[{"id": "pms1", "question": "Post-authorization safety studies (PASS)?", "context": "Ongoing safety monitoring"}, {"id": "pms2", "question": "Periodic Safety Update Reports (PSURs)?", "context": "Safety reporting"}]',
 ARRAY['Pharmacovigilance Manager'], '12-24 months'),

('00000008-6700-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-6000-4000-8000-000000000001', 'Pharmacovigilance', 'Safety data collection and reporting', 'Regulatory', 1, 7, 'critical',
 '[{"id": "pv1", "question": "What is your pharmacovigilance system for UK/EU?", "context": "Safety monitoring"}, {"id": "pv2", "question": "Qualified Person for Pharmacovigilance (QPPV)?", "context": "Regulatory requirement"}, {"id": "pv3", "question": "Adverse event reporting procedures?", "context": "Safety compliance"}]',
 ARRAY['Pharmacovigilance Manager'], '6-12 months');

-- Commercial Operations domains (7xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-7000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Commercial Operations', 'Market access and commercialization', 'Business', 0, 7, 'important', '[]', ARRAY['Commercial Director', 'Market Access Manager'], NULL),

('00000008-7100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-7000-4000-8000-000000000001', 'Market Access', 'Market access and reimbursement strategy', 'Business', 1, 1, 'critical',
 '[{"id": "mac1", "question": "Market access strategy for UK and EU?", "context": "Reimbursement pathway"}, {"id": "mac2", "question": "Evidence generation for HTA?", "context": "Value demonstration"}, {"id": "mac3", "question": "Payer engagement and negotiation strategy?", "context": "Pricing approval"}]',
 ARRAY['Market Access Manager'], '12-24 months'),

('00000008-7200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-7000-4000-8000-000000000001', 'NICE & SMC Assessment', 'Health technology assessment in UK', 'Regulatory', 1, 2, 'critical',
 '[{"id": "nice1", "question": "Have you engaged with NICE for health technology assessment?", "context": "NHS reimbursement"}, {"id": "nice2", "question": "SMC (Scottish Medicines Consortium) submission?", "context": "Scotland approval"}, {"id": "nice3", "question": "Cost-effectiveness analysis and QALY data?", "context": "HTA submission"}]',
 ARRAY['Health Economics Manager', 'Market Access'], '12-18 months'),

('00000008-7300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-7000-4000-8000-000000000001', 'Pricing & Reimbursement', 'Pricing strategy and negotiations', 'Business', 1, 3, 'important',
 '[{"id": "pr1", "question": "Pricing strategy (value-based, cost-plus)?", "context": "Commercial model"}, {"id": "pr2", "question": "Patient access schemes or risk-sharing?", "context": "NICE requirement"}]',
 ARRAY['Pricing Manager'], '6-12 months'),

('00000008-7400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-7000-4000-8000-000000000001', 'Medical Affairs', 'Medical education and scientific communication', 'Business', 1, 4, 'important',
 '[{"id": "meda1", "question": "Medical affairs strategy?", "context": "Scientific communication"}, {"id": "meda2", "question": "Key opinion leader (KOL) engagement?", "context": "Medical education"}]',
 ARRAY['Medical Affairs Director'], '6-12 months'),

('00000008-7500-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-7000-4000-8000-000000000001', 'Distribution & Cold Chain', 'Supply chain and distribution', 'Operations', 1, 5, 'important',
 '[{"id": "dc1", "question": "Distribution network and logistics?", "context": "Product availability"}, {"id": "dc2", "question": "Cold chain requirements (2-8°C)?", "context": "Temperature-sensitive products"}, {"id": "dc3", "question": "Wholesaler and pharmacy distribution?", "context": "UK/EU supply chain"}]',
 ARRAY['Supply Chain Manager'], '6-12 months'),

('00000008-7600-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-7000-4000-8000-000000000001', 'KOL Management', 'Key opinion leader engagement', 'Business', 1, 6, 'nice-to-have',
 '[{"id": "kol1", "question": "KOL identification and mapping?", "context": "Thought leader engagement"}, {"id": "kol2", "question": "Advisory boards and consulting agreements?", "context": "Scientific input"}]',
 ARRAY['Medical Affairs Manager'], '3-6 months');

-- Intellectual Property domains (8xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000008-8000-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', NULL, 'Intellectual Property', 'Patent strategy and IP protection', 'Business', 0, 8, 'important', '[]', ARRAY['IP Counsel', 'Patent Attorney'], NULL),

('00000008-8100-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-8000-4000-8000-000000000001', 'Patent Strategy', 'Patent portfolio development', 'Business', 1, 1, 'critical',
 '[{"id": "ps1", "question": "Composition of matter patents filed?", "context": "Core IP protection"}, {"id": "ps2", "question": "Method of use and formulation patents?", "context": "Extended protection"}, {"id": "ps3", "question": "Patent filing strategy (PCT, regional)?", "context": "Geographic coverage"}]',
 ARRAY['Patent Attorney', 'IP Counsel'], '6-12 months'),

('00000008-8200-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-8000-4000-8000-000000000001', 'Freedom to Operate', 'FTO analysis and third-party IP', 'Business', 1, 2, 'important',
 '[{"id": "fto1", "question": "Freedom-to-operate analysis completed?", "context": "Risk assessment"}, {"id": "fto2", "question": "Third-party patent landscape?", "context": "Competitive IP"}]',
 ARRAY['Patent Attorney'], '3-6 months'),

('00000008-8300-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-8000-4000-8000-000000000001', 'Data Exclusivity', 'Regulatory data protection', 'Regulatory', 1, 3, 'important',
 '[{"id": "de1", "question": "Regulatory data exclusivity period?", "context": "8+2+1 years in EU"}, {"id": "de2", "question": "Orphan drug exclusivity?", "context": "10 years for rare diseases"}]',
 ARRAY['Regulatory Affairs Manager'], '2-4 weeks'),

('00000008-8400-4000-8000-000000000001', '00000008-0000-4000-8000-000000000001', '00000008-8000-4000-8000-000000000001', 'Supplementary Protection Certificates', 'SPC for patent extension', 'Regulatory', 1, 4, 'important',
 '[{"id": "spc1", "question": "SPC filing strategy in UK/EU?", "context": "Up to 5 years patent extension"}, {"id": "spc2", "question": "Pediatric extension eligibility?", "context": "Additional 6 months"}]',
 ARRAY['Patent Attorney', 'Regulatory Affairs'], '3-6 months');

-- Update template counts
UPDATE blueprint_templates SET
  estimated_domains = (SELECT COUNT(*) FROM knowledge_domains WHERE template_id = '00000008-0000-4000-8000-000000000001'),
  estimated_questions = (SELECT COUNT(*) FROM knowledge_domains kd, jsonb_array_elements(kd.key_questions) WHERE kd.template_id = '00000008-0000-4000-8000-000000000001')
WHERE id = '00000008-0000-4000-8000-000000000001';

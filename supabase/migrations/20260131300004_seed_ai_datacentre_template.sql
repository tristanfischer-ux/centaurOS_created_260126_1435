-- Seed AI Data Centres Blueprint Template
-- Template for AI training and inference data centre infrastructure

-- ============================================================================
-- AI DATA CENTRES TEMPLATE
-- ============================================================================

INSERT INTO blueprint_templates (id, name, description, product_category, icon, estimated_domains, estimated_questions, is_system_template, metadata)
VALUES (
    '00000007-0000-4000-8000-000000000001',
    'AI Data Centres',
    'For AI training and inference data centre infrastructure',
    'ai-datacentre',
    'server-cog',
    55,
    165,
    true,
    '{"tags": ["infrastructure", "AI", "computing", "cloud"], "difficulty": "advanced"}'
);

-- Compute Infrastructure domains (1xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-1000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Compute Infrastructure', 'GPU clusters and compute hardware', 'Electronics', 0, 1, 'critical', '[]', ARRAY['Infrastructure Architect', 'Data Centre Engineer'], NULL),

('00000007-1100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-1000-4000-8000-000000000001', 'GPU Clusters', 'NVIDIA H100/B200 and GPU infrastructure', 'Electronics', 1, 1, 'critical',
 '[{"id": "gpu1", "question": "What GPU generation (H100, B200, H200)?", "context": "Determines performance and power"}, {"id": "gpu2", "question": "How many GPUs per node?", "context": "Affects node architecture"}, {"id": "gpu3", "question": "What total GPU count?", "context": "Determines facility sizing"}]',
 ARRAY['HPC Architect', 'GPU Engineer'], '8-12 weeks'),

('00000007-1200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-1000-4000-8000-000000000001', 'TPU & ASIC Systems', 'Google TPU and custom AI accelerators', 'Electronics', 1, 2, 'important',
 '[{"id": "tpu1", "question": "Google TPU, AWS Trainium, or other ASICs?", "context": "Affects vendor lock-in"}, {"id": "tpu2", "question": "What workload optimization?", "context": "Training vs inference"}]',
 ARRAY['ML Infrastructure Engineer'], '6-10 weeks'),

('00000007-1300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-1000-4000-8000-000000000001', 'CPU Servers', 'General purpose CPU compute', 'Electronics', 1, 3, 'important',
 '[{"id": "cpu1", "question": "What CPU architecture (x86, ARM)?", "context": "Affects software compatibility"}, {"id": "cpu2", "question": "CPU-to-GPU ratio in cluster?", "context": "Determines node architecture"}]',
 ARRAY['Systems Architect'], '4-8 weeks'),

('00000007-1400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-1000-4000-8000-000000000001', 'High-Bandwidth Memory', 'HBM and memory systems', 'Electronics', 1, 4, 'critical',
 '[{"id": "hbm1", "question": "What memory capacity per GPU?", "context": "Affects model size capability"}, {"id": "hbm2", "question": "HBM3 or HBM3e?", "context": "Bandwidth and capacity"}]',
 ARRAY['Hardware Engineer'], '2-4 weeks'),

('00000007-1500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-1000-4000-8000-000000000001', 'Storage Systems', 'NVMe and object storage', 'Electronics', 1, 5, 'critical',
 '[{"id": "st1", "question": "What storage capacity and performance?", "context": "Dataset size and throughput"}, {"id": "st2", "question": "NVMe flash, object storage, or both?", "context": "Affects architecture"}, {"id": "st3", "question": "Storage tier strategy (hot, warm, cold)?", "context": "Cost optimization"}]',
 ARRAY['Storage Architect'], '6-10 weeks');

-- Power Infrastructure domains (2xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-2000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Power Infrastructure', 'Electrical power delivery and distribution', 'Electronics', 0, 2, 'critical', '[]', ARRAY['Power Engineer', 'Electrical Engineer'], NULL),

('00000007-2100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-2000-4000-8000-000000000001', 'Power Delivery Architecture', 'Main power distribution system', 'Electronics', 1, 1, 'critical',
 '[{"id": "pda1", "question": "What total facility power requirement?", "context": "Determines utility connection"}, {"id": "pda2", "question": "Redundant power feeds (N+1, 2N)?", "context": "Reliability level"}, {"id": "pda3", "question": "What voltage distribution (480V, medium voltage)?", "context": "Affects infrastructure design"}]',
 ARRAY['Power Engineer', 'Electrical Engineer'], '10-16 weeks'),

('00000007-2200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-2000-4000-8000-000000000001', 'UPS Systems', 'Uninterruptible power supply', 'Electronics', 1, 2, 'critical',
 '[{"id": "ups1", "question": "What UPS runtime required?", "context": "Battery sizing"}, {"id": "ups2", "question": "Centralized or distributed UPS?", "context": "Architecture choice"}]',
 ARRAY['Power Engineer'], '6-10 weeks'),

('00000007-2300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-2000-4000-8000-000000000001', 'Backup Generators', 'Diesel or gas generators', 'Mechanical', 1, 3, 'important',
 '[{"id": "gen1", "question": "Diesel or natural gas generators?", "context": "Fuel logistics and emissions"}, {"id": "gen2", "question": "What backup runtime required?", "context": "Fuel tank sizing"}]',
 ARRAY['Facilities Engineer'], '8-12 weeks'),

('00000007-2400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-2000-4000-8000-000000000001', 'Power Distribution Units', 'PDU and rack power distribution', 'Electronics', 1, 4, 'critical',
 '[{"id": "pdu1", "question": "Intelligent or basic PDUs?", "context": "Monitoring capability"}, {"id": "pdu2", "question": "Per-rack power capacity?", "context": "Determines PDU sizing"}]',
 ARRAY['Data Centre Engineer'], '4-8 weeks'),

('00000007-2500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-2000-4000-8000-000000000001', 'Power Usage Effectiveness', 'PUE optimization and monitoring', 'Operations', 1, 5, 'important',
 '[{"id": "pue1", "question": "What target PUE?", "context": "Efficiency goal (1.1-1.3 is excellent)"}, {"id": "pue2", "question": "Real-time PUE monitoring?", "context": "Operations visibility"}]',
 ARRAY['Efficiency Engineer'], '2-4 weeks'),

('00000007-2600-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-2000-4000-8000-000000000001', 'Grid Connection', 'Utility interconnection', 'Business', 1, 6, 'critical',
 '[{"id": "grid1", "question": "What is your grid connection agreement with National Grid ESO?", "context": "UK grid operator"}, {"id": "grid2", "question": "On-site renewable power generation?", "context": "Sustainability and cost"}]',
 ARRAY['Facilities Manager', 'Power Engineer'], '12-24 weeks');

-- Cooling Systems domains (3xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-3000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Cooling Systems', 'Thermal management and cooling', 'Mechanical', 0, 3, 'critical', '[]', ARRAY['Mechanical Engineer', 'Cooling Engineer'], NULL),

('00000007-3100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-3000-4000-8000-000000000001', 'Direct Liquid Cooling', 'DLC for high-density GPU cooling', 'Mechanical', 1, 1, 'critical',
 '[{"id": "dlc1", "question": "Direct liquid cooling for GPUs?", "context": "Required for H100/B200 density"}, {"id": "dlc2", "question": "Cold plate or immersion cooling?", "context": "Cooling approach"}, {"id": "dlc3", "question": "What coolant (water, dielectric)?", "context": "Affects system design"}]',
 ARRAY['Cooling Engineer'], '10-16 weeks'),

('00000007-3200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-3000-4000-8000-000000000001', 'Rear-Door Heat Exchangers', 'RDHX for rack cooling', 'Mechanical', 1, 2, 'important',
 '[{"id": "rdhx1", "question": "Rear-door heat exchangers for supplemental cooling?", "context": "Hybrid cooling approach"}, {"id": "rdhx2", "question": "Active or passive RDHX?", "context": "Determines pumping requirements"}]',
 ARRAY['Cooling Engineer'], '4-8 weeks'),

('00000007-3300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-3000-4000-8000-000000000001', 'Immersion Cooling', 'Two-phase immersion cooling', 'Mechanical', 1, 3, 'nice-to-have',
 '[{"id": "ic1", "question": "Single-phase or two-phase immersion?", "context": "Cooling performance"}, {"id": "ic2", "question": "What dielectric fluid?", "context": "Affects cost and performance"}]',
 ARRAY['Cooling Engineer'], '12-20 weeks'),

('00000007-3400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-3000-4000-8000-000000000001', 'CRAC & CRAH Units', 'Computer room air conditioning', 'Mechanical', 1, 4, 'important',
 '[{"id": "crac1", "question": "CRAC or CRAH units for room cooling?", "context": "Air-cooled vs chilled water"}, {"id": "crac2", "question": "In-row or perimeter cooling?", "context": "Airflow management"}]',
 ARRAY['HVAC Engineer'], '6-10 weeks'),

('00000007-3500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-3000-4000-8000-000000000001', 'Hot & Cold Aisle Containment', 'Airflow management', 'Mechanical', 1, 5, 'important',
 '[{"id": "hc1", "question": "Hot or cold aisle containment?", "context": "Efficiency optimization"}, {"id": "hc2", "question": "What supply air temperature?", "context": "Affects efficiency"}]',
 ARRAY['Data Centre Engineer'], '2-4 weeks'),

('00000007-3600-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-3000-4000-8000-000000000001', 'Chillers & Cooling Towers', 'Central chilled water plant', 'Mechanical', 1, 6, 'critical',
 '[{"id": "ct1", "question": "Air-cooled or water-cooled chillers?", "context": "Climate and water availability"}, {"id": "ct2", "question": "What total cooling capacity?", "context": "Chiller plant sizing"}, {"id": "ct3", "question": "Free cooling capability?", "context": "UK climate advantage for efficiency"}]',
 ARRAY['Mechanical Engineer'], '10-16 weeks');

-- Network Infrastructure domains (4xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-4000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Network Infrastructure', 'High-speed interconnects and networking', 'Electronics', 0, 4, 'critical', '[]', ARRAY['Network Architect', 'Network Engineer'], NULL),

('00000007-4100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-4000-4000-8000-000000000001', 'High-Speed Interconnects', 'InfiniBand, RoCE for GPU-GPU', 'Electronics', 1, 1, 'critical',
 '[{"id": "hsi1", "question": "InfiniBand or RoCE (RDMA over Ethernet)?", "context": "GPU interconnect choice"}, {"id": "hsi2", "question": "What interconnect bandwidth (400Gb, 800Gb)?", "context": "Training performance"}, {"id": "hsi3", "question": "Full mesh or rail-optimized topology?", "context": "Affects network design"}]',
 ARRAY['Network Architect', 'HPC Engineer'], '10-16 weeks'),

('00000007-4200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-4000-4000-8000-000000000001', 'Network Switches', '400GbE and spine-leaf architecture', 'Electronics', 1, 2, 'critical',
 '[{"id": "nsw1", "question": "What network switch capacity?", "context": "Determines switch model"}, {"id": "nsw2", "question": "Oversubscription ratio?", "context": "Cost vs performance trade-off"}]',
 ARRAY['Network Engineer'], '6-10 weeks'),

('00000007-4300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-4000-4000-8000-000000000001', 'Structured Cabling', 'Fiber optic and copper cabling', 'Electronics', 1, 3, 'important',
 '[{"id": "sc1", "question": "Fiber optic cable type (OM3, OM4, single-mode)?", "context": "Distance and bandwidth"}, {"id": "sc2", "question": "Cable management strategy?", "context": "Maintenance and scalability"}]',
 ARRAY['Cabling Engineer'], '4-8 weeks'),

('00000007-4400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-4000-4000-8000-000000000001', 'Network Topology', 'Spine-leaf and network design', 'Electronics', 1, 4, 'critical',
 '[{"id": "nt1", "question": "Spine-leaf or fat-tree topology?", "context": "Scalability and performance"}, {"id": "nt2", "question": "How many spine and leaf switches?", "context": "Network capacity"}]',
 ARRAY['Network Architect'], '6-10 weeks'),

('00000007-4500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-4000-4000-8000-000000000001', 'Load Balancing', 'Traffic distribution and optimization', 'Software', 1, 5, 'important',
 '[{"id": "lb1", "question": "Hardware or software load balancers?", "context": "Performance vs flexibility"}, {"id": "lb2", "question": "What load balancing algorithm?", "context": "Workload optimization"}]',
 ARRAY['Network Engineer'], '2-4 weeks');

-- Software Platform domains (5xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-5000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Software Platform', 'ML frameworks and orchestration', 'Software', 0, 5, 'critical', '[]', ARRAY['ML Platform Engineer', 'DevOps Engineer'], NULL),

('00000007-5100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-5000-4000-8000-000000000001', 'ML Frameworks', 'PyTorch, JAX, TensorFlow', 'Software', 1, 1, 'critical',
 '[{"id": "mlf1", "question": "What ML frameworks (PyTorch, JAX, TensorFlow)?", "context": "Customer requirements"}, {"id": "mlf2", "question": "Multi-framework support?", "context": "Affects environment management"}]',
 ARRAY['ML Platform Engineer'], '4-8 weeks'),

('00000007-5200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-5000-4000-8000-000000000001', 'Cluster Orchestration', 'Kubernetes, Slurm for job scheduling', 'Software', 1, 2, 'critical',
 '[{"id": "co1", "question": "Kubernetes, Slurm, or both?", "context": "Workload orchestration approach"}, {"id": "co2", "question": "GPU scheduling and allocation policy?", "context": "Resource optimization"}, {"id": "co3", "question": "Multi-tenancy support?", "context": "Customer isolation"}]',
 ARRAY['Platform Engineer', 'DevOps Engineer'], '8-12 weeks'),

('00000007-5300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-5000-4000-8000-000000000001', 'Model Serving', 'Triton, vLLM for inference', 'Software', 1, 3, 'important',
 '[{"id": "ms1", "question": "What inference serving platform (Triton, vLLM)?", "context": "Deployment approach"}, {"id": "ms2", "question": "Autoscaling capability?", "context": "Cost optimization"}]',
 ARRAY['ML Platform Engineer'], '6-10 weeks'),

('00000007-5400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-5000-4000-8000-000000000001', 'Monitoring & Observability', 'Prometheus, Grafana for monitoring', 'Software', 1, 4, 'critical',
 '[{"id": "mo1", "question": "What monitoring stack?", "context": "Operations visibility"}, {"id": "mo2", "question": "GPU utilization and telemetry?", "context": "Resource optimization"}]',
 ARRAY['DevOps Engineer', 'SRE'], '4-8 weeks'),

('00000007-5500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-5000-4000-8000-000000000001', 'Data Pipeline', 'ETL and data management', 'Software', 1, 5, 'important',
 '[{"id": "dp1", "question": "Data ingestion and preprocessing pipeline?", "context": "Training data workflow"}, {"id": "dp2", "question": "Dataset versioning and management?", "context": "Reproducibility"}]',
 ARRAY['Data Engineer', 'ML Engineer'], '6-10 weeks');

-- Security & Access domains (6xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-6000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Security & Access', 'Physical and cybersecurity', 'Software', 0, 6, 'critical', '[]', ARRAY['Security Engineer', 'CISO'], NULL),

('00000007-6100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-6000-4000-8000-000000000001', 'Physical Security', 'Access control and surveillance', 'Operations', 1, 1, 'critical',
 '[{"id": "ps1", "question": "What physical security level required?", "context": "Tier III or IV standards"}, {"id": "ps2", "question": "24/7 security staff or automated?", "context": "Operational approach"}]',
 ARRAY['Security Manager', 'Facilities Manager'], '4-8 weeks'),

('00000007-6200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-6000-4000-8000-000000000001', 'Cybersecurity', 'SOC and threat monitoring', 'Software', 1, 2, 'critical',
 '[{"id": "cs1", "question": "Internal SOC or outsourced?", "context": "Security operations"}, {"id": "cs2", "question": "What security certifications (ISO 27001, SOC 2)?", "context": "Customer requirements"}]',
 ARRAY['Security Engineer', 'SOC Analyst'], '8-12 weeks'),

('00000007-6300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-6000-4000-8000-000000000001', 'Access Control', 'Biometric and multi-factor authentication', 'Software', 1, 3, 'critical',
 '[{"id": "ac1", "question": "Biometric access control?", "context": "High-security requirement"}, {"id": "ac2", "question": "Multi-factor authentication for all access?", "context": "Security policy"}]',
 ARRAY['Security Engineer'], '2-4 weeks'),

('00000007-6400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-6000-4000-8000-000000000001', 'DDoS Protection', 'Network attack mitigation', 'Software', 1, 4, 'important',
 '[{"id": "ddos1", "question": "DDoS mitigation strategy?", "context": "Availability protection"}, {"id": "ddos2", "question": "Scrubbing center or on-premise?", "context": "Defense approach"}]',
 ARRAY['Network Security Engineer'], '4-8 weeks'),

('00000007-6500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-6000-4000-8000-000000000001', 'Compliance Monitoring', 'Audit and compliance systems', 'Regulatory', 1, 5, 'important',
 '[{"id": "cm1", "question": "Automated compliance monitoring?", "context": "Continuous compliance"}, {"id": "cm2", "question": "Log retention policy?", "context": "Regulatory requirements"}]',
 ARRAY['Compliance Officer'], '4-8 weeks'),

('00000007-6600-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-6000-4000-8000-000000000001', 'Incident Response', 'Security incident procedures', 'Operations', 1, 6, 'critical',
 '[{"id": "ir1", "question": "Incident response plan and team?", "context": "Security readiness"}, {"id": "ir2", "question": "Security incident retention and analysis?", "context": "Forensics capability"}]',
 ARRAY['Security Manager', 'Incident Response Team'], '4-8 weeks');

-- Regulatory & Compliance domains (7xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-7000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Regulatory & Compliance', 'UK and EU regulatory compliance', 'Regulatory', 0, 7, 'critical', '[]', ARRAY['Regulatory Affairs Manager', 'Legal Counsel'], NULL),

('00000007-7100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-7000-4000-8000-000000000001', 'UK Planning Permission', 'UK planning and construction approval', 'Regulatory', 1, 1, 'critical',
 '[{"id": "ukpp1", "question": "Have you obtained UK planning permission for the data centre?", "context": "Required for construction"}, {"id": "ukpp2", "question": "Local authority engagement and community consultation?", "context": "Planning process"}, {"id": "ukpp3", "question": "Environmental impact assessment submitted?", "context": "Planning requirement"}]',
 ARRAY['Planning Consultant', 'Project Manager'], '12-24 weeks'),

('00000007-7200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-7000-4000-8000-000000000001', 'UK Building Regulations', 'Building control and safety compliance', 'Regulatory', 1, 2, 'critical',
 '[{"id": "ukbr1", "question": "Building Regulations approval obtained?", "context": "Construction compliance"}, {"id": "ukbr2", "question": "Fire safety and means of escape design?", "context": "Life safety requirement"}]',
 ARRAY['Building Control Officer', 'Fire Engineer'], '8-12 weeks'),

('00000007-7300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-7000-4000-8000-000000000001', 'UK Grid Connection', 'National Grid ESO connection', 'Regulatory', 1, 3, 'critical',
 '[{"id": "ukgc1", "question": "What is your grid connection agreement with National Grid ESO?", "context": "Power supply approval"}, {"id": "ukgc2", "question": "Distribution Network Operator (DNO) coordination?", "context": "Local grid connection"}, {"id": "ukgc3", "question": "Grid capacity study completed?", "context": "Feasibility"}]',
 ARRAY['Power Engineer', 'Regulatory Affairs'], '16-36 weeks'),

('00000007-7400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-7000-4000-8000-000000000001', 'EU AI Act Compliance', 'EU AI regulation compliance', 'Regulatory', 1, 4, 'critical',
 '[{"id": "euai1", "question": "What is your approach to EU AI Act compliance for hosted models?", "context": "High-risk AI systems"}, {"id": "euai2", "question": "AI system risk classification?", "context": "Determines compliance requirements"}, {"id": "euai3", "question": "Model transparency and documentation?", "context": "EU AI Act requirement"}]',
 ARRAY['AI Governance Officer', 'Legal Counsel'], '8-16 weeks'),

('00000007-7500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-7000-4000-8000-000000000001', 'UK & EU GDPR', 'Data protection compliance', 'Regulatory', 1, 5, 'critical',
 '[{"id": "gdpr1", "question": "How does your facility comply with UK GDPR and EU GDPR?", "context": "Data processing requirements"}, {"id": "gdpr2", "question": "Data Processing Impact Assessment (DPIA)?", "context": "High-risk processing"}, {"id": "gdpr3", "question": "Cross-border data transfer mechanisms?", "context": "International customers"}]',
 ARRAY['Data Protection Officer', 'Legal Counsel'], '6-12 weeks'),

('00000007-7600-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-7000-4000-8000-000000000001', 'Energy Efficiency Regulations', 'UK energy efficiency compliance', 'Regulatory', 1, 6, 'important',
 '[{"id": "eer1", "question": "Compliance with UK energy efficiency standards?", "context": "ESOS and CCA schemes"}, {"id": "eer2", "question": "PUE reporting requirements?", "context": "Transparency"}]',
 ARRAY['Sustainability Manager'], '4-8 weeks'),

('00000007-7700-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-7000-4000-8000-000000000001', 'Environmental Impact Assessment', 'EIA and environmental permitting', 'Regulatory', 1, 7, 'important',
 '[{"id": "eia1", "question": "Environmental Impact Assessment completed?", "context": "Large developments"}, {"id": "eia2", "question": "Water abstraction and discharge permits?", "context": "Cooling system requirements"}]',
 ARRAY['Environmental Consultant'], '12-24 weeks');

-- Business & Operations domains (8xxx series)
INSERT INTO knowledge_domains (id, template_id, parent_id, name, description, category, depth, display_order, criticality, key_questions, typical_roles, learning_time_estimate) VALUES
('00000007-8000-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', NULL, 'Business & Operations', 'Commercial operations and management', 'Business', 0, 8, 'important', '[]', ARRAY['General Manager', 'Operations Director'], NULL),

('00000007-8100-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-8000-4000-8000-000000000001', 'Site Selection', 'Location selection and criteria', 'Business', 1, 1, 'critical',
 '[{"id": "ss1", "question": "What site selection criteria?", "context": "Power, connectivity, climate"}, {"id": "ss2", "question": "Proximity to fiber and network connectivity?", "context": "Latency and bandwidth"}]',
 ARRAY['Real Estate Manager', 'Project Manager'], '8-16 weeks'),

('00000007-8200-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-8000-4000-8000-000000000001', 'Capacity Planning', 'Growth and expansion planning', 'Operations', 1, 2, 'important',
 '[{"id": "cp1", "question": "What capacity growth projections?", "context": "Phasing strategy"}, {"id": "cp2", "question": "Modular or monolithic build-out?", "context": "Capital efficiency"}]',
 ARRAY['Capacity Planner'], '4-8 weeks'),

('00000007-8300-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-8000-4000-8000-000000000001', 'Customer Contracts', 'Service agreements and SLAs', 'Business', 1, 3, 'important',
 '[{"id": "cc1", "question": "What service level agreements (SLAs)?", "context": "Uptime and performance guarantees"}, {"id": "cc2", "question": "Reserved or on-demand capacity model?", "context": "Business model"}]',
 ARRAY['Sales Director', 'Contracts Manager'], '4-8 weeks'),

('00000007-8400-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-8000-4000-8000-000000000001', 'SLA Management', 'Service level monitoring and management', 'Operations', 1, 4, 'critical',
 '[{"id": "sla1", "question": "SLA monitoring and reporting systems?", "context": "Customer transparency"}, {"id": "sla2", "question": "SLA credit policies?", "context": "Customer satisfaction"}]',
 ARRAY['Service Manager'], '2-4 weeks'),

('00000007-8500-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-8000-4000-8000-000000000001', 'Pricing Models', 'Compute pricing strategy', 'Business', 1, 5, 'important',
 '[{"id": "pm1", "question": "GPU-hour or node-based pricing?", "context": "Revenue model"}, {"id": "pm2", "question": "Spot or reserved instance pricing?", "context": "Utilization optimization"}]',
 ARRAY['Pricing Manager', 'Finance'], '2-4 weeks'),

('00000007-8600-4000-8000-000000000001', '00000007-0000-4000-8000-000000000001', '00000007-8000-4000-8000-000000000001', 'Sustainability Reporting', 'ESG and carbon reporting', 'Business', 1, 6, 'important',
 '[{"id": "sr1", "question": "Carbon footprint tracking and reporting?", "context": "ESG requirements"}, {"id": "sr2", "question": "Renewable energy procurement strategy?", "context": "Sustainability goals"}]',
 ARRAY['Sustainability Manager'], '4-8 weeks');

-- Update template counts
UPDATE blueprint_templates SET
  estimated_domains = (SELECT COUNT(*) FROM knowledge_domains WHERE template_id = '00000007-0000-4000-8000-000000000001'),
  estimated_questions = (SELECT COUNT(*) FROM knowledge_domains kd, jsonb_array_elements(kd.key_questions) WHERE kd.template_id = '00000007-0000-4000-8000-000000000001')
WHERE id = '00000007-0000-4000-8000-000000000001';

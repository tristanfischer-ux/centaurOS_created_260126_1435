-- =============================================
-- SEED DATA: Centaur Marketplace
-- =============================================

INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
VALUES
-- CATEGORY A: PEOPLE
    -- Executives
    ('People', 'Executive', 'Dr. Sarah Chen', 'Fractional CTO with 15 years in aerospace. Ex-Airbus. Expert in systems architecture and digital transformation.', '{"role": "Fractional CTO", "rate": "£1200/day", "availability": "2 days/week", "expertise": ["Aerospace", "Systems Architecture", "Digital Transformation"]}', NULL, true),
    ('People', 'Executive', 'James Sterling', 'Manufacturing Operations Lead. 20 years managing high-volume production lines. Lean Six Sigma Black Belt.', '{"role": "Ops Lead", "rate": "£1000/day", "availability": "3 days/week", "expertise": ["Lean Manufacturing", "Six Sigma", "Operations"]}', NULL, true),
    ('People', 'Executive', 'Elena Rodriguez', 'Strategic Finance Director. Specializing in scaling deep tech startups from Series A to C.', '{"role": "Fractional CFO", "rate": "£1100/day", "availability": "1 day/week", "expertise": ["Fundraising", "Financial Modeling", "SaaS Metrics"]}', NULL, true),
    ('People', 'Executive', 'Marcus Thorne', 'Chief Product Officer. Led product teams at 3 unicorns. Expert in B2B SaaS and PLG.', '{"role": "Fractional CPO", "rate": "£1300/day", "availability": "2 days/week", "expertise": ["Product Strategy", "PLG", "UX Leadership"]}', NULL, true),
    ('People', 'Executive', 'Dr. Aris Vlahos', 'AI Research Lead. PhD in Computer Vision. Specializing in industrial defect detection models.', '{"role": "AI Lead", "rate": "£1500/day", "availability": "1 day/week", "expertise": ["Computer Vision", "Deep Learning", "Industrial AI"]}', NULL, true),

    -- Apprentices
    ('People', 'Apprentice', 'David Miller', 'CAD Specialist. Recent Imperial College grad. Proficient in complex surface modeling.', '{"role": "CAD Specialist", "rate": "£2000/month", "skills": ["Fusion360", "SolidWorks", "Generative Design"], "education": "Imperial College London"}', NULL, true),
    ('People', 'Apprentice', 'Priya Patel', 'Supply Chain Analyst. Creating resilient procurement strategies for SMEs.', '{"role": "Analyst", "rate": "£2000/month", "skills": ["Python", "SQL", "Logistics Modeling"], "education": "University of Manchester"}', NULL, true),
    ('People', 'Apprentice', 'Liam O''Connor', 'Mechatronics Junior. Experience with Arduino and PLC programming.', '{"role": "Mechatronics Engineer", "rate": "£2100/month", "skills": ["C++", "PLC", "Circuit Design"], "education": "TU Delft"}', NULL, true),
    ('People', 'Apprentice', 'Sophie Dubois', 'Frontend Developer. React & Tailwind enthusiast. Focus on accessible UI.', '{"role": "Frontend Dev", "rate": "£1900/month", "skills": ["React", "TypeScript", "Tailwind"], "education": "Le Wagon"}', NULL, true),
    ('People', 'Apprentice', 'Noah Kim', 'Data Science Intern. Strong stats background. Python pandas/numpy wizard.', '{"role": "Data Scientist", "rate": "£2000/month", "skills": ["Python", "Statistics", "Machine Learning"], "education": "UCL"}', NULL, true),
    ('People', 'Apprentice', 'Emma Wilson', 'UX/UI Designer. Creating clean, industrial interfaces.', '{"role": "Designer", "rate": "£2000/month", "skills": ["Figma", "Prototyping", "User Research"], "education": "Loughborough University"}', NULL, true),
    ('People', 'Apprentice', 'Lucas Weber', 'Robotics Systems. ROS2 experience with manipulator arms.', '{"role": "Robotics Engineer", "rate": "£2200/month", "skills": ["ROS2", "Python", "Kinematics"], "education": "ETH Zurich"}', NULL, true),
    ('People', 'Apprentice', 'Olivia Jones', 'Technical Writer. Simplifying complex engineering documentation.', '{"role": "Tech Writer", "rate": "£1800/month", "skills": ["Documentation", "Markdown", "Technical Communication"], "education": "University of Bristol"}', NULL, true),


-- CATEGORY B: PRODUCTS (Additive Manufacturing)
    -- Materials (1-5)
    ('Products', 'Material', 'Ti-64 Grade 23 Powder (Kg)', 'Medical grade Titanium alloy powder for SLM systems. High biocompatibility.', '{"unit": "kg", "price": "£250", "lead_time": "2 days", "spec": "ASTM F136"}', NULL, true),
    ('Products', 'Material', 'Inconel 718 Powder (Kg)', 'Nickel-chromium-based superalloy. High heat resistance for aerospace.', '{"unit": "kg", "price": "£180", "lead_time": "3 days", "spec": "AMS 5662"}', NULL, true),
    ('Products', 'Material', 'AlSi10Mg Powder (Kg)', 'Aluminum alloy for lightweight, strong components. Good thermal properties.', '{"unit": "kg", "price": "£60", "lead_time": "1 day", "spec": "DIN EN 1706"}', NULL, true),
    ('Products', 'Material', 'PA12 Nylon Powder (Kg)', 'Robust thermoplastic for SLS. Excellent chemical resistance.', '{"unit": "kg", "price": "£80", "lead_time": "1 day", "spec": "Industrial Grade"}', NULL, true),
    ('Products', 'Material', 'Maraging Steel MS1 (Kg)', 'High strength tooling steel. Easily heat-treatable.', '{"unit": "kg", "price": "£90", "lead_time": "2 days", "spec": "1.2709"}', NULL, true),

    -- Machine Hours (6-10)
    ('Products', 'Machine Capacity', 'EOS M 290 Capacity (48h Block)', 'Standard DMLS system for metal parts. 250x250x325mm build volume.', '{"unit": "Block (48h)", "rate": "£3500", "location": "Birmingham, UK", "machine_type": "DMLS"}', NULL, true),
    ('Products', 'Machine Capacity', 'Renishaw AM 500Q (24h Rush)', 'Quad-laser system for high productivity. Rapid turnaround.', '{"unit": "Day (24h)", "rate": "£2800", "location": "Sheffield, UK", "machine_type": "Renishaw Quad"}', NULL, true),
    ('Products', 'Machine Capacity', 'HP Multi Jet Fusion 5200', 'High-speed polymer production. Ideal for batch manufacturing.', '{"unit": "Build", "rate": "£1200", "location": "Munich, DE", "machine_type": "MJF"}', NULL, true),
    ('Products', 'Machine Capacity', 'Stratasys F900', 'Large format FDM. Industrial thermoplastics (Ultem, ASA).', '{"unit": "Day", "rate": "£1500", "location": "Bristol, UK", "machine_type": "FDM"}', NULL, true),
    ('Products', 'Machine Capacity', 'SLM 280', 'Dual-laser selective laser melting. Open parameter accessibility.', '{"unit": "Day", "rate": "£2200", "location": "Lyon, FR", "machine_type": "SLM"}', NULL, true),

    -- Post-Processing (11-15)
    ('Products', 'Post-Processing', 'Heat Treatment (Vacuum Furnace)', 'Stress relief and annealing in inert atmosphere.', '{"unit": "Batch", "price": "£450", "capacity": "500kg", "standard": "AMS 2750"}', NULL, true),
    ('Products', 'Post-Processing', 'HIP (Hot Isostatic Pressing)', 'Eliminating internal porosity and improving mechanical properties.', '{"unit": "Batch", "price": "£1200", "cycle_time": "48h", "pressure": "100MPa"}', NULL, true),
    ('Products', 'Post-Processing', 'CNC Finishing (5-Axis)', 'Precision machining of AM parts to tight tolerances.', '{"unit": "Hour", "rate": "£120", "machine": "Hermle C400", "accuracy": "±0.01mm"}', NULL, true),
    ('Products', 'Post-Processing', 'Shot Peening', 'Surface enhancement to improve fatigue life.', '{"unit": "part", "rate": "£15", "media": "Ceramic/Glass", "standard": "SAE J2441"}', NULL, true),
    ('Products', 'Post-Processing', 'Anodizing Type II', 'Protective and decorative surface treatment for Aluminum.', '{"unit": "Batch", "price": "£200", "colors": ["Black", "Clear", "Red"], "standard": "MIL-A-8625"}', NULL, true),

    -- Quality/Testing (16-20)
    ('Products', 'Quality', 'CT Scan Analysis', 'Non-destructive internal void and geometry inspection.', '{"unit": "Scan", "price": "£350", "resolution": "50 micron", "report": "Voxel Analysis"}', NULL, true),
    ('Products', 'Quality', 'Tensile Testing (ASTM E8)', 'Mechanical property verification using standard coupons.', '{"unit": "Test set", "price": "£150", "spec": "ASTM E8", "output": "Stress-Strain Curve"}', NULL, true),
    ('Products', 'Quality', 'Powder Characterization', 'PSD, Flowability, and Moisture analysis for metal powders.', '{"unit": "Sample", "price": "£200", "tests": ["Hall Flow", "PSD", "Humidity"]}', NULL, true),
    ('Products', 'Quality', '3D Scanning (Metrology)', 'Comparing physical part to CAD model (Colour map).', '{"unit": "Part", "price": "£180", "accuracy": "0.02mm", "system": "GOM ATOS"}', NULL, true),
    ('Products', 'Quality', 'Dye Penetrant Inspection', 'Surface crack detection for non-porous materials.', '{"unit": "Part", "price": "£45", "level": "Level 2", "standard": "ASTM E1417"}', NULL, true),


-- CATEGORY C: SERVICES
    -- VC
    ('Services', 'VC', 'DeepTech Ventures UK', 'Early stage deep tech investor. Seed to Series A.', '{"stage": "Seed/Series A", "check_size": "£500k-£2m", "focus": ["AI", "Robotics", "Materials"]}', NULL, true),
    ('Services', 'VC', 'Atomico Industrial', 'Growth stage funding for industrial tech scaling.', '{"stage": "Series B+", "check_size": "£10m+", "focus": ["Industrial Automation", "Supply Chain"]}', NULL, true),
    ('Services', 'VC', 'Cambridge Innovation Capital', 'Backing intellectual property rich companies from the Cambridge ecosystem.', '{"stage": "Early Stage", "focus": ["Life Sciences", "Deep Tech"], "location": "Cambridge, UK"}', NULL, true),

    -- Legal
    ('Services', 'Legal', 'IP Guard LLP', 'Specialist patent attorneys for engineering and software.', '{"specialty": "Patent Filing", "rate": "Fixed Fee", "jurisdictions": ["UK", "EU", "US"]}', NULL, true),
    ('Services', 'Legal', 'Foundry Law', 'Commercial contracts for manufacturing and supply chain.', '{"specialty": "Commercial Contracts", "rate": "£350/hr", "focus": ["Manufacturing", "SaaS"]}', NULL, true),

    -- Finance
    ('Services', 'Finance', 'R&D Tax Specialists', 'Maximizing R&D tax credits for engineering firms.', '{"service": "R&D Claims", "fee_model": "Contingency (15%)", "success_rate": "99%"}', NULL, true),
    ('Services', 'Finance', 'Fractional CFO Partners', 'Strategic financial guidance without the full-time cost.', '{"service": "Fractional CFO", "model": "Retainer", "rate": "£2500/month"}', NULL, true),

    -- Software
    ('Services', 'Software', 'Jira Enterprise Setup', 'Custom workflow configuration for complex engineering teams.', '{"platform": "Jira", "service": "Implementation", "timeframe": "2-4 weeks"}', NULL, true),
    ('Services', 'Software', 'HubSpot Integration Agency', 'Connecting CRM with ERP for seamless data flow.', '{"platform": "HubSpot", "service": "Integration", "expertise": ["Salesforce", "NetSuite"]}', NULL, true),

    -- Pitch Prep (Investment Readiness)
    ('Services', 'Pitch Prep', 'Deck Doctor', 'Expert pitch deck design and narrative development. We''ve helped 50+ startups raise £100M+.', '{"service": "Pitch Deck Design", "rate": "£2,500-£5,000", "deliverables": ["Investor Deck", "One-Pager", "Financial Model Review"], "turnaround": "5-7 days"}', NULL, true),
    ('Services', 'Pitch Prep', 'Founder Coaching Co', 'One-on-one pitch coaching with ex-VCs. Practice sessions, Q&A prep, and live feedback.', '{"service": "Pitch Coaching", "rate": "£500/session", "deliverables": ["3x Practice Sessions", "Q&A Preparation", "Video Review"], "turnaround": "1-2 weeks"}', NULL, true),
    ('Services', 'Pitch Prep', 'Story Capital', 'Narrative strategy for deep tech founders. We translate complex tech into investor-friendly stories.', '{"service": "Narrative Development", "rate": "£3,000-£8,000", "deliverables": ["Investment Thesis", "Market Story", "Competitive Positioning"], "focus": ["Deep Tech", "Hardware", "Climate"]}', NULL, true),
    ('Services', 'Pitch Prep', 'Financial Model Factory', 'Investor-grade financial models for hardware and SaaS companies. Built by ex-investment bankers.', '{"service": "Financial Modeling", "rate": "£1,500-£4,000", "deliverables": ["3-Statement Model", "Unit Economics", "Scenario Analysis"], "turnaround": "7-10 days"}', NULL, true),
    ('Services', 'Pitch Prep', 'Due Diligence Ready', 'Comprehensive data room preparation and due diligence document assembly.', '{"service": "Data Room Setup", "rate": "£2,000-£3,500", "deliverables": ["Virtual Data Room", "Document Checklist", "Cap Table Clean-up"], "turnaround": "2-3 weeks"}', NULL, true),


-- CATEGORY D: AI (Agents)
    ('AI', 'Agent', 'Supply Chain Sentinel', '24/7 Risk monitoring for your global supply chain.', '{"function": "Risk Monitoring", "cost": "£50/month", "inputs": ["News API", "Supplier Data"], "latency": "Real-time"}', NULL, true),
    ('AI', 'Agent', 'Contract Review Bot', 'Instant legal review for NDAs and simple service agreements.', '{"function": "Legal Review", "cost": "£0.50/page", "accuracy": "95%", "model": "LegalBERT component"}', NULL, true),
    ('AI', 'Agent', 'Market Scraper', 'Aggregates pricing data from competitors and suppliers.', '{"function": "Market Intelligence", "cost": "£30/month", "frequency": "Daily", "sources": "Web"}', NULL, true),
    ('AI', 'Agent', 'RFQ Generator', 'Autofills complex RFQ forms based on CAD files and specs.', '{"function": "Automation", "cost": "£100/month", "inputs": ["STEP files", "PDF specs"], "savings": "4h/week"}', NULL, true),
    ('AI', 'Agent', 'Code Pilot', 'Context-aware coding assistant trained on your repository.', '{"function": "Coding Assistant", "cost": "£20/user/month", "languages": ["TypeScript", "Python", "Rust"]}', NULL, true),
    ('AI', 'Agent', 'Compliance Checker (ISO 9001)', 'Audits your documentation against ISO 9001 standards.', '{"function": "Compliance", "cost": "£200/audit", "standard": "ISO 9001:2015", "output": "Gap Analysis Report"}', NULL, true);

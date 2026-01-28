-- =============================================
-- ENHANCED SEED DATA: Marketplace People (Detailed & Comparable)
-- =============================================

-- First, delete existing People listings
DELETE FROM public.marketplace_listings WHERE category = 'People';

-- EXECUTIVES - Detailed profiles for comparison
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
VALUES
    ('People', 'Executive', 'Dr. Sarah Chen', 
     'Fractional CTO with 15 years in aerospace and defense. Former VP Engineering at Airbus. Led teams of 200+ engineers. Expert in systems architecture, digital transformation, and regulatory compliance. Published author on aerospace safety systems.',
     '{
        "role": "Fractional CTO",
        "rate": "£1,200/day",
        "availability": "2 days/week",
        "years_experience": 15,
        "industries": ["Aerospace", "Defense", "Automotive"],
        "expertise": ["Systems Architecture", "Digital Transformation", "Team Leadership", "Regulatory Compliance"],
        "education": "PhD Aerospace Engineering, MIT",
        "location": "London, UK",
        "languages": ["English", "Mandarin"],
        "previous_companies": ["Airbus", "Boeing", "Rolls-Royce"],
        "certifications": ["PMP", "TOGAF"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'James Sterling', 
     'Manufacturing Operations Lead with 20 years experience managing high-volume production. Lean Six Sigma Black Belt and Master Black Belt trainer. Reduced operational costs by 40% at previous role. Specialist in factory automation and Industry 4.0.',
     '{
        "role": "Operations Lead",
        "rate": "£1,000/day",
        "availability": "3 days/week",
        "years_experience": 20,
        "industries": ["Manufacturing", "Automotive", "Consumer Electronics"],
        "expertise": ["Lean Manufacturing", "Six Sigma", "Factory Automation", "Supply Chain"],
        "education": "MBA, Warwick Business School",
        "location": "Birmingham, UK",
        "languages": ["English", "German"],
        "previous_companies": ["JLR", "BMW", "Dyson"],
        "certifications": ["Six Sigma Black Belt", "APICS CSCP"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'Elena Rodriguez', 
     'Strategic Finance Director specializing in deep tech startups. Raised £150M+ across 12 funding rounds. Former Goldman Sachs. Expert in financial modeling, investor relations, and M&A. Board advisor to 5 startups.',
     '{
        "role": "Fractional CFO",
        "rate": "£1,400/day",
        "availability": "1 day/week",
        "years_experience": 18,
        "industries": ["Deep Tech", "SaaS", "Fintech"],
        "expertise": ["Fundraising", "Financial Modeling", "M&A", "Investor Relations"],
        "education": "MBA Finance, London Business School",
        "location": "London, UK",
        "languages": ["English", "Spanish", "Portuguese"],
        "previous_companies": ["Goldman Sachs", "Revolut", "Deliveroo"],
        "certifications": ["CFA", "ACA"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'Marcus Thorne', 
     'Chief Product Officer who has led product teams at 3 unicorns. 12 years building B2B SaaS products. Pioneer in product-led growth strategies. Scaled products from 0 to 10M users. Regular speaker at Product conferences.',
     '{
        "role": "Fractional CPO",
        "rate": "£1,300/day",
        "availability": "2 days/week",
        "years_experience": 12,
        "industries": ["B2B SaaS", "Fintech", "Enterprise Software"],
        "expertise": ["Product Strategy", "PLG", "UX Leadership", "Roadmap Planning"],
        "education": "MSc Computer Science, Stanford",
        "location": "Remote (UK-based)",
        "languages": ["English"],
        "previous_companies": ["Stripe", "Notion", "Figma"],
        "certifications": ["Certified Product Manager"],
        "timezone": "GMT/PST"
     }', NULL, true),

    ('People', 'Executive', 'Dr. Aris Vlahos', 
     'AI Research Lead with PhD in Computer Vision from Oxford. 10 years applying ML to industrial problems. Built defect detection systems achieving 99.7% accuracy. Published 25+ papers. Former Google DeepMind researcher.',
     '{
        "role": "AI Lead",
        "rate": "£1,500/day",
        "availability": "1 day/week",
        "years_experience": 10,
        "industries": ["Industrial AI", "Robotics", "Healthcare"],
        "expertise": ["Computer Vision", "Deep Learning", "MLOps", "Industrial Automation"],
        "education": "PhD Computer Vision, Oxford",
        "location": "Cambridge, UK",
        "languages": ["English", "Greek"],
        "previous_companies": ["Google DeepMind", "NVIDIA", "Ocado"],
        "certifications": ["Google Cloud ML Engineer"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'Victoria Hammond', 
     'Chief Revenue Officer with 16 years in enterprise sales. Built sales teams from 5 to 150 reps. £200M+ ARR generated. Expert in MEDDIC methodology. Former VP Sales at Salesforce EMEA.',
     '{
        "role": "Fractional CRO",
        "rate": "£1,350/day",
        "availability": "2 days/week",
        "years_experience": 16,
        "industries": ["Enterprise SaaS", "Cloud Infrastructure", "Cybersecurity"],
        "expertise": ["Enterprise Sales", "Sales Leadership", "Revenue Operations", "Go-to-Market"],
        "education": "BA Economics, Cambridge",
        "location": "London, UK",
        "languages": ["English", "French"],
        "previous_companies": ["Salesforce", "ServiceNow", "Datadog"],
        "certifications": ["MEDDIC Certified"],
        "timezone": "GMT"
     }', NULL, true),

-- APPRENTICES - Detailed profiles for comparison
    ('People', 'Apprentice', 'David Miller', 
     'CAD Specialist with First Class Honours from Imperial College. 2 years industry experience. Expert in complex surface modeling and generative design. Completed 50+ client projects. Passionate about sustainable manufacturing.',
     '{
        "role": "CAD Specialist",
        "rate": "£2,200/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Fusion 360", "SolidWorks", "CATIA", "Generative Design", "GD&T"],
        "education": "MEng Mechanical Engineering, Imperial College London",
        "location": "London, UK",
        "languages": ["English"],
        "projects_completed": 50,
        "github": "github.com/dmiller-cad",
        "portfolio": "Available",
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Priya Patel', 
     'Supply Chain Analyst building resilient procurement strategies. Strong analytical background with Python and SQL. Reduced procurement costs by 25% in internship. Published research on supply chain resilience.',
     '{
        "role": "Supply Chain Analyst",
        "rate": "£2,000/month",
        "availability": "Full-time",
        "years_experience": 1,
        "skills": ["Python", "SQL", "Tableau", "SAP", "Logistics Modeling"],
        "education": "MSc Supply Chain Management, Manchester",
        "location": "Manchester, UK",
        "languages": ["English", "Hindi", "Gujarati"],
        "projects_completed": 15,
        "certifications": ["SAP SCM"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Liam O''Connor', 
     'Mechatronics Engineer with hands-on experience in robotics and automation. Built 3 award-winning robots at TU Delft. Expert in PLC programming and circuit design. Fluent in C++ and Python.',
     '{
        "role": "Mechatronics Engineer",
        "rate": "£2,400/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["C++", "Python", "PLC Programming", "Circuit Design", "ROS", "Arduino"],
        "education": "MSc Mechatronics, TU Delft",
        "location": "Dublin, Ireland",
        "languages": ["English", "Irish", "Dutch"],
        "projects_completed": 25,
        "github": "github.com/liamrobotics",
        "awards": ["TU Delft Robotics Award 2024"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Sophie Dubois', 
     'Frontend Developer specializing in React and accessible UI design. 3 years experience building production applications. Contributed to open-source design systems. Focus on performance and accessibility.',
     '{
        "role": "Frontend Developer",
        "rate": "£2,100/month",
        "availability": "Full-time",
        "years_experience": 3,
        "skills": ["React", "TypeScript", "Next.js", "Tailwind CSS", "Accessibility", "Testing"],
        "education": "Le Wagon Bootcamp + BSc Computer Science",
        "location": "Paris, France",
        "languages": ["English", "French"],
        "projects_completed": 40,
        "github": "github.com/sophiedev",
        "open_source": "Radix UI Contributor",
        "timezone": "CET"
     }', NULL, true),

    ('People', 'Apprentice', 'Noah Kim', 
     'Data Scientist with strong statistics and ML background. Built predictive models achieving 95%+ accuracy. Experience with large-scale data pipelines. Published researcher in ML applications.',
     '{
        "role": "Data Scientist",
        "rate": "£2,300/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Python", "TensorFlow", "PyTorch", "SQL", "Statistics", "MLOps"],
        "education": "MSc Data Science, UCL",
        "location": "London, UK",
        "languages": ["English", "Korean"],
        "projects_completed": 30,
        "github": "github.com/noahkim-ml",
        "publications": 3,
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Emma Wilson', 
     'UX/UI Designer creating clean, industrial interfaces. 2 years designing for B2B products. Strong user research skills. Figma expert with component library experience.',
     '{
        "role": "UX/UI Designer",
        "rate": "£2,000/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Figma", "Prototyping", "User Research", "Design Systems", "Usability Testing"],
        "education": "BA Industrial Design, Loughborough",
        "location": "Nottingham, UK",
        "languages": ["English"],
        "projects_completed": 35,
        "portfolio": "emmawilson.design",
        "dribbble": "dribbble.com/emmaw",
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Lucas Weber', 
     'Robotics Systems Engineer specializing in ROS2 and manipulator arms. Built autonomous systems for warehouse automation. Strong kinematics and control systems background.',
     '{
        "role": "Robotics Engineer",
        "rate": "£2,500/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["ROS2", "Python", "C++", "Kinematics", "Computer Vision", "SLAM"],
        "education": "MSc Robotics, ETH Zurich",
        "location": "Zurich, Switzerland",
        "languages": ["English", "German", "French"],
        "projects_completed": 20,
        "github": "github.com/lucasrobotics",
        "certifications": ["ROS2 Developer"],
        "timezone": "CET"
     }', NULL, true),

    ('People', 'Apprentice', 'Olivia Jones', 
     'Technical Writer simplifying complex engineering documentation. Created docs for 10+ products. Expert in API documentation and developer experience. Strong technical background.',
     '{
        "role": "Technical Writer",
        "rate": "£1,800/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Technical Writing", "API Documentation", "Markdown", "Git", "Developer Experience"],
        "education": "MA Technical Communication, Bristol",
        "location": "Bristol, UK",
        "languages": ["English"],
        "projects_completed": 45,
        "portfolio": "oliviawrites.dev",
        "tools": ["Notion", "GitBook", "Docusaurus"],
        "timezone": "GMT"
     }', NULL, true);
-- =============================================
-- SEED DATA: AI Marketplace Listings
-- Comprehensive AI tools for manufacturing & enterprise
-- =============================================

-- First, remove existing AI listings to avoid duplicates
DELETE FROM public.marketplace_listings WHERE category = 'AI';

-- Insert detailed AI marketplace listings
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
VALUES

-- =============================================
-- AGENTS (Autonomous Workers)
-- =============================================

('AI', 'Agent', 'Supply Chain Sentinel', 
 'Autonomous AI agent that continuously monitors your global supply chain for disruptions, geopolitical risks, and supplier issues. Proactively alerts procurement teams before problems impact production schedules, reducing supply chain incidents by up to 40%.',
 '{
   "type": "Agent",
   "cost": "£75/month",
   "cost_value": 75,
   "function": "24/7 supply chain risk monitoring and early warning system",
   "autonomy_level": "Full",
   "accuracy": "94%",
   "latency": "Real-time",
   "integrations": ["SAP", "Oracle SCM", "Slack", "Microsoft Teams", "Email"],
   "data_inputs": ["Supplier data feeds", "News APIs", "Weather services", "Shipping trackers", "Financial indicators"],
   "outputs": ["Risk alerts", "Impact assessments", "Mitigation recommendations", "Weekly risk digests"],
   "use_cases": ["Manufacturing", "Supply Chain", "Procurement", "Logistics"],
   "setup_time": "1 day",
   "support": "24/7"
 }', NULL, true),

('AI', 'Agent', 'Inventory Optimizer', 
 'Intelligent stock management agent that autonomously balances inventory levels across warehouses, predicts demand patterns, and triggers reorder points. Reduces carrying costs while maintaining 99%+ service levels through continuous optimization.',
 '{
   "type": "Agent",
   "cost": "£120/month",
   "cost_value": 120,
   "function": "Autonomous inventory optimization and demand-driven replenishment",
   "autonomy_level": "Full",
   "accuracy": "96%",
   "latency": "Real-time",
   "integrations": ["NetSuite", "SAP", "Shopify", "WooCommerce", "QuickBooks"],
   "data_inputs": ["Historical sales", "Seasonality patterns", "Lead times", "Supplier MOQs", "Warehouse capacity"],
   "outputs": ["Reorder recommendations", "Stock transfer orders", "Demand forecasts", "Excess stock alerts"],
   "use_cases": ["Manufacturing", "Retail", "Distribution", "E-commerce"],
   "setup_time": "3 days",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Agent', 'Quality Inspector Bot', 
 'Computer vision-powered autonomous inspector that analyzes production line imagery to detect defects in real-time. Trained on 10M+ defect images, it catches micro-cracks, surface anomalies, and dimensional deviations invisible to human inspectors.',
 '{
   "type": "Agent",
   "cost": "£200/month",
   "cost_value": 200,
   "function": "Automated visual quality inspection and defect detection",
   "autonomy_level": "Full",
   "accuracy": "99.2%",
   "latency": "Real-time",
   "integrations": ["SCADA", "MES systems", "PLC controllers", "Camera feeds", "Slack"],
   "data_inputs": ["Camera streams", "CAD reference models", "Tolerance specs", "Historical defect data"],
   "outputs": ["Pass/Fail decisions", "Defect classifications", "Root cause suggestions", "Quality reports"],
   "use_cases": ["Manufacturing", "Aerospace", "Automotive", "Electronics", "Medical Devices"],
   "setup_time": "1 week",
   "support": "24/7"
 }', NULL, true),

('AI', 'Agent', 'Maintenance Predictor', 
 'Predictive maintenance agent that monitors equipment sensors to forecast failures before they occur. Reduces unplanned downtime by 70% and extends asset lifespan through optimal maintenance scheduling based on actual condition rather than fixed intervals.',
 '{
   "type": "Agent",
   "cost": "£150/month per machine",
   "cost_value": 150,
   "function": "Predictive maintenance and equipment health monitoring",
   "autonomy_level": "Semi",
   "accuracy": "91%",
   "latency": "Minutes",
   "integrations": ["IoT sensors", "CMMS", "SAP PM", "Maximo", "UpKeep"],
   "data_inputs": ["Vibration sensors", "Temperature logs", "Power consumption", "Maintenance history", "OEM specs"],
   "outputs": ["Failure predictions", "Maintenance work orders", "Spare parts recommendations", "Health dashboards"],
   "use_cases": ["Manufacturing", "Energy", "Mining", "Transportation", "Facilities"],
   "setup_time": "1 week",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Agent', 'Compliance Guardian', 
 'Autonomous compliance monitoring agent that continuously audits your operations against regulatory requirements. Tracks changes in regulations, identifies gaps, and generates remediation tasks to maintain certifications like ISO, FDA, and aerospace standards.',
 '{
   "type": "Agent",
   "cost": "£250/month",
   "cost_value": 250,
   "function": "Continuous compliance monitoring and gap analysis",
   "autonomy_level": "Semi",
   "accuracy": "97%",
   "latency": "Hours",
   "integrations": ["Document management", "QMS systems", "Jira", "Asana", "Email"],
   "data_inputs": ["Policy documents", "Process records", "Audit trails", "Regulatory feeds", "Training records"],
   "outputs": ["Compliance scorecards", "Gap analysis reports", "Remediation tasks", "Audit readiness checklists"],
   "use_cases": ["Manufacturing", "Aerospace", "Medical Devices", "Food & Beverage", "Pharmaceuticals"],
   "setup_time": "1 week",
   "support": "Business hours"
 }', NULL, true),


-- =============================================
-- ASSISTANTS (Co-pilot Tools)
-- =============================================

('AI', 'Assistant', 'CAD Co-pilot', 
 'Intelligent design assistant that works alongside engineers in CAD environments. Suggests optimizations, identifies manufacturability issues, estimates costs in real-time, and generates design alternatives. Accelerates design cycles by 3x while reducing engineering change orders.',
 '{
   "type": "Assistant",
   "cost": "£50/user/month",
   "cost_value": 50,
   "function": "AI-powered CAD design assistance and DFM analysis",
   "autonomy_level": "Supervised",
   "accuracy": "92%",
   "latency": "Real-time",
   "integrations": ["SolidWorks", "Fusion 360", "CATIA", "Inventor", "Onshape"],
   "data_inputs": ["CAD models", "Material libraries", "Manufacturing constraints", "Cost databases"],
   "outputs": ["Design suggestions", "DFM warnings", "Cost estimates", "Alternative geometries", "Tolerance analysis"],
   "use_cases": ["Manufacturing", "Aerospace", "Automotive", "Consumer Products", "Medical Devices"],
   "setup_time": "1 hour",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Assistant', 'Code Assistant Pro', 
 'Context-aware coding co-pilot trained on industrial software patterns. Understands PLC logic, embedded systems, and enterprise codebases. Generates boilerplate, suggests refactoring, and catches bugs before commit. Improves developer velocity by 40%.',
 '{
   "type": "Assistant",
   "cost": "£25/user/month",
   "cost_value": 25,
   "function": "Intelligent code completion and development assistance",
   "autonomy_level": "Supervised",
   "accuracy": "89%",
   "latency": "Real-time",
   "integrations": ["VS Code", "JetBrains", "GitHub", "GitLab", "Azure DevOps"],
   "data_inputs": ["Codebase context", "Documentation", "Stack Overflow", "Internal wikis"],
   "outputs": ["Code completions", "Refactoring suggestions", "Bug warnings", "Documentation generation"],
   "use_cases": ["Software Development", "Industrial Automation", "Embedded Systems", "Web Applications"],
   "setup_time": "1 hour",
   "support": "Community"
 }', NULL, true),

('AI', 'Assistant', 'Technical Writer AI', 
 'Documentation assistant that transforms engineering notes into polished technical documents. Maintains consistent terminology, generates diagrams from descriptions, and ensures compliance with documentation standards like ASD-STE100 and industry templates.',
 '{
   "type": "Assistant",
   "cost": "£35/user/month",
   "cost_value": 35,
   "function": "Automated technical documentation and standards compliance",
   "autonomy_level": "Supervised",
   "accuracy": "94%",
   "latency": "Minutes",
   "integrations": ["Confluence", "Notion", "Google Docs", "Microsoft Word", "MadCap Flare"],
   "data_inputs": ["Engineering notes", "Meeting transcripts", "CAD metadata", "Existing docs", "Style guides"],
   "outputs": ["User manuals", "Work instructions", "API documentation", "Training materials", "Compliance docs"],
   "use_cases": ["Manufacturing", "Software", "Aerospace", "Medical Devices", "Engineering Services"],
   "setup_time": "1 hour",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Assistant', 'Meeting Summarizer', 
 'Real-time meeting assistant that captures decisions, action items, and key discussion points. Integrates with your task management system to automatically create follow-up tasks and maintains a searchable archive of institutional knowledge.',
 '{
   "type": "Assistant",
   "cost": "£15/user/month",
   "cost_value": 15,
   "function": "Intelligent meeting capture and action item extraction",
   "autonomy_level": "Supervised",
   "accuracy": "93%",
   "latency": "Real-time",
   "integrations": ["Zoom", "Teams", "Google Meet", "Slack", "Jira", "Asana", "Linear"],
   "data_inputs": ["Meeting audio", "Screen shares", "Chat messages", "Calendar context"],
   "outputs": ["Meeting summaries", "Action items", "Decision logs", "Searchable transcripts"],
   "use_cases": ["All Industries", "Project Management", "Engineering", "Sales", "Executive Teams"],
   "setup_time": "1 hour",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Assistant', 'Sales Engineer Copilot', 
 'Technical sales assistant that helps configure complex products, generate accurate quotes, and answer technical questions during customer calls. Reduces quote turnaround from days to minutes while ensuring technical accuracy.',
 '{
   "type": "Assistant",
   "cost": "£60/user/month",
   "cost_value": 60,
   "function": "Technical sales support and rapid quote generation",
   "autonomy_level": "Supervised",
   "accuracy": "96%",
   "latency": "Real-time",
   "integrations": ["Salesforce", "HubSpot", "CPQ systems", "ERP", "Product configurators"],
   "data_inputs": ["Product catalog", "Pricing rules", "Customer history", "Technical specs", "Competitive intel"],
   "outputs": ["Technical recommendations", "Configured quotes", "Proposal drafts", "Comparison sheets"],
   "use_cases": ["Manufacturing", "Industrial Equipment", "B2B SaaS", "Engineering Services"],
   "setup_time": "3 days",
   "support": "Business hours"
 }', NULL, true),


-- =============================================
-- ANALYZERS (Data Processing)
-- =============================================

('AI', 'Analyzer', 'Cost Estimator', 
 'Advanced manufacturing cost analysis engine that evaluates CAD files, material specifications, and process requirements to generate accurate quotes in minutes. Considers labor, materials, overhead, and regional cost factors with breakdown transparency.',
 '{
   "type": "Analyzer",
   "cost": "£2/estimate",
   "cost_value": 2,
   "function": "Automated manufacturing cost estimation from CAD files",
   "autonomy_level": "Full",
   "accuracy": "94%",
   "latency": "Minutes",
   "integrations": ["CAD systems", "ERP", "MES", "Procurement databases"],
   "data_inputs": ["STEP files", "Material specs", "Quantity requirements", "Process constraints", "Regional cost data"],
   "outputs": ["Detailed cost breakdowns", "Alternative scenarios", "Make vs buy analysis", "Margin recommendations"],
   "use_cases": ["Manufacturing", "Job Shops", "Contract Manufacturing", "Aerospace", "Automotive"],
   "setup_time": "1 day",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Analyzer', 'Demand Forecaster', 
 'Machine learning-powered demand prediction engine that analyzes historical patterns, market signals, and external factors. Provides granular SKU-level forecasts with confidence intervals, enabling precise production planning and inventory optimization.',
 '{
   "type": "Analyzer",
   "cost": "£100/month",
   "cost_value": 100,
   "function": "AI-driven demand forecasting with multi-factor analysis",
   "autonomy_level": "Full",
   "accuracy": "88%",
   "latency": "Hours",
   "integrations": ["ERP", "POS systems", "CRM", "Market data feeds", "Weather APIs"],
   "data_inputs": ["Historical sales", "Promotions calendar", "Economic indicators", "Competitor pricing", "Seasonality"],
   "outputs": ["SKU-level forecasts", "Confidence intervals", "Scenario modeling", "Anomaly alerts"],
   "use_cases": ["Manufacturing", "Retail", "CPG", "Distribution", "E-commerce"],
   "setup_time": "1 week",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Analyzer', 'Defect Classifier', 
 'Deep learning defect analysis system that categorizes quality issues by root cause, severity, and process origin. Identifies patterns across production runs to pinpoint systemic issues and recommends corrective actions based on historical resolutions.',
 '{
   "type": "Analyzer",
   "cost": "£0.10/analysis",
   "cost_value": 0,
   "function": "Automated defect root cause analysis and classification",
   "autonomy_level": "Full",
   "accuracy": "97%",
   "latency": "Real-time",
   "integrations": ["QMS", "MES", "Vision systems", "CMM", "Lab equipment"],
   "data_inputs": ["Defect images", "Process parameters", "Material batch data", "Operator logs", "Environmental conditions"],
   "outputs": ["Defect classifications", "Root cause probabilities", "Trend analysis", "Corrective action suggestions"],
   "use_cases": ["Manufacturing", "Automotive", "Electronics", "Aerospace", "Medical Devices"],
   "setup_time": "1 week",
   "support": "24/7"
 }', NULL, true),

('AI', 'Analyzer', 'Contract Analyzer', 
 'Legal document analysis engine that reviews contracts for risks, obligations, and non-standard clauses. Compares against your playbook, highlights deviations, and extracts key terms for faster negotiation cycles and reduced legal review costs.',
 '{
   "type": "Analyzer",
   "cost": "£1.50/page",
   "cost_value": 2,
   "function": "AI-powered contract review and risk identification",
   "autonomy_level": "Semi",
   "accuracy": "95%",
   "latency": "Minutes",
   "integrations": ["DocuSign", "Ironclad", "ContractPodAi", "SharePoint", "Google Drive"],
   "data_inputs": ["Contract PDFs", "Company playbooks", "Historical agreements", "Industry benchmarks"],
   "outputs": ["Risk assessments", "Clause extraction", "Redline suggestions", "Obligation summaries"],
   "use_cases": ["Legal", "Procurement", "Sales", "Partnerships", "M&A"],
   "setup_time": "1 day",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Analyzer', 'Energy Optimizer', 
 'Facility energy analysis system that identifies consumption patterns, waste, and optimization opportunities. Provides actionable recommendations for reducing energy costs by 15-30% while maintaining production targets and comfort levels.',
 '{
   "type": "Analyzer",
   "cost": "£80/month per facility",
   "cost_value": 80,
   "function": "Energy consumption analysis and optimization recommendations",
   "autonomy_level": "Full",
   "accuracy": "92%",
   "latency": "Hours",
   "integrations": ["BMS", "Smart meters", "SCADA", "Weather services", "Utility APIs"],
   "data_inputs": ["Energy consumption data", "Production schedules", "Weather forecasts", "Utility tariffs", "Equipment specs"],
   "outputs": ["Consumption dashboards", "Anomaly detection", "Optimization recommendations", "ROI projections"],
   "use_cases": ["Manufacturing", "Warehousing", "Data Centers", "Commercial Buildings", "Retail"],
   "setup_time": "3 days",
   "support": "Business hours"
 }', NULL, true),


-- =============================================
-- AUTOMATION (Workflow Triggers)
-- =============================================

('AI', 'Automation', 'RFQ Auto-responder', 
 'Intelligent RFQ processing automation that receives incoming quote requests, extracts specifications, queries your pricing engine, and generates professional quote responses. Reduces response time from days to hours while maintaining accuracy.',
 '{
   "type": "Automation",
   "cost": "£5/RFQ processed",
   "cost_value": 5,
   "function": "Automated RFQ intake, analysis, and quote generation",
   "autonomy_level": "Semi",
   "accuracy": "93%",
   "latency": "Minutes",
   "integrations": ["Email", "Web portals", "CRM", "ERP", "CPQ systems"],
   "data_inputs": ["RFQ emails", "PDF attachments", "CAD files", "Pricing databases", "Customer history"],
   "outputs": ["Structured RFQ data", "Draft quotes", "Clarification requests", "Win probability scores"],
   "use_cases": ["Manufacturing", "Job Shops", "Contract Manufacturing", "Engineering Services"],
   "setup_time": "1 week",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Automation', 'Invoice Processor', 
 'End-to-end invoice automation that captures incoming invoices, extracts line items, matches to POs, flags discrepancies, and routes for approval. Reduces AP processing costs by 80% while eliminating manual data entry errors.',
 '{
   "type": "Automation",
   "cost": "£0.75/invoice",
   "cost_value": 1,
   "function": "Intelligent invoice capture, matching, and approval routing",
   "autonomy_level": "Full",
   "accuracy": "98%",
   "latency": "Minutes",
   "integrations": ["QuickBooks", "Xero", "SAP", "NetSuite", "Email", "Slack"],
   "data_inputs": ["Invoice PDFs", "Email attachments", "Purchase orders", "Vendor master data"],
   "outputs": ["Extracted invoice data", "PO match results", "Exception flags", "Approval workflows"],
   "use_cases": ["All Industries", "Finance", "Procurement", "Operations"],
   "setup_time": "1 day",
   "support": "24/7"
 }', NULL, true),

('AI', 'Automation', 'Order Router', 
 'Smart order orchestration system that automatically routes incoming orders to optimal fulfillment locations based on inventory, capacity, shipping costs, and delivery promises. Reduces fulfillment costs while improving on-time delivery rates.',
 '{
   "type": "Automation",
   "cost": "£0.25/order",
   "cost_value": 0,
   "function": "Intelligent order routing and fulfillment optimization",
   "autonomy_level": "Full",
   "accuracy": "99%",
   "latency": "Real-time",
   "integrations": ["Shopify", "WooCommerce", "Amazon", "ERP", "WMS", "3PL systems"],
   "data_inputs": ["Order details", "Inventory levels", "Shipping rates", "Capacity data", "Customer location"],
   "outputs": ["Routing decisions", "Split order recommendations", "Carrier selections", "Delivery estimates"],
   "use_cases": ["E-commerce", "Distribution", "Manufacturing", "Retail", "3PL"],
   "setup_time": "3 days",
   "support": "24/7"
 }', NULL, true),

('AI', 'Automation', 'Onboarding Orchestrator', 
 'Employee and vendor onboarding automation that triggers provisioning workflows, collects required documents, schedules training, and tracks completion. Reduces onboarding time by 60% while ensuring compliance with all requirements.',
 '{
   "type": "Automation",
   "cost": "£15/onboarding",
   "cost_value": 15,
   "function": "Automated onboarding workflow orchestration and tracking",
   "autonomy_level": "Semi",
   "accuracy": "99%",
   "latency": "Real-time",
   "integrations": ["Workday", "BambooHR", "Okta", "Google Workspace", "Microsoft 365", "Slack"],
   "data_inputs": ["New hire data", "Role requirements", "Compliance checklists", "Training catalogs"],
   "outputs": ["Provisioning requests", "Document collection", "Training assignments", "Progress dashboards"],
   "use_cases": ["HR", "IT", "Procurement", "All Industries"],
   "setup_time": "1 week",
   "support": "Business hours"
 }', NULL, true),

('AI', 'Automation', 'Alert Dispatcher', 
 'Intelligent alerting system that consolidates notifications from multiple sources, deduplicates, prioritizes by urgency, and routes to the right people via their preferred channels. Reduces alert fatigue while ensuring critical issues get immediate attention.',
 '{
   "type": "Automation",
   "cost": "£30/month",
   "cost_value": 30,
   "function": "Smart alert aggregation, prioritization, and routing",
   "autonomy_level": "Full",
   "accuracy": "97%",
   "latency": "Real-time",
   "integrations": ["PagerDuty", "OpsGenie", "Datadog", "Slack", "Teams", "SMS", "Email"],
   "data_inputs": ["System alerts", "Monitoring data", "On-call schedules", "Escalation policies"],
   "outputs": ["Prioritized alerts", "Escalations", "Incident summaries", "Response tracking"],
   "use_cases": ["DevOps", "IT Operations", "Manufacturing", "Facilities Management"],
   "setup_time": "1 day",
   "support": "24/7"
 }', NULL, true),

('AI', 'Automation', 'Report Generator', 
 'Automated business reporting engine that pulls data from multiple sources, applies transformations, and generates formatted reports on schedule. Eliminates manual report building while ensuring stakeholders receive consistent, accurate insights.',
 '{
   "type": "Automation",
   "cost": "£40/month",
   "cost_value": 40,
   "function": "Automated multi-source report generation and distribution",
   "autonomy_level": "Full",
   "accuracy": "99%",
   "latency": "Hours",
   "integrations": ["SQL databases", "Google Sheets", "Excel", "Salesforce", "HubSpot", "ERP systems"],
   "data_inputs": ["Database queries", "API endpoints", "Spreadsheets", "Report templates"],
   "outputs": ["PDF reports", "Interactive dashboards", "Email summaries", "Scheduled distributions"],
   "use_cases": ["Finance", "Operations", "Sales", "Executive Reporting", "All Industries"],
   "setup_time": "1 day",
   "support": "Business hours"
 }', NULL, true);
-- =============================================
-- SEED DATA: Marketplace Products (Detailed & Comparable)
-- =============================================

-- First, delete existing Products listings
DELETE FROM public.marketplace_listings WHERE category = 'Products';

-- =============================================
-- SUBCATEGORY: Manufacturer (8-10 companies)
-- =============================================
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
VALUES
    ('Products', 'Manufacturer', 'Precision Dynamics Ltd',
     'Leading UK CNC machining specialist with 15 years of aerospace and defense experience. ISO 9001 and AS9100 certified facility in Sheffield with 25 CNC machines including 5-axis capability. Known for tight-tolerance work and rapid prototyping with typical turnaround of 5-7 days.',
     '{
        "company_type": "CNC",
        "location": "Sheffield, UK",
        "certifications": ["ISO 9001", "AS9100", "Cyber Essentials Plus"],
        "capabilities": ["5-axis CNC", "Turn-Mill", "EDM", "Surface Grinding"],
        "industries": ["Aerospace", "Defense", "Medical Devices"],
        "lead_time": "5-7 days",
        "min_order": "£500",
        "capacity_available": "35%",
        "employees": 65,
        "established": 2009,
        "machines": 25,
        "max_part_size": "1200x800x600mm",
        "materials": ["Titanium", "Inconel", "Aluminum", "Stainless Steel"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'AdditiveTech GmbH',
     'German metal 3D printing powerhouse operating Europe''s largest DMLS facility. Specializes in complex aerospace and medical components with full in-house post-processing. AS9100D and ISO 13485 certified. Pioneer in topology-optimized lightweight structures achieving up to 60% weight reduction.',
     '{
        "company_type": "3D Printing",
        "location": "Munich, Germany",
        "certifications": ["ISO 9001", "AS9100D", "ISO 13485", "NADCAP"],
        "capabilities": ["DMLS", "EBM", "SLM", "DED", "Heat Treatment", "HIP"],
        "industries": ["Aerospace", "Medical", "Motorsport", "Energy"],
        "lead_time": "2-3 weeks",
        "min_order": "€2,000",
        "capacity_available": "25%",
        "employees": 120,
        "established": 2012,
        "machines": 18,
        "build_volume": "400x400x400mm (largest)",
        "materials": ["Ti-64", "Inconel 718", "AlSi10Mg", "CoCr", "Maraging Steel"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'MoldMaster Industries',
     'UK''s premier injection molding specialist with 30+ years heritage. Family-owned business operating 45 presses from 50T to 1500T. Full in-house toolmaking capability with average tool life of 500k+ shots. Expertise in technical polymers for automotive and consumer electronics.',
     '{
        "company_type": "Injection Molding",
        "location": "Wolverhampton, UK",
        "certifications": ["ISO 9001", "IATF 16949", "ISO 14001"],
        "capabilities": ["Injection Molding", "Insert Molding", "Overmolding", "Tool Making", "Tool Repair"],
        "industries": ["Automotive", "Consumer Electronics", "Packaging", "Industrial"],
        "lead_time": "Tooling: 4-6 weeks, Production: 1 week",
        "min_order": "£1,000",
        "capacity_available": "40%",
        "employees": 85,
        "established": 1992,
        "machines": 45,
        "clamp_force_range": "50T - 1500T",
        "materials": ["ABS", "PC", "PA66", "POM", "PP", "PEEK", "Glass-filled variants"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'Sheffield Sheet Metal Co',
     'Comprehensive sheet metal fabrication facility serving UK manufacturing for over 40 years. Full service from laser cutting through to powder coating and assembly. Specialist in complex enclosures and chassis for electronics and industrial equipment. 24-hour rapid prototyping service available.',
     '{
        "company_type": "Sheet Metal",
        "location": "Sheffield, UK",
        "certifications": ["ISO 9001", "ISO 14001", "CE Marking"],
        "capabilities": ["Laser Cutting", "CNC Punching", "Press Brake", "Welding", "Powder Coating", "Assembly"],
        "industries": ["Electronics", "Industrial Equipment", "HVAC", "Signage"],
        "lead_time": "3-5 days (proto), 1-2 weeks (production)",
        "min_order": "£250",
        "capacity_available": "45%",
        "employees": 55,
        "established": 1983,
        "machines": 12,
        "max_sheet_size": "3000x1500mm",
        "materials": ["Mild Steel", "Stainless Steel", "Aluminum", "Copper", "Brass"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'AeroComponents SA',
     'French aerospace tier-2 supplier with NADCAP accreditation for special processes. Specializes in flight-critical structural components and landing gear assemblies. Full traceability and AS9100D quality management. Direct supplier to Airbus, Safran, and Dassault programs.',
     '{
        "company_type": "CNC",
        "location": "Toulouse, France",
        "certifications": ["AS9100D", "NADCAP", "ISO 9001", "EN 9104-001"],
        "capabilities": ["5-axis CNC", "Deep Hole Drilling", "Honing", "Assembly", "NDT"],
        "industries": ["Aerospace", "Defense", "Space"],
        "lead_time": "2-4 weeks",
        "min_order": "€3,000",
        "capacity_available": "20%",
        "employees": 180,
        "established": 1998,
        "machines": 40,
        "max_part_size": "2000x1000x800mm",
        "materials": ["Ti-6Al-4V", "Inconel 718", "7075-T6", "15-5PH", "300M Steel"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'MedDevice Manufacturing',
     'Irish contract manufacturer specializing in Class II and III medical devices. ISO 13485 certified cleanroom facility with full validation services. Expert in surgical instruments, orthopedic implants, and diagnostic equipment. FDA registered with multiple 510(k) clearances supported.',
     '{
        "company_type": "CNC",
        "location": "Galway, Ireland",
        "certifications": ["ISO 13485", "ISO 9001", "FDA Registered", "CE Marking"],
        "capabilities": ["Swiss-type CNC", "5-axis Milling", "Laser Marking", "Passivation", "Cleanroom Assembly"],
        "industries": ["Medical Devices", "Orthopedics", "Dental", "Diagnostics"],
        "lead_time": "2-3 weeks",
        "min_order": "€1,500",
        "capacity_available": "30%",
        "employees": 95,
        "established": 2005,
        "machines": 35,
        "cleanroom_class": "ISO 7",
        "materials": ["316L SS", "Ti-6Al-4V ELI", "PEEK", "CoCrMo", "Nitinol"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'RapidProto Ltd',
     'UK''s fastest prototyping house offering 24-48 hour turnaround on most projects. Multi-technology capability including SLA, SLS, FDM, and CNC. Bridge production runs up to 500 units. Popular with startups and R&D departments requiring quick design iteration cycles.',
     '{
        "company_type": "3D Printing",
        "location": "Bristol, UK",
        "certifications": ["ISO 9001"],
        "capabilities": ["SLA", "SLS", "FDM", "PolyJet", "CNC Machining", "Vacuum Casting"],
        "industries": ["Consumer Products", "Automotive", "Electronics", "Medical"],
        "lead_time": "24-48 hours (express), 3-5 days (standard)",
        "min_order": "£100",
        "capacity_available": "55%",
        "employees": 28,
        "established": 2015,
        "machines": 22,
        "build_volume": "600x600x600mm (largest)",
        "materials": ["Standard Resins", "Tough Resins", "PA12", "TPU", "ABS", "Aluminum"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'HeavyMetal Foundry',
     'Traditional sand and investment casting foundry with modern simulation-driven process control. Specialists in ferrous and non-ferrous castings up to 2 tonnes. In-house pattern making, heat treatment, and machining. Serving heavy industry, marine, and rail sectors for 75 years.',
     '{
        "company_type": "Casting",
        "location": "Birmingham, UK",
        "certifications": ["ISO 9001", "Lloyd''s Register", "DNV-GL"],
        "capabilities": ["Sand Casting", "Investment Casting", "Heat Treatment", "CNC Machining", "NDT"],
        "industries": ["Marine", "Rail", "Oil & Gas", "Heavy Industry"],
        "lead_time": "4-8 weeks",
        "min_order": "£2,000",
        "capacity_available": "50%",
        "employees": 75,
        "established": 1948,
        "max_casting_weight": "2000kg",
        "materials": ["Ductile Iron", "Grey Iron", "Steel", "Bronze", "Aluminum"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'SwissTurn Precision AG',
     'Swiss manufacturer of ultra-precision turned components for watchmaking, medical, and aerospace. Operating 60 Swiss-type CNC lathes with live tooling. Tolerances to ±2 microns on critical features. Specialist in micro-machining components under 1mm diameter.',
     '{
        "company_type": "CNC",
        "location": "Biel, Switzerland",
        "certifications": ["ISO 9001", "ISO 13485", "AS9100D"],
        "capabilities": ["Swiss-type Turning", "Micro-machining", "Thread Whirling", "Laser Cutting"],
        "industries": ["Watchmaking", "Medical", "Aerospace", "Electronics"],
        "lead_time": "1-2 weeks",
        "min_order": "CHF 1,000",
        "capacity_available": "15%",
        "employees": 110,
        "established": 1985,
        "machines": 60,
        "tolerance": "±0.002mm",
        "materials": ["Stainless Steel", "Titanium", "Brass", "PEEK", "Precious Metals"]
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Machine Capacity
-- =============================================
    ('Products', 'Machine Capacity', 'EOS M 290 - Premium Slot',
     'High-demand DMLS machine time available at our Birmingham facility. Ideal for titanium and Inconel aerospace components. Full parameter access and in-house metallurgist support. Includes powder handling and basic de-powdering.',
     '{
        "machine_type": "EOS M 290",
        "technology": "DMLS",
        "location": "Birmingham Facility, UK",
        "rate": "£2,800/day",
        "rate_value": 2800,
        "availability": "Next week",
        "build_volume": "250x250x325mm",
        "materials": ["Ti-64", "Inconel 718", "AlSi10Mg", "Maraging Steel"],
        "accuracy": "±0.05mm",
        "layer_thickness": "30-60 microns",
        "certifications": ["ISO 9001", "AS9100"],
        "operator_included": true
     }', NULL, true),

    ('Products', 'Machine Capacity', 'DMG MORI NTX 2000 - 5-Axis',
     'State-of-the-art turn-mill center available for complex aerospace and medical components. Full 5-axis simultaneous capability with live tooling. Ideal for complete machining in single setup. Experienced operator available.',
     '{
        "machine_type": "DMG MORI NTX 2000",
        "technology": "CNC Turn-Mill",
        "location": "Sheffield Facility, UK",
        "rate": "£1,800/day",
        "rate_value": 1800,
        "availability": "Immediate",
        "build_volume": "Ø650 x 1500mm",
        "materials": ["All metals", "Plastics"],
        "accuracy": "±0.01mm",
        "spindle_speed": "12,000 RPM",
        "certifications": ["ISO 9001"],
        "operator_included": true
     }', NULL, true),

    ('Products', 'Machine Capacity', 'HP MJF 5200 - Polymer Batch',
     'High-productivity Multi Jet Fusion capacity for PA12 and PA12GB production runs. Excellent for functional prototypes and end-use parts. Includes dyeing service for black parts. Ideal batches of 50-500 small parts.',
     '{
        "machine_type": "HP Multi Jet Fusion 5200",
        "technology": "MJF",
        "location": "Munich Facility, Germany",
        "rate": "€1,500/build",
        "rate_value": 1500,
        "availability": "2-3 days",
        "build_volume": "380x284x380mm",
        "materials": ["PA12", "PA12GB", "TPU"],
        "accuracy": "±0.3mm",
        "layer_thickness": "80 microns",
        "certifications": ["ISO 9001"],
        "operator_included": true
     }', NULL, true),

    ('Products', 'Machine Capacity', 'SLM 500 Quad - High Volume',
     'Quad-laser SLM system for maximum productivity on aluminum and steel parts. Perfect for automotive and industrial series production. 24/7 operation available. Includes stress relief heat treatment.',
     '{
        "machine_type": "SLM Solutions 500 Quad",
        "technology": "SLM",
        "location": "Stuttgart Facility, Germany",
        "rate": "€4,500/day",
        "rate_value": 4500,
        "availability": "1 week",
        "build_volume": "500x280x365mm",
        "materials": ["AlSi10Mg", "316L", "Maraging Steel", "CoCr"],
        "accuracy": "±0.1mm",
        "layer_thickness": "30-90 microns",
        "certifications": ["ISO 9001", "IATF 16949"],
        "operator_included": true
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Material
-- =============================================
    ('Products', 'Material', 'Ti-64 Grade 23 ELI Powder',
     'Extra Low Interstitial titanium powder optimized for medical implants and aerospace structural components. Spherical morphology with excellent flowability. Batch-traceable with full mill certification. Argon-atomized for low oxygen content.',
     '{
        "material_type": "Metal Powder",
        "grade": "Ti-6Al-4V ELI (Grade 23)",
        "unit": "kg",
        "price": "£285/kg",
        "price_value": 285,
        "lead_time": "3-5 days",
        "specification": "ASTM F136, AMS 4930",
        "particle_size": "15-45 microns",
        "oxygen_content": "<0.13%",
        "applications": ["Medical Implants", "Aerospace Structural"],
        "min_order_qty": 5
     }', NULL, true),

    ('Products', 'Material', 'Inconel 718 Powder',
     'Nickel-based superalloy powder for high-temperature aerospace and energy applications. Excellent creep resistance and fatigue strength at elevated temperatures. Precipitation-hardenable. Suitable for EOS, SLM, and DMLS systems.',
     '{
        "material_type": "Metal Powder",
        "grade": "Inconel 718",
        "unit": "kg",
        "price": "£195/kg",
        "price_value": 195,
        "lead_time": "2-4 days",
        "specification": "AMS 5662, AMS 5664",
        "particle_size": "15-53 microns",
        "applications": ["Turbine Components", "Aerospace", "Oil & Gas"],
        "min_order_qty": 10
     }', NULL, true),

    ('Products', 'Material', 'PA2200 Nylon 12 Powder',
     'Industry-standard polyamide powder for SLS systems. Excellent mechanical properties with good chemical resistance. Ideal for functional prototypes and series production. Food contact compliant grades available.',
     '{
        "material_type": "Polymer Powder",
        "grade": "PA2200 (PA12)",
        "unit": "kg",
        "price": "£75/kg",
        "price_value": 75,
        "lead_time": "1-2 days",
        "specification": "EOS Material Spec",
        "particle_size": "56 microns average",
        "applications": ["Functional Prototypes", "End-use Parts", "Automotive"],
        "min_order_qty": 20
     }', NULL, true),

    ('Products', 'Material', '316L Stainless Steel Powder',
     'Corrosion-resistant austenitic stainless steel powder for marine, food, and medical applications. Excellent weldability and polishability. Low carbon content prevents sensitization. Biocompatible.',
     '{
        "material_type": "Metal Powder",
        "grade": "316L",
        "unit": "kg",
        "price": "£65/kg",
        "price_value": 65,
        "lead_time": "1-2 days",
        "specification": "ASTM A240, AMS 5653",
        "particle_size": "15-45 microns",
        "applications": ["Marine", "Food Processing", "Medical", "Chemical"],
        "min_order_qty": 10
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Post-Processing
-- =============================================
    ('Products', 'Post-Processing', 'Vacuum Heat Treatment',
     'Precision heat treatment in vacuum furnace for stress relief, annealing, and solution treatment. Essential for AM parts to achieve optimal mechanical properties. Full thermal profiling and certification to aerospace standards. Batch sizes from 1kg to 500kg.',
     '{
        "service_type": "Heat Treatment",
        "process": "Vacuum Furnace",
        "unit": "batch",
        "price": "£550/batch",
        "price_value": 550,
        "lead_time": "2-3 days",
        "standards": ["AMS 2750", "NADCAP"],
        "max_temperature": "1300°C",
        "atmosphere": "Vacuum / Argon",
        "max_batch_weight": "500kg",
        "certifications": ["NADCAP", "ISO 9001"]
     }', NULL, true),

    ('Products', 'Post-Processing', 'Hot Isostatic Pressing (HIP)',
     'Eliminate internal porosity and achieve full density in AM parts. Critical for aerospace and medical applications requiring maximum fatigue life. Combined temperature and pressure cycle tailored to material. Full densification reports provided.',
     '{
        "service_type": "HIP",
        "process": "Hot Isostatic Pressing",
        "unit": "batch",
        "price": "£1,400/batch",
        "price_value": 1400,
        "lead_time": "3-5 days",
        "standards": ["ASTM E1931"],
        "max_pressure": "200 MPa",
        "max_temperature": "1400°C",
        "max_part_size": "Ø600 x 1500mm",
        "certifications": ["NADCAP", "AS9100"]
     }', NULL, true),

    ('Products', 'Post-Processing', '5-Axis CNC Finishing',
     'Precision machining of critical features on AM parts. Achieve tight tolerances on mounting surfaces, bores, and threads. Hermle C400 5-axis machining center with 0.01mm accuracy. CAM programming included.',
     '{
        "service_type": "Machining",
        "process": "5-Axis CNC",
        "unit": "hour",
        "rate": "£135/hour",
        "rate_value": 135,
        "lead_time": "1-2 days",
        "machine": "Hermle C400",
        "accuracy": "±0.01mm",
        "max_part_size": "850x700x500mm",
        "certifications": ["ISO 9001", "AS9100"]
     }', NULL, true),

    ('Products', 'Post-Processing', 'Surface Finishing - Tumbling & Polishing',
     'Comprehensive surface finishing from mass finishing to mirror polish. Tumble deburring, vibratory finishing, and hand polishing available. Ra values from 3.2 to 0.1 microns achievable. Ideal for medical and consumer products.',
     '{
        "service_type": "Surface Finishing",
        "process": "Tumbling / Polishing",
        "unit": "part",
        "price": "From £15/part",
        "price_value": 15,
        "lead_time": "1-3 days",
        "finishes_available": ["Tumbled", "Bead Blasted", "Satin", "Mirror Polish"],
        "ra_range": "0.1 - 3.2 microns",
        "certifications": ["ISO 9001"]
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Quality
-- =============================================
    ('Products', 'Quality', 'Industrial CT Scanning',
     'Non-destructive 3D X-ray inspection for internal defect detection and dimensional verification. Compare AM parts to original CAD with full colour deviation maps. Porosity analysis with void size distribution. UKAS accredited laboratory.',
     '{
        "service_type": "Inspection",
        "method": "Computed Tomography",
        "unit": "scan",
        "price": "£450/scan",
        "price_value": 450,
        "lead_time": "2-3 days",
        "resolution": "20 microns",
        "max_part_size": "Ø300 x 400mm",
        "outputs": ["STL mesh", "Porosity report", "CAD comparison", "Cross-sections"],
        "certifications": ["UKAS", "ISO 17025"]
     }', NULL, true),

    ('Products', 'Quality', 'Mechanical Testing Suite',
     'Complete mechanical property verification including tensile, hardness, and impact testing. Test to ASTM, ISO, and customer specifications. Full test reports with stress-strain curves and statistical analysis. Witness testing available.',
     '{
        "service_type": "Testing",
        "method": "Mechanical Testing",
        "unit": "test set",
        "price": "£320/set",
        "price_value": 320,
        "lead_time": "3-5 days",
        "tests_included": ["Tensile (ASTM E8)", "Hardness (Rockwell/Vickers)", "Charpy Impact"],
        "outputs": ["Stress-strain curves", "Property values", "Statistical analysis"],
        "certifications": ["UKAS", "NADCAP", "ISO 17025"]
     }', NULL, true),

    ('Products', 'Quality', 'CMM Dimensional Inspection',
     'High-accuracy coordinate measuring machine inspection for critical dimensions. Full GD&T evaluation with balloon drawings and statistical reports. Zeiss Contura with 1.8 micron accuracy. First Article Inspection (FAI) per AS9102.',
     '{
        "service_type": "Inspection",
        "method": "CMM",
        "unit": "part",
        "price": "£180/part",
        "price_value": 180,
        "lead_time": "1-2 days",
        "machine": "Zeiss Contura",
        "accuracy": "±0.0018mm",
        "max_part_size": "1200x1000x600mm",
        "outputs": ["Dimensional report", "GD&T analysis", "FAI (AS9102)"],
        "certifications": ["ISO 17025", "AS9100"]
     }', NULL, true),

    ('Products', 'Quality', 'Material Analysis - Metallography',
     'Microstructural analysis and material composition verification. Optical and SEM microscopy with EDS elemental analysis. Grain size measurement, phase identification, and inclusion rating. Critical for AM process validation.',
     '{
        "service_type": "Analysis",
        "method": "Metallography",
        "unit": "sample",
        "price": "£280/sample",
        "price_value": 280,
        "lead_time": "3-5 days",
        "techniques": ["Optical Microscopy", "SEM", "EDS", "EBSD"],
        "outputs": ["Microstructure images", "Grain size (ASTM E112)", "Composition report"],
        "certifications": ["ISO 17025"]
     }', NULL, true);

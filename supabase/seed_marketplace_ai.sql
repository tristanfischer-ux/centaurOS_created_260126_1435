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

-- =============================================
-- MIGRATION: Add More Objective Packs
-- =============================================
-- This migration adds 10 additional objective packs covering:
-- - Compliance (SOC 2, Vendor Risk)
-- - Legal (GDPR/CCPA)
-- - Sales & Growth (Sales Playbook, Pricing Strategy)
-- - Security (Security Audit)
-- - Engineering (Technical Due Diligence)
-- - HR (Onboarding, Performance Reviews)
-- - Operations (Hiring Pipeline)

-- 1. Insert the 10 new objective packs
INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
VALUES 
('SOC 2 Type I Preparation', 'Prepare for SOC 2 Type I audit by documenting controls, policies, and evidence collection.', 'Compliance', 'Hard', '8-12 Weeks', 'shield'),
('GDPR/CCPA Compliance Audit', 'Conduct a comprehensive privacy compliance audit to identify gaps and implement required data protection measures.', 'Legal', 'Medium', '6-8 Weeks', 'file-check'),
('Vendor Risk Assessment', 'Systematically evaluate vendor security, compliance, and business risks before onboarding critical suppliers.', 'Compliance', 'Medium', '3-4 Weeks', 'scale'),
('Build Sales Playbook', 'Create a repeatable sales process with scripts, objection handling, and qualification criteria to scale revenue.', 'Sales', 'Medium', '2-3 Weeks', 'target'),
('Customer Discovery & Pricing Strategy', 'Conduct market research and customer interviews to validate pricing and optimize revenue.', 'Growth', 'Hard', '3-4 Weeks', 'dollar-sign'),
('Security Audit & Hardening', 'Comprehensive security assessment and remediation to protect against vulnerabilities and ensure compliance.', 'Security', 'Hard', '3-4 Weeks', 'shield-check'),
('Technical Due Diligence', 'Assess codebase quality, architecture, and technical risks for acquisition, investment, or partnership decisions.', 'Engineering', 'Hard', '2-3 Weeks', 'search'),
('Onboard New Employee', 'Complete end-to-end onboarding process for a new team member, from paperwork to first-day setup.', 'HR', 'Medium', '2 Weeks', 'user-plus'),
('Conduct Annual Performance Reviews', 'Execute comprehensive performance review cycle including self-assessments, manager reviews, and development planning.', 'HR', 'Hard', '6 Weeks', 'clipboard-check'),
('Build Hiring Pipeline', 'Establish a structured hiring process from job posting to offer acceptance, ensuring consistent candidate experience.', 'Operations', 'Medium', '3 Weeks', 'users');

-- 2. Get IDs for seeding items (using DO block)
DO $$
DECLARE
    soc2_id UUID;
    gdpr_id UUID;
    vendor_id UUID;
    sales_id UUID;
    pricing_id UUID;
    security_id UUID;
    diligence_id UUID;
    onboard_id UUID;
    performance_id UUID;
    hiring_id UUID;
BEGIN
    SELECT id INTO soc2_id FROM public.objective_packs WHERE title = 'SOC 2 Type I Preparation' LIMIT 1;
    SELECT id INTO gdpr_id FROM public.objective_packs WHERE title = 'GDPR/CCPA Compliance Audit' LIMIT 1;
    SELECT id INTO vendor_id FROM public.objective_packs WHERE title = 'Vendor Risk Assessment' LIMIT 1;
    SELECT id INTO sales_id FROM public.objective_packs WHERE title = 'Build Sales Playbook' LIMIT 1;
    SELECT id INTO pricing_id FROM public.objective_packs WHERE title = 'Customer Discovery & Pricing Strategy' LIMIT 1;
    SELECT id INTO security_id FROM public.objective_packs WHERE title = 'Security Audit & Hardening' LIMIT 1;
    SELECT id INTO diligence_id FROM public.objective_packs WHERE title = 'Technical Due Diligence' LIMIT 1;
    SELECT id INTO onboard_id FROM public.objective_packs WHERE title = 'Onboard New Employee' LIMIT 1;
    SELECT id INTO performance_id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1;
    SELECT id INTO hiring_id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline' LIMIT 1;

    -- SOC 2 Type I Preparation Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (soc2_id, 'Map Trust Services Criteria to Current Controls', 'Research SOC 2 criteria and create gap analysis matrix mapping existing controls to requirements.', 'AI_Agent', 1),
    (soc2_id, 'Draft Security Policies and Procedures', 'Create policies covering access control, incident response, change management, vendor management.', 'AI_Agent', 2),
    (soc2_id, 'Schedule Control Evidence Collection Sessions', 'Coordinate with IT, HR, operations teams for evidence gathering.', 'Apprentice', 3),
    (soc2_id, 'Review and Approve Control Documentation', 'Sign off on policies and control matrices for accuracy.', 'Executive', 4),
    (soc2_id, 'Collect and Organize Control Evidence', 'Gather logs, screenshots, signed policies, training records.', 'Apprentice', 5),
    (soc2_id, 'Select and Contract with SOC 2 Auditor', 'Evaluate CPA firms, negotiate terms, execute audit agreement.', 'Executive', 6);

    -- GDPR/CCPA Compliance Audit Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (gdpr_id, 'Inventory Personal Data Collection and Processing', 'Map all data flows, collection points, and third-party processors.', 'AI_Agent', 1),
    (gdpr_id, 'Draft Privacy Policy and Cookie Notice', 'Create compliant templates explaining data practices and user rights.', 'AI_Agent', 2),
    (gdpr_id, 'Coordinate Legal Review of Privacy Documents', 'Schedule review sessions with counsel.', 'Apprentice', 3),
    (gdpr_id, 'Approve Privacy Policy and DPAs', 'Final approval on privacy policy and data processing agreements.', 'Executive', 4),
    (gdpr_id, 'Implement User Rights Request Workflow', 'Set up DSAR handling process with templates and SLA tracking.', 'Apprentice', 5),
    (gdpr_id, 'Conduct Privacy Impact Assessment', 'Perform DPIA for high-risk processing with mitigation strategies.', 'AI_Agent', 6);

    -- Vendor Risk Assessment Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (vendor_id, 'Research Vendor Security Posture', 'Analyze certifications (SOC 2, ISO 27001), breach history, compliance status.', 'AI_Agent', 1),
    (vendor_id, 'Draft Vendor Risk Assessment Questionnaire', 'Create questionnaire covering security, data handling, business continuity.', 'AI_Agent', 2),
    (vendor_id, 'Schedule Vendor Assessment Meeting', 'Coordinate with vendor contacts and distribute questionnaire.', 'Apprentice', 3),
    (vendor_id, 'Review Vendor Responses and Risk Score', 'Evaluate responses and assign risk score.', 'Executive', 4),
    (vendor_id, 'Collect and Organize Vendor Documentation', 'File security documents in vendor management system.', 'Apprentice', 5),
    (vendor_id, 'Negotiate Vendor Security Terms', 'Review and negotiate DPAs and security addendums.', 'Executive', 6);

    -- Build Sales Playbook Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (sales_id, 'Research Competitor Sales Methodologies', 'Analyze top 5 competitors approaches, messaging, positioning.', 'AI_Agent', 1),
    (sales_id, 'Define Ideal Customer Profile', 'Make strategic decisions on target segments and buyer personas.', 'Executive', 2),
    (sales_id, 'Draft Qualification Framework', 'Create BANT criteria with scoring rubrics and discovery questions.', 'AI_Agent', 3),
    (sales_id, 'Create Objection Handling Scripts', 'Draft responses to common objections with multiple approaches.', 'AI_Agent', 4),
    (sales_id, 'Schedule Playbook Review Session', 'Coordinate with sales team for review meeting.', 'Apprentice', 5),
    (sales_id, 'Approve and Finalize Playbook', 'Review, provide feedback, authorize distribution.', 'Executive', 6);

    -- Customer Discovery & Pricing Strategy Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (pricing_id, 'Research Pricing Models in Industry', 'Analyze competitor pricing, value-based strategies, pricing psychology.', 'AI_Agent', 1),
    (pricing_id, 'Design Customer Interview Framework', 'Create scripts for willingness-to-pay and value perception research.', 'AI_Agent', 2),
    (pricing_id, 'Approve Interview Approach', 'Decide on target segments and approve methodology.', 'Executive', 3),
    (pricing_id, 'Recruit Interview Participants', 'Identify candidates, schedule sessions, track responses.', 'Apprentice', 4),
    (pricing_id, 'Conduct Customer Interviews', 'Lead discovery interviews and document key insights.', 'Executive', 5),
    (pricing_id, 'Analyze Interview Data', 'Synthesize findings into pricing recommendation report.', 'AI_Agent', 6),
    (pricing_id, 'Finalize Pricing Strategy', 'Make final pricing decisions and authorize implementation.', 'Executive', 7);

    -- Security Audit & Hardening Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (security_id, 'Security Vulnerability Scan', 'Run automated scans across codebase, dependencies, infrastructure with CVSS scores.', 'AI_Agent', 1),
    (security_id, 'Review Security Findings', 'Prioritize critical issues and approve remediation plan.', 'Executive', 2),
    (security_id, 'Dependency Audit & Updates', 'Audit dependencies for vulnerabilities, draft update plan, identify breaking changes.', 'AI_Agent', 3),
    (security_id, 'Implement Authentication Hardening', 'Configure MFA enforcement, update password policies, coordinate rollout.', 'Apprentice', 4),
    (security_id, 'Security Policy Documentation', 'Draft incident response, access control, and data handling policies.', 'AI_Agent', 5),
    (security_id, 'Final Security Review', 'Approve implemented fixes and sign off on audit completion.', 'Executive', 6);

    -- Technical Due Diligence Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (diligence_id, 'Codebase Architecture Analysis', 'Analyze tech stack, design patterns, code organization with diagrams.', 'AI_Agent', 1),
    (diligence_id, 'Code Quality & Metrics Report', 'Generate test coverage, cyclomatic complexity, code duplication metrics.', 'AI_Agent', 2),
    (diligence_id, 'Technical Debt Assessment', 'Catalog debt, estimate remediation effort, prioritize by impact.', 'AI_Agent', 3),
    (diligence_id, 'Infrastructure & Scalability Review', 'Assess bottlenecks, performance characteristics, cost efficiency.', 'AI_Agent', 4),
    (diligence_id, 'Team & Process Evaluation', 'Coordinate interviews, gather documentation on dev processes.', 'Apprentice', 5),
    (diligence_id, 'Due Diligence Report & Recommendations', 'Make go/no-go decision based on technical assessment.', 'Executive', 6);

    -- Onboard New Employee Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (onboard_id, 'Research Onboarding Best Practices', 'Analyze industry standards and compliance requirements.', 'AI_Agent', 1),
    (onboard_id, 'Draft Onboarding Checklist and Welcome Packet', 'Create comprehensive checklist covering HR forms, IT setup, first-week schedule.', 'AI_Agent', 2),
    (onboard_id, 'Approve Onboarding Plan and Budget', 'Review checklist, equipment budget, timeline.', 'Executive', 3),
    (onboard_id, 'Schedule Orientation Sessions and IT Setup', 'Coordinate invites, reserve rooms, submit access requests.', 'Apprentice', 4),
    (onboard_id, 'Prepare Workspace and Equipment', 'Set up desk, configure accounts, prepare welcome materials.', 'Apprentice', 5),
    (onboard_id, 'Conduct First-Day Orientation', 'Lead welcome meeting, introduce team, set expectations.', 'Executive', 6);

    -- Conduct Annual Performance Reviews Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (performance_id, 'Research Performance Review Frameworks', 'Analyze best practices for review cycles, rating scales, feedback methods.', 'AI_Agent', 1),
    (performance_id, 'Draft Review Templates and Guidelines', 'Create self-assessment, manager review forms, calibration guidelines.', 'AI_Agent', 2),
    (performance_id, 'Approve Review Process and Timeline', 'Sign off on framework, schedule, compensation impact decisions.', 'Executive', 3),
    (performance_id, 'Schedule Review Meetings and Send Reminders', 'Coordinate invites and deadline reminders.', 'Apprentice', 4),
    (performance_id, 'Collect and Organize Review Documents', 'Gather assessments and compile for calibration.', 'Apprentice', 5),
    (performance_id, 'Facilitate Calibration Sessions', 'Lead calibration for consistent ratings across teams.', 'Executive', 6),
    (performance_id, 'Deliver Feedback and Create Development Plans', 'Conduct 1:1 reviews and establish development goals.', 'Executive', 7);

    -- Build Hiring Pipeline Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (hiring_id, 'Research Job Market and Salary Benchmarks', 'Analyze market rates, competitor postings, candidate expectations.', 'AI_Agent', 1),
    (hiring_id, 'Draft Job Description and Interview Questions', 'Create compelling posting with structured interview questions.', 'AI_Agent', 2),
    (hiring_id, 'Approve Job Posting and Hiring Budget', 'Review description, salary range, recruitment budget.', 'Executive', 3),
    (hiring_id, 'Post Job and Coordinate Recruiter Outreach', 'Publish on platforms, activate recruiter partnerships.', 'Apprentice', 4),
    (hiring_id, 'Schedule Interviews and Manage Pipeline', 'Coordinate calendars, send confirmations, track candidates.', 'Apprentice', 5),
    (hiring_id, 'Conduct Final Interviews and Make Decision', 'Lead final rounds, evaluate candidates, make offer decision.', 'Executive', 6),
    (hiring_id, 'Extend Offer and Coordinate Onboarding', 'Send offer, negotiate terms, initiate background checks.', 'Apprentice', 7);

END $$;

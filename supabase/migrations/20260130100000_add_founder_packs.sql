-- =============================================
-- MIGRATION: Add Founder-Focused Objective Packs
-- =============================================
-- This migration adds 5 objective packs tailored for early-stage founders:
-- - Fundraising Preparation
-- - Product Launch
-- - Customer Discovery
-- - Technical Infrastructure Setup
-- - Team Culture & Rituals

-- 1. Insert the 5 new objective packs
INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
VALUES 
('Fundraising Preparation', 'Prepare for your fundraising round with a compelling pitch deck, organized data room, and investor outreach strategy.', 'Finance', 'Hard', '4-6 Weeks', 'dollar-sign'),
('Product Launch', 'Plan and execute a successful product launch including beta testing, marketing, documentation, and go-to-market strategy.', 'Operations', 'Hard', '6-8 Weeks', 'rocket'),
('Customer Discovery', 'Conduct systematic customer interviews to validate problems, understand user needs, and gather actionable feedback.', 'Sales', 'Medium', '3-4 Weeks', 'search'),
('Technical Infrastructure Setup', 'Establish production-ready infrastructure with CI/CD pipelines, monitoring, logging, and documentation.', 'Engineering', 'Hard', '2-3 Weeks', 'server'),
('Team Culture & Rituals', 'Define your company culture, establish team rituals, and create processes that scale with your organization.', 'HR', 'Medium', '2-3 Weeks', 'users');

-- 2. Get IDs and seed pack items
DO $$
DECLARE
    fundraising_id UUID;
    launch_id UUID;
    discovery_id UUID;
    infra_id UUID;
    culture_id UUID;
BEGIN
    SELECT id INTO fundraising_id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1;
    SELECT id INTO launch_id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1;
    SELECT id INTO discovery_id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1;
    SELECT id INTO infra_id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1;
    SELECT id INTO culture_id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1;

    -- Fundraising Preparation Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (fundraising_id, 'Research Target Investors', 'Identify 50+ relevant investors by stage, sector, thesis, and portfolio fit. Create prioritized outreach list.', 'AI_Agent', 1),
    (fundraising_id, 'Draft Pitch Deck Narrative', 'Create story arc covering problem, solution, market, traction, team, and ask. Include supporting data.', 'AI_Agent', 2),
    (fundraising_id, 'Review and Refine Pitch Deck', 'Iterate on deck based on feedback, ensure compelling narrative and accurate financials.', 'Executive', 3),
    (fundraising_id, 'Organize Data Room', 'Set up secure data room with financials, cap table, contracts, metrics dashboard, and team bios.', 'Apprentice', 4),
    (fundraising_id, 'Draft Financial Model', 'Build 3-year revenue model with assumptions, unit economics, and sensitivity analysis.', 'AI_Agent', 5),
    (fundraising_id, 'Review Financial Projections', 'Validate assumptions, ensure defensibility of projections, approve for investor sharing.', 'Executive', 6),
    (fundraising_id, 'Create Investor FAQ Document', 'Prepare answers to common investor questions about market, competition, risks, and path to profitability.', 'AI_Agent', 7),
    (fundraising_id, 'Schedule Investor Meetings', 'Coordinate warm intros, book meetings, send prep materials, manage follow-ups.', 'Apprentice', 8),
    (fundraising_id, 'Conduct Investor Meetings', 'Lead pitch meetings, answer due diligence questions, negotiate terms.', 'Executive', 9),
    (fundraising_id, 'Review and Negotiate Term Sheet', 'Analyze term sheet terms, negotiate key provisions, coordinate with legal counsel.', 'Executive', 10);

    -- Product Launch Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (launch_id, 'Define Launch Goals and Success Metrics', 'Set specific, measurable launch goals (signups, revenue, press) and KPIs to track.', 'Executive', 1),
    (launch_id, 'Create Beta Testing Plan', 'Design beta program structure, success criteria, feedback collection process, and timeline.', 'AI_Agent', 2),
    (launch_id, 'Recruit Beta Testers', 'Identify and onboard beta users, send invites, set expectations, create communication channel.', 'Apprentice', 3),
    (launch_id, 'Draft Product Documentation', 'Write user guides, API documentation, FAQs, and quick-start tutorials.', 'AI_Agent', 4),
    (launch_id, 'Create Launch Marketing Content', 'Develop landing page copy, email sequences, social media posts, and press materials.', 'AI_Agent', 5),
    (launch_id, 'Build Media and Influencer List', 'Research relevant journalists, bloggers, and influencers. Draft personalized pitches.', 'AI_Agent', 6),
    (launch_id, 'Review Marketing Materials', 'Approve all external communications, verify messaging consistency and accuracy.', 'Executive', 7),
    (launch_id, 'Coordinate Launch Day Logistics', 'Schedule posts, coordinate team responsibilities, prepare support coverage, test all systems.', 'Apprentice', 8),
    (launch_id, 'Execute Launch Day', 'Flip the switch, monitor systems, engage on social media, respond to press inquiries.', 'Executive', 9),
    (launch_id, 'Post-Launch Analysis', 'Compile metrics report, gather user feedback, identify wins and areas for improvement.', 'AI_Agent', 10);

    -- Customer Discovery Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (discovery_id, 'Define Research Objectives', 'Clarify what you need to learn: problem validation, solution fit, pricing, or user journey.', 'Executive', 1),
    (discovery_id, 'Create Interview Discussion Guide', 'Draft open-ended questions focusing on problems, current solutions, and desired outcomes.', 'AI_Agent', 2),
    (discovery_id, 'Identify Target Interview Segments', 'Define customer segments to interview, ensure diversity of perspectives.', 'Executive', 3),
    (discovery_id, 'Recruit Interview Participants', 'Find and schedule 15-20 interviews using networks, cold outreach, or paid recruitment.', 'Apprentice', 4),
    (discovery_id, 'Conduct Customer Interviews', 'Lead discovery conversations, probe for insights, avoid leading questions.', 'Executive', 5),
    (discovery_id, 'Transcribe and Organize Notes', 'Create detailed interview notes, tag by theme, organize in shared repository.', 'Apprentice', 6),
    (discovery_id, 'Synthesize Interview Findings', 'Analyze patterns across interviews, identify key insights, prioritize learnings.', 'AI_Agent', 7),
    (discovery_id, 'Create Customer Discovery Report', 'Compile findings into actionable report with recommendations and next steps.', 'AI_Agent', 8),
    (discovery_id, 'Review Findings and Decide Next Steps', 'Evaluate insights, make strategic decisions about product direction.', 'Executive', 9);

    -- Technical Infrastructure Setup Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (infra_id, 'Audit Current Infrastructure', 'Document existing setup, identify gaps in reliability, security, and observability.', 'AI_Agent', 1),
    (infra_id, 'Design CI/CD Pipeline', 'Create pipeline architecture for automated testing, builds, and deployments.', 'AI_Agent', 2),
    (infra_id, 'Review Infrastructure Plan', 'Approve architecture decisions, budget allocation, and security approach.', 'Executive', 3),
    (infra_id, 'Implement CI/CD Pipeline', 'Set up GitHub Actions/GitLab CI with test, build, and deploy stages.', 'Apprentice', 4),
    (infra_id, 'Configure Monitoring and Alerting', 'Set up application monitoring, error tracking, uptime checks, and alert rules.', 'AI_Agent', 5),
    (infra_id, 'Implement Logging Infrastructure', 'Configure centralized logging with search, retention policies, and log analysis.', 'Apprentice', 6),
    (infra_id, 'Create Infrastructure Documentation', 'Document architecture, runbooks, incident response procedures, and access controls.', 'AI_Agent', 7),
    (infra_id, 'Security Hardening', 'Implement secrets management, access controls, dependency scanning, and security headers.', 'Apprentice', 8),
    (infra_id, 'Conduct Infrastructure Review', 'Verify all systems operational, approve documentation, sign off on production readiness.', 'Executive', 9);

    -- Team Culture & Rituals Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (culture_id, 'Research Company Culture Frameworks', 'Analyze culture frameworks (Netflix, GitLab, etc.) and identify applicable elements.', 'AI_Agent', 1),
    (culture_id, 'Define Company Values', 'Articulate 3-5 core values that guide decision-making and behavior.', 'Executive', 2),
    (culture_id, 'Draft Culture Document', 'Write comprehensive culture doc explaining values, expected behaviors, and how we work.', 'AI_Agent', 3),
    (culture_id, 'Review and Refine Culture Document', 'Gather team feedback, iterate on language, ensure authenticity and clarity.', 'Executive', 4),
    (culture_id, 'Design Team Rituals', 'Create cadence for standups, retrospectives, all-hands, and social events.', 'AI_Agent', 5),
    (culture_id, 'Set Up Communication Norms', 'Define expectations for Slack, email, meetings, async vs sync communication.', 'Apprentice', 6),
    (culture_id, 'Create Decision-Making Framework', 'Document who makes what decisions, escalation paths, and autonomy levels.', 'AI_Agent', 7),
    (culture_id, 'Implement Team Rituals', 'Schedule recurring events, create templates, train team on new processes.', 'Apprentice', 8),
    (culture_id, 'First Culture Retrospective', 'After 4 weeks, review what is working, gather feedback, iterate on rituals.', 'Executive', 9);

END $$;

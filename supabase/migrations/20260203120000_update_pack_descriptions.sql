-- =============================================
-- MIGRATION: Update Objective Pack Descriptions
-- =============================================
-- This migration updates all objective pack descriptions to be more compelling
-- with at least 5 lines explaining benefits, outcomes, and positioning.

-- Product & Marketing Packs
UPDATE public.objective_packs 
SET description = 'Ship your product to market in 4 weeks with surgical precision using our battle-tested launch protocol. This pack combines AI-powered competitor research, rapid user validation, and zero-friction deployment pipelines to help you prove product-market fit fast and capture early adopters before competitors move. You''ll go from idea to production-ready MVP with validated assumptions, real customer feedback, and a scalable infrastructure foundation. Perfect for first-time founders who need to de-risk their launch while maintaining velocity. Speed is your competitive advantage—execute with confidence.'
WHERE title = 'Launch MVP';

UPDATE public.objective_packs 
SET description = 'Flood your channels with 30 days of professional content in 72 hours using an AI-accelerated sprint framework. This pack leverages keyword intelligence, competitor gap analysis, and rapid content generation to help you own your narrative and dominate search rankings before your competition catches up. You''ll create blog posts, social media threads, email sequences, and SEO-optimized articles that generate inbound leads without hiring an entire content team. Perfect for bootstrapped founders who need to establish thought leadership and drive organic traffic at scale. Content is your moat—build it fast.'
WHERE title = 'Content Marketing Sprint';

-- Compliance & Legal Packs
UPDATE public.objective_packs 
SET description = 'Unlock enterprise deals and investor confidence by achieving SOC 2 Type I compliance through our structured audit preparation framework. This pack guides you through control documentation, policy creation, and evidence collection—saving you $50K+ vs. hiring consultants while positioning your company for Series A+ fundraising and Fortune 500 customer acquisition. You''ll build audit-ready documentation, implement industry-standard security controls, and demonstrate trustworthiness that converts skeptical enterprise buyers into signed contracts. Perfect for SaaS founders targeting enterprise customers who demand compliance verification. SOC 2 isn''t just checkbox compliance—it''s your ticket to bigger deals.'
WHERE title = 'SOC 2 Type I Preparation';

UPDATE public.objective_packs 
SET description = 'Protect your company from €20M fines while building customer trust through comprehensive GDPR/CCPA compliance auditing. This pack systematically identifies privacy gaps, implements required data protection measures, and creates legal-grade documentation that withstands regulatory scrutiny—turning compliance from a liability into a competitive advantage in privacy-conscious markets. You''ll establish robust data handling procedures, implement user rights workflows, and gain the confidence to expand internationally without regulatory fear. Perfect for founders operating in EU/California markets or preparing for global expansion. Compliance failures destroyed companies like Google (€50M fine) and Meta (€1.2B)—protect yourself before regulators come knocking.'
WHERE title = 'GDPR/CCPA Compliance Audit';

UPDATE public.objective_packs 
SET description = 'Prevent supply chain disasters and protect customer data by implementing enterprise-grade vendor risk assessment processes before critical failures occur. This pack provides a systematic framework for evaluating vendor security posture, compliance status, and business continuity capabilities—helping you avoid the catastrophic breaches and outages that destroyed companies relying on under-vetted suppliers. You''ll create repeatable assessment workflows, standardized risk scoring, and escalation procedures that scale as your vendor ecosystem grows. Perfect for founders onboarding mission-critical SaaS providers, payment processors, or data handlers who could sink your business if compromised. Your customers trust you with their data—make sure your vendors earn that same trust.'
WHERE title = 'Vendor Risk Assessment';

-- Sales & Growth Packs  
UPDATE public.objective_packs 
SET description = 'Accelerate deal velocity by 40-60% and scale from 7-figure to 8-figure ARR through a battle-tested sales playbook that eliminates guesswork from your revenue engine. This pack implements proven frameworks (MEDDIC, BANT, Challenger Sale) with customized scripts, objection handling, and qualification criteria that reduce rep ramp time from 6 months to 6 weeks while maintaining deal quality. You''ll create a repeatable system that allows any seller to close deals like your top performer—no more relying on "natural talent" or expensive sales gurus. Perfect for founders transitioning from founder-led sales to a scalable sales org that prints money predictably. Your playbook is the difference between grinding out each deal and building a revenue machine.'
WHERE title = 'Build Sales Playbook';

UPDATE public.objective_packs 
SET description = 'Unlock 20-40% more revenue from your existing product by discovering what customers will actually pay through systematic pricing research and validation interviews. This pack applies Jobs-to-be-Done and Value-Based Pricing frameworks to uncover willingness-to-pay thresholds, identify competitor pricing gaps, and position your solution to capture 3-5x more value per customer than you''re currently extracting. You''ll move beyond gut-feel pricing decisions to data-backed strategies that maximize revenue without losing customers—transforming pricing from a scary guessing game into your most powerful growth lever. Perfect for founders leaving money on the table with cost-plus pricing or copying competitor rates without understanding perceived value. Most SaaS companies undercharge by 30-50%—stop giving away margin to customers who would happily pay more.'
WHERE title = 'Customer Discovery & Pricing Strategy';

-- Security & Engineering Packs
UPDATE public.objective_packs 
SET description = 'Transform your security posture from liability to competitive advantage through comprehensive vulnerability assessment and remediation using industry-standard tools and frameworks. This pack deploys SAST/DAST scanners, penetration testing methodologies, and OWASP Top 10 defenses to identify and patch critical vulnerabilities before attackers exploit them—complete with audit-ready documentation and CVSS scoring for compliance reporting. You''ll implement defense-in-depth controls including MFA enforcement, zero-trust policies, and incident response procedures that satisfy the most paranoid enterprise CISO. Perfect for founders preparing for security questionnaires, SOC 2 audits, or investor due diligence who need to prove they''re not a security disaster waiting to happen. One breach can destroy your company—harden your defenses before it''s too late.'
WHERE title = 'Security Audit & Hardening';

UPDATE public.objective_packs 
SET description = 'Protect yourself from costly acquisition surprises through systematic technical assessment using static analysis tools, architectural review, and performance profiling. This pack quantifies code quality metrics (test coverage, cyclomatic complexity, technical debt), identifies scalability bottlenecks, and produces executive-ready reports with remediation cost estimates and go/no-go recommendations—giving you leverage in negotiations or confidence to walk away from disaster acquisitions. You''ll evaluate not just the code but the team velocity, development processes, and operational maturity that determine whether this technical asset is a gold mine or money pit. Perfect for buyers, investors, or partnership prospects who need to know if the technology actually works as advertised before writing the check. Technical surprises killed companies like HP (Autonomy: $8.8B writedown)—don''t be the next cautionary tale.'
WHERE title = 'Technical Due Diligence';

-- HR & Operations Packs
UPDATE public.objective_packs 
SET description = 'Transform first impressions into lasting commitment through a structured onboarding program that reduces time-to-productivity by 40% and establishes cultural foundations from day one. This pack provides end-to-end checklists, welcome materials, and first-week frameworks that help new hires feel valued, prepared, and connected—turning onboarding from overwhelming paperwork chaos into a memorable experience that reinforces why they joined your mission. You''ll create consistent processes that scale from 10 to 100+ employees without sacrificing the personal touch that makes startups special. Perfect for founders who know great people are joining their team but worry about maintaining culture quality as they scale headcount rapidly. Your first week sets the tone for their entire tenure—make it count.'
WHERE title = 'Onboard New Employee';

UPDATE public.objective_packs 
SET description = 'Unlock your team''s full potential and increase top performer retention by 30% through fair, consistent performance conversations backed by data-driven frameworks and calibrated ratings. This pack implements proven review methodologies including self-assessments, 360 feedback, and manager evaluations that surface growth opportunities while rewarding high performers—transforming the dreaded annual review into a motivating development conversation that drives accountability. You''ll establish calibration standards that ensure consistent ratings across teams, eliminating the favoritism and recency bias that destroy trust in your performance culture. Perfect for founders scaling from "everyone knows how they''re doing" to structured performance management that works across multiple teams and managers. Reviews done badly demotivate your best people—do them right and watch performance soar.'
WHERE title = 'Conduct Annual Performance Reviews';

UPDATE public.objective_packs 
SET description = 'Build a world-class hiring machine that reduces time-to-hire by 35%, improves offer acceptance rates, and protects team quality while scaling headcount predictably. This pack establishes a structured pipeline from job posting through offer acceptance with standardized interview frameworks, candidate scoring rubrics, and experience touchpoints that make A-players choose you over competitors paying 20% more. You''ll create a repeatable system that empowers any hiring manager to identify great fits (not just charismatic talkers) while providing candidates with the clarity and respect they deserve throughout the process. Perfect for founders transitioning from scrappy "hire fast, fire fast" chaos to scalable talent acquisition that builds the team you need without diluting culture. Your hiring process is a preview of your company—make it impressive.'
WHERE title = 'Build Hiring Pipeline';

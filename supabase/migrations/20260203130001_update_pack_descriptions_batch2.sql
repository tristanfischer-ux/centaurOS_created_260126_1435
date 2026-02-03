-- =============================================
-- MIGRATION: Update Pack Descriptions - Batch 2
-- =============================================
-- Updates descriptions for 5 objective packs to be more compelling
-- and value-focused, explaining what problem they solve, who they're for,
-- key outcomes, and why they matter.

-- Update Build Sales Playbook
UPDATE public.objective_packs
SET description = 'Stop losing deals to inconsistent sales conversations. This pack helps you build a battle-tested sales playbook that transforms your scattered approach into a repeatable revenue machine. Perfect for founders and sales leaders who need to scale beyond hero selling. You''ll create winning scripts, bulletproof objection handlers, and qualification criteria that ensure every rep sells like your best closer. With a proven playbook, you''ll shorten sales cycles, increase win rates, and confidently onboard new salespeople who perform from day one. Turn sales from an art into a science—and watch your revenue compound.'
WHERE title = 'Build Sales Playbook';

-- Update Customer Discovery & Pricing Strategy
UPDATE public.objective_packs
SET description = 'Are you leaving money on the table with guesswork pricing? This pack combines customer research with strategic pricing to help you capture the value you actually deliver. Ideal for founders launching new products or teams struggling with pricing confidence. Through systematic customer interviews and competitive analysis, you''ll uncover what customers truly value, their willingness to pay, and the positioning that commands premium pricing. The result: data-backed pricing that maximizes revenue while accelerating sales. Stop competing on price alone—position yourself where customers happily pay more because they understand your true value.'
WHERE title = 'Customer Discovery & Pricing Strategy';

-- Update Security Audit & Hardening
UPDATE public.objective_packs
SET description = 'One breach can destroy years of trust and put you out of business. This pack provides a systematic security assessment and hardening process to protect your company before attackers find your weaknesses. Essential for any company handling customer data, preparing for compliance audits (SOC 2, ISO 27001), or responding to security questionnaires from enterprise buyers. You''ll identify critical vulnerabilities, remediate risks using industry best practices, document your security controls, and build confidence with customers and investors. Don''t wait for a breach to take security seriously—harden your defenses now and turn security into a competitive advantage that wins enterprise deals.'
WHERE title = 'Security Audit & Hardening';

-- Update Technical Due Diligence
UPDATE public.objective_packs
SET description = 'Before you acquire, invest in, or partner with a company, know exactly what you''re getting into. This pack delivers a comprehensive technical assessment that uncovers hidden risks, technical debt, and architectural issues that could tank the deal post-close. Critical for investors, acquirers, and partnership teams evaluating technology companies. You''ll analyze code quality, architecture decisions, security posture, scalability constraints, team capabilities, and development practices—then receive a clear report with risk ratings and remediation costs. Make informed decisions with eyes wide open. Avoid expensive surprises and negotiate from a position of knowledge, not hope.'
WHERE title = 'Technical Due Diligence';

-- Update Onboard New Employee
UPDATE public.objective_packs
SET description = 'A great employee''s first week can make or break their long-term success and engagement. This pack transforms chaotic first-day scrambles into a world-class onboarding experience that accelerates time-to-productivity and builds lasting loyalty. Designed for growing teams who want new hires to feel welcomed, equipped, and productive from day one. You''ll handle all paperwork, provision accounts, prepare their workspace, schedule key meetings, assign a mentor, and create a structured 30-60-90 day plan. The result: new team members who ramp faster, stay longer, and become advocates for your company culture. First impressions matter—make yours unforgettable.'
WHERE title = 'Onboard New Employee';

-- Update objective pack descriptions to be more compelling and value-focused
-- This migration improves the marketing copy for 5 key packs

-- 1. Launch MVP
UPDATE public.objective_packs
SET description = 'Ship your MVP faster than you thought possible. Perfect for founders who need to validate their idea in market without burning through runway. This pack orchestrates your entire launch workflow—from technical infrastructure and security basics to landing pages, analytics setup, and beta user onboarding. Get to product-market fit conversations in weeks, not months. Includes AI-powered task execution to handle the grunt work while you focus on vision and customer feedback.'
WHERE title = 'Launch MVP';

-- 2. Content Marketing Sprint
UPDATE public.objective_packs
SET description = 'Break through the content creation bottleneck that''s killing your SEO and thought leadership. Designed for lean marketing teams who need consistent, high-quality output without hiring a content agency. This sprint generates a full month of blog posts, social content, email sequences, and distribution plans in just 3 days. Stop choosing between quality and quantity—get both. Your AI agents research, draft, and optimize while you review and approve. Turn your expertise into scalable content that drives inbound leads and builds authority in your space.'
WHERE title = 'Content Marketing Sprint';

-- 3. SOC 2 Type I Preparation
UPDATE public.objective_packs
SET description = 'Win enterprise deals and close security questionnaires with confidence. Essential for B2B SaaS companies pursuing Fortune 500 customers who require SOC 2 compliance. This pack guides you through the entire Type I readiness process—control documentation, policy creation, evidence collection, vendor risk assessments, and audit preparation. Stop losing deals to "security requirements not met." Your AI apprentices document controls, organize evidence, and maintain compliance artifacts while you focus on building trust with enterprise buyers. Reduce audit prep time from 6 months to 8-12 weeks.'
WHERE title = 'SOC 2 Type I Preparation';

-- 4. GDPR/CCPA Compliance Audit
UPDATE public.objective_packs
SET description = 'Protect your business from regulatory fines and reputational damage while building customer trust. Critical for any company handling EU or California resident data—before you face an inquiry or complaint. This comprehensive audit maps your data flows, identifies privacy gaps, implements required safeguards, creates compliant policies, and establishes ongoing monitoring. Stop operating in a compliance gray zone. Transform privacy from a legal risk into a competitive advantage. Your AI agents inventory data systems, draft privacy documentation, and track remediation tasks while you maintain focus on growth.'
WHERE title = 'GDPR/CCPA Compliance Audit';

-- 5. Vendor Risk Assessment
UPDATE public.objective_packs
SET description = 'Make confident vendor decisions without slowing down your business. Essential for companies onboarding critical suppliers, SaaS tools, or data processors where security failures could breach your own compliance or harm customers. This systematic assessment evaluates security posture, compliance certifications, data handling practices, business continuity, and financial stability before you sign. Avoid costly vendor incidents that cascade into customer breaches, compliance violations, or service outages. Your AI agents create questionnaires, analyze vendor responses, flag red flags, and generate risk scores—turning weeks of back-and-forth into a streamlined 3-4 week process.'
WHERE title = 'Vendor Risk Assessment';

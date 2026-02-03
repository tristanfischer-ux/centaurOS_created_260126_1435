-- =============================================
-- MIGRATION: Update Pack Descriptions (Batch 3)
-- =============================================
-- Updates 2 objective pack descriptions to be more compelling and value-focused:
-- - Conduct Annual Performance Reviews
-- - Build Hiring Pipeline

-- Update "Conduct Annual Performance Reviews" description
UPDATE public.objective_packs 
SET description = 'Transform performance reviews from dreaded checkbox exercises into powerful growth conversations that drive team excellence. This comprehensive cycle guides you through self-assessments, manager reviews, and development planning that actually moves the needle. Perfect for HR leaders and managers who want to turn annual reviews into career development moments that boost engagement, retention, and performance. Build a fair, structured process that identifies high performers, addresses underperformance early, and creates clear growth paths that keep your best people motivated and aligned with company goals.'
WHERE title = 'Conduct Annual Performance Reviews';

-- Update "Build Hiring Pipeline" description
UPDATE public.objective_packs 
SET description = 'Stop making inconsistent hiring decisions that lead to bad hires and wasted resources. This structured hiring framework takes you from job posting to offer acceptance with a repeatable process that delivers quality candidates and an exceptional experience every time. Designed for HR teams and hiring managers at scaling companies who need predictable, high-quality hiring outcomes. Establish clear evaluation criteria, standardized interview processes, and consistent candidate communication that protects your employer brand while building a pipeline that reliably delivers A-players. Your hiring process is your first impression—make it count.'
WHERE title = 'Build Hiring Pipeline';

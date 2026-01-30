-- =============================================
-- MIGRATION: Apprenticeship Management System
-- =============================================
-- Complete apprenticeship management matching/exceeding Multiverse, QA, ApprentiScope:
-- - Programme definitions with UK apprenticeship standards
-- - Enrollment tracking with mentor assignments
-- - Learning modules and completion tracking
-- - OTJT (Off-the-Job Training) time logging with approval workflow
-- - Progress reviews with structured check-ins
-- - Skills framework and gap analysis
-- - Legal document management with signatures
-- - Compliance reporting support

-- =============================================
-- 1. APPRENTICESHIP PROGRAMMES
-- =============================================
-- Templates for UK apprenticeship standards (L3-L7)

CREATE TABLE IF NOT EXISTS public.apprenticeship_programmes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    level INTEGER CHECK (level BETWEEN 3 AND 7), -- UK Levels 3-7
    standard_code TEXT, -- UK apprenticeship standard reference (e.g., ST0116)
    duration_months INTEGER NOT NULL,
    otjt_hours_required INTEGER NOT NULL, -- Total OTJT hours required for programme
    description TEXT,
    skills_framework JSONB DEFAULT '{}', -- Required competencies by category
    learning_outcomes JSONB DEFAULT '[]', -- Expected outcomes
    assessment_plan JSONB DEFAULT '{}', -- EPA requirements
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.apprenticeship_programmes IS 'UK apprenticeship programme definitions with standards and requirements';
COMMENT ON COLUMN public.apprenticeship_programmes.level IS 'UK apprenticeship level: 3=Advanced, 4=Higher, 5=Foundation Degree, 6=Degree, 7=Masters';
COMMENT ON COLUMN public.apprenticeship_programmes.standard_code IS 'Official UK apprenticeship standard code (e.g., ST0116 for Software Developer)';
COMMENT ON COLUMN public.apprenticeship_programmes.otjt_hours_required IS 'Minimum off-the-job training hours required (typically 20% of working hours)';

-- =============================================
-- 2. APPRENTICESHIP ENROLLMENTS
-- =============================================
-- Instance of an apprentice enrolled in a programme

CREATE TABLE IF NOT EXISTS public.apprenticeship_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apprentice_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    programme_id UUID NOT NULL REFERENCES public.apprenticeship_programmes(id) ON DELETE RESTRICT,
    foundry_id TEXT NOT NULL,
    
    -- Key dates
    start_date DATE NOT NULL,
    expected_end_date DATE NOT NULL,
    actual_end_date DATE, -- Filled when completed/withdrawn
    flying_start_date DATE, -- When learning modules unlock (typically 1 week after start)
    
    -- Status tracking
    status TEXT CHECK (status IN ('enrolled', 'active', 'on_break', 'gateway', 'epa', 'completed', 'withdrawn')) DEFAULT 'enrolled',
    
    -- OTJT tracking
    otjt_hours_logged DECIMAL DEFAULT 0,
    otjt_hours_target DECIMAL NOT NULL,
    
    -- Mentor assignments
    workplace_buddy_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    senior_mentor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Wage tracking (for compliance)
    hourly_rate DECIMAL,
    wage_band TEXT CHECK (wage_band IN ('apprentice_minimum', 'national_minimum', 'living_wage', 'above_living_wage')),
    
    -- Legal documents tracking
    agreement_signed_at TIMESTAMPTZ,
    commitment_statement_signed_at TIMESTAMPTZ,
    training_plan_approved_at TIMESTAMPTZ,
    
    -- Additional metadata
    employment_type TEXT CHECK (employment_type IN ('full_time', 'part_time')) DEFAULT 'full_time',
    weekly_hours INTEGER DEFAULT 30, -- For OTJT calculation
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(apprentice_id, programme_id)
);

COMMENT ON TABLE public.apprenticeship_enrollments IS 'Tracks individual apprentice enrollments in programmes with progress and compliance data';
COMMENT ON COLUMN public.apprenticeship_enrollments.flying_start_date IS 'Date when learning modules become available (typically 1 week after start)';
COMMENT ON COLUMN public.apprenticeship_enrollments.status IS 'gateway = ready for EPA review, epa = in End Point Assessment';

-- =============================================
-- 3. LEARNING MODULES
-- =============================================
-- Training content units within programmes

CREATE TABLE IF NOT EXISTS public.learning_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    programme_id UUID REFERENCES public.apprenticeship_programmes(id) ON DELETE CASCADE,
    
    title TEXT NOT NULL,
    description TEXT,
    module_type TEXT CHECK (module_type IN (
        'core',           -- Required programme content
        'functional',     -- Maths/English (Level 2)
        'quick_skill',    -- Optional skill boosters
        'ai_readiness',   -- AI/LLM training (CentaurOS special)
        'assessment',     -- Evaluation modules
        'project'         -- Project-based learning
    )) NOT NULL,
    
    -- Content delivery
    content_url TEXT,           -- Link to content (video, doc, interactive)
    content_type TEXT CHECK (content_type IN ('video', 'document', 'interactive', 'task', 'external')),
    content_data JSONB,         -- Embedded content or configuration
    estimated_hours DECIMAL NOT NULL DEFAULT 1,
    counts_as_otjt BOOLEAN DEFAULT true,
    
    -- Sequencing
    order_index INTEGER DEFAULT 0,
    prerequisite_module_id UUID REFERENCES public.learning_modules(id) ON DELETE SET NULL,
    unlock_after_days INTEGER DEFAULT 0, -- Days after flying start to unlock
    
    -- Skills mapping
    skills_taught JSONB DEFAULT '[]', -- Array of skill names/IDs
    
    -- Assessment
    has_assessment BOOLEAN DEFAULT false,
    passing_score DECIMAL, -- Minimum score to pass (if has_assessment)
    max_attempts INTEGER DEFAULT 3,
    
    is_mandatory BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.learning_modules IS 'Training content modules within apprenticeship programmes';
COMMENT ON COLUMN public.learning_modules.module_type IS 'core=required, functional=maths/english, ai_readiness=CentaurOS AI training';

-- =============================================
-- 4. MODULE COMPLETIONS
-- =============================================
-- Tracks apprentice progress through modules

CREATE TABLE IF NOT EXISTS public.module_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.apprenticeship_enrollments(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES public.learning_modules(id) ON DELETE CASCADE,
    
    status TEXT CHECK (status IN ('locked', 'available', 'in_progress', 'completed', 'failed')) DEFAULT 'locked',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Time tracking
    hours_logged DECIMAL DEFAULT 0,
    
    -- Assessment results
    score DECIMAL,
    attempts INTEGER DEFAULT 0,
    feedback TEXT,
    graded_by UUID REFERENCES public.profiles(id),
    graded_at TIMESTAMPTZ,
    
    -- Evidence
    evidence_urls JSONB DEFAULT '[]', -- Uploaded work samples
    reflection TEXT, -- Apprentice's reflection on learning
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(enrollment_id, module_id)
);

COMMENT ON TABLE public.module_completions IS 'Tracks individual apprentice progress through learning modules';

-- =============================================
-- 5. OTJT TIME LOGS
-- =============================================
-- Granular off-the-job training time tracking with approval workflow

CREATE TABLE IF NOT EXISTS public.otjt_time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.apprenticeship_enrollments(id) ON DELETE CASCADE,
    
    log_date DATE NOT NULL,
    hours DECIMAL NOT NULL CHECK (hours > 0 AND hours <= 12),
    
    activity_type TEXT CHECK (activity_type IN (
        'learning_module',    -- Completing a module
        'mentoring',          -- 1:1 with mentor
        'workshop',           -- Group training session
        'self_study',         -- Independent learning
        'project_training',   -- Learning via project work
        'assessment',         -- Taking assessments
        'shadowing',          -- Job shadowing
        'external_training',  -- External courses/conferences
        'other'
    )) NOT NULL,
    
    description TEXT,
    learning_outcomes TEXT, -- What was learned
    
    -- Link to related records
    module_id UUID REFERENCES public.learning_modules(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    
    -- Approval workflow
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'queried')) DEFAULT 'pending',
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    query_message TEXT,
    
    -- Evidence
    evidence_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.otjt_time_logs IS 'Off-the-job training time logs with mentor approval workflow';
COMMENT ON COLUMN public.otjt_time_logs.status IS 'queried = mentor has questions about this entry';

-- =============================================
-- 6. PROGRESS REVIEWS
-- =============================================
-- Structured check-ins between apprentice and mentor

CREATE TABLE IF NOT EXISTS public.progress_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.apprenticeship_enrollments(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    review_type TEXT CHECK (review_type IN (
        'weekly',
        'monthly',
        'quarterly',
        'mid_programme',
        'gateway',           -- Ready for EPA check
        'end_point_assessment'
    )) NOT NULL,
    
    -- Scheduling
    scheduled_date DATE,
    completed_date DATE,
    duration_minutes INTEGER,
    
    -- Review content (structured)
    objectives_met JSONB DEFAULT '[]',           -- Which objectives achieved
    skills_demonstrated JSONB DEFAULT '[]',       -- Skills observed
    areas_for_improvement JSONB DEFAULT '[]',     -- Development areas
    
    -- Narrative feedback
    apprentice_reflection TEXT,
    mentor_feedback TEXT,
    action_items JSONB DEFAULT '[]',              -- Follow-up tasks
    
    -- Ratings
    overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
    on_track BOOLEAN,
    
    -- OTJT summary for period
    otjt_hours_in_period DECIMAL,
    otjt_target_for_period DECIMAL,
    
    -- Signatures (compliance requirement)
    apprentice_signed_at TIMESTAMPTZ,
    mentor_signed_at TIMESTAMPTZ,
    
    -- Gateway/EPA specific
    gateway_ready BOOLEAN, -- For gateway reviews: is apprentice ready for EPA?
    epa_recommendation TEXT, -- For gateway: recommendation notes
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.progress_reviews IS 'Structured progress reviews between apprentices and mentors';
COMMENT ON COLUMN public.progress_reviews.gateway_ready IS 'For gateway reviews: indicates if apprentice is ready for End Point Assessment';

-- =============================================
-- 7. SKILLS FRAMEWORK
-- =============================================
-- Competency definitions for skills tracking

CREATE TABLE IF NOT EXISTS public.apprenticeship_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('technical', 'professional', 'ai', 'functional', 'leadership')),
    description TEXT,
    
    -- Proficiency levels (1-5)
    level_1_description TEXT, -- Awareness
    level_2_description TEXT, -- Understanding
    level_3_description TEXT, -- Application
    level_4_description TEXT, -- Analysis/Evaluation
    level_5_description TEXT, -- Mastery/Creation
    
    -- Hierarchy
    parent_skill_id UUID REFERENCES public.apprenticeship_skills(id) ON DELETE SET NULL,
    
    -- Mapping to programmes
    programme_ids UUID[] DEFAULT '{}', -- Which programmes use this skill
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.apprenticeship_skills IS 'Competency framework for apprenticeship skills assessment';
COMMENT ON COLUMN public.apprenticeship_skills.category IS 'ai category is unique to CentaurOS Digital Body skills';

-- =============================================
-- 8. APPRENTICE SKILL ASSESSMENTS
-- =============================================
-- Tracks skill acquisition for each apprentice

CREATE TABLE IF NOT EXISTS public.apprentice_skill_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.apprenticeship_enrollments(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.apprenticeship_skills(id) ON DELETE CASCADE,
    
    current_level INTEGER CHECK (current_level BETWEEN 0 AND 5) DEFAULT 0,
    target_level INTEGER CHECK (target_level BETWEEN 1 AND 5) DEFAULT 3,
    
    -- Assessment history
    assessed_at TIMESTAMPTZ,
    assessed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assessment_method TEXT, -- 'observation', 'portfolio', 'test', 'self_assessment'
    evidence TEXT,
    evidence_urls JSONB DEFAULT '[]',
    
    -- Notes
    assessor_notes TEXT,
    development_plan TEXT, -- How to improve this skill
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(enrollment_id, skill_id)
);

COMMENT ON TABLE public.apprentice_skill_assessments IS 'Tracks individual skill levels and assessments for each apprentice';

-- =============================================
-- 9. APPRENTICESHIP DOCUMENTS
-- =============================================
-- Legal agreements, statements, and compliance documents

CREATE TABLE IF NOT EXISTS public.apprenticeship_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.apprenticeship_enrollments(id) ON DELETE CASCADE,
    
    document_type TEXT CHECK (document_type IN (
        'apprenticeship_agreement',  -- Employment contract
        'commitment_statement',      -- 3-way agreement
        'training_plan',             -- Individual training plan
        'progress_review',           -- Signed review record
        'evidence_portfolio',        -- Compiled evidence
        'gateway_declaration',       -- Ready for EPA declaration
        'epa_submission',            -- End Point Assessment submission
        'certificate',               -- Completion certificate
        'other'
    )) NOT NULL,
    
    title TEXT NOT NULL,
    description TEXT,
    
    -- Content
    file_url TEXT,           -- Uploaded document
    content JSONB,           -- For generated documents (template data)
    template_version TEXT,   -- Version of template used
    
    -- Multi-party signatures
    signatures JSONB DEFAULT '[]', -- [{user_id, role, signed_at, ip_address}]
    requires_signatures JSONB DEFAULT '[]', -- [{user_id, role}] who need to sign
    
    status TEXT CHECK (status IN ('draft', 'pending_signatures', 'partially_signed', 'signed', 'expired', 'superseded')) DEFAULT 'draft',
    
    -- Validity
    valid_from DATE,
    valid_until DATE,
    superseded_by UUID REFERENCES public.apprenticeship_documents(id) ON DELETE SET NULL,
    
    -- Audit
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.apprenticeship_documents IS 'Legal documents for apprenticeship compliance with signature tracking';

-- =============================================
-- 10. INDEXES FOR PERFORMANCE
-- =============================================

-- Enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_apprentice ON public.apprenticeship_enrollments(apprentice_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_programme ON public.apprenticeship_enrollments(programme_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_foundry ON public.apprenticeship_enrollments(foundry_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.apprenticeship_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_mentor ON public.apprenticeship_enrollments(senior_mentor_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_buddy ON public.apprenticeship_enrollments(workplace_buddy_id);

-- Module completions
CREATE INDEX IF NOT EXISTS idx_module_completions_enrollment ON public.module_completions(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_module_completions_module ON public.module_completions(module_id);
CREATE INDEX IF NOT EXISTS idx_module_completions_status ON public.module_completions(status);

-- OTJT logs
CREATE INDEX IF NOT EXISTS idx_otjt_logs_enrollment ON public.otjt_time_logs(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_otjt_logs_date ON public.otjt_time_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_otjt_logs_status ON public.otjt_time_logs(status);
CREATE INDEX IF NOT EXISTS idx_otjt_logs_approver ON public.otjt_time_logs(approved_by);

-- Progress reviews
CREATE INDEX IF NOT EXISTS idx_reviews_enrollment ON public.progress_reviews(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON public.progress_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_scheduled ON public.progress_reviews(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_reviews_type ON public.progress_reviews(review_type);

-- Skills
CREATE INDEX IF NOT EXISTS idx_apprentice_skills_enrollment ON public.apprentice_skill_assessments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_apprentice_skills_skill ON public.apprentice_skill_assessments(skill_id);

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_enrollment ON public.apprenticeship_documents(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON public.apprenticeship_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.apprenticeship_documents(status);

-- =============================================
-- 11. ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.apprenticeship_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apprenticeship_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otjt_time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apprenticeship_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apprentice_skill_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apprenticeship_documents ENABLE ROW LEVEL SECURITY;

-- Programmes: Public read, admin write
CREATE POLICY "Programmes are viewable by all authenticated users"
    ON public.apprenticeship_programmes FOR SELECT
    TO authenticated
    USING (true);

-- Enrollments: Own enrollment or mentor/admin
CREATE POLICY "Users can view their own enrollment"
    ON public.apprenticeship_enrollments FOR SELECT
    TO authenticated
    USING (
        apprentice_id = auth.uid() 
        OR senior_mentor_id = auth.uid()
        OR workplace_buddy_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('Executive', 'Founder')
            AND foundry_id = apprenticeship_enrollments.foundry_id
        )
    );

CREATE POLICY "Executives can create enrollments in their foundry"
    ON public.apprenticeship_enrollments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('Executive', 'Founder')
            AND foundry_id = apprenticeship_enrollments.foundry_id
        )
    );

CREATE POLICY "Mentors can update their apprentices enrollments"
    ON public.apprenticeship_enrollments FOR UPDATE
    TO authenticated
    USING (
        senior_mentor_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('Executive', 'Founder')
            AND foundry_id = apprenticeship_enrollments.foundry_id
        )
    );

-- Learning modules: Public read
CREATE POLICY "Learning modules are viewable by authenticated users"
    ON public.learning_modules FOR SELECT
    TO authenticated
    USING (true);

-- Module completions: Own or mentor
CREATE POLICY "Users can view module completions for their enrollments"
    ON public.module_completions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = module_completions.enrollment_id
            AND (
                e.apprentice_id = auth.uid()
                OR e.senior_mentor_id = auth.uid()
                OR e.workplace_buddy_id = auth.uid()
            )
        )
    );

CREATE POLICY "Apprentices can update their own module completions"
    ON public.module_completions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = module_completions.enrollment_id
            AND e.apprentice_id = auth.uid()
        )
    );

-- OTJT logs: Own or mentor
CREATE POLICY "Users can view OTJT logs for their enrollments"
    ON public.otjt_time_logs FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = otjt_time_logs.enrollment_id
            AND (
                e.apprentice_id = auth.uid()
                OR e.senior_mentor_id = auth.uid()
                OR e.workplace_buddy_id = auth.uid()
            )
        )
    );

CREATE POLICY "Apprentices can create OTJT logs for their enrollment"
    ON public.otjt_time_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = otjt_time_logs.enrollment_id
            AND e.apprentice_id = auth.uid()
        )
    );

CREATE POLICY "Mentors can approve OTJT logs"
    ON public.otjt_time_logs FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = otjt_time_logs.enrollment_id
            AND (e.senior_mentor_id = auth.uid() OR e.workplace_buddy_id = auth.uid())
        )
    );

-- Progress reviews: Participants only
CREATE POLICY "Review participants can view reviews"
    ON public.progress_reviews FOR SELECT
    TO authenticated
    USING (
        reviewer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = progress_reviews.enrollment_id
            AND (
                e.apprentice_id = auth.uid()
                OR e.senior_mentor_id = auth.uid()
            )
        )
    );

CREATE POLICY "Mentors can create progress reviews"
    ON public.progress_reviews FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = progress_reviews.enrollment_id
            AND (e.senior_mentor_id = auth.uid() OR e.workplace_buddy_id = auth.uid())
        )
    );

CREATE POLICY "Review participants can update reviews"
    ON public.progress_reviews FOR UPDATE
    TO authenticated
    USING (
        reviewer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = progress_reviews.enrollment_id
            AND e.apprentice_id = auth.uid()
        )
    );

-- Skills: Public read
CREATE POLICY "Skills framework is viewable by all"
    ON public.apprenticeship_skills FOR SELECT
    TO authenticated
    USING (true);

-- Skill assessments: Own or mentor
CREATE POLICY "Users can view skill assessments for their enrollments"
    ON public.apprentice_skill_assessments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = apprentice_skill_assessments.enrollment_id
            AND (
                e.apprentice_id = auth.uid()
                OR e.senior_mentor_id = auth.uid()
            )
        )
    );

CREATE POLICY "Mentors can assess skills"
    ON public.apprentice_skill_assessments FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = apprentice_skill_assessments.enrollment_id
            AND e.senior_mentor_id = auth.uid()
        )
    );

-- Documents: Enrollment participants
CREATE POLICY "Enrollment participants can view documents"
    ON public.apprenticeship_documents FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = apprenticeship_documents.enrollment_id
            AND (
                e.apprentice_id = auth.uid()
                OR e.senior_mentor_id = auth.uid()
                OR e.workplace_buddy_id = auth.uid()
            )
        )
    );

CREATE POLICY "Authorized users can create documents"
    ON public.apprenticeship_documents FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = apprenticeship_documents.enrollment_id
            AND (
                e.senior_mentor_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.profiles 
                    WHERE id = auth.uid() AND role IN ('Executive', 'Founder')
                )
            )
        )
    );

CREATE POLICY "Participants can update documents (for signing)"
    ON public.apprenticeship_documents FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.apprenticeship_enrollments e
            WHERE e.id = apprenticeship_documents.enrollment_id
            AND (
                e.apprentice_id = auth.uid()
                OR e.senior_mentor_id = auth.uid()
            )
        )
    );

-- =============================================
-- 12. SEED DATA: STANDARD UK PROGRAMMES
-- =============================================

INSERT INTO public.apprenticeship_programmes (title, level, standard_code, duration_months, otjt_hours_required, description, skills_framework) VALUES

-- Level 3 Programmes
('Digital Marketing Apprenticeship', 3, 'ST0122', 18, 270,
 'Define, design, build and implement digital campaigns across multiple platforms. Learn SEO, PPC, social media marketing, and analytics.',
 '{"technical": ["seo", "ppc", "social_media", "analytics", "content_creation", "email_marketing"], "professional": ["creativity", "copywriting", "project_management", "stakeholder_communication"]}'::jsonb),

('IT Solutions Technician', 3, 'ST0505', 18, 270,
 'Install, configure and support IT systems. Provide technical support and troubleshooting.',
 '{"technical": ["hardware", "networking", "operating_systems", "troubleshooting", "security_basics"], "professional": ["customer_service", "documentation", "time_management"]}'::jsonb),

-- Level 4 Programmes
('Software Developer', 4, 'ST0116', 24, 360,
 'Design, develop and test software systems following best practices. Full-stack development with modern frameworks.',
 '{"technical": ["coding", "testing", "version_control", "databases", "api_development", "deployment"], "professional": ["problem_solving", "communication", "teamwork", "agile_methodologies"], "ai": ["ai_assisted_coding", "prompt_engineering", "code_review_with_ai"]}'::jsonb),

('Data Analyst', 4, 'ST0118', 24, 360,
 'Collect, organise and analyse data to provide business insights. Create visualizations and reports.',
 '{"technical": ["sql", "python", "data_visualization", "statistics", "data_cleaning", "bi_tools"], "professional": ["analysis", "presentation", "stakeholder_management", "critical_thinking"], "ai": ["ai_data_analysis", "automated_reporting"]}'::jsonb),

('Cyber Security Technologist', 4, 'ST0865', 24, 360,
 'Protect systems, networks and data from cyber threats. Implement security measures and respond to incidents.',
 '{"technical": ["network_security", "penetration_testing", "incident_response", "compliance", "cryptography"], "professional": ["risk_assessment", "documentation", "communication"]}'::jsonb),

('DevOps Engineer', 4, 'ST0825', 24, 360,
 'Bridge development and operations. Implement CI/CD pipelines, infrastructure as code, and cloud platforms.',
 '{"technical": ["ci_cd", "containerization", "cloud_platforms", "infrastructure_as_code", "monitoring", "scripting"], "professional": ["collaboration", "problem_solving", "documentation"], "ai": ["ai_ops", "automated_testing"]}'::jsonb),

-- Level 5 Programmes
('Operations/Departmental Manager', 5, 'ST0385', 30, 450,
 'Manage teams and operations within a department. Develop strategy and drive performance.',
 '{"professional": ["leadership", "strategic_planning", "budget_management", "performance_management", "change_management"], "technical": ["data_driven_decision_making", "project_management"]}'::jsonb),

-- Level 6 Programmes (Degree Apprenticeships)
('Digital Technology Solutions Professional', 6, 'ST0119', 36, 540,
 'Degree-level apprenticeship covering advanced software development, data science, and technology leadership.',
 '{"technical": ["advanced_programming", "system_architecture", "machine_learning", "cloud_architecture", "security_architecture"], "professional": ["leadership", "business_analysis", "stakeholder_management", "strategic_thinking"], "ai": ["ai_architecture", "ml_implementation", "ai_ethics"]}'::jsonb),

('Data Scientist', 6, 'ST0585', 36, 540,
 'Apply scientific methods and algorithms to extract knowledge from data. Build predictive models and AI systems.',
 '{"technical": ["machine_learning", "deep_learning", "statistical_modeling", "big_data", "nlp", "computer_vision"], "professional": ["research_methodology", "presentation", "business_understanding"], "ai": ["model_deployment", "mlops", "responsible_ai"]}'::jsonb),

-- Level 7 Programmes (Masters-level)
('Artificial Intelligence (AI) Data Specialist', 7, 'ST0763', 36, 540,
 'Design and implement AI/ML solutions for complex business problems. Lead AI strategy and implementation.',
 '{"technical": ["deep_learning", "reinforcement_learning", "advanced_nlp", "generative_ai", "mlops", "distributed_computing"], "professional": ["research", "ethics", "leadership", "strategic_planning"], "ai": ["ai_governance", "enterprise_ai", "ai_safety"]}'::jsonb),

('Senior Leader', 7, 'ST0480', 36, 540,
 'Strategic leadership at board level. Drive organizational change and business growth.',
 '{"professional": ["strategic_leadership", "corporate_governance", "financial_management", "organizational_development", "stakeholder_management", "change_leadership"]}'::jsonb);

-- =============================================
-- 13. SEED DATA: SKILLS FRAMEWORK
-- =============================================

INSERT INTO public.apprenticeship_skills (name, category, description, level_1_description, level_2_description, level_3_description, level_4_description, level_5_description) VALUES

-- Technical Skills
('Programming/Coding', 'technical', 'Writing clean, maintainable code in one or more programming languages',
 'Can read and understand basic code', 'Can write simple programs with guidance', 'Can independently develop features', 'Can architect complex systems', 'Can mentor others and define coding standards'),

('Testing & QA', 'technical', 'Writing and executing tests to ensure software quality',
 'Understands what testing is', 'Can write basic unit tests', 'Can implement comprehensive test suites', 'Can design test strategies', 'Can establish QA culture and practices'),

('Database Management', 'technical', 'Designing, querying and managing databases',
 'Can run simple queries', 'Can write complex queries and basic schemas', 'Can design normalized databases', 'Can optimize performance and scale', 'Can architect data platforms'),

('Cloud Platforms', 'technical', 'Using and managing cloud infrastructure (AWS, Azure, GCP)',
 'Aware of cloud concepts', 'Can use basic cloud services', 'Can deploy and manage applications', 'Can architect cloud solutions', 'Can define cloud strategy'),

('Version Control', 'technical', 'Using Git and collaborative development workflows',
 'Can clone and pull', 'Can commit and push changes', 'Can manage branches and resolve conflicts', 'Can implement branching strategies', 'Can design development workflows'),

-- AI Skills (CentaurOS Unique)
('AI-Assisted Development', 'ai', 'Using AI tools to enhance development productivity',
 'Aware of AI coding tools', 'Can use AI for simple tasks', 'Can effectively pair-program with AI', 'Can architect AI-enhanced workflows', 'Can train others in AI collaboration'),

('Prompt Engineering', 'ai', 'Crafting effective prompts to get useful AI outputs',
 'Can write basic prompts', 'Can iterate on prompts for better results', 'Can design prompt templates for consistent results', 'Can optimize prompts for complex tasks', 'Can develop prompt frameworks for organizations'),

('AI Ethics & Safety', 'ai', 'Understanding responsible AI use and safety considerations',
 'Aware of AI risks', 'Understands key ethical principles', 'Can apply ethical frameworks', 'Can assess AI risks and mitigations', 'Can develop AI governance policies'),

('LLM Integration', 'ai', 'Integrating large language models into applications',
 'Understands LLM basics', 'Can use LLM APIs', 'Can build LLM-powered features', 'Can optimize LLM applications', 'Can architect LLM platforms'),

-- Professional Skills
('Communication', 'professional', 'Clear written and verbal communication',
 'Can communicate basic information', 'Can write clear documentation', 'Can present to stakeholders', 'Can influence decisions', 'Can communicate at executive level'),

('Problem Solving', 'professional', 'Analytical thinking and solution development',
 'Can identify problems', 'Can propose solutions', 'Can independently solve complex problems', 'Can develop problem-solving frameworks', 'Can mentor others in problem solving'),

('Teamwork', 'professional', 'Collaborating effectively with others',
 'Can work alongside others', 'Can contribute to team goals', 'Can coordinate team efforts', 'Can lead team initiatives', 'Can build high-performing teams'),

('Time Management', 'professional', 'Organizing work and meeting deadlines',
 'Can follow schedules', 'Can manage own workload', 'Can prioritize effectively', 'Can manage complex projects', 'Can optimize organizational efficiency'),

('Stakeholder Management', 'professional', 'Building and maintaining relationships with stakeholders',
 'Can interact with stakeholders', 'Can gather requirements', 'Can manage expectations', 'Can influence stakeholders', 'Can develop stakeholder strategies'),

-- Functional Skills
('Business Mathematics', 'functional', 'Applying mathematical concepts in business contexts',
 'Basic arithmetic', 'Can use formulas and percentages', 'Can analyze numerical data', 'Can model business scenarios', 'Can develop analytical frameworks'),

('Business English', 'functional', 'Professional written and verbal English',
 'Basic literacy', 'Can write professional emails', 'Can write reports and proposals', 'Can write strategic documents', 'Can define communication standards');

-- =============================================
-- 14. SEED DATA: LEARNING MODULES (Sample for Software Developer)
-- =============================================

DO $$
DECLARE
    software_dev_id UUID;
BEGIN
    SELECT id INTO software_dev_id FROM public.apprenticeship_programmes WHERE standard_code = 'ST0116' LIMIT 1;
    
    IF software_dev_id IS NOT NULL THEN
        INSERT INTO public.learning_modules (programme_id, title, description, module_type, content_type, estimated_hours, order_index, unlock_after_days, skills_taught, is_mandatory) VALUES
        
        -- Week 1: Induction
        (software_dev_id, 'Welcome to Your Apprenticeship', 'Introduction to the apprenticeship programme, expectations, and how to succeed.', 'core', 'interactive', 2, 1, 0, '["communication", "time_management"]', true),
        (software_dev_id, 'Understanding Your Digital Body', 'Introduction to AI-assisted development and the CentaurOS toolkit.', 'ai_readiness', 'interactive', 4, 2, 0, '["ai_assisted_development", "prompt_engineering"]', true),
        (software_dev_id, 'AI Safety & Ethics Training', 'Responsible AI use, limitations, and organizational policies.', 'ai_readiness', 'interactive', 2, 3, 0, '["ai_ethics_safety"]', true),
        (software_dev_id, 'Setting Up Your Development Environment', 'Installing and configuring Cursor, VS Code, and development tools.', 'core', 'task', 4, 4, 0, '["version_control"]', true),
        
        -- Week 2-4: Foundations
        (software_dev_id, 'Git & Version Control Fundamentals', 'Branching, merging, pull requests, and collaborative workflows.', 'core', 'interactive', 8, 5, 7, '["version_control"]', true),
        (software_dev_id, 'Programming Fundamentals', 'Core programming concepts: variables, loops, functions, objects.', 'core', 'interactive', 16, 6, 7, '["programming_coding"]', true),
        (software_dev_id, 'Testing Fundamentals', 'Unit testing, test-driven development, and quality assurance.', 'core', 'interactive', 8, 7, 14, '["testing_qa"]', true),
        (software_dev_id, 'Database Basics', 'SQL, data modeling, and database design principles.', 'core', 'interactive', 12, 8, 14, '["database_management"]', true),
        
        -- Month 2-3: Building Skills
        (software_dev_id, 'Building Your First Feature', 'End-to-end feature development with mentor guidance.', 'project', 'task', 20, 9, 28, '["programming_coding", "testing_qa", "problem_solving"]', true),
        (software_dev_id, 'Code Review Best Practices', 'Giving and receiving constructive code feedback.', 'core', 'interactive', 4, 10, 42, '["communication", "teamwork"]', true),
        (software_dev_id, 'AI Pair Programming Mastery', 'Advanced techniques for collaborating with AI coding assistants.', 'ai_readiness', 'interactive', 6, 11, 42, '["ai_assisted_development", "prompt_engineering"]', true),
        
        -- Ongoing: Professional Development
        (software_dev_id, 'Effective Communication for Developers', 'Technical writing, presentations, and stakeholder communication.', 'core', 'interactive', 6, 12, 56, '["communication", "stakeholder_management"]', true),
        (software_dev_id, 'Agile & Scrum Fundamentals', 'Working in agile teams: sprints, standups, retrospectives.', 'core', 'interactive', 4, 13, 56, '["teamwork", "time_management"]', true),
        
        -- Assessment Modules
        (software_dev_id, 'Mid-Programme Assessment', 'Portfolio review and skills assessment at programme midpoint.', 'assessment', 'task', 8, 14, 180, '[]', true),
        (software_dev_id, 'Gateway Readiness Assessment', 'Final review to determine readiness for End Point Assessment.', 'assessment', 'task', 4, 15, 630, '[]', true),
        
        -- Quick Skills (Optional)
        (software_dev_id, 'Introduction to Cloud Platforms', 'AWS/Azure/GCP basics and deployment fundamentals.', 'quick_skill', 'interactive', 6, 100, 60, '["cloud_platforms"]', false),
        (software_dev_id, 'API Design & Development', 'RESTful APIs, documentation, and best practices.', 'quick_skill', 'interactive', 8, 101, 90, '["programming_coding"]', false),
        (software_dev_id, 'Security Fundamentals for Developers', 'OWASP top 10, secure coding practices.', 'quick_skill', 'interactive', 6, 102, 120, '[]', false);
    END IF;
END $$;

-- =============================================
-- 15. HELPER FUNCTIONS
-- =============================================

-- Function to calculate OTJT progress percentage
CREATE OR REPLACE FUNCTION calculate_otjt_progress(enrollment_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    logged DECIMAL;
    target DECIMAL;
BEGIN
    SELECT otjt_hours_logged, otjt_hours_target INTO logged, target
    FROM public.apprenticeship_enrollments
    WHERE id = enrollment_id;
    
    IF target IS NULL OR target = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN ROUND((logged / target) * 100, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if apprentice is on track for OTJT
CREATE OR REPLACE FUNCTION is_otjt_on_track(enrollment_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    enrollment RECORD;
    expected_progress DECIMAL;
    actual_progress DECIMAL;
BEGIN
    SELECT * INTO enrollment
    FROM public.apprenticeship_enrollments
    WHERE id = enrollment_id;
    
    IF enrollment IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Calculate expected progress based on time elapsed
    expected_progress := EXTRACT(EPOCH FROM (CURRENT_DATE - enrollment.start_date)) /
                        EXTRACT(EPOCH FROM (enrollment.expected_end_date - enrollment.start_date)) * 100;
    
    -- Get actual progress
    actual_progress := calculate_otjt_progress(enrollment_id);
    
    -- On track if within 10% of expected
    RETURN actual_progress >= (expected_progress * 0.9);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get weekly OTJT target (6 hours for full-time)
CREATE OR REPLACE FUNCTION get_weekly_otjt_target(enrollment_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    weekly_hours INTEGER;
BEGIN
    SELECT COALESCE(e.weekly_hours, 30) INTO weekly_hours
    FROM public.apprenticeship_enrollments e
    WHERE e.id = enrollment_id;
    
    -- 20% of working hours, capped at 30 hours/week = 6 hours OTJT
    RETURN LEAST(weekly_hours * 0.2, 6);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update enrollment OTJT total when logs change
CREATE OR REPLACE FUNCTION update_enrollment_otjt_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.apprenticeship_enrollments
    SET otjt_hours_logged = (
        SELECT COALESCE(SUM(hours), 0)
        FROM public.otjt_time_logs
        WHERE enrollment_id = COALESCE(NEW.enrollment_id, OLD.enrollment_id)
        AND status = 'approved'
    ),
    updated_at = now()
    WHERE id = COALESCE(NEW.enrollment_id, OLD.enrollment_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_otjt_total
AFTER INSERT OR UPDATE OR DELETE ON public.otjt_time_logs
FOR EACH ROW
EXECUTE FUNCTION update_enrollment_otjt_total();

-- =============================================
-- 16. NOTIFICATIONS FOR APPRENTICESHIP EVENTS
-- =============================================

-- Add apprenticeship notification types to existing notifications table (if it exists)
DO $$
BEGIN
    -- Check if notifications table exists and has a type check constraint
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_schema = 'public') THEN
        -- Try to add new notification types (will silently fail if constraint doesn't exist)
        BEGIN
            EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check';
            EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
                ''task_assigned'', ''task_completed'', ''comment_added'', ''mention'', ''approval_required'',
                ''objective_updated'', ''team_invite'', ''system'', ''marketplace'',
                ''otjt_approval_required'', ''otjt_approved'', ''otjt_rejected'',
                ''review_scheduled'', ''review_reminder'', ''review_completed'',
                ''module_unlocked'', ''module_completed'', ''skill_assessed'',
                ''document_pending_signature'', ''document_signed'',
                ''enrollment_created'', ''gateway_ready'', ''at_risk_alert''
            ))';
        EXCEPTION WHEN OTHERS THEN
            -- Constraint modification failed, that's okay
            NULL;
        END;
    END IF;
END $$;

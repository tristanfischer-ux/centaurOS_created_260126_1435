-- =============================================
-- MIGRATION: Executive Journey Features
-- =============================================
-- This migration adds features for the complete executive journey:
-- 1. Public profile pages with shareable URLs
-- 2. Self-service listing creation
-- 3. Profile completeness tracking
-- 4. Case studies
-- 5. Discovery call booking
-- 6. Enhanced proposal system for RFQs
-- 7. Trial periods
-- 8. Success check-ins (30/60/90 day)
-- 9. Video introductions
-- 10. NDA/IP templates

-- =============================================
-- SECTION 1: PROVIDER PROFILE ENHANCEMENTS
-- =============================================

-- Add public profile fields to provider_profiles
ALTER TABLE public.provider_profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS profile_slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS video_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS years_experience INTEGER,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS specializations TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS industries TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS company_stages TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS minimum_engagement_hours INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS accepts_trial BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS trial_rate_discount INTEGER DEFAULT 0;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_provider_profiles_username ON public.provider_profiles(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_profiles_slug ON public.provider_profiles(profile_slug) WHERE profile_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_profiles_public ON public.provider_profiles(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_provider_profiles_featured ON public.provider_profiles(featured_until) WHERE featured_until > NOW();

-- =============================================
-- SECTION 2: CASE STUDIES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.case_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    client_name TEXT,
    client_logo_url TEXT,
    client_industry TEXT,
    company_stage TEXT,
    challenge TEXT NOT NULL,
    approach TEXT NOT NULL,
    outcome TEXT NOT NULL,
    metrics JSONB DEFAULT '[]'::jsonb, -- Array of {label, value, change_percent}
    testimonial_quote TEXT,
    testimonial_author TEXT,
    testimonial_role TEXT,
    start_date DATE,
    end_date DATE,
    engagement_type TEXT CHECK (engagement_type IN ('fractional', 'project', 'advisory', 'interim')),
    hours_per_week INTEGER,
    is_featured BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_studies_provider ON public.case_studies(provider_id);
CREATE INDEX IF NOT EXISTS idx_case_studies_featured ON public.case_studies(provider_id, is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_case_studies_public ON public.case_studies(provider_id, is_public) WHERE is_public = TRUE;

-- Enable RLS
ALTER TABLE public.case_studies ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view public case studies
CREATE POLICY "view_public_case_studies" ON public.case_studies
    FOR SELECT USING (auth.role() = 'authenticated' AND is_public = TRUE);

-- Providers can manage their own case studies
CREATE POLICY "manage_own_case_studies" ON public.case_studies
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- SECTION 3: DISCOVERY CALLS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.discovery_call_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT TRUE,
    call_duration_minutes INTEGER DEFAULT 30,
    buffer_minutes INTEGER DEFAULT 15,
    max_advance_days INTEGER DEFAULT 30,
    min_notice_hours INTEGER DEFAULT 24,
    calendar_provider TEXT CHECK (calendar_provider IN ('google', 'outlook', 'apple', 'manual')),
    calendar_sync_token TEXT,
    calendar_sync_enabled BOOLEAN DEFAULT FALSE,
    pre_call_questions JSONB DEFAULT '[]'::jsonb,
    confirmation_message TEXT,
    reminder_hours_before INTEGER DEFAULT 24,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id)
);

CREATE TABLE IF NOT EXISTS public.discovery_call_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.discovery_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
    meeting_url TEXT,
    notes TEXT,
    pre_call_answers JSONB DEFAULT '{}'::jsonb,
    buyer_feedback TEXT,
    provider_feedback TEXT,
    converted_to_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    cancelled_by UUID REFERENCES public.profiles(id),
    cancellation_reason TEXT,
    reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_calls_provider ON public.discovery_calls(provider_id);
CREATE INDEX IF NOT EXISTS idx_discovery_calls_buyer ON public.discovery_calls(buyer_id);
CREATE INDEX IF NOT EXISTS idx_discovery_calls_scheduled ON public.discovery_calls(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_discovery_calls_status ON public.discovery_calls(status);
CREATE INDEX IF NOT EXISTS idx_discovery_call_slots_provider ON public.discovery_call_slots(provider_id, day_of_week);

-- Enable RLS
ALTER TABLE public.discovery_call_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_call_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_calls ENABLE ROW LEVEL SECURITY;

-- Discovery call settings policies
CREATE POLICY "view_discovery_settings" ON public.discovery_call_settings
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "manage_own_discovery_settings" ON public.discovery_call_settings
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Discovery call slots policies
CREATE POLICY "view_discovery_slots" ON public.discovery_call_slots
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "manage_own_discovery_slots" ON public.discovery_call_slots
    FOR ALL USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- Discovery calls policies
CREATE POLICY "view_own_discovery_calls" ON public.discovery_calls
    FOR SELECT USING (
        buyer_id = auth.uid() OR 
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "create_discovery_calls" ON public.discovery_calls
    FOR INSERT WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "update_own_discovery_calls" ON public.discovery_calls
    FOR UPDATE USING (
        buyer_id = auth.uid() OR 
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- SECTION 4: ENHANCED RFQ PROPOSALS
-- =============================================

-- Add proposal fields to rfq_responses
ALTER TABLE public.rfq_responses
ADD COLUMN IF NOT EXISTS proposal_title TEXT,
ADD COLUMN IF NOT EXISTS proposal_summary TEXT,
ADD COLUMN IF NOT EXISTS scope_of_work TEXT,
ADD COLUMN IF NOT EXISTS deliverables JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS timeline_weeks INTEGER,
ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS pricing_breakdown JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT,
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS valid_until DATE,
ADD COLUMN IF NOT EXISTS buyer_viewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS buyer_shortlisted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================
-- SECTION 5: TRIAL PERIODS
-- =============================================

-- Add trial order type
DO $$ BEGIN
    ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'trial';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add trial fields to orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS trial_duration_weeks INTEGER,
ADD COLUMN IF NOT EXISTS trial_hours_per_week INTEGER,
ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS converted_from_trial_id UUID REFERENCES public.orders(id);

-- =============================================
-- SECTION 6: SUCCESS CHECK-INS
-- =============================================

CREATE TABLE IF NOT EXISTS public.success_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    retainer_id UUID REFERENCES public.retainers(id) ON DELETE CASCADE,
    checkin_type TEXT NOT NULL CHECK (checkin_type IN ('day_30', 'day_60', 'day_90', 'quarterly', 'custom')),
    scheduled_for DATE NOT NULL,
    completed_at TIMESTAMPTZ,
    buyer_rating INTEGER CHECK (buyer_rating >= 1 AND buyer_rating <= 5),
    buyer_feedback TEXT,
    seller_rating INTEGER CHECK (seller_rating >= 1 AND seller_rating <= 5),
    seller_feedback TEXT,
    issues_raised TEXT,
    action_items JSONB DEFAULT '[]'::jsonb,
    continuation_confirmed BOOLEAN,
    scope_changes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, checkin_type)
);

CREATE INDEX IF NOT EXISTS idx_success_checkins_order ON public.success_checkins(order_id);
CREATE INDEX IF NOT EXISTS idx_success_checkins_scheduled ON public.success_checkins(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_success_checkins_pending ON public.success_checkins(scheduled_for) WHERE completed_at IS NULL;

-- Enable RLS
ALTER TABLE public.success_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_checkins" ON public.success_checkins
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "manage_own_checkins" ON public.success_checkins
    FOR ALL USING (
        order_id IN (
            SELECT id FROM public.orders 
            WHERE buyer_id = auth.uid() OR 
                  seller_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
        )
    );

-- =============================================
-- SECTION 7: SELF-SERVICE LISTINGS
-- =============================================

-- Add provider-created listings tracking
ALTER TABLE public.marketplace_listings
ADD COLUMN IF NOT EXISTS created_by_provider_id UUID REFERENCES public.provider_profiles(id),
ADD COLUMN IF NOT EXISTS is_self_created BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- =============================================
-- SECTION 8: NDA/IP TEMPLATES
-- =============================================

-- Add more template types
INSERT INTO public.contract_templates (template_type, name, content, variables, is_default)
VALUES 
(
    'nda',
    'Mutual Non-Disclosure Agreement',
    E'MUTUAL NON-DISCLOSURE AGREEMENT\n\nThis Mutual Non-Disclosure Agreement (the "Agreement") is entered into as of {{effective_date}} by and between:\n\n{{party_a_name}} ("Party A")\nand\n{{party_b_name}} ("Party B")\n\n1. DEFINITION OF CONFIDENTIAL INFORMATION\n\nFor purposes of this Agreement, "Confidential Information" means any data or information that is proprietary to the Disclosing Party and not generally known to the public, whether in tangible or intangible form.\n\n2. OBLIGATIONS OF RECEIVING PARTY\n\nThe Receiving Party agrees to:\n(a) Hold and maintain the Confidential Information in strict confidence\n(b) Not to use the Confidential Information except as necessary to perform services\n(c) Not to disclose any Confidential Information to third parties\n\n3. TIME PERIODS\n\nThis Agreement shall remain in effect for {{term_years}} years from the Effective Date.\n\n4. GOVERNING LAW\n\nThis Agreement shall be governed by the laws of {{governing_jurisdiction}}.\n\nIN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.\n\n{{party_a_name}}\nSignature: _________________\nDate: _________________\n\n{{party_b_name}}\nSignature: _________________\nDate: _________________',
    '[{"name": "effective_date", "type": "date", "required": true}, {"name": "party_a_name", "type": "text", "required": true}, {"name": "party_b_name", "type": "text", "required": true}, {"name": "term_years", "type": "number", "required": true, "default": 2}, {"name": "governing_jurisdiction", "type": "text", "required": true, "default": "England and Wales"}]'::jsonb,
    true
),
(
    'ip_assignment',
    'Intellectual Property Assignment Agreement',
    E'INTELLECTUAL PROPERTY ASSIGNMENT AGREEMENT\n\nThis IP Assignment Agreement (the "Agreement") is entered into as of {{effective_date}} by and between:\n\n{{assignor_name}} ("Assignor")\nand\n{{assignee_name}} ("Assignee")\n\n1. ASSIGNMENT OF INTELLECTUAL PROPERTY\n\nAssignor hereby irrevocably assigns, transfers and conveys to Assignee all right, title, and interest in and to all Intellectual Property created during the engagement, including but not limited to:\n\n(a) All inventions, discoveries, and improvements\n(b) All copyrightable works\n(c) All trade secrets and know-how\n(d) All patent applications and patents\n\n2. WORK FOR HIRE\n\nAll Work Product shall be considered "work made for hire" as defined by applicable copyright law.\n\n3. FURTHER ASSURANCES\n\nAssignor agrees to execute any documents and take any actions reasonably necessary to perfect Assignee''s rights in the Intellectual Property.\n\n4. CONSIDERATION\n\nThe consideration for this assignment is included in the fees paid under the Services Agreement dated {{services_agreement_date}}.\n\n5. GOVERNING LAW\n\nThis Agreement shall be governed by the laws of {{governing_jurisdiction}}.\n\nIN WITNESS WHEREOF:\n\n{{assignor_name}}\nSignature: _________________\nDate: _________________\n\n{{assignee_name}}\nSignature: _________________\nDate: _________________',
    '[{"name": "effective_date", "type": "date", "required": true}, {"name": "assignor_name", "type": "text", "required": true}, {"name": "assignee_name", "type": "text", "required": true}, {"name": "services_agreement_date", "type": "date", "required": true}, {"name": "governing_jurisdiction", "type": "text", "required": true, "default": "England and Wales"}]'::jsonb,
    true
),
(
    'sow',
    'Statement of Work',
    E'STATEMENT OF WORK\n\nProject: {{project_name}}\nEffective Date: {{effective_date}}\nClient: {{client_name}}\nProvider: {{provider_name}}\n\n1. PROJECT OVERVIEW\n\n{{project_overview}}\n\n2. SCOPE OF WORK\n\n{{scope_of_work}}\n\n3. DELIVERABLES\n\n{{deliverables}}\n\n4. TIMELINE\n\nStart Date: {{start_date}}\nEnd Date: {{end_date}}\nDuration: {{duration_weeks}} weeks\n\n5. MILESTONES\n\n{{milestones}}\n\n6. PRICING\n\nEngagement Type: {{engagement_type}}\nRate: {{rate}} {{currency}} per {{rate_period}}\nEstimated Total: {{estimated_total}} {{currency}}\n\n7. PAYMENT TERMS\n\n{{payment_terms}}\n\n8. ASSUMPTIONS AND EXCLUSIONS\n\n{{assumptions}}\n\n9. CHANGE MANAGEMENT\n\nAny changes to this SOW must be agreed in writing by both parties.\n\n10. ACCEPTANCE\n\nBy signing below, both parties agree to the terms outlined in this Statement of Work.\n\n{{client_name}}\nSignature: _________________\nDate: _________________\n\n{{provider_name}}\nSignature: _________________\nDate: _________________',
    '[{"name": "project_name", "type": "text", "required": true}, {"name": "effective_date", "type": "date", "required": true}, {"name": "client_name", "type": "text", "required": true}, {"name": "provider_name", "type": "text", "required": true}, {"name": "project_overview", "type": "textarea", "required": true}, {"name": "scope_of_work", "type": "textarea", "required": true}, {"name": "deliverables", "type": "textarea", "required": true}, {"name": "start_date", "type": "date", "required": true}, {"name": "end_date", "type": "date", "required": true}, {"name": "duration_weeks", "type": "number", "required": true}, {"name": "milestones", "type": "textarea", "required": false}, {"name": "engagement_type", "type": "select", "required": true, "options": ["Fractional", "Project", "Advisory", "Retainer"]}, {"name": "rate", "type": "number", "required": true}, {"name": "currency", "type": "select", "required": true, "options": ["GBP", "USD", "EUR"], "default": "GBP"}, {"name": "rate_period", "type": "select", "required": true, "options": ["hour", "day", "week", "month"]}, {"name": "estimated_total", "type": "number", "required": true}, {"name": "payment_terms", "type": "textarea", "required": true}, {"name": "assumptions", "type": "textarea", "required": false}]'::jsonb,
    true
),
(
    'fractional_engagement',
    'Fractional Executive Engagement Agreement',
    E'FRACTIONAL EXECUTIVE ENGAGEMENT AGREEMENT\n\nThis Agreement is entered into as of {{effective_date}} between:\n\n{{company_name}} (the "Company")\nand\n{{executive_name}} (the "Executive")\n\n1. ENGAGEMENT\n\nThe Company engages the Executive to serve as a fractional {{executive_role}} on the terms set forth herein.\n\n2. TERM\n\nThis engagement shall commence on {{start_date}} and continue for an initial term of {{initial_term_months}} months, unless earlier terminated.\n\n3. TIME COMMITMENT\n\nThe Executive agrees to dedicate approximately {{hours_per_week}} hours per week to Company matters.\n\n4. COMPENSATION\n\nThe Company shall pay the Executive:\n- Monthly Retainer: {{monthly_retainer}} {{currency}}\n- Payment Terms: {{payment_terms}}\n\n5. RESPONSIBILITIES\n\n{{responsibilities}}\n\n6. REPORTING\n\nThe Executive shall report to {{reporting_to}}.\n\n7. CONFIDENTIALITY\n\nThe Executive agrees to maintain strict confidentiality regarding all Company information.\n\n8. INTELLECTUAL PROPERTY\n\nAll work product created by the Executive shall be the property of the Company.\n\n9. TERMINATION\n\nEither party may terminate this Agreement with {{notice_period_days}} days written notice.\n\n10. INDEPENDENT CONTRACTOR\n\nThe Executive is an independent contractor, not an employee of the Company.\n\n11. GOVERNING LAW\n\nThis Agreement shall be governed by the laws of {{governing_jurisdiction}}.\n\nIN WITNESS WHEREOF:\n\n{{company_name}}\nBy: _________________\nTitle: _________________\nDate: _________________\n\n{{executive_name}}\nSignature: _________________\nDate: _________________',
    '[{"name": "effective_date", "type": "date", "required": true}, {"name": "company_name", "type": "text", "required": true}, {"name": "executive_name", "type": "text", "required": true}, {"name": "executive_role", "type": "text", "required": true, "placeholder": "e.g., Chief Marketing Officer"}, {"name": "start_date", "type": "date", "required": true}, {"name": "initial_term_months", "type": "number", "required": true, "default": 6}, {"name": "hours_per_week", "type": "number", "required": true, "default": 15}, {"name": "monthly_retainer", "type": "number", "required": true}, {"name": "currency", "type": "select", "required": true, "options": ["GBP", "USD", "EUR"], "default": "GBP"}, {"name": "payment_terms", "type": "textarea", "required": true, "default": "Net 30 days from invoice date"}, {"name": "responsibilities", "type": "textarea", "required": true}, {"name": "reporting_to", "type": "text", "required": true, "default": "CEO"}, {"name": "notice_period_days", "type": "number", "required": true, "default": 30}, {"name": "governing_jurisdiction", "type": "text", "required": true, "default": "England and Wales"}]'::jsonb,
    true
)
ON CONFLICT DO NOTHING;

-- =============================================
-- SECTION 9: PROFILE COMPLETENESS FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION public.calculate_profile_completeness(provider_id_input UUID)
RETURNS INTEGER AS $$
DECLARE
    completeness INTEGER := 0;
    provider RECORD;
    case_study_count INTEGER;
    portfolio_count INTEGER;
BEGIN
    SELECT * INTO provider FROM public.provider_profiles WHERE id = provider_id_input;
    
    IF provider IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Required fields (60% total)
    IF provider.headline IS NOT NULL AND LENGTH(provider.headline) > 10 THEN
        completeness := completeness + 10;
    END IF;
    
    IF provider.bio IS NOT NULL AND LENGTH(provider.bio) > 50 THEN
        completeness := completeness + 15;
    END IF;
    
    IF provider.day_rate IS NOT NULL AND provider.day_rate > 0 THEN
        completeness := completeness + 10;
    END IF;
    
    IF provider.stripe_onboarding_complete = TRUE THEN
        completeness := completeness + 15;
    END IF;
    
    IF provider.timezone IS NOT NULL THEN
        completeness := completeness + 5;
    END IF;
    
    IF provider.currency IS NOT NULL THEN
        completeness := completeness + 5;
    END IF;
    
    -- Optional but valuable fields (40% total)
    IF provider.video_url IS NOT NULL THEN
        completeness := completeness + 10;
    END IF;
    
    IF provider.linkedin_url IS NOT NULL THEN
        completeness := completeness + 5;
    END IF;
    
    IF provider.location IS NOT NULL THEN
        completeness := completeness + 5;
    END IF;
    
    IF provider.years_experience IS NOT NULL THEN
        completeness := completeness + 5;
    END IF;
    
    IF array_length(provider.specializations, 1) > 0 THEN
        completeness := completeness + 5;
    END IF;
    
    -- Case studies (bonus 5%)
    SELECT COUNT(*) INTO case_study_count FROM public.case_studies WHERE case_studies.provider_id = provider_id_input AND is_public = TRUE;
    IF case_study_count > 0 THEN
        completeness := completeness + 5;
    END IF;
    
    -- Portfolio items (bonus 5%)
    SELECT COUNT(*) INTO portfolio_count FROM public.provider_portfolio WHERE provider_portfolio.provider_id = provider_id_input;
    IF portfolio_count > 0 THEN
        completeness := completeness + 5;
    END IF;
    
    -- Cap at 100
    IF completeness > 100 THEN
        completeness := 100;
    END IF;
    
    RETURN completeness;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update profile completeness
CREATE OR REPLACE FUNCTION public.update_profile_completeness()
RETURNS TRIGGER AS $$
BEGIN
    NEW.profile_completeness := public.calculate_profile_completeness(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profile_completeness ON public.provider_profiles;
CREATE TRIGGER trigger_update_profile_completeness
    BEFORE INSERT OR UPDATE ON public.provider_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_profile_completeness();

-- =============================================
-- SECTION 10: SLUG GENERATION
-- =============================================

CREATE OR REPLACE FUNCTION public.generate_profile_slug(full_name TEXT, user_id UUID)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Create base slug from name
    base_slug := LOWER(REGEXP_REPLACE(full_name, '[^a-zA-Z0-9]', '-', 'g'));
    base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');
    base_slug := TRIM(BOTH '-' FROM base_slug);
    
    -- If empty, use user_id prefix
    IF base_slug = '' OR base_slug IS NULL THEN
        base_slug := 'provider';
    END IF;
    
    final_slug := base_slug;
    
    -- Check for uniqueness and append counter if needed
    WHILE EXISTS (SELECT 1 FROM public.provider_profiles WHERE profile_slug = final_slug AND provider_profiles.user_id != generate_profile_slug.user_id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SECTION 11: SUCCESS CHECK-IN AUTO-CREATION
-- =============================================

CREATE OR REPLACE FUNCTION public.create_success_checkins()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create check-ins for accepted orders
    IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status != 'accepted') THEN
        -- Create 30-day check-in
        INSERT INTO public.success_checkins (order_id, checkin_type, scheduled_for)
        VALUES (NEW.id, 'day_30', CURRENT_DATE + INTERVAL '30 days')
        ON CONFLICT DO NOTHING;
        
        -- Create 60-day check-in
        INSERT INTO public.success_checkins (order_id, checkin_type, scheduled_for)
        VALUES (NEW.id, 'day_60', CURRENT_DATE + INTERVAL '60 days')
        ON CONFLICT DO NOTHING;
        
        -- Create 90-day check-in
        INSERT INTO public.success_checkins (order_id, checkin_type, scheduled_for)
        VALUES (NEW.id, 'day_90', CURRENT_DATE + INTERVAL '90 days')
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_success_checkins ON public.orders;
CREATE TRIGGER trigger_create_success_checkins
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.create_success_checkins();

-- =============================================
-- SECTION 12: PROFILE VIEW TRACKING
-- =============================================

CREATE TABLE IF NOT EXISTS public.profile_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT CHECK (source IN ('marketplace', 'search', 'direct', 'rfq', 'referral'))
);

CREATE INDEX IF NOT EXISTS idx_profile_views_provider ON public.profile_views(provider_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_date ON public.profile_views(viewed_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Anyone can create views (we want to track anonymous views too)
CREATE POLICY "insert_profile_views" ON public.profile_views
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Providers can see their own views
CREATE POLICY "view_own_profile_views" ON public.profile_views
    FOR SELECT USING (
        provider_id IN (SELECT id FROM public.provider_profiles WHERE user_id = auth.uid())
    );

-- =============================================
-- SECTION 13: COMMENTS
-- =============================================

COMMENT ON TABLE public.case_studies IS 'Structured case studies showcasing provider work history';
COMMENT ON TABLE public.discovery_call_settings IS 'Provider settings for discovery call scheduling';
COMMENT ON TABLE public.discovery_call_slots IS 'Weekly availability slots for discovery calls';
COMMENT ON TABLE public.discovery_calls IS 'Scheduled discovery calls between buyers and providers';
COMMENT ON TABLE public.success_checkins IS 'Structured check-ins at 30/60/90 days for ongoing engagements';
COMMENT ON TABLE public.profile_views IS 'Analytics tracking for provider profile views';

COMMENT ON COLUMN public.provider_profiles.profile_slug IS 'URL-friendly slug for public profile page';
COMMENT ON COLUMN public.provider_profiles.video_url IS 'Video introduction URL (60-90 second intro)';
COMMENT ON COLUMN public.provider_profiles.profile_completeness IS 'Calculated percentage of profile completion (0-100)';
COMMENT ON COLUMN public.provider_profiles.accepts_trial IS 'Whether provider accepts 2-week trial engagements';

-- =============================================
-- SECTION 14: RPC FUNCTIONS
-- =============================================

-- Function to increment profile views
CREATE OR REPLACE FUNCTION public.increment_profile_views(provider_id_input UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.provider_profiles
    SET profile_views = COALESCE(profile_views, 0) + 1,
        last_active_at = NOW()
    WHERE id = provider_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- END OF MIGRATION
-- =============================================

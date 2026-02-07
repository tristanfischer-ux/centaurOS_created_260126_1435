/**
 * Migration: Cold Email Outreach Pipeline tables
 *
 * Purpose: Persist prospect data, campaigns, generated email sequences,
 * and seller knowledge base content for the 11x-grade cold email agent system.
 *
 * Security:
 * - RLS policies enforce foundry isolation (same pattern as agent_workflows)
 * - Users can only view outreach data in their own foundry
 * - Only the creator can update/delete their own records
 *
 * Rollback:
 *   DROP TABLE IF EXISTS public.outreach_emails CASCADE;
 *   DROP TABLE IF EXISTS public.outreach_contacts CASCADE;
 *   DROP TABLE IF EXISTS public.outreach_campaigns CASCADE;
 *   DROP TABLE IF EXISTS public.outreach_knowledge_base CASCADE;
 */

-- ============================================================================
-- OUTREACH KNOWLEDGE BASE
-- Stores the seller's product context, case studies, value props, and
-- competitor intel. Fed into the personalization and email generation prompts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'text',          -- text, url, pdf_extract
    category TEXT NOT NULL DEFAULT 'product',            -- product, case_study, value_prop, competitor_intel, icp_definition
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_kb" ON public.outreach_knowledge_base
    FOR SELECT USING (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "create_own_foundry_kb" ON public.outreach_knowledge_base
    FOR INSERT WITH CHECK (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "update_own_kb" ON public.outreach_knowledge_base
    FOR UPDATE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "delete_own_kb" ON public.outreach_knowledge_base
    FOR DELETE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_outreach_kb_foundry_id ON public.outreach_knowledge_base(foundry_id);
CREATE INDEX IF NOT EXISTS idx_outreach_kb_category ON public.outreach_knowledge_base(category);

-- ============================================================================
-- OUTREACH CAMPAIGNS
-- Defines a campaign: the product context, ICP, tone, value props, and status.
-- Each campaign can target many contacts and generate many emails.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL DEFAULT 'Untitled Campaign',
    status TEXT NOT NULL DEFAULT 'draft',                -- draft, active, paused, completed, archived
    product_context TEXT DEFAULT '',                      -- what we're selling
    icp_description TEXT DEFAULT '',                      -- ideal customer profile
    value_props JSONB NOT NULL DEFAULT '[]'::jsonb,      -- array of value propositions
    case_studies JSONB NOT NULL DEFAULT '[]'::jsonb,      -- array of case study summaries
    tone TEXT NOT NULL DEFAULT 'professional',            -- professional, casual, executive, technical
    sequence_length INTEGER NOT NULL DEFAULT 4,           -- number of emails in the sequence
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,          -- extensible: e.g. target_industries, company_sizes
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_campaigns" ON public.outreach_campaigns
    FOR SELECT USING (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "create_own_foundry_campaigns" ON public.outreach_campaigns
    FOR INSERT WITH CHECK (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "update_own_campaigns" ON public.outreach_campaigns
    FOR UPDATE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "delete_own_campaigns" ON public.outreach_campaigns
    FOR DELETE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_foundry_id ON public.outreach_campaigns(foundry_id);
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_status ON public.outreach_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_created_by ON public.outreach_campaigns(created_by);

-- ============================================================================
-- OUTREACH CONTACTS
-- Prospect data: enriched company/role info, buying signals, lead score.
-- Each contact belongs to a campaign and a foundry.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Prospect identity
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT DEFAULT '',
    linkedin_url TEXT DEFAULT '',
    job_title TEXT DEFAULT '',
    -- Company info
    company_name TEXT NOT NULL DEFAULT '',
    company_domain TEXT DEFAULT '',
    industry TEXT DEFAULT '',
    company_size TEXT DEFAULT '',                         -- e.g. "11-50", "51-200", "201-500"
    funding_stage TEXT DEFAULT '',                        -- e.g. "Seed", "Series A", "Series B"
    -- Enriched data (from research prompt)
    tech_stack JSONB NOT NULL DEFAULT '[]'::jsonb,       -- known technologies they use
    signals JSONB NOT NULL DEFAULT '[]'::jsonb,          -- buying signals: job changes, funding, website visits
    research_brief TEXT DEFAULT '',                       -- full research output from AI
    pain_points JSONB NOT NULL DEFAULT '[]'::jsonb,      -- identified pain points
    -- Scoring (from scoring prompt)
    score INTEGER DEFAULT 0,                              -- 0-10 lead score
    score_reasoning TEXT DEFAULT '',                      -- why they scored this way
    recommended_angle TEXT DEFAULT '',                    -- best approach angle
    -- Status
    status TEXT NOT NULL DEFAULT 'new',                   -- new, researched, scored, approved, sequenced, contacted, replied, bounced, opted_out
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_contacts" ON public.outreach_contacts
    FOR SELECT USING (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "create_own_foundry_contacts" ON public.outreach_contacts
    FOR INSERT WITH CHECK (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "update_own_contacts" ON public.outreach_contacts
    FOR UPDATE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "delete_own_contacts" ON public.outreach_contacts
    FOR DELETE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_outreach_contacts_foundry_id ON public.outreach_contacts(foundry_id);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_campaign_id ON public.outreach_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_status ON public.outreach_contacts(status);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_score ON public.outreach_contacts(score DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_email ON public.outreach_contacts(email);

-- ============================================================================
-- OUTREACH EMAILS
-- Generated email sequences per contact. Each row is one email in the sequence.
-- Stores subject lines (with variants for A/B), body, personalization data,
-- and the QA report from the compliance check.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Email content
    sequence_position INTEGER NOT NULL DEFAULT 1,         -- 1, 2, 3, 4 in the sequence
    sequence_label TEXT DEFAULT '',                        -- "Opener", "Value-Add", "Case Study", "Breakup"
    subject TEXT NOT NULL DEFAULT '',                      -- primary subject line
    subject_variants JSONB NOT NULL DEFAULT '[]'::jsonb,  -- A/B test variants
    body TEXT NOT NULL DEFAULT '',                         -- email body
    send_delay_days INTEGER NOT NULL DEFAULT 0,           -- days after previous email
    channel TEXT NOT NULL DEFAULT 'email',                 -- email, linkedin, phone
    -- Personalization context (what data was used to craft this email)
    personalization_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- QA results
    qa_report JSONB DEFAULT NULL,                         -- spam check, tone, compliance flags
    qa_passed BOOLEAN DEFAULT false,
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'draft',                  -- draft, approved, scheduled, sent, opened, replied, bounced, opted_out
    scheduled_at TIMESTAMPTZ DEFAULT NULL,
    sent_at TIMESTAMPTZ DEFAULT NULL,
    opened_at TIMESTAMPTZ DEFAULT NULL,
    replied_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_emails" ON public.outreach_emails
    FOR SELECT USING (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "create_own_foundry_emails" ON public.outreach_emails
    FOR INSERT WITH CHECK (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "update_own_emails" ON public.outreach_emails
    FOR UPDATE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "delete_own_emails" ON public.outreach_emails
    FOR DELETE USING (
        created_by = auth.uid()
        AND foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_outreach_emails_foundry_id ON public.outreach_emails(foundry_id);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_contact_id ON public.outreach_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_campaign_id ON public.outreach_emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_status ON public.outreach_emails(status);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_sequence ON public.outreach_emails(contact_id, sequence_position);

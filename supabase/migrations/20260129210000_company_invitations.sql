-- Migration: Company Invitations and Project Assignments
-- This migration adds:
-- 1. owner_id to foundries table to track the founding admin
-- 2. company_invitations table for token-based team invitations
-- 3. project_assignments table for apprentice dual membership (Guild + company projects)

-- =============================================
-- 1. ADD OWNER TO FOUNDRIES
-- =============================================

ALTER TABLE public.foundries 
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add index for quick owner lookups
CREATE INDEX IF NOT EXISTS idx_foundries_owner_id ON public.foundries(owner_id);

-- =============================================
-- 2. CREATE COMPANY_INVITATIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.company_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id uuid NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    email text NOT NULL,
    role public.member_role NOT NULL DEFAULT 'Apprentice',
    token text UNIQUE NOT NULL,
    invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON public.company_invitations(token);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON public.company_invitations(email);
CREATE INDEX IF NOT EXISTS idx_company_invitations_foundry_id ON public.company_invitations(foundry_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_expires_at ON public.company_invitations(expires_at);

-- Enable RLS
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_invitations

-- Founders and Executives can view invitations for their foundry
DROP POLICY IF EXISTS "Admins can view invitations" ON public.company_invitations;
CREATE POLICY "Admins can view invitations" ON public.company_invitations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = company_invitations.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- Founders and Executives can create invitations for their foundry
DROP POLICY IF EXISTS "Admins can create invitations" ON public.company_invitations;
CREATE POLICY "Admins can create invitations" ON public.company_invitations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = company_invitations.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- Founders and Executives can update invitations (e.g., to mark as accepted)
DROP POLICY IF EXISTS "Admins can update invitations" ON public.company_invitations;
CREATE POLICY "Admins can update invitations" ON public.company_invitations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = company_invitations.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- Founders and Executives can delete invitations
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.company_invitations;
CREATE POLICY "Admins can delete invitations" ON public.company_invitations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = company_invitations.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- Service role can bypass RLS for accepting invitations
DROP POLICY IF EXISTS "Service role full access to invitations" ON public.company_invitations;
CREATE POLICY "Service role full access to invitations" ON public.company_invitations
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================
-- 3. CREATE PROJECT_ASSIGNMENTS TABLE
-- =============================================
-- This table tracks which apprentices from the Guild are assigned to which company projects

CREATE TABLE IF NOT EXISTS public.project_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    apprentice_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    foundry_id uuid NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    project_name text,
    project_description text,
    assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    started_at timestamptz DEFAULT now(),
    ended_at timestamptz,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (apprentice_id, foundry_id, project_name, started_at)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_assignments_apprentice ON public.project_assignments(apprentice_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_foundry ON public.project_assignments(foundry_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_status ON public.project_assignments(status);
CREATE INDEX IF NOT EXISTS idx_project_assignments_assigned_by ON public.project_assignments(assigned_by);

-- Enable RLS
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_assignments

-- Apprentices can view their own assignments
DROP POLICY IF EXISTS "Apprentices can view own assignments" ON public.project_assignments;
CREATE POLICY "Apprentices can view own assignments" ON public.project_assignments
    FOR SELECT USING (apprentice_id = auth.uid());

-- Founders and Executives can view assignments for their foundry
DROP POLICY IF EXISTS "Admins can view foundry assignments" ON public.project_assignments;
CREATE POLICY "Admins can view foundry assignments" ON public.project_assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = project_assignments.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- Founders and Executives can create assignments for their foundry
DROP POLICY IF EXISTS "Admins can create assignments" ON public.project_assignments;
CREATE POLICY "Admins can create assignments" ON public.project_assignments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = project_assignments.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- Founders and Executives can update assignments for their foundry
DROP POLICY IF EXISTS "Admins can update assignments" ON public.project_assignments;
CREATE POLICY "Admins can update assignments" ON public.project_assignments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = project_assignments.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- Founders and Executives can delete assignments for their foundry
DROP POLICY IF EXISTS "Admins can delete assignments" ON public.project_assignments;
CREATE POLICY "Admins can delete assignments" ON public.project_assignments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = project_assignments.foundry_id::text
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- =============================================
-- 4. HELPER FUNCTIONS
-- =============================================

-- Function to generate a secure random invitation token
CREATE OR REPLACE FUNCTION public.generate_invitation_token()
RETURNS text AS $$
DECLARE
    token text;
BEGIN
    -- Generate a 32-character hex token (128 bits of entropy)
    token := encode(gen_random_bytes(16), 'hex');
    RETURN token;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Function to check if an invitation is valid (not expired, not accepted)
CREATE OR REPLACE FUNCTION public.is_invitation_valid(invitation_token text)
RETURNS boolean AS $$
DECLARE
    inv record;
BEGIN
    SELECT * INTO inv
    FROM public.company_invitations
    WHERE token = invitation_token;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    IF inv.accepted_at IS NOT NULL THEN
        RETURN false;
    END IF;
    
    IF inv.expires_at < now() THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get invitation details by token (for public access during signup)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invitation_token text)
RETURNS TABLE (
    id uuid,
    foundry_id uuid,
    foundry_name text,
    email text,
    role public.member_role,
    invited_by_name text,
    expires_at timestamptz,
    is_valid boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.id,
        ci.foundry_id,
        f.name as foundry_name,
        ci.email,
        ci.role,
        p.full_name as invited_by_name,
        ci.expires_at,
        (ci.accepted_at IS NULL AND ci.expires_at > now()) as is_valid
    FROM public.company_invitations ci
    JOIN public.foundries f ON f.id = ci.foundry_id
    JOIN public.profiles p ON p.id = ci.invited_by
    WHERE ci.token = invitation_token;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- 5. TRIGGERS
-- =============================================

-- Auto-update updated_at for company_invitations
CREATE OR REPLACE FUNCTION update_company_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_company_invitations_updated_at_trigger ON public.company_invitations;
CREATE TRIGGER update_company_invitations_updated_at_trigger
    BEFORE UPDATE ON public.company_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_company_invitations_updated_at();

-- Auto-update updated_at for project_assignments
CREATE OR REPLACE FUNCTION update_project_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_assignments_updated_at_trigger ON public.project_assignments;
CREATE TRIGGER update_project_assignments_updated_at_trigger
    BEFORE UPDATE ON public.project_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_project_assignments_updated_at();

-- =============================================
-- 6. COMMENTS
-- =============================================

COMMENT ON TABLE public.company_invitations IS 'Token-based invitations for users to join a company/foundry';
COMMENT ON COLUMN public.company_invitations.token IS 'Unique secure token sent via email for accepting the invitation';
COMMENT ON COLUMN public.company_invitations.expires_at IS 'Invitation expiration timestamp (typically 7 days from creation)';
COMMENT ON COLUMN public.company_invitations.accepted_at IS 'When the invitation was accepted (null if pending)';

COMMENT ON TABLE public.project_assignments IS 'Tracks apprentice assignments from the Guild pool to company projects';
COMMENT ON COLUMN public.project_assignments.apprentice_id IS 'The Guild apprentice assigned to the project';
COMMENT ON COLUMN public.project_assignments.foundry_id IS 'The company/foundry the apprentice is assigned to work with';
COMMENT ON COLUMN public.project_assignments.status IS 'active: currently working, completed: finished, cancelled: ended early';

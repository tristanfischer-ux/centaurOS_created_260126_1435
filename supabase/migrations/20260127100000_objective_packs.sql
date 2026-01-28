-- Create objective_packs table
CREATE TABLE IF NOT EXISTS public.objective_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT, 
    difficulty TEXT,
    estimated_duration TEXT,
    icon_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create pack_items table
CREATE TABLE IF NOT EXISTS public.pack_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES public.objective_packs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    role public.member_role NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.objective_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_items ENABLE ROW LEVEL SECURITY;

-- Create Policies (Public Read for now, authenticated users can read all packs)
CREATE POLICY "Enable read access for authenticated users" 
ON public.objective_packs FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Enable read access for authenticated users" 
ON public.pack_items FOR SELECT 
TO authenticated 
USING (true);

-- Seed Data using a DO block to manage IDs
DO $$
DECLARE
    company_formation_id UUID;
    legal_ip_id UUID;
    financial_setup_id UUID;
    digital_presence_id UUID;
    uk_startup_id UUID;
BEGIN
    -- 1. Company Formation & Governance
    INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
    VALUES ('Company Formation & Governance', 'Complete setup for a new limited company including registration and core governance documents.', 'Legal', 'High', '2 weeks', 'Building')
    RETURNING id INTO company_formation_id;

    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (company_formation_id, 'Register with Companies House', 'File IN01 form to incorporate the company. Requires company name, address, director details, and initial share capital.', 'Executive', 1),
    (company_formation_id, 'Draft Articles of Association', 'Prepare the company''s written rules for running the company, agreed by the shareholders, directors and the company secretary.', 'AI_Agent', 2),
    (company_formation_id, 'Prepare Shareholder Agreement', 'Draft agreement outlining shareholder rights, obligations, and stock transfer rules.', 'AI_Agent', 3),
    (company_formation_id, 'Appoint Directors and Secretary', 'Formally appoint initial directors and company secretary (if applicable) and file AP01 forms.', 'Executive', 4),
    (company_formation_id, 'Issue Share Certificates', 'Generate and distribute share certificates to initial shareholders.', 'AI_Agent', 5);

    -- 2. Legal & Intellectual Property
    INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
    VALUES ('Legal & Intellectual Property', 'Secure your brand assets, trademarks, and establish core legal compliance.', 'Legal', 'High', '4 weeks', 'Scale')
    RETURNING id INTO legal_ip_id;

    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (legal_ip_id, 'Trademark Search & Registration', 'Conduct search for brand conflicts and file trademark application with IPO for company name and logo.', 'AI_Agent', 1),
    (legal_ip_id, 'IP Assignment Agreements', 'Execute IP assignment deeds for all founders and early contributors to ensure company owns all IP.', 'AI_Agent', 2),
    (legal_ip_id, 'Privacy Policy & Terms of Service', 'Draft GDPR-compliant Privacy Policy and standard Terms of Service for the website/app.', 'AI_Agent', 3),
    (legal_ip_id, 'Data Protection Registration', 'Register with the ICO (Information Commissioner''s Office) as a data controller.', 'Executive', 4);

    -- 3. Financial Infrastructure
    INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
    VALUES ('Financial Infrastructure', 'Setup banking, accounting, and tax registration.', 'Finance', 'Medium', '1 week', 'Landmark')
    RETURNING id INTO financial_setup_id;

    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (financial_setup_id, 'Open Business Bank Account', 'Set up primary business banking facilities. Required: Incorporation cert, ID for directors.', 'Executive', 1),
    (financial_setup_id, 'VAT Registration', 'Register for VAT if taxable turnover is expected to exceed threshold (or voluntary registration).', 'AI_Agent', 2),
    (financial_setup_id, 'Setup Accounting Software', 'Initialize Xero/Quickbooks account and connect bank feeds.', 'Apprentice', 3),
    (financial_setup_id, 'Appoint Accountants', 'Engage external accounting firm for annual accounts and tax filing.', 'Executive', 4),
    (financial_setup_id, 'Setup Payroll (PAYE)', 'Register as an employer with HMRC even if you are the only employee.', 'AI_Agent', 5);

    -- 4. Digital Presence & Brand
    INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
    VALUES ('Digital Presence & Brand', 'Establish online identity, domains, and basic web presence.', 'Growth', 'Low', '1 week', 'Globe')
    RETURNING id INTO digital_presence_id;

    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (digital_presence_id, 'Domain Name Registration', 'Purchase primary .com/.co.uk domains and defensive variations.', 'AI_Agent', 1),
    (digital_presence_id, 'Setup Corporate Email (GSuite/O365)', 'Configure business email accounts for founders/team.', 'Apprentice', 2),
    (digital_presence_id, 'Launch Landing Page', 'Deploy "Coming Soon" page with email capture.', 'AI_Agent', 3),
    (digital_presence_id, 'Claim Social Handles', 'Register brand name on Twitter, LinkedIn, Instagram, etc.', 'Apprentice', 4);

    -- 5. UK Startup Pack (Comprehensive)
    INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
    VALUES ('UK Startup Launchpad', 'Comprehensive guide to launching a UK business from zero to operational.', 'Startup', 'High', '6 weeks', 'Rocket')
    RETURNING id INTO uk_startup_id;

    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (uk_startup_id, 'Register with Companies House', 'File IN01 form to incorporate the company including Director details and initial share capital.', 'Executive', 1),
    (uk_startup_id, 'Register for Corporation Tax', 'Register your company with HMRC for Corporation Tax within 3 months of starting business.', 'Executive', 2),
    (uk_startup_id, 'Open Business Bank Account', 'Set up a dedicated business bank account to keep finances separate.', 'Executive', 3),
    (uk_startup_id, 'Get Business Insurance', 'Secure Employers'' Liability insurance (required if you have employees) and Professional Indemnity insurance.', 'Executive', 4),
    (uk_startup_id, 'Set up PAYE', 'Register as an employer with HMRC to manage payroll for yourself and employees.', 'AI_Agent', 5),
    (uk_startup_id, 'Register for VAT', 'Register for VAT if taxable turnover > £85,000, or voluntarily for tax efficiency.', 'AI_Agent', 6),
    (uk_startup_id, 'ICO Registration', 'Register with the Information Commissioner''s Office (ICO) for Data Protection compliance.', 'Executive', 7),
    (uk_startup_id, 'Establish Registered Office', 'Set up a physical address for official company correspondence.', 'Apprentice', 8),
    (uk_startup_id, 'Draft Founder Agreements', 'Create clear agreements between co-founders regarding equity and roles.', 'AI_Agent', 9);

END $$;

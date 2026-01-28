-- =============================================
-- MIGRATION: Business Functions for Founder Awareness
-- =============================================
-- Tracks business function coverage to help founders understand
-- what areas are handled vs. gaps that need attention

-- 1. Create business_functions catalog table
-- This is a shared catalog of all business functions across categories
CREATE TABLE public.business_functions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category text NOT NULL CHECK (category IN (
        'finance', 'legal', 'sales', 'marketing', 
        'product', 'operations', 'people', 'customer', 'strategy'
    )),
    name text NOT NULL,
    description text,
    typical_roles text[] DEFAULT '{}',
    is_critical boolean DEFAULT false,
    display_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- 2. Create foundry_function_coverage table
-- Tracks each foundry's coverage of business functions
CREATE TABLE public.foundry_function_coverage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    function_id uuid NOT NULL REFERENCES public.business_functions(id) ON DELETE CASCADE,
    coverage_status text NOT NULL DEFAULT 'gap' CHECK (coverage_status IN ('covered', 'partial', 'gap', 'not_needed')),
    covered_by text,
    notes text,
    assessed_at timestamptz DEFAULT now(),
    assessed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(foundry_id, function_id)
);

-- 3. Create indexes for performance
CREATE INDEX idx_business_functions_category ON public.business_functions(category);
CREATE INDEX idx_business_functions_display_order ON public.business_functions(category, display_order);
CREATE INDEX idx_foundry_function_coverage_foundry ON public.foundry_function_coverage(foundry_id);
CREATE INDEX idx_foundry_function_coverage_status ON public.foundry_function_coverage(coverage_status);
CREATE INDEX idx_foundry_function_coverage_gaps ON public.foundry_function_coverage(foundry_id) 
    WHERE coverage_status = 'gap';

-- 4. Enable RLS
ALTER TABLE public.business_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundry_function_coverage ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for business_functions (public catalog - read-only for authenticated)
CREATE POLICY "Authenticated users can view business functions" ON public.business_functions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage business functions" ON public.business_functions
    FOR ALL USING (auth.role() = 'service_role');

-- 6. RLS Policies for foundry_function_coverage (foundry-isolated)
CREATE POLICY "Users can view coverage in same foundry" ON public.foundry_function_coverage
    FOR SELECT
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert coverage in same foundry" ON public.foundry_function_coverage
    FOR INSERT
    WITH CHECK (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update coverage in same foundry" ON public.foundry_function_coverage
    FOR UPDATE
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete coverage in same foundry" ON public.foundry_function_coverage
    FOR DELETE
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

-- 7. Seed business_functions catalog
INSERT INTO public.business_functions (category, name, description, typical_roles, is_critical, display_order) VALUES

-- FINANCE (category: finance)
('finance', 'Bookkeeping', 'Day-to-day recording of financial transactions, receipts, and expenses', ARRAY['Bookkeeper', 'Accountant', 'Finance Manager'], true, 1),
('finance', 'Financial Planning & Analysis', 'Budgeting, forecasting, and financial modeling for decision-making', ARRAY['FP&A Analyst', 'CFO', 'Finance Director'], true, 2),
('finance', 'Tax Strategy & Compliance', 'Tax planning, filings, and compliance with tax regulations', ARRAY['Tax Accountant', 'CPA', 'Tax Advisor'], true, 3),
('finance', 'Payroll Management', 'Processing employee compensation, benefits deductions, and tax withholdings', ARRAY['Payroll Specialist', 'HR Manager', 'Accountant'], true, 4),
('finance', 'Invoicing & Accounts Receivable', 'Creating invoices, tracking payments, and managing collections', ARRAY['AR Specialist', 'Billing Coordinator', 'Finance Clerk'], false, 5),
('finance', 'Cash Flow Management', 'Monitoring and optimizing cash inflows and outflows', ARRAY['Controller', 'CFO', 'Treasury Manager'], true, 6),
('finance', 'Budgeting & Cost Control', 'Setting budgets and monitoring spending against targets', ARRAY['Budget Analyst', 'Finance Manager', 'CFO'], false, 7),

-- LEGAL (category: legal)
('legal', 'Contract Management', 'Drafting, reviewing, and managing contracts with vendors, partners, and customers', ARRAY['General Counsel', 'Contract Manager', 'Paralegal'], true, 1),
('legal', 'Intellectual Property Protection', 'Patents, trademarks, copyrights, and trade secret protection', ARRAY['IP Attorney', 'Patent Agent', 'General Counsel'], true, 2),
('legal', 'Regulatory Compliance', 'Ensuring compliance with industry regulations and standards', ARRAY['Compliance Officer', 'Regulatory Affairs Manager', 'Legal Counsel'], true, 3),
('legal', 'Employment Law', 'Employment agreements, policies, terminations, and workplace compliance', ARRAY['Employment Attorney', 'HR Director', 'General Counsel'], true, 4),
('legal', 'Corporate Structure & Governance', 'Entity formation, corporate filings, board governance, and equity management', ARRAY['Corporate Attorney', 'CFO', 'General Counsel'], true, 5),
('legal', 'Risk Management', 'Identifying, assessing, and mitigating legal and business risks', ARRAY['Risk Manager', 'General Counsel', 'COO'], false, 6),
('legal', 'Data Privacy & Security', 'GDPR, CCPA, and data protection compliance', ARRAY['Privacy Officer', 'DPO', 'Legal Counsel'], true, 7),

-- SALES (category: sales)
('sales', 'Lead Generation', 'Identifying and qualifying potential customers and opportunities', ARRAY['SDR', 'BDR', 'Marketing Manager'], true, 1),
('sales', 'Sales Process & Methodology', 'Defining and executing the sales process from prospect to close', ARRAY['VP Sales', 'Sales Manager', 'Account Executive'], true, 2),
('sales', 'Account Management', 'Managing ongoing relationships with existing customers', ARRAY['Account Manager', 'Customer Success Manager', 'Account Executive'], true, 3),
('sales', 'Pricing Strategy', 'Developing and optimizing pricing models and strategies', ARRAY['Pricing Manager', 'VP Sales', 'Product Manager'], true, 4),
('sales', 'Sales Operations', 'Sales tools, processes, reporting, and enablement', ARRAY['Sales Ops Manager', 'Revenue Operations', 'Sales Analyst'], false, 5),
('sales', 'CRM Management', 'Managing customer relationship management systems and data', ARRAY['CRM Admin', 'Sales Ops', 'Marketing Ops'], false, 6),
('sales', 'Sales Forecasting', 'Predicting future sales and pipeline management', ARRAY['VP Sales', 'Sales Manager', 'Revenue Operations'], false, 7),

-- MARKETING (category: marketing)
('marketing', 'Brand Strategy', 'Developing and maintaining brand identity, positioning, and voice', ARRAY['Brand Manager', 'CMO', 'Creative Director'], true, 1),
('marketing', 'Content Marketing', 'Creating valuable content to attract and engage target audiences', ARRAY['Content Manager', 'Content Writer', 'Marketing Manager'], true, 2),
('marketing', 'Digital Marketing', 'Online advertising, SEO, SEM, social media, and email marketing', ARRAY['Digital Marketing Manager', 'Growth Marketer', 'PPC Specialist'], true, 3),
('marketing', 'PR & Communications', 'Media relations, press releases, and external communications', ARRAY['PR Manager', 'Communications Director', 'CMO'], false, 4),
('marketing', 'Market Research', 'Analyzing market trends, competitors, and customer insights', ARRAY['Market Research Analyst', 'Product Marketing Manager', 'Strategy Analyst'], true, 5),
('marketing', 'Growth Marketing', 'Experimentation and optimization for user acquisition and retention', ARRAY['Growth Manager', 'Growth Hacker', 'Marketing Manager'], true, 6),
('marketing', 'Event Marketing', 'Planning and executing events, conferences, and webinars', ARRAY['Event Manager', 'Marketing Manager', 'Community Manager'], false, 7),

-- PRODUCT (category: product)
('product', 'Product Management', 'Defining product vision, strategy, roadmap, and requirements', ARRAY['Product Manager', 'VP Product', 'CPO'], true, 1),
('product', 'Software Development', 'Building and maintaining software products and features', ARRAY['Software Engineer', 'Tech Lead', 'CTO'], true, 2),
('product', 'Hardware / Manufacturing', 'Physical product design, prototyping, and manufacturing', ARRAY['Hardware Engineer', 'Manufacturing Engineer', 'Product Designer'], false, 3),
('product', 'QA & Testing', 'Quality assurance, testing, and bug tracking', ARRAY['QA Engineer', 'Test Lead', 'QA Manager'], true, 4),
('product', 'UX / Design', 'User experience design, UI design, and user research', ARRAY['UX Designer', 'Product Designer', 'Design Lead'], true, 5),
('product', 'Technical Architecture', 'System design, infrastructure, and technical decision-making', ARRAY['Software Architect', 'CTO', 'Principal Engineer'], true, 6),
('product', 'DevOps & Infrastructure', 'CI/CD, deployment, monitoring, and infrastructure management', ARRAY['DevOps Engineer', 'SRE', 'Platform Engineer'], true, 7),

-- OPERATIONS (category: operations)
('operations', 'Supply Chain Management', 'Managing suppliers, inventory, and logistics', ARRAY['Supply Chain Manager', 'Procurement Manager', 'COO'], false, 1),
('operations', 'Manufacturing Operations', 'Production planning, quality control, and factory management', ARRAY['Operations Manager', 'Plant Manager', 'COO'], false, 2),
('operations', 'Logistics & Fulfillment', 'Shipping, warehousing, and order fulfillment', ARRAY['Logistics Manager', 'Fulfillment Coordinator', 'Operations Manager'], false, 3),
('operations', 'Procurement & Vendor Management', 'Sourcing, negotiating, and managing vendor relationships', ARRAY['Procurement Manager', 'Buyer', 'Vendor Manager'], false, 4),
('operations', 'Facilities Management', 'Office space, equipment, and physical infrastructure', ARRAY['Facilities Manager', 'Office Manager', 'Operations Manager'], false, 5),
('operations', 'Process Optimization', 'Improving efficiency and streamlining workflows', ARRAY['Process Engineer', 'Operations Analyst', 'COO'], false, 6),

-- PEOPLE (category: people)
('people', 'Recruiting & Talent Acquisition', 'Sourcing, interviewing, and hiring talent', ARRAY['Recruiter', 'Talent Acquisition Manager', 'HR Director'], true, 1),
('people', 'Onboarding', 'New employee orientation, training, and integration', ARRAY['HR Coordinator', 'Onboarding Specialist', 'HR Manager'], true, 2),
('people', 'Performance Management', 'Goal setting, reviews, feedback, and career development', ARRAY['HR Manager', 'People Ops Manager', 'Department Managers'], true, 3),
('people', 'Culture & Engagement', 'Building and maintaining company culture and employee satisfaction', ARRAY['People Ops', 'Culture Manager', 'CEO'], true, 4),
('people', 'Learning & Development', 'Training programs, skill development, and professional growth', ARRAY['L&D Manager', 'Training Coordinator', 'HR Manager'], false, 5),
('people', 'Compensation & Benefits', 'Salary structures, benefits administration, and equity programs', ARRAY['Compensation Manager', 'HR Director', 'CFO'], true, 6),
('people', 'Employee Relations', 'Conflict resolution, policy enforcement, and workplace issues', ARRAY['HR Manager', 'Employee Relations Specialist', 'General Counsel'], false, 7),

-- CUSTOMER (category: customer)
('customer', 'Customer Support', 'Handling customer inquiries, issues, and technical support', ARRAY['Support Agent', 'Support Manager', 'Customer Service Rep'], true, 1),
('customer', 'Customer Success', 'Ensuring customers achieve their desired outcomes with your product', ARRAY['Customer Success Manager', 'CSM', 'Account Manager'], true, 2),
('customer', 'Community Management', 'Building and nurturing user communities and forums', ARRAY['Community Manager', 'Developer Advocate', 'Marketing Manager'], false, 3),
('customer', 'Voice of Customer', 'Collecting and analyzing customer feedback and insights', ARRAY['Product Manager', 'UX Researcher', 'Customer Insights Analyst'], true, 4),
('customer', 'Customer Education', 'Documentation, tutorials, and customer training programs', ARRAY['Technical Writer', 'Customer Education Manager', 'Support Lead'], false, 5),

-- STRATEGY (category: strategy)
('strategy', 'Vision & Mission', 'Defining company purpose, vision, and strategic direction', ARRAY['CEO', 'Founder', 'Board'], true, 1),
('strategy', 'Fundraising & Investor Relations', 'Raising capital and managing investor relationships', ARRAY['CEO', 'CFO', 'Founder'], true, 2),
('strategy', 'Partnerships & Business Development', 'Strategic partnerships, alliances, and channel relationships', ARRAY['BD Manager', 'VP Partnerships', 'CEO'], true, 3),
('strategy', 'Board Relations', 'Board meetings, reporting, and governance', ARRAY['CEO', 'CFO', 'General Counsel'], true, 4),
('strategy', 'Strategic Planning', 'Long-term planning, OKRs, and strategic initiatives', ARRAY['CEO', 'COO', 'Strategy Lead'], true, 5),
('strategy', 'M&A Activities', 'Mergers, acquisitions, and strategic investments', ARRAY['CEO', 'CFO', 'Corporate Development'], false, 6),
('strategy', 'Competitive Intelligence', 'Monitoring and analyzing competitive landscape', ARRAY['Strategy Analyst', 'Product Marketing', 'CEO'], false, 7);

-- 8. Helper function to get coverage summary for a foundry
CREATE OR REPLACE FUNCTION public.get_foundry_coverage_summary(p_foundry_id text)
RETURNS TABLE (
    category text,
    total_functions bigint,
    covered bigint,
    partial bigint,
    gaps bigint,
    not_needed bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bf.category,
        COUNT(bf.id) as total_functions,
        COUNT(ffc.id) FILTER (WHERE ffc.coverage_status = 'covered') as covered,
        COUNT(ffc.id) FILTER (WHERE ffc.coverage_status = 'partial') as partial,
        COUNT(bf.id) - COUNT(ffc.id) + COUNT(ffc.id) FILTER (WHERE ffc.coverage_status = 'gap') as gaps,
        COUNT(ffc.id) FILTER (WHERE ffc.coverage_status = 'not_needed') as not_needed
    FROM public.business_functions bf
    LEFT JOIN public.foundry_function_coverage ffc 
        ON bf.id = ffc.function_id AND ffc.foundry_id = p_foundry_id
    GROUP BY bf.category
    ORDER BY bf.category;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_foundry_coverage_summary TO authenticated;

-- Comments
COMMENT ON TABLE public.business_functions IS 'Catalog of business functions that founders need to cover';
COMMENT ON TABLE public.foundry_function_coverage IS 'Tracks each foundry''s coverage of business functions';
COMMENT ON COLUMN public.foundry_function_coverage.coverage_status IS 'covered: fully handled, partial: some coverage, gap: not addressed, not_needed: not applicable';

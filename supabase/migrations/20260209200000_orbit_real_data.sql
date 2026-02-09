-- ============================================================================
-- Migration: Wire Orbit View to Real Data
-- Purpose: Ensure business_functions + foundry_function_coverage tables exist,
--          add primary_function_id to profiles for business function mapping,
--          seed additional marketplace People listings for underrepresented
--          functions, and add function_category to existing listing attributes.
-- ============================================================================

-- 0. Ensure prerequisite tables exist (migration 20260128000001 may have
--    been recorded but the tables were dropped or never created).

CREATE TABLE IF NOT EXISTS public.business_functions (
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

ALTER TABLE public.business_functions ENABLE ROW LEVEL SECURITY;

-- Idempotent policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'business_functions' AND policyname = 'Authenticated users can view business functions'
  ) THEN
    CREATE POLICY "Authenticated users can view business functions" ON public.business_functions
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'business_functions' AND policyname = 'Service role can manage business functions'
  ) THEN
    CREATE POLICY "Service role can manage business functions" ON public.business_functions
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_business_functions_category ON public.business_functions(category);
CREATE INDEX IF NOT EXISTS idx_business_functions_display_order ON public.business_functions(category, display_order);

-- Seed the catalog if empty
INSERT INTO public.business_functions (category, name, description, typical_roles, is_critical, display_order)
SELECT * FROM (VALUES
  ('finance', 'Bookkeeping', 'Day-to-day recording of financial transactions', ARRAY['Bookkeeper','Accountant','Finance Manager'], true, 1),
  ('finance', 'Financial Planning & Analysis', 'Budgeting, forecasting, and financial modeling', ARRAY['FP&A Analyst','CFO','Finance Director'], true, 2),
  ('finance', 'Tax Strategy & Compliance', 'Tax planning, filings, and compliance', ARRAY['Tax Accountant','CPA','Tax Advisor'], true, 3),
  ('finance', 'Payroll Management', 'Processing compensation and benefits', ARRAY['Payroll Specialist','HR Manager','Accountant'], true, 4),
  ('finance', 'Invoicing & Accounts Receivable', 'Invoices, payments, and collections', ARRAY['AR Specialist','Billing Coordinator','Finance Clerk'], false, 5),
  ('finance', 'Cash Flow Management', 'Monitoring cash inflows and outflows', ARRAY['Controller','CFO','Treasury Manager'], true, 6),
  ('finance', 'Budgeting & Cost Control', 'Setting budgets and monitoring spending', ARRAY['Budget Analyst','Finance Manager','CFO'], false, 7),
  ('legal', 'Contract Management', 'Drafting, reviewing, managing contracts', ARRAY['General Counsel','Contract Manager','Paralegal'], true, 1),
  ('legal', 'Intellectual Property Protection', 'Patents, trademarks, copyrights', ARRAY['IP Attorney','Patent Agent','General Counsel'], true, 2),
  ('legal', 'Regulatory Compliance', 'Industry regulation compliance', ARRAY['Compliance Officer','Regulatory Affairs Manager','Legal Counsel'], true, 3),
  ('legal', 'Employment Law', 'Employment agreements and workplace compliance', ARRAY['Employment Attorney','HR Director','General Counsel'], true, 4),
  ('legal', 'Corporate Structure & Governance', 'Entity formation and governance', ARRAY['Corporate Attorney','CFO','General Counsel'], true, 5),
  ('legal', 'Risk Management', 'Identifying and mitigating risks', ARRAY['Risk Manager','General Counsel','COO'], false, 6),
  ('legal', 'Data Privacy & Security', 'GDPR, CCPA, data protection', ARRAY['Privacy Officer','DPO','Legal Counsel'], true, 7),
  ('sales', 'Lead Generation', 'Identifying and qualifying prospects', ARRAY['SDR','BDR','Marketing Manager'], true, 1),
  ('sales', 'Sales Process & Methodology', 'Executing the sales process', ARRAY['VP Sales','Sales Manager','Account Executive'], true, 2),
  ('sales', 'Account Management', 'Managing existing customer relationships', ARRAY['Account Manager','CSM','Account Executive'], true, 3),
  ('sales', 'Pricing Strategy', 'Pricing models and strategies', ARRAY['Pricing Manager','VP Sales','Product Manager'], true, 4),
  ('sales', 'Sales Operations', 'Sales tools, reporting, enablement', ARRAY['Sales Ops Manager','Revenue Operations','Sales Analyst'], false, 5),
  ('sales', 'CRM Management', 'Managing CRM systems and data', ARRAY['CRM Admin','Sales Ops','Marketing Ops'], false, 6),
  ('sales', 'Sales Forecasting', 'Pipeline management and prediction', ARRAY['VP Sales','Sales Manager','Revenue Operations'], false, 7),
  ('marketing', 'Brand Strategy', 'Brand identity, positioning, voice', ARRAY['Brand Manager','CMO','Creative Director'], true, 1),
  ('marketing', 'Content Marketing', 'Content to attract and engage audiences', ARRAY['Content Manager','Content Writer','Marketing Manager'], true, 2),
  ('marketing', 'Digital Marketing', 'SEO, SEM, social media, email', ARRAY['Digital Marketing Manager','Growth Marketer','PPC Specialist'], true, 3),
  ('marketing', 'PR & Communications', 'Media relations and communications', ARRAY['PR Manager','Communications Director','CMO'], false, 4),
  ('marketing', 'Market Research', 'Market trends, competitors, insights', ARRAY['Market Research Analyst','PMM','Strategy Analyst'], true, 5),
  ('marketing', 'Growth Marketing', 'User acquisition and retention', ARRAY['Growth Manager','Growth Hacker','Marketing Manager'], true, 6),
  ('marketing', 'Event Marketing', 'Events, conferences, webinars', ARRAY['Event Manager','Marketing Manager','Community Manager'], false, 7),
  ('product', 'Product Management', 'Vision, strategy, roadmap, requirements', ARRAY['Product Manager','VP Product','CPO'], true, 1),
  ('product', 'Software Development', 'Building software products', ARRAY['Software Engineer','Tech Lead','CTO'], true, 2),
  ('product', 'Hardware / Manufacturing', 'Physical product design and prototyping', ARRAY['Hardware Engineer','Manufacturing Engineer','Product Designer'], false, 3),
  ('product', 'QA & Testing', 'Quality assurance and testing', ARRAY['QA Engineer','Test Lead','QA Manager'], true, 4),
  ('product', 'UX / Design', 'UX/UI design and user research', ARRAY['UX Designer','Product Designer','Design Lead'], true, 5),
  ('product', 'Technical Architecture', 'System design and infrastructure', ARRAY['Software Architect','CTO','Principal Engineer'], true, 6),
  ('product', 'DevOps & Infrastructure', 'CI/CD, deployment, monitoring', ARRAY['DevOps Engineer','SRE','Platform Engineer'], true, 7),
  ('operations', 'Supply Chain Management', 'Suppliers, inventory, logistics', ARRAY['Supply Chain Manager','Procurement Manager','COO'], false, 1),
  ('operations', 'Manufacturing Operations', 'Production and quality control', ARRAY['Operations Manager','Plant Manager','COO'], false, 2),
  ('operations', 'Logistics & Fulfillment', 'Shipping, warehousing, order fulfillment', ARRAY['Logistics Manager','Fulfillment Coordinator','Operations Manager'], false, 3),
  ('operations', 'Procurement & Vendor Management', 'Sourcing and vendor relationships', ARRAY['Procurement Manager','Buyer','Vendor Manager'], false, 4),
  ('operations', 'Facilities Management', 'Office, equipment, infrastructure', ARRAY['Facilities Manager','Office Manager','Operations Manager'], false, 5),
  ('operations', 'Process Optimization', 'Efficiency and workflow improvement', ARRAY['Process Engineer','Operations Analyst','COO'], false, 6),
  ('people', 'Recruiting & Talent Acquisition', 'Sourcing and hiring talent', ARRAY['Recruiter','Talent Acquisition Manager','HR Director'], true, 1),
  ('people', 'Onboarding', 'New employee orientation and integration', ARRAY['HR Coordinator','Onboarding Specialist','HR Manager'], true, 2),
  ('people', 'Performance Management', 'Goals, reviews, feedback', ARRAY['HR Manager','People Ops Manager','Department Managers'], true, 3),
  ('people', 'Culture & Engagement', 'Company culture and employee satisfaction', ARRAY['People Ops','Culture Manager','CEO'], true, 4),
  ('people', 'Learning & Development', 'Training and professional growth', ARRAY['L&D Manager','Training Coordinator','HR Manager'], false, 5),
  ('people', 'Compensation & Benefits', 'Salary, benefits, equity programs', ARRAY['Compensation Manager','HR Director','CFO'], true, 6),
  ('people', 'Employee Relations', 'Conflict resolution and policy', ARRAY['HR Manager','Employee Relations Specialist','General Counsel'], false, 7),
  ('customer', 'Customer Support', 'Customer inquiries and issues', ARRAY['Support Agent','Support Manager','Customer Service Rep'], true, 1),
  ('customer', 'Customer Success', 'Ensuring customer outcomes', ARRAY['Customer Success Manager','CSM','Account Manager'], true, 2),
  ('customer', 'Community Management', 'User communities and forums', ARRAY['Community Manager','Developer Advocate','Marketing Manager'], false, 3),
  ('customer', 'Voice of Customer', 'Customer feedback and insights', ARRAY['Product Manager','UX Researcher','Customer Insights Analyst'], true, 4),
  ('customer', 'Customer Education', 'Documentation and training', ARRAY['Technical Writer','Customer Education Manager','Support Lead'], false, 5),
  ('strategy', 'Vision & Mission', 'Company purpose and direction', ARRAY['CEO','Founder','Board'], true, 1),
  ('strategy', 'Fundraising & Investor Relations', 'Raising capital', ARRAY['CEO','CFO','Founder'], true, 2),
  ('strategy', 'Partnerships & Business Development', 'Strategic partnerships', ARRAY['BD Manager','VP Partnerships','CEO'], true, 3),
  ('strategy', 'Board Relations', 'Board meetings and governance', ARRAY['CEO','CFO','General Counsel'], true, 4),
  ('strategy', 'Strategic Planning', 'Long-term planning and OKRs', ARRAY['CEO','COO','Strategy Lead'], true, 5),
  ('strategy', 'M&A Activities', 'Mergers and acquisitions', ARRAY['CEO','CFO','Corporate Development'], false, 6),
  ('strategy', 'Competitive Intelligence', 'Competitive landscape analysis', ARRAY['Strategy Analyst','Product Marketing','CEO'], false, 7)
) AS v(category, name, description, typical_roles, is_critical, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.business_functions LIMIT 1);

-- Foundry function coverage
CREATE TABLE IF NOT EXISTS public.foundry_function_coverage (
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

ALTER TABLE public.foundry_function_coverage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'foundry_function_coverage' AND policyname = 'Users can view coverage in same foundry'
  ) THEN
    CREATE POLICY "Users can view coverage in same foundry" ON public.foundry_function_coverage
      FOR SELECT USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'foundry_function_coverage' AND policyname = 'Users can manage coverage in same foundry'
  ) THEN
    CREATE POLICY "Users can manage coverage in same foundry" ON public.foundry_function_coverage
      FOR ALL USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_foundry_function_coverage_foundry ON public.foundry_function_coverage(foundry_id);
CREATE INDEX IF NOT EXISTS idx_foundry_function_coverage_status ON public.foundry_function_coverage(coverage_status);

-- 1. Add primary_function_id to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS primary_function_id UUID REFERENCES public.business_functions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_primary_function ON public.profiles(primary_function_id);

-- 2. Update existing marketplace People listings with function_category in attributes
-- Dr. Sarah Chen (Fractional CTO) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Dr. Sarah Chen';

-- James Sterling (Operations Lead) → operations
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "operations"}'::jsonb
WHERE category = 'People' AND title = 'James Sterling';

-- Elena Rodriguez (Fractional CFO) → finance
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "finance"}'::jsonb
WHERE category = 'People' AND title = 'Elena Rodriguez';

-- Marcus Thorne (Fractional CPO) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Marcus Thorne';

-- Dr. Aris Vlahos (AI Lead) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Dr. Aris Vlahos';

-- Victoria Hammond (Fractional CRO) → sales
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "sales"}'::jsonb
WHERE category = 'People' AND title = 'Victoria Hammond';

-- David Miller (CAD Specialist) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'David Miller';

-- Priya Patel (Supply Chain Analyst) → operations
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "operations"}'::jsonb
WHERE category = 'People' AND title = 'Priya Patel';

-- Liam O'Connor (Mechatronics Engineer) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Liam O''Connor';

-- Sophie Dubois (Frontend Developer) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Sophie Dubois';

-- Noah Kim (Data Scientist) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Noah Kim';

-- Emma Wilson (UX/UI Designer) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Emma Wilson';

-- Lucas Weber (Robotics Engineer) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Lucas Weber';

-- Olivia Jones (Technical Writer) → product
UPDATE public.marketplace_listings
SET attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Olivia Jones';


-- 3. Seed new marketplace People listings for underrepresented functions
-- MARKETING - Executives
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
VALUES
    ('People', 'Executive', 'Rachel Nguyen',
     'Fractional CMO with 14 years scaling brands from seed to Series C. Former Head of Marketing at HubSpot EMEA. Expert in brand positioning, demand generation, and go-to-market strategy. Grew pipeline by 300% in 18 months at previous role.',
     '{
        "role": "Fractional CMO",
        "rate": "£1,250/day",
        "availability": "2 days/week",
        "years_experience": 14,
        "industries": ["B2B SaaS", "Deep Tech", "Fintech"],
        "expertise": ["Brand Strategy", "Demand Generation", "Go-to-Market", "Content Marketing"],
        "education": "MBA Marketing, INSEAD",
        "location": "London, UK",
        "languages": ["English", "Vietnamese", "French"],
        "previous_companies": ["HubSpot", "Intercom", "Stripe"],
        "certifications": ["Google Analytics", "HubSpot Inbound"],
        "timezone": "GMT",
        "function_category": "marketing"
     }', NULL, true),

    ('People', 'Executive', 'Tom Ashford',
     'Growth Marketing Lead specialising in PLG and performance marketing for technical products. Built growth teams at 2 unicorns. Expert in SEO, paid acquisition, and conversion optimisation. Data-driven approach with strong analytics foundation.',
     '{
        "role": "Growth Lead",
        "rate": "£1,100/day",
        "availability": "3 days/week",
        "years_experience": 10,
        "industries": ["SaaS", "Developer Tools", "Marketplace"],
        "expertise": ["Growth Strategy", "SEO", "Paid Acquisition", "Conversion Optimisation"],
        "education": "BSc Mathematics, Warwick",
        "location": "Manchester, UK",
        "languages": ["English"],
        "previous_companies": ["Monzo", "Deliveroo", "Wise"],
        "certifications": ["Google Ads", "Meta Blueprint"],
        "timezone": "GMT",
        "function_category": "marketing"
     }', NULL, true),

-- MARKETING - Apprentices
    ('People', 'Apprentice', 'Zara Osei',
     'Content Marketing Specialist creating thought leadership for deep tech companies. 2 years experience producing technical blogs, whitepapers, and case studies. Strong SEO background with measurable results.',
     '{
        "role": "Content Marketing Specialist",
        "rate": "£1,900/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Content Strategy", "SEO Writing", "HubSpot", "WordPress", "Analytics"],
        "education": "BA English & Media, Leeds",
        "location": "Leeds, UK",
        "languages": ["English", "Twi"],
        "projects_completed": 45,
        "portfolio": "zaraosei.com",
        "timezone": "GMT",
        "function_category": "marketing"
     }', NULL, true),

    ('People', 'Apprentice', 'Kai Brennan',
     'Social Media & Community Manager experienced in building engaged developer and B2B communities. Grew Discord community from 0 to 5,000 members. Strong video editing and graphic design skills.',
     '{
        "role": "Social Media Manager",
        "rate": "£1,800/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Social Media Strategy", "Community Management", "Video Editing", "Canva", "Discord"],
        "education": "BA Marketing, Bristol",
        "location": "Bristol, UK",
        "languages": ["English"],
        "projects_completed": 30,
        "timezone": "GMT",
        "function_category": "marketing"
     }', NULL, true),

-- HR / PEOPLE - Executives
    ('People', 'Executive', 'Amy O''Brien',
     'Fractional CHRO with 16 years building people operations from scratch at high-growth startups. Former VP People at Revolut. Expert in talent strategy, compensation design, and organisational development. Built teams from 20 to 500+.',
     '{
        "role": "Fractional CHRO",
        "rate": "£1,200/day",
        "availability": "2 days/week",
        "years_experience": 16,
        "industries": ["Fintech", "Deep Tech", "SaaS"],
        "expertise": ["Talent Strategy", "Compensation Design", "Org Development", "Employment Law"],
        "education": "MSc Organisational Psychology, Birkbeck",
        "location": "London, UK",
        "languages": ["English"],
        "previous_companies": ["Revolut", "Checkout.com", "Improbable"],
        "certifications": ["CIPD Level 7", "SHRM-SCP"],
        "timezone": "GMT",
        "function_category": "hr"
     }', NULL, true),

    ('People', 'Executive', 'Lucy Wang',
     'Head of Talent Acquisition specialising in engineering and deep tech hiring. 12 years recruiting across Europe. Built talent pipelines at 3 unicorns. Expert in employer branding, DEI, and structured interviewing.',
     '{
        "role": "Head of Talent",
        "rate": "£1,000/day",
        "availability": "3 days/week",
        "years_experience": 12,
        "industries": ["Tech", "Engineering", "Hardware"],
        "expertise": ["Engineering Hiring", "Employer Branding", "DEI", "Structured Interviewing"],
        "education": "BA Psychology, Durham",
        "location": "Remote (UK-based)",
        "languages": ["English", "Mandarin"],
        "previous_companies": ["Darktrace", "ARM", "Graphcore"],
        "certifications": ["LinkedIn Recruiter Certified"],
        "timezone": "GMT",
        "function_category": "hr"
     }', NULL, true),

-- HR - Apprentice
    ('People', 'Apprentice', 'Ben Torres',
     'HR Coordinator with experience in onboarding, employee engagement, and HRIS systems. 1 year supporting People teams at a Series B startup. Strong organisational skills and attention to detail.',
     '{
        "role": "HR Coordinator",
        "rate": "£1,700/month",
        "availability": "Full-time",
        "years_experience": 1,
        "skills": ["BambooHR", "Onboarding", "Employee Engagement", "Payroll Support", "GDPR"],
        "education": "BA Business Management, Exeter",
        "location": "Exeter, UK",
        "languages": ["English", "Spanish"],
        "projects_completed": 20,
        "timezone": "GMT",
        "function_category": "hr"
     }', NULL, true),

-- LEGAL - Executives
    ('People', 'Executive', 'James Liu',
     'Fractional General Counsel with 18 years in technology and IP law. Former Legal Director at Amazon UK. Expert in commercial contracts, data protection, and corporate governance. Advised on £500M+ in transactions.',
     '{
        "role": "Fractional General Counsel",
        "rate": "£1,400/day",
        "availability": "1 day/week",
        "years_experience": 18,
        "industries": ["Technology", "E-commerce", "Deep Tech"],
        "expertise": ["Commercial Contracts", "Data Protection", "IP Law", "Corporate Governance"],
        "education": "LLM Technology Law, Cambridge",
        "location": "London, UK",
        "languages": ["English", "Mandarin"],
        "previous_companies": ["Amazon", "Clifford Chance", "Mishcon de Reya"],
        "certifications": ["Solicitor (England & Wales)"],
        "timezone": "GMT",
        "function_category": "legal"
     }', NULL, true),

    ('People', 'Executive', 'Patrick Nwosu',
     'IP & Patent Attorney specialising in engineering and software patents. 14 years protecting innovation for startups and corporates. Filed 200+ patents globally. Expert in freedom-to-operate analysis and licensing.',
     '{
        "role": "IP Attorney",
        "rate": "£1,300/day",
        "availability": "2 days/week",
        "years_experience": 14,
        "industries": ["Hardware", "Robotics", "Software", "Biotech"],
        "expertise": ["Patent Prosecution", "IP Strategy", "Licensing", "Freedom-to-Operate"],
        "education": "MEng + LLM Patent Law, Queen Mary",
        "location": "London, UK",
        "languages": ["English", "Igbo"],
        "previous_companies": ["Marks & Clerk", "Dyson", "Arm"],
        "certifications": ["Chartered Patent Attorney", "European Patent Attorney"],
        "timezone": "GMT",
        "function_category": "legal"
     }', NULL, true),

-- LEGAL - Apprentice
    ('People', 'Apprentice', 'Olivia Dunn',
     'Legal Assistant with experience in contract review and compliance documentation. 1 year supporting legal teams at a tech startup. Strong research skills and attention to regulatory detail.',
     '{
        "role": "Legal Assistant",
        "rate": "£1,600/month",
        "availability": "Full-time",
        "years_experience": 1,
        "skills": ["Contract Review", "Legal Research", "GDPR Compliance", "NDA Drafting", "IP Filing"],
        "education": "LLB Law, King''s College London",
        "location": "London, UK",
        "languages": ["English"],
        "projects_completed": 25,
        "timezone": "GMT",
        "function_category": "legal"
     }', NULL, true),

-- SALES - Apprentice
    ('People', 'Apprentice', 'Sam Patel',
     'Sales Development Representative with strong outbound prospecting skills. 1 year at a B2B SaaS company. Expert in cold outreach, CRM management, and pipeline generation. Consistently exceeded quota by 130%.',
     '{
        "role": "Sales Development Rep",
        "rate": "£1,800/month",
        "availability": "Full-time",
        "years_experience": 1,
        "skills": ["Outbound Prospecting", "Salesforce", "Cold Email", "LinkedIn Sales Nav", "HubSpot"],
        "education": "BA Business, Nottingham",
        "location": "Nottingham, UK",
        "languages": ["English", "Gujarati"],
        "projects_completed": 15,
        "timezone": "GMT",
        "function_category": "sales"
     }', NULL, true),

-- FINANCE - Apprentice
    ('People', 'Apprentice', 'Chloe Martin',
     'Financial Analyst with strong modelling and reporting skills. 2 years supporting FP&A at a Series B startup. Expert in Excel, financial modelling, and management reporting. CFA Level 1 passed.',
     '{
        "role": "Financial Analyst",
        "rate": "£2,100/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Financial Modelling", "Excel", "SQL", "Xero", "Management Reporting"],
        "education": "BSc Accounting & Finance, LSE",
        "location": "London, UK",
        "languages": ["English", "French"],
        "projects_completed": 30,
        "certifications": ["CFA Level 1"],
        "timezone": "GMT",
        "function_category": "finance"
     }', NULL, true),

-- OPERATIONS - Apprentice
    ('People', 'Apprentice', 'Leo Park',
     'Operations Analyst building process automation and efficiency improvements. 1 year at a logistics startup. Strong data analysis and process mapping skills. Reduced manual operations time by 40%.',
     '{
        "role": "Operations Analyst",
        "rate": "£1,900/month",
        "availability": "Full-time",
        "years_experience": 1,
        "skills": ["Process Automation", "Data Analysis", "Zapier", "Notion", "Python"],
        "education": "BEng Industrial Engineering, Sheffield",
        "location": "Sheffield, UK",
        "languages": ["English", "Korean"],
        "projects_completed": 20,
        "timezone": "GMT",
        "function_category": "operations"
     }', NULL, true),

-- PRODUCT - Apprentice (extra)
    ('People', 'Apprentice', 'Grace Kim',
     'Product Analyst with strong quantitative skills. 2 years working with product teams on feature prioritisation, A/B testing, and user analytics. Expert in Mixpanel and Amplitude.',
     '{
        "role": "Product Analyst",
        "rate": "£2,000/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Product Analytics", "Mixpanel", "Amplitude", "SQL", "A/B Testing"],
        "education": "MSc Business Analytics, Imperial",
        "location": "London, UK",
        "languages": ["English", "Korean"],
        "projects_completed": 35,
        "timezone": "GMT",
        "function_category": "product"
     }', NULL, true),

-- SALES - Executive (extra)
    ('People', 'Executive', 'Nadia Solovyova',
     'Enterprise Account Executive with 11 years closing complex B2B deals. Specialist in selling to manufacturing, defence, and aerospace verticals. £50M+ lifetime revenue. Expert in value selling and multi-stakeholder negotiations.',
     '{
        "role": "Enterprise Account Executive",
        "rate": "£1,100/day",
        "availability": "3 days/week",
        "years_experience": 11,
        "industries": ["Manufacturing", "Defence", "Aerospace"],
        "expertise": ["Enterprise Sales", "Value Selling", "Account Management", "Negotiation"],
        "education": "MBA, Imperial College Business School",
        "location": "London, UK",
        "languages": ["English", "Russian", "Ukrainian"],
        "previous_companies": ["Siemens", "BAE Systems", "Palantir"],
        "certifications": ["MEDDPICC Certified"],
        "timezone": "GMT",
        "function_category": "sales"
     }', NULL, true)

ON CONFLICT (id) DO NOTHING;

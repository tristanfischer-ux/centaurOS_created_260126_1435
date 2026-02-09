-- ============================================================================
-- Migration: Wire Orbit View to Real Data
-- Purpose: Add primary_function_id to profiles for business function mapping,
--          seed additional marketplace People listings for underrepresented
--          functions, and add function_category to existing listing attributes.
-- ============================================================================

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

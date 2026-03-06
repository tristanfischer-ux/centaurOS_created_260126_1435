-- ============================================================================
-- Migration: Re-seed Marketplace People Listings for Team Orbit
-- Purpose: Ensure all 29 People listings exist with is_verified = true and
--          correct function_category attributes for orbit outer ring display.
--          Idempotent — guards each INSERT with NOT EXISTS on title+category.
-- ============================================================================

-- ── Step 1: Update existing People listings ─────────────────────────────────
-- Set is_verified = true and add function_category where missing.
-- Covers case where data exists but was de-verified or lacks the attribute.

-- Original 14 from seed migration (20260128100000)
UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Dr. Sarah Chen';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "operations"}'::jsonb
WHERE category = 'People' AND title = 'James Sterling';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "finance"}'::jsonb
WHERE category = 'People' AND title = 'Elena Rodriguez';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Marcus Thorne';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Dr. Aris Vlahos';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "sales"}'::jsonb
WHERE category = 'People' AND title = 'Victoria Hammond';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'David Miller';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "operations"}'::jsonb
WHERE category = 'People' AND title = 'Priya Patel';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Liam O''Connor';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Sophie Dubois';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Noah Kim';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Emma Wilson';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Lucas Weber';

UPDATE public.marketplace_listings SET is_verified = true,
  attributes = attributes || '{"function_category": "product"}'::jsonb
WHERE category = 'People' AND title = 'Olivia Jones';

-- Orbit additions from 20260209200000
UPDATE public.marketplace_listings SET is_verified = true
WHERE category = 'People' AND title IN (
  'Rachel Nguyen', 'Tom Ashford', 'Zara Osei', 'Kai Brennan',
  'Amy O''Brien', 'Lucy Wang', 'Ben Torres',
  'James Liu', 'Patrick Nwosu', 'Olivia Dunn',
  'Sam Patel', 'Chloe Martin', 'Leo Park', 'Grace Kim', 'Nadia Solovyova'
);


-- ── Step 2: Idempotent INSERT for all 29 People listings ────────────────────
-- Each guarded with NOT EXISTS to avoid duplicates.

-- === PRODUCT ===

-- Dr. Sarah Chen — Fractional CTO (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Dr. Sarah Chen',
  'Fractional CTO with 15 years in aerospace and defense. Former VP Engineering at Airbus. Led teams of 200+ engineers. Expert in systems architecture, digital transformation, and regulatory compliance.',
  '{"role":"Fractional CTO","rate":"£1,200/day","availability":"2 days/week","years_experience":15,"industries":["Aerospace","Defense","Automotive"],"expertise":["Systems Architecture","Digital Transformation","Team Leadership","Regulatory Compliance"],"education":"PhD Aerospace Engineering, MIT","location":"London, UK","languages":["English","Mandarin"],"previous_companies":["Airbus","Boeing","Rolls-Royce"],"certifications":["PMP","TOGAF"],"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Dr. Sarah Chen' AND category = 'People');

-- Marcus Thorne — Fractional CPO (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Marcus Thorne',
  'Chief Product Officer who has led product teams at 3 unicorns. 12 years building B2B SaaS products. Pioneer in product-led growth strategies. Scaled products from 0 to 10M users.',
  '{"role":"Fractional CPO","rate":"£1,300/day","availability":"2 days/week","years_experience":12,"industries":["B2B SaaS","Fintech","Enterprise Software"],"expertise":["Product Strategy","PLG","UX Leadership","Roadmap Planning"],"education":"MSc Computer Science, Stanford","location":"Remote (UK-based)","languages":["English"],"previous_companies":["Stripe","Notion","Figma"],"certifications":["Certified Product Manager"],"timezone":"GMT/PST","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Marcus Thorne' AND category = 'People');

-- Dr. Aris Vlahos — AI Lead (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Dr. Aris Vlahos',
  'AI Research Lead with PhD in Computer Vision from Oxford. 10 years applying ML to industrial problems. Built defect detection systems achieving 99.7% accuracy. Published 25+ papers.',
  '{"role":"AI Lead","rate":"£1,500/day","availability":"1 day/week","years_experience":10,"industries":["Industrial AI","Robotics","Healthcare"],"expertise":["Computer Vision","Deep Learning","MLOps","Industrial Automation"],"education":"PhD Computer Vision, Oxford","location":"Cambridge, UK","languages":["English","Greek"],"previous_companies":["Google DeepMind","NVIDIA","Ocado"],"certifications":["Google Cloud ML Engineer"],"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Dr. Aris Vlahos' AND category = 'People');

-- David Miller — CAD Specialist (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'David Miller',
  'CAD Specialist with 3 years experience in mechanical design and 3D modelling. Proficient in SolidWorks, Fusion 360, and AutoCAD. Strong GD&T knowledge.',
  '{"role":"CAD Specialist","rate":"£2,200/month","availability":"Full-time","years_experience":3,"skills":["SolidWorks","Fusion 360","AutoCAD","GD&T","FEA"],"education":"BEng Mechanical Engineering, Imperial","location":"London, UK","languages":["English"],"projects_completed":40,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'David Miller' AND category = 'People');

-- Liam O'Connor — Mechatronics Engineer (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Liam O''Connor',
  'Mechatronics Engineer with 2 years experience bridging mechanical and electrical design. Arduino, ROS, and embedded systems expertise.',
  '{"role":"Mechatronics Engineer","rate":"£2,100/month","availability":"Full-time","years_experience":2,"skills":["Arduino","ROS","Embedded Systems","PCB Design","Python"],"education":"MEng Mechatronics, Bath","location":"Bath, UK","languages":["English","Irish"],"projects_completed":25,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Liam O''Connor' AND category = 'People');

-- Sophie Dubois — Frontend Developer (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Sophie Dubois',
  'Frontend Developer with 2 years experience building responsive web applications. React, TypeScript, and design-system expertise.',
  '{"role":"Frontend Developer","rate":"£2,000/month","availability":"Full-time","years_experience":2,"skills":["React","TypeScript","Next.js","Tailwind CSS","Figma"],"education":"BSc Computer Science, UCL","location":"London, UK","languages":["English","French"],"projects_completed":30,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Sophie Dubois' AND category = 'People');

-- Noah Kim — Data Scientist (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Noah Kim',
  'Data Scientist with 2 years experience in ML model development and analytics. Python, TensorFlow, and SQL expertise.',
  '{"role":"Data Scientist","rate":"£2,300/month","availability":"Full-time","years_experience":2,"skills":["Python","TensorFlow","SQL","Pandas","Tableau"],"education":"MSc Data Science, Edinburgh","location":"Edinburgh, UK","languages":["English","Korean"],"projects_completed":20,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Noah Kim' AND category = 'People');

-- Emma Wilson — UX/UI Designer (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Emma Wilson',
  'UX/UI Designer with 2 years creating user-centred digital experiences. Strong Figma and prototyping skills with focus on accessibility.',
  '{"role":"UX/UI Designer","rate":"£2,000/month","availability":"Full-time","years_experience":2,"skills":["Figma","User Research","Prototyping","Design Systems","Accessibility"],"education":"BA Product Design, Goldsmiths","location":"London, UK","languages":["English"],"projects_completed":35,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Emma Wilson' AND category = 'People');

-- Lucas Weber — Robotics Engineer (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Lucas Weber',
  'Robotics Engineer with 1 year experience in automated systems and industrial robotics. ROS 2, C++, and simulation expertise.',
  '{"role":"Robotics Engineer","rate":"£2,100/month","availability":"Full-time","years_experience":1,"skills":["ROS 2","C++","Gazebo","MATLAB","Computer Vision"],"education":"MSc Robotics, Bristol","location":"Bristol, UK","languages":["English","German"],"projects_completed":15,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Lucas Weber' AND category = 'People');

-- Olivia Jones — Technical Writer (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Olivia Jones',
  'Technical Writer with 1 year documenting APIs and engineering processes. Strong markdown and docs-as-code skills.',
  '{"role":"Technical Writer","rate":"£1,800/month","availability":"Full-time","years_experience":1,"skills":["Technical Writing","API Documentation","Markdown","Git","Confluence"],"education":"BA English Literature, Oxford","location":"Oxford, UK","languages":["English"],"projects_completed":25,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Olivia Jones' AND category = 'People');

-- Grace Kim — Product Analyst (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Grace Kim',
  'Product Analyst with strong quantitative skills. 2 years working with product teams on feature prioritisation, A/B testing, and user analytics.',
  '{"role":"Product Analyst","rate":"£2,000/month","availability":"Full-time","years_experience":2,"skills":["Product Analytics","Mixpanel","Amplitude","SQL","A/B Testing"],"education":"MSc Business Analytics, Imperial","location":"London, UK","languages":["English","Korean"],"projects_completed":35,"timezone":"GMT","function_category":"product"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Grace Kim' AND category = 'People');

-- === SALES ===

-- Victoria Hammond — Fractional CRO (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Victoria Hammond',
  'Chief Revenue Officer with 16 years in enterprise sales. Built sales teams from 5 to 150 reps. £200M+ ARR generated. Expert in MEDDIC methodology.',
  '{"role":"Fractional CRO","rate":"£1,350/day","availability":"2 days/week","years_experience":16,"industries":["Enterprise SaaS","Manufacturing","Professional Services"],"expertise":["Enterprise Sales","MEDDIC","Revenue Operations","Sales Leadership"],"education":"MBA, London Business School","location":"London, UK","languages":["English"],"previous_companies":["Salesforce","Oracle","SAP"],"certifications":["MEDDIC Certified"],"timezone":"GMT","function_category":"sales"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Victoria Hammond' AND category = 'People');

-- Nadia Solovyova — Enterprise Account Executive (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Nadia Solovyova',
  'Enterprise Account Executive with 11 years closing complex B2B deals. Specialist in selling to manufacturing, defence, and aerospace verticals. £50M+ lifetime revenue.',
  '{"role":"Enterprise Account Executive","rate":"£1,100/day","availability":"3 days/week","years_experience":11,"industries":["Manufacturing","Defence","Aerospace"],"expertise":["Enterprise Sales","Value Selling","Account Management","Negotiation"],"education":"MBA, Imperial College Business School","location":"London, UK","languages":["English","Russian","Ukrainian"],"previous_companies":["Siemens","BAE Systems","Palantir"],"certifications":["MEDDPICC Certified"],"timezone":"GMT","function_category":"sales"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Nadia Solovyova' AND category = 'People');

-- Sam Patel — Sales Development Rep (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Sam Patel',
  'Sales Development Representative with strong outbound prospecting skills. 1 year at a B2B SaaS company. Consistently exceeded quota by 130%.',
  '{"role":"Sales Development Rep","rate":"£1,800/month","availability":"Full-time","years_experience":1,"skills":["Outbound Prospecting","Salesforce","Cold Email","LinkedIn Sales Nav","HubSpot"],"education":"BA Business, Nottingham","location":"Nottingham, UK","languages":["English","Gujarati"],"projects_completed":15,"timezone":"GMT","function_category":"sales"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Sam Patel' AND category = 'People');

-- === MARKETING ===

-- Rachel Nguyen — Fractional CMO (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Rachel Nguyen',
  'Fractional CMO with 14 years scaling brands from seed to Series C. Former Head of Marketing at HubSpot EMEA. Expert in brand positioning, demand generation, and go-to-market strategy.',
  '{"role":"Fractional CMO","rate":"£1,250/day","availability":"2 days/week","years_experience":14,"industries":["B2B SaaS","Deep Tech","Fintech"],"expertise":["Brand Strategy","Demand Generation","Go-to-Market","Content Marketing"],"education":"MBA Marketing, INSEAD","location":"London, UK","languages":["English","Vietnamese","French"],"previous_companies":["HubSpot","Intercom","Stripe"],"certifications":["Google Analytics","HubSpot Inbound"],"timezone":"GMT","function_category":"marketing"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Rachel Nguyen' AND category = 'People');

-- Tom Ashford — Growth Lead (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Tom Ashford',
  'Growth Marketing Lead specialising in PLG and performance marketing for technical products. Built growth teams at 2 unicorns.',
  '{"role":"Growth Lead","rate":"£1,100/day","availability":"3 days/week","years_experience":10,"industries":["SaaS","Developer Tools","Marketplace"],"expertise":["Growth Strategy","SEO","Paid Acquisition","Conversion Optimisation"],"education":"BSc Mathematics, Warwick","location":"Manchester, UK","languages":["English"],"previous_companies":["Monzo","Deliveroo","Wise"],"certifications":["Google Ads","Meta Blueprint"],"timezone":"GMT","function_category":"marketing"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Tom Ashford' AND category = 'People');

-- Zara Osei — Content Marketing Specialist (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Zara Osei',
  'Content Marketing Specialist creating thought leadership for deep tech companies. 2 years experience producing technical blogs, whitepapers, and case studies.',
  '{"role":"Content Marketing Specialist","rate":"£1,900/month","availability":"Full-time","years_experience":2,"skills":["Content Strategy","SEO Writing","HubSpot","WordPress","Analytics"],"education":"BA English & Media, Leeds","location":"Leeds, UK","languages":["English","Twi"],"projects_completed":45,"timezone":"GMT","function_category":"marketing"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Zara Osei' AND category = 'People');

-- Kai Brennan — Social Media Manager (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Kai Brennan',
  'Social Media & Community Manager experienced in building engaged developer and B2B communities. Grew Discord community from 0 to 5,000 members.',
  '{"role":"Social Media Manager","rate":"£1,800/month","availability":"Full-time","years_experience":2,"skills":["Social Media Strategy","Community Management","Video Editing","Canva","Discord"],"education":"BA Marketing, Bristol","location":"Bristol, UK","languages":["English"],"projects_completed":30,"timezone":"GMT","function_category":"marketing"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Kai Brennan' AND category = 'People');

-- === FINANCE ===

-- Elena Rodriguez — Fractional CFO (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Elena Rodriguez',
  'Strategic Finance Director specializing in deep tech startups. Raised £150M+ across 12 funding rounds. Former Goldman Sachs. Expert in financial modeling, investor relations, and M&A.',
  '{"role":"Fractional CFO","rate":"£1,400/day","availability":"1 day/week","years_experience":18,"industries":["Deep Tech","SaaS","Fintech"],"expertise":["Fundraising","Financial Modeling","M&A","Investor Relations"],"education":"MBA Finance, London Business School","location":"London, UK","languages":["English","Spanish","Portuguese"],"previous_companies":["Goldman Sachs","Revolut","Deliveroo"],"certifications":["CFA","ACA"],"timezone":"GMT","function_category":"finance"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Elena Rodriguez' AND category = 'People');

-- Chloe Martin — Financial Analyst (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Chloe Martin',
  'Financial Analyst with strong modelling and reporting skills. 2 years supporting FP&A at a Series B startup. CFA Level 1 passed.',
  '{"role":"Financial Analyst","rate":"£2,100/month","availability":"Full-time","years_experience":2,"skills":["Financial Modelling","Excel","SQL","Xero","Management Reporting"],"education":"BSc Accounting & Finance, LSE","location":"London, UK","languages":["English","French"],"projects_completed":30,"certifications":["CFA Level 1"],"timezone":"GMT","function_category":"finance"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Chloe Martin' AND category = 'People');

-- === OPERATIONS ===

-- James Sterling — Operations Lead (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'James Sterling',
  'Manufacturing Operations Lead with 20 years experience managing high-volume production. Lean Six Sigma Black Belt. Reduced operational costs by 40% at previous role.',
  '{"role":"Operations Lead","rate":"£1,000/day","availability":"3 days/week","years_experience":20,"industries":["Manufacturing","Automotive","Consumer Electronics"],"expertise":["Lean Manufacturing","Six Sigma","Factory Automation","Supply Chain"],"education":"MBA, Warwick Business School","location":"Birmingham, UK","languages":["English","German"],"previous_companies":["JLR","BMW","Dyson"],"certifications":["Six Sigma Black Belt","APICS CSCP"],"timezone":"GMT","function_category":"operations"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'James Sterling' AND category = 'People');

-- Priya Patel — Supply Chain Analyst (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Priya Patel',
  'Supply Chain Analyst with 2 years optimising procurement and logistics workflows. Expert in ERP systems and data-driven inventory management.',
  '{"role":"Supply Chain Analyst","rate":"£2,000/month","availability":"Full-time","years_experience":2,"skills":["Supply Chain Analytics","SAP","Excel","Procurement","Inventory Management"],"education":"BEng Manufacturing Engineering, Loughborough","location":"Loughborough, UK","languages":["English","Hindi","Gujarati"],"projects_completed":20,"timezone":"GMT","function_category":"operations"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Priya Patel' AND category = 'People');

-- Leo Park — Operations Analyst (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Leo Park',
  'Operations Analyst building process automation and efficiency improvements. 1 year at a logistics startup. Reduced manual operations time by 40%.',
  '{"role":"Operations Analyst","rate":"£1,900/month","availability":"Full-time","years_experience":1,"skills":["Process Automation","Data Analysis","Zapier","Notion","Python"],"education":"BEng Industrial Engineering, Sheffield","location":"Sheffield, UK","languages":["English","Korean"],"projects_completed":20,"timezone":"GMT","function_category":"operations"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Leo Park' AND category = 'People');

-- === HR ===

-- Amy O'Brien — Fractional CHRO (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Amy O''Brien',
  'Fractional CHRO with 16 years building people operations from scratch at high-growth startups. Former VP People at Revolut. Built teams from 20 to 500+.',
  '{"role":"Fractional CHRO","rate":"£1,200/day","availability":"2 days/week","years_experience":16,"industries":["Fintech","Deep Tech","SaaS"],"expertise":["Talent Strategy","Compensation Design","Org Development","Employment Law"],"education":"MSc Organisational Psychology, Birkbeck","location":"London, UK","languages":["English"],"previous_companies":["Revolut","Checkout.com","Improbable"],"certifications":["CIPD Level 7","SHRM-SCP"],"timezone":"GMT","function_category":"hr"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Amy O''Brien' AND category = 'People');

-- Lucy Wang — Head of Talent (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Lucy Wang',
  'Head of Talent Acquisition specialising in engineering and deep tech hiring. 12 years recruiting across Europe. Built talent pipelines at 3 unicorns.',
  '{"role":"Head of Talent","rate":"£1,000/day","availability":"3 days/week","years_experience":12,"industries":["Tech","Engineering","Hardware"],"expertise":["Engineering Hiring","Employer Branding","DEI","Structured Interviewing"],"education":"BA Psychology, Durham","location":"Remote (UK-based)","languages":["English","Mandarin"],"previous_companies":["Darktrace","ARM","Graphcore"],"certifications":["LinkedIn Recruiter Certified"],"timezone":"GMT","function_category":"hr"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Lucy Wang' AND category = 'People');

-- Ben Torres — HR Coordinator (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Ben Torres',
  'HR Coordinator with experience in onboarding, employee engagement, and HRIS systems. 1 year supporting People teams at a Series B startup.',
  '{"role":"HR Coordinator","rate":"£1,700/month","availability":"Full-time","years_experience":1,"skills":["BambooHR","Onboarding","Employee Engagement","Payroll Support","GDPR"],"education":"BA Business Management, Exeter","location":"Exeter, UK","languages":["English","Spanish"],"projects_completed":20,"timezone":"GMT","function_category":"hr"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Ben Torres' AND category = 'People');

-- === LEGAL ===

-- James Liu — Fractional General Counsel (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'James Liu',
  'Fractional General Counsel with 18 years in technology and IP law. Former Legal Director at Amazon UK. Advised on £500M+ in transactions.',
  '{"role":"Fractional General Counsel","rate":"£1,400/day","availability":"1 day/week","years_experience":18,"industries":["Technology","E-commerce","Deep Tech"],"expertise":["Commercial Contracts","Data Protection","IP Law","Corporate Governance"],"education":"LLM Technology Law, Cambridge","location":"London, UK","languages":["English","Mandarin"],"previous_companies":["Amazon","Clifford Chance","Mishcon de Reya"],"certifications":["Solicitor (England & Wales)"],"timezone":"GMT","function_category":"legal"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'James Liu' AND category = 'People');

-- Patrick Nwosu — IP Attorney (Executive)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Executive', 'Patrick Nwosu',
  'IP & Patent Attorney specialising in engineering and software patents. 14 years protecting innovation. Filed 200+ patents globally.',
  '{"role":"IP Attorney","rate":"£1,300/day","availability":"2 days/week","years_experience":14,"industries":["Hardware","Robotics","Software","Biotech"],"expertise":["Patent Prosecution","IP Strategy","Licensing","Freedom-to-Operate"],"education":"MEng + LLM Patent Law, Queen Mary","location":"London, UK","languages":["English","Igbo"],"previous_companies":["Marks & Clerk","Dyson","Arm"],"certifications":["Chartered Patent Attorney","European Patent Attorney"],"timezone":"GMT","function_category":"legal"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Patrick Nwosu' AND category = 'People');

-- Olivia Dunn — Legal Assistant (Apprentice)
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
SELECT 'People', 'Apprentice', 'Olivia Dunn',
  'Legal Assistant with experience in contract review and compliance documentation. 1 year supporting legal teams at a tech startup.',
  '{"role":"Legal Assistant","rate":"£1,600/month","availability":"Full-time","years_experience":1,"skills":["Contract Review","Legal Research","GDPR Compliance","NDA Drafting","IP Filing"],"education":"LLB Law, King''s College London","location":"London, UK","languages":["English"],"projects_completed":25,"timezone":"GMT","function_category":"legal"}'::jsonb,
  NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_listings WHERE title = 'Olivia Dunn' AND category = 'People');

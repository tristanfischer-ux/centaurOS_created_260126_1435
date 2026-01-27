-- Seed Service Providers
INSERT INTO public.service_providers (company_name, provider_type, is_verified, contact_info)
VALUES 
    ('Apex Legal', 'Legal', true, '{"email": "contact@apex.law", "website": "https://apex.law", "services": ["Incorporation", "IP Protection", "Term Sheet Review"]}'),
    ('Vanguard VC', 'VC', true, '{"email": "pitch@vanguard.vc", "website": "https://vanguard.vc", "focus": "Seed/Series A"}'),
    ('Summit Finance', 'Financial', true, '{"email": "hello@summit.finance", "website": "https://summit.finance", "services": ["Fractional CFO", "Bookkeeping"]}'),
    ('IronForge Fabricators', 'Fabrication', true, '{"email": "quotes@ironforge.com", "website": "https://ironforge.com", "capabilities": ["CNC", "Welding"]}'),
    ('PrintLabs 3D', 'Additive Manufacturing', true, '{"email": "orders@printlabs.com", "website": "https://printlabs.com", "materials": ["PLA", "ABS", "Nylon", "Resin"]}');

-- Seed AI Tools
INSERT INTO public.ai_tools (name, category, provider, description, typical_monthly_cost)
VALUES
    ('Market Scout', 'Market Research', 'CentaurAI', 'Autonomous competitor analysis and trend spotting agent.', 49.00),
    ('Contract Sentinel', 'Legal', 'LexTech', 'Review NDAs and service agreements instantly.', 99.00),
    ('Pitch Perfect', 'Fundraising', 'VentureBot', 'Drafts and refines pitch decks and investor emails.', 29.00),
    ('RecruitAI', 'HR', 'TalentFlow', 'Sourcing and initial screening of candidate profiles.', 79.00);

-- Seed Mock RFQs (for Manufacturing view)
INSERT INTO public.manufacturing_rfqs (title, specifications, budget_range, status, foundry_id, created_by)
VALUES
    ('Aluminum Enclosure Prototype', 'CNC machined 6061 Aluminum, Anodized Black. Tolerance +/- 0.05mm. Qty: 5', '$500 - $1,000', 'Open', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');

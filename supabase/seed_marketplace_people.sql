-- =============================================
-- ENHANCED SEED DATA: Marketplace People (Detailed & Comparable)
-- =============================================

-- First, delete existing People listings
DELETE FROM public.marketplace_listings WHERE category = 'People';

-- EXECUTIVES - Detailed profiles for comparison
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
VALUES
    ('People', 'Executive', 'Dr. Sarah Chen', 
     'Fractional CTO with 15 years in aerospace and defense. Former VP Engineering at Airbus. Led teams of 200+ engineers. Expert in systems architecture, digital transformation, and regulatory compliance. Published author on aerospace safety systems.',
     '{
        "role": "Fractional CTO",
        "rate": "£1,200/day",
        "availability": "2 days/week",
        "years_experience": 15,
        "industries": ["Aerospace", "Defense", "Automotive"],
        "expertise": ["Systems Architecture", "Digital Transformation", "Team Leadership", "Regulatory Compliance"],
        "education": "PhD Aerospace Engineering, MIT",
        "location": "London, UK",
        "languages": ["English", "Mandarin"],
        "previous_companies": ["Airbus", "Boeing", "Rolls-Royce"],
        "certifications": ["PMP", "TOGAF"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'James Sterling', 
     'Manufacturing Operations Lead with 20 years experience managing high-volume production. Lean Six Sigma Black Belt and Master Black Belt trainer. Reduced operational costs by 40% at previous role. Specialist in factory automation and Industry 4.0.',
     '{
        "role": "Operations Lead",
        "rate": "£1,000/day",
        "availability": "3 days/week",
        "years_experience": 20,
        "industries": ["Manufacturing", "Automotive", "Consumer Electronics"],
        "expertise": ["Lean Manufacturing", "Six Sigma", "Factory Automation", "Supply Chain"],
        "education": "MBA, Warwick Business School",
        "location": "Birmingham, UK",
        "languages": ["English", "German"],
        "previous_companies": ["JLR", "BMW", "Dyson"],
        "certifications": ["Six Sigma Black Belt", "APICS CSCP"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'Elena Rodriguez', 
     'Strategic Finance Director specializing in deep tech startups. Raised £150M+ across 12 funding rounds. Former Goldman Sachs. Expert in financial modeling, investor relations, and M&A. Board advisor to 5 startups.',
     '{
        "role": "Fractional CFO",
        "rate": "£1,400/day",
        "availability": "1 day/week",
        "years_experience": 18,
        "industries": ["Deep Tech", "SaaS", "Fintech"],
        "expertise": ["Fundraising", "Financial Modeling", "M&A", "Investor Relations"],
        "education": "MBA Finance, London Business School",
        "location": "London, UK",
        "languages": ["English", "Spanish", "Portuguese"],
        "previous_companies": ["Goldman Sachs", "Revolut", "Deliveroo"],
        "certifications": ["CFA", "ACA"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'Marcus Thorne', 
     'Chief Product Officer who has led product teams at 3 unicorns. 12 years building B2B SaaS products. Pioneer in product-led growth strategies. Scaled products from 0 to 10M users. Regular speaker at Product conferences.',
     '{
        "role": "Fractional CPO",
        "rate": "£1,300/day",
        "availability": "2 days/week",
        "years_experience": 12,
        "industries": ["B2B SaaS", "Fintech", "Enterprise Software"],
        "expertise": ["Product Strategy", "PLG", "UX Leadership", "Roadmap Planning"],
        "education": "MSc Computer Science, Stanford",
        "location": "Remote (UK-based)",
        "languages": ["English"],
        "previous_companies": ["Stripe", "Notion", "Figma"],
        "certifications": ["Certified Product Manager"],
        "timezone": "GMT/PST"
     }', NULL, true),

    ('People', 'Executive', 'Dr. Aris Vlahos', 
     'AI Research Lead with PhD in Computer Vision from Oxford. 10 years applying ML to industrial problems. Built defect detection systems achieving 99.7% accuracy. Published 25+ papers. Former Google DeepMind researcher.',
     '{
        "role": "AI Lead",
        "rate": "£1,500/day",
        "availability": "1 day/week",
        "years_experience": 10,
        "industries": ["Industrial AI", "Robotics", "Healthcare"],
        "expertise": ["Computer Vision", "Deep Learning", "MLOps", "Industrial Automation"],
        "education": "PhD Computer Vision, Oxford",
        "location": "Cambridge, UK",
        "languages": ["English", "Greek"],
        "previous_companies": ["Google DeepMind", "NVIDIA", "Ocado"],
        "certifications": ["Google Cloud ML Engineer"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Executive', 'Victoria Hammond', 
     'Chief Revenue Officer with 16 years in enterprise sales. Built sales teams from 5 to 150 reps. £200M+ ARR generated. Expert in MEDDIC methodology. Former VP Sales at Salesforce EMEA.',
     '{
        "role": "Fractional CRO",
        "rate": "£1,350/day",
        "availability": "2 days/week",
        "years_experience": 16,
        "industries": ["Enterprise SaaS", "Cloud Infrastructure", "Cybersecurity"],
        "expertise": ["Enterprise Sales", "Sales Leadership", "Revenue Operations", "Go-to-Market"],
        "education": "BA Economics, Cambridge",
        "location": "London, UK",
        "languages": ["English", "French"],
        "previous_companies": ["Salesforce", "ServiceNow", "Datadog"],
        "certifications": ["MEDDIC Certified"],
        "timezone": "GMT"
     }', NULL, true),

-- APPRENTICES - Detailed profiles for comparison
    ('People', 'Apprentice', 'David Miller', 
     'CAD Specialist with First Class Honours from Imperial College. 2 years industry experience. Expert in complex surface modeling and generative design. Completed 50+ client projects. Passionate about sustainable manufacturing.',
     '{
        "role": "CAD Specialist",
        "rate": "£2,200/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Fusion 360", "SolidWorks", "CATIA", "Generative Design", "GD&T"],
        "education": "MEng Mechanical Engineering, Imperial College London",
        "location": "London, UK",
        "languages": ["English"],
        "projects_completed": 50,
        "github": "github.com/dmiller-cad",
        "portfolio": "Available",
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Priya Patel', 
     'Supply Chain Analyst building resilient procurement strategies. Strong analytical background with Python and SQL. Reduced procurement costs by 25% in internship. Published research on supply chain resilience.',
     '{
        "role": "Supply Chain Analyst",
        "rate": "£2,000/month",
        "availability": "Full-time",
        "years_experience": 1,
        "skills": ["Python", "SQL", "Tableau", "SAP", "Logistics Modeling"],
        "education": "MSc Supply Chain Management, Manchester",
        "location": "Manchester, UK",
        "languages": ["English", "Hindi", "Gujarati"],
        "projects_completed": 15,
        "certifications": ["SAP SCM"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Liam O''Connor', 
     'Mechatronics Engineer with hands-on experience in robotics and automation. Built 3 award-winning robots at TU Delft. Expert in PLC programming and circuit design. Fluent in C++ and Python.',
     '{
        "role": "Mechatronics Engineer",
        "rate": "£2,400/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["C++", "Python", "PLC Programming", "Circuit Design", "ROS", "Arduino"],
        "education": "MSc Mechatronics, TU Delft",
        "location": "Dublin, Ireland",
        "languages": ["English", "Irish", "Dutch"],
        "projects_completed": 25,
        "github": "github.com/liamrobotics",
        "awards": ["TU Delft Robotics Award 2024"],
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Sophie Dubois', 
     'Frontend Developer specializing in React and accessible UI design. 3 years experience building production applications. Contributed to open-source design systems. Focus on performance and accessibility.',
     '{
        "role": "Frontend Developer",
        "rate": "£2,100/month",
        "availability": "Full-time",
        "years_experience": 3,
        "skills": ["React", "TypeScript", "Next.js", "Tailwind CSS", "Accessibility", "Testing"],
        "education": "Le Wagon Bootcamp + BSc Computer Science",
        "location": "Paris, France",
        "languages": ["English", "French"],
        "projects_completed": 40,
        "github": "github.com/sophiedev",
        "open_source": "Radix UI Contributor",
        "timezone": "CET"
     }', NULL, true),

    ('People', 'Apprentice', 'Noah Kim', 
     'Data Scientist with strong statistics and ML background. Built predictive models achieving 95%+ accuracy. Experience with large-scale data pipelines. Published researcher in ML applications.',
     '{
        "role": "Data Scientist",
        "rate": "£2,300/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Python", "TensorFlow", "PyTorch", "SQL", "Statistics", "MLOps"],
        "education": "MSc Data Science, UCL",
        "location": "London, UK",
        "languages": ["English", "Korean"],
        "projects_completed": 30,
        "github": "github.com/noahkim-ml",
        "publications": 3,
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Emma Wilson', 
     'UX/UI Designer creating clean, industrial interfaces. 2 years designing for B2B products. Strong user research skills. Figma expert with component library experience.',
     '{
        "role": "UX/UI Designer",
        "rate": "£2,000/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Figma", "Prototyping", "User Research", "Design Systems", "Usability Testing"],
        "education": "BA Industrial Design, Loughborough",
        "location": "Nottingham, UK",
        "languages": ["English"],
        "projects_completed": 35,
        "portfolio": "emmawilson.design",
        "dribbble": "dribbble.com/emmaw",
        "timezone": "GMT"
     }', NULL, true),

    ('People', 'Apprentice', 'Lucas Weber', 
     'Robotics Systems Engineer specializing in ROS2 and manipulator arms. Built autonomous systems for warehouse automation. Strong kinematics and control systems background.',
     '{
        "role": "Robotics Engineer",
        "rate": "£2,500/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["ROS2", "Python", "C++", "Kinematics", "Computer Vision", "SLAM"],
        "education": "MSc Robotics, ETH Zurich",
        "location": "Zurich, Switzerland",
        "languages": ["English", "German", "French"],
        "projects_completed": 20,
        "github": "github.com/lucasrobotics",
        "certifications": ["ROS2 Developer"],
        "timezone": "CET"
     }', NULL, true),

    ('People', 'Apprentice', 'Olivia Jones', 
     'Technical Writer simplifying complex engineering documentation. Created docs for 10+ products. Expert in API documentation and developer experience. Strong technical background.',
     '{
        "role": "Technical Writer",
        "rate": "£1,800/month",
        "availability": "Full-time",
        "years_experience": 2,
        "skills": ["Technical Writing", "API Documentation", "Markdown", "Git", "Developer Experience"],
        "education": "MA Technical Communication, Bristol",
        "location": "Bristol, UK",
        "languages": ["English"],
        "projects_completed": 45,
        "portfolio": "oliviawrites.dev",
        "tools": ["Notion", "GitBook", "Docusaurus"],
        "timezone": "GMT"
     }', NULL, true);

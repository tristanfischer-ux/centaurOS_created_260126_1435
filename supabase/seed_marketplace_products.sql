-- =============================================
-- SEED DATA: Marketplace Products (Detailed & Comparable)
-- =============================================

-- First, delete existing Products listings
DELETE FROM public.marketplace_listings WHERE category = 'Products';

-- =============================================
-- SUBCATEGORY: Manufacturer (8-10 companies)
-- =============================================
INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, image_url, is_verified)
VALUES
    ('Products', 'Manufacturer', 'Precision Dynamics Ltd',
     'Leading UK CNC machining specialist with 15 years of aerospace and defense experience. ISO 9001 and AS9100 certified facility in Sheffield with 25 CNC machines including 5-axis capability. Known for tight-tolerance work and rapid prototyping with typical turnaround of 5-7 days.',
     '{
        "company_type": "CNC",
        "location": "Sheffield, UK",
        "certifications": ["ISO 9001", "AS9100", "Cyber Essentials Plus"],
        "capabilities": ["5-axis CNC", "Turn-Mill", "EDM", "Surface Grinding"],
        "industries": ["Aerospace", "Defense", "Medical Devices"],
        "lead_time": "5-7 days",
        "min_order": "£500",
        "capacity_available": "35%",
        "employees": 65,
        "established": 2009,
        "machines": 25,
        "max_part_size": "1200x800x600mm",
        "materials": ["Titanium", "Inconel", "Aluminum", "Stainless Steel"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'AdditiveTech GmbH',
     'German metal 3D printing powerhouse operating Europe''s largest DMLS facility. Specializes in complex aerospace and medical components with full in-house post-processing. AS9100D and ISO 13485 certified. Pioneer in topology-optimized lightweight structures achieving up to 60% weight reduction.',
     '{
        "company_type": "3D Printing",
        "location": "Munich, Germany",
        "certifications": ["ISO 9001", "AS9100D", "ISO 13485", "NADCAP"],
        "capabilities": ["DMLS", "EBM", "SLM", "DED", "Heat Treatment", "HIP"],
        "industries": ["Aerospace", "Medical", "Motorsport", "Energy"],
        "lead_time": "2-3 weeks",
        "min_order": "€2,000",
        "capacity_available": "25%",
        "employees": 120,
        "established": 2012,
        "machines": 18,
        "build_volume": "400x400x400mm (largest)",
        "materials": ["Ti-64", "Inconel 718", "AlSi10Mg", "CoCr", "Maraging Steel"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'MoldMaster Industries',
     'UK''s premier injection molding specialist with 30+ years heritage. Family-owned business operating 45 presses from 50T to 1500T. Full in-house toolmaking capability with average tool life of 500k+ shots. Expertise in technical polymers for automotive and consumer electronics.',
     '{
        "company_type": "Injection Molding",
        "location": "Wolverhampton, UK",
        "certifications": ["ISO 9001", "IATF 16949", "ISO 14001"],
        "capabilities": ["Injection Molding", "Insert Molding", "Overmolding", "Tool Making", "Tool Repair"],
        "industries": ["Automotive", "Consumer Electronics", "Packaging", "Industrial"],
        "lead_time": "Tooling: 4-6 weeks, Production: 1 week",
        "min_order": "£1,000",
        "capacity_available": "40%",
        "employees": 85,
        "established": 1992,
        "machines": 45,
        "clamp_force_range": "50T - 1500T",
        "materials": ["ABS", "PC", "PA66", "POM", "PP", "PEEK", "Glass-filled variants"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'Sheffield Sheet Metal Co',
     'Comprehensive sheet metal fabrication facility serving UK manufacturing for over 40 years. Full service from laser cutting through to powder coating and assembly. Specialist in complex enclosures and chassis for electronics and industrial equipment. 24-hour rapid prototyping service available.',
     '{
        "company_type": "Sheet Metal",
        "location": "Sheffield, UK",
        "certifications": ["ISO 9001", "ISO 14001", "CE Marking"],
        "capabilities": ["Laser Cutting", "CNC Punching", "Press Brake", "Welding", "Powder Coating", "Assembly"],
        "industries": ["Electronics", "Industrial Equipment", "HVAC", "Signage"],
        "lead_time": "3-5 days (proto), 1-2 weeks (production)",
        "min_order": "£250",
        "capacity_available": "45%",
        "employees": 55,
        "established": 1983,
        "machines": 12,
        "max_sheet_size": "3000x1500mm",
        "materials": ["Mild Steel", "Stainless Steel", "Aluminum", "Copper", "Brass"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'AeroComponents SA',
     'French aerospace tier-2 supplier with NADCAP accreditation for special processes. Specializes in flight-critical structural components and landing gear assemblies. Full traceability and AS9100D quality management. Direct supplier to Airbus, Safran, and Dassault programs.',
     '{
        "company_type": "CNC",
        "location": "Toulouse, France",
        "certifications": ["AS9100D", "NADCAP", "ISO 9001", "EN 9104-001"],
        "capabilities": ["5-axis CNC", "Deep Hole Drilling", "Honing", "Assembly", "NDT"],
        "industries": ["Aerospace", "Defense", "Space"],
        "lead_time": "2-4 weeks",
        "min_order": "€3,000",
        "capacity_available": "20%",
        "employees": 180,
        "established": 1998,
        "machines": 40,
        "max_part_size": "2000x1000x800mm",
        "materials": ["Ti-6Al-4V", "Inconel 718", "7075-T6", "15-5PH", "300M Steel"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'MedDevice Manufacturing',
     'Irish contract manufacturer specializing in Class II and III medical devices. ISO 13485 certified cleanroom facility with full validation services. Expert in surgical instruments, orthopedic implants, and diagnostic equipment. FDA registered with multiple 510(k) clearances supported.',
     '{
        "company_type": "CNC",
        "location": "Galway, Ireland",
        "certifications": ["ISO 13485", "ISO 9001", "FDA Registered", "CE Marking"],
        "capabilities": ["Swiss-type CNC", "5-axis Milling", "Laser Marking", "Passivation", "Cleanroom Assembly"],
        "industries": ["Medical Devices", "Orthopedics", "Dental", "Diagnostics"],
        "lead_time": "2-3 weeks",
        "min_order": "€1,500",
        "capacity_available": "30%",
        "employees": 95,
        "established": 2005,
        "machines": 35,
        "cleanroom_class": "ISO 7",
        "materials": ["316L SS", "Ti-6Al-4V ELI", "PEEK", "CoCrMo", "Nitinol"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'RapidProto Ltd',
     'UK''s fastest prototyping house offering 24-48 hour turnaround on most projects. Multi-technology capability including SLA, SLS, FDM, and CNC. Bridge production runs up to 500 units. Popular with startups and R&D departments requiring quick design iteration cycles.',
     '{
        "company_type": "3D Printing",
        "location": "Bristol, UK",
        "certifications": ["ISO 9001"],
        "capabilities": ["SLA", "SLS", "FDM", "PolyJet", "CNC Machining", "Vacuum Casting"],
        "industries": ["Consumer Products", "Automotive", "Electronics", "Medical"],
        "lead_time": "24-48 hours (express), 3-5 days (standard)",
        "min_order": "£100",
        "capacity_available": "55%",
        "employees": 28,
        "established": 2015,
        "machines": 22,
        "build_volume": "600x600x600mm (largest)",
        "materials": ["Standard Resins", "Tough Resins", "PA12", "TPU", "ABS", "Aluminum"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'HeavyMetal Foundry',
     'Traditional sand and investment casting foundry with modern simulation-driven process control. Specialists in ferrous and non-ferrous castings up to 2 tonnes. In-house pattern making, heat treatment, and machining. Serving heavy industry, marine, and rail sectors for 75 years.',
     '{
        "company_type": "Casting",
        "location": "Birmingham, UK",
        "certifications": ["ISO 9001", "Lloyd''s Register", "DNV-GL"],
        "capabilities": ["Sand Casting", "Investment Casting", "Heat Treatment", "CNC Machining", "NDT"],
        "industries": ["Marine", "Rail", "Oil & Gas", "Heavy Industry"],
        "lead_time": "4-8 weeks",
        "min_order": "£2,000",
        "capacity_available": "50%",
        "employees": 75,
        "established": 1948,
        "max_casting_weight": "2000kg",
        "materials": ["Ductile Iron", "Grey Iron", "Steel", "Bronze", "Aluminum"]
     }', NULL, true),

    ('Products', 'Manufacturer', 'SwissTurn Precision AG',
     'Swiss manufacturer of ultra-precision turned components for watchmaking, medical, and aerospace. Operating 60 Swiss-type CNC lathes with live tooling. Tolerances to ±2 microns on critical features. Specialist in micro-machining components under 1mm diameter.',
     '{
        "company_type": "CNC",
        "location": "Biel, Switzerland",
        "certifications": ["ISO 9001", "ISO 13485", "AS9100D"],
        "capabilities": ["Swiss-type Turning", "Micro-machining", "Thread Whirling", "Laser Cutting"],
        "industries": ["Watchmaking", "Medical", "Aerospace", "Electronics"],
        "lead_time": "1-2 weeks",
        "min_order": "CHF 1,000",
        "capacity_available": "15%",
        "employees": 110,
        "established": 1985,
        "machines": 60,
        "tolerance": "±0.002mm",
        "materials": ["Stainless Steel", "Titanium", "Brass", "PEEK", "Precious Metals"]
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Machine Capacity
-- =============================================
    ('Products', 'Machine Capacity', 'EOS M 290 - Premium Slot',
     'High-demand DMLS machine time available at our Birmingham facility. Ideal for titanium and Inconel aerospace components. Full parameter access and in-house metallurgist support. Includes powder handling and basic de-powdering.',
     '{
        "machine_type": "EOS M 290",
        "technology": "DMLS",
        "location": "Birmingham Facility, UK",
        "rate": "£2,800/day",
        "rate_value": 2800,
        "availability": "Next week",
        "build_volume": "250x250x325mm",
        "materials": ["Ti-64", "Inconel 718", "AlSi10Mg", "Maraging Steel"],
        "accuracy": "±0.05mm",
        "layer_thickness": "30-60 microns",
        "certifications": ["ISO 9001", "AS9100"],
        "operator_included": true
     }', NULL, true),

    ('Products', 'Machine Capacity', 'DMG MORI NTX 2000 - 5-Axis',
     'State-of-the-art turn-mill center available for complex aerospace and medical components. Full 5-axis simultaneous capability with live tooling. Ideal for complete machining in single setup. Experienced operator available.',
     '{
        "machine_type": "DMG MORI NTX 2000",
        "technology": "CNC Turn-Mill",
        "location": "Sheffield Facility, UK",
        "rate": "£1,800/day",
        "rate_value": 1800,
        "availability": "Immediate",
        "build_volume": "Ø650 x 1500mm",
        "materials": ["All metals", "Plastics"],
        "accuracy": "±0.01mm",
        "spindle_speed": "12,000 RPM",
        "certifications": ["ISO 9001"],
        "operator_included": true
     }', NULL, true),

    ('Products', 'Machine Capacity', 'HP MJF 5200 - Polymer Batch',
     'High-productivity Multi Jet Fusion capacity for PA12 and PA12GB production runs. Excellent for functional prototypes and end-use parts. Includes dyeing service for black parts. Ideal batches of 50-500 small parts.',
     '{
        "machine_type": "HP Multi Jet Fusion 5200",
        "technology": "MJF",
        "location": "Munich Facility, Germany",
        "rate": "€1,500/build",
        "rate_value": 1500,
        "availability": "2-3 days",
        "build_volume": "380x284x380mm",
        "materials": ["PA12", "PA12GB", "TPU"],
        "accuracy": "±0.3mm",
        "layer_thickness": "80 microns",
        "certifications": ["ISO 9001"],
        "operator_included": true
     }', NULL, true),

    ('Products', 'Machine Capacity', 'SLM 500 Quad - High Volume',
     'Quad-laser SLM system for maximum productivity on aluminum and steel parts. Perfect for automotive and industrial series production. 24/7 operation available. Includes stress relief heat treatment.',
     '{
        "machine_type": "SLM Solutions 500 Quad",
        "technology": "SLM",
        "location": "Stuttgart Facility, Germany",
        "rate": "€4,500/day",
        "rate_value": 4500,
        "availability": "1 week",
        "build_volume": "500x280x365mm",
        "materials": ["AlSi10Mg", "316L", "Maraging Steel", "CoCr"],
        "accuracy": "±0.1mm",
        "layer_thickness": "30-90 microns",
        "certifications": ["ISO 9001", "IATF 16949"],
        "operator_included": true
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Material
-- =============================================
    ('Products', 'Material', 'Ti-64 Grade 23 ELI Powder',
     'Extra Low Interstitial titanium powder optimized for medical implants and aerospace structural components. Spherical morphology with excellent flowability. Batch-traceable with full mill certification. Argon-atomized for low oxygen content.',
     '{
        "material_type": "Metal Powder",
        "grade": "Ti-6Al-4V ELI (Grade 23)",
        "unit": "kg",
        "price": "£285/kg",
        "price_value": 285,
        "lead_time": "3-5 days",
        "specification": "ASTM F136, AMS 4930",
        "particle_size": "15-45 microns",
        "oxygen_content": "<0.13%",
        "applications": ["Medical Implants", "Aerospace Structural"],
        "min_order_qty": 5
     }', NULL, true),

    ('Products', 'Material', 'Inconel 718 Powder',
     'Nickel-based superalloy powder for high-temperature aerospace and energy applications. Excellent creep resistance and fatigue strength at elevated temperatures. Precipitation-hardenable. Suitable for EOS, SLM, and DMLS systems.',
     '{
        "material_type": "Metal Powder",
        "grade": "Inconel 718",
        "unit": "kg",
        "price": "£195/kg",
        "price_value": 195,
        "lead_time": "2-4 days",
        "specification": "AMS 5662, AMS 5664",
        "particle_size": "15-53 microns",
        "applications": ["Turbine Components", "Aerospace", "Oil & Gas"],
        "min_order_qty": 10
     }', NULL, true),

    ('Products', 'Material', 'PA2200 Nylon 12 Powder',
     'Industry-standard polyamide powder for SLS systems. Excellent mechanical properties with good chemical resistance. Ideal for functional prototypes and series production. Food contact compliant grades available.',
     '{
        "material_type": "Polymer Powder",
        "grade": "PA2200 (PA12)",
        "unit": "kg",
        "price": "£75/kg",
        "price_value": 75,
        "lead_time": "1-2 days",
        "specification": "EOS Material Spec",
        "particle_size": "56 microns average",
        "applications": ["Functional Prototypes", "End-use Parts", "Automotive"],
        "min_order_qty": 20
     }', NULL, true),

    ('Products', 'Material', '316L Stainless Steel Powder',
     'Corrosion-resistant austenitic stainless steel powder for marine, food, and medical applications. Excellent weldability and polishability. Low carbon content prevents sensitization. Biocompatible.',
     '{
        "material_type": "Metal Powder",
        "grade": "316L",
        "unit": "kg",
        "price": "£65/kg",
        "price_value": 65,
        "lead_time": "1-2 days",
        "specification": "ASTM A240, AMS 5653",
        "particle_size": "15-45 microns",
        "applications": ["Marine", "Food Processing", "Medical", "Chemical"],
        "min_order_qty": 10
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Post-Processing
-- =============================================
    ('Products', 'Post-Processing', 'Vacuum Heat Treatment',
     'Precision heat treatment in vacuum furnace for stress relief, annealing, and solution treatment. Essential for AM parts to achieve optimal mechanical properties. Full thermal profiling and certification to aerospace standards. Batch sizes from 1kg to 500kg.',
     '{
        "service_type": "Heat Treatment",
        "process": "Vacuum Furnace",
        "unit": "batch",
        "price": "£550/batch",
        "price_value": 550,
        "lead_time": "2-3 days",
        "standards": ["AMS 2750", "NADCAP"],
        "max_temperature": "1300°C",
        "atmosphere": "Vacuum / Argon",
        "max_batch_weight": "500kg",
        "certifications": ["NADCAP", "ISO 9001"]
     }', NULL, true),

    ('Products', 'Post-Processing', 'Hot Isostatic Pressing (HIP)',
     'Eliminate internal porosity and achieve full density in AM parts. Critical for aerospace and medical applications requiring maximum fatigue life. Combined temperature and pressure cycle tailored to material. Full densification reports provided.',
     '{
        "service_type": "HIP",
        "process": "Hot Isostatic Pressing",
        "unit": "batch",
        "price": "£1,400/batch",
        "price_value": 1400,
        "lead_time": "3-5 days",
        "standards": ["ASTM E1931"],
        "max_pressure": "200 MPa",
        "max_temperature": "1400°C",
        "max_part_size": "Ø600 x 1500mm",
        "certifications": ["NADCAP", "AS9100"]
     }', NULL, true),

    ('Products', 'Post-Processing', '5-Axis CNC Finishing',
     'Precision machining of critical features on AM parts. Achieve tight tolerances on mounting surfaces, bores, and threads. Hermle C400 5-axis machining center with 0.01mm accuracy. CAM programming included.',
     '{
        "service_type": "Machining",
        "process": "5-Axis CNC",
        "unit": "hour",
        "rate": "£135/hour",
        "rate_value": 135,
        "lead_time": "1-2 days",
        "machine": "Hermle C400",
        "accuracy": "±0.01mm",
        "max_part_size": "850x700x500mm",
        "certifications": ["ISO 9001", "AS9100"]
     }', NULL, true),

    ('Products', 'Post-Processing', 'Surface Finishing - Tumbling & Polishing',
     'Comprehensive surface finishing from mass finishing to mirror polish. Tumble deburring, vibratory finishing, and hand polishing available. Ra values from 3.2 to 0.1 microns achievable. Ideal for medical and consumer products.',
     '{
        "service_type": "Surface Finishing",
        "process": "Tumbling / Polishing",
        "unit": "part",
        "price": "From £15/part",
        "price_value": 15,
        "lead_time": "1-3 days",
        "finishes_available": ["Tumbled", "Bead Blasted", "Satin", "Mirror Polish"],
        "ra_range": "0.1 - 3.2 microns",
        "certifications": ["ISO 9001"]
     }', NULL, true),

-- =============================================
-- SUBCATEGORY: Quality
-- =============================================
    ('Products', 'Quality', 'Industrial CT Scanning',
     'Non-destructive 3D X-ray inspection for internal defect detection and dimensional verification. Compare AM parts to original CAD with full colour deviation maps. Porosity analysis with void size distribution. UKAS accredited laboratory.',
     '{
        "service_type": "Inspection",
        "method": "Computed Tomography",
        "unit": "scan",
        "price": "£450/scan",
        "price_value": 450,
        "lead_time": "2-3 days",
        "resolution": "20 microns",
        "max_part_size": "Ø300 x 400mm",
        "outputs": ["STL mesh", "Porosity report", "CAD comparison", "Cross-sections"],
        "certifications": ["UKAS", "ISO 17025"]
     }', NULL, true),

    ('Products', 'Quality', 'Mechanical Testing Suite',
     'Complete mechanical property verification including tensile, hardness, and impact testing. Test to ASTM, ISO, and customer specifications. Full test reports with stress-strain curves and statistical analysis. Witness testing available.',
     '{
        "service_type": "Testing",
        "method": "Mechanical Testing",
        "unit": "test set",
        "price": "£320/set",
        "price_value": 320,
        "lead_time": "3-5 days",
        "tests_included": ["Tensile (ASTM E8)", "Hardness (Rockwell/Vickers)", "Charpy Impact"],
        "outputs": ["Stress-strain curves", "Property values", "Statistical analysis"],
        "certifications": ["UKAS", "NADCAP", "ISO 17025"]
     }', NULL, true),

    ('Products', 'Quality', 'CMM Dimensional Inspection',
     'High-accuracy coordinate measuring machine inspection for critical dimensions. Full GD&T evaluation with balloon drawings and statistical reports. Zeiss Contura with 1.8 micron accuracy. First Article Inspection (FAI) per AS9102.',
     '{
        "service_type": "Inspection",
        "method": "CMM",
        "unit": "part",
        "price": "£180/part",
        "price_value": 180,
        "lead_time": "1-2 days",
        "machine": "Zeiss Contura",
        "accuracy": "±0.0018mm",
        "max_part_size": "1200x1000x600mm",
        "outputs": ["Dimensional report", "GD&T analysis", "FAI (AS9102)"],
        "certifications": ["ISO 17025", "AS9100"]
     }', NULL, true),

    ('Products', 'Quality', 'Material Analysis - Metallography',
     'Microstructural analysis and material composition verification. Optical and SEM microscopy with EDS elemental analysis. Grain size measurement, phase identification, and inclusion rating. Critical for AM process validation.',
     '{
        "service_type": "Analysis",
        "method": "Metallography",
        "unit": "sample",
        "price": "£280/sample",
        "price_value": 280,
        "lead_time": "3-5 days",
        "techniques": ["Optical Microscopy", "SEM", "EDS", "EBSD"],
        "outputs": ["Microstructure images", "Grain size (ASTM E112)", "Composition report"],
        "certifications": ["ISO 17025"]
     }', NULL, true);

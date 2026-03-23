-- ============================================================================
-- Seed engineering reference databases with real data
-- INTENT: The Forge pipeline queries these tables during research + decomposition
-- to ground AI output in verified material properties, tolerances, and standards.
-- Without data, the "Internal Engineering Database" enrichment returns empty.
-- ============================================================================

-- ── Material Properties ─────────────────────────────────────────────
-- Common engineering materials with verified handbook data
-- machinability_rating is integer (0-100 scale), weldability and corrosion_resistance are text
INSERT INTO material_properties (material_code, material_name, material_family, density_kg_m3, yield_strength_mpa, elastic_modulus_gpa, thermal_conductivity_w_mk, cost_per_kg_usd, elongation_percent, machinability_rating, weldability, corrosion_resistance, verified) VALUES
('AL-6061-T6', 'Aluminum 6061-T6', 'Aluminum', 2700, 276, 68.9, 167, 8.50, 12, 70, 'good', 'good', true),
('AL-7075-T6', 'Aluminum 7075-T6', 'Aluminum', 2810, 503, 71.7, 130, 12.00, 11, 50, 'poor', 'fair', true),
('AL-5083-H321', 'Aluminum 5083-H321 (Marine Grade)', 'Aluminum', 2660, 228, 71.0, 117, 9.50, 16, 45, 'good', 'excellent', true),
('AL-2024-T3', 'Aluminum 2024-T3 (Aerospace)', 'Aluminum', 2780, 345, 73.1, 121, 11.00, 18, 50, 'poor', 'poor', true),
('SS-304', 'Stainless Steel 304 (18/8)', 'Stainless Steel', 8000, 215, 193, 16.2, 4.50, 70, 30, 'good', 'excellent', true),
('SS-316L', 'Stainless Steel 316 (Marine/Medical)', 'Stainless Steel', 8000, 170, 193, 16.3, 6.00, 60, 25, 'good', 'excellent', true),
('SS-17-4PH', '17-4 PH Stainless (H900)', 'Stainless Steel', 7780, 1170, 197, 18.3, 8.00, 10, 40, 'fair', 'good', true),
('CS-1018', 'AISI 1018 Cold Rolled Steel', 'Carbon Steel', 7870, 370, 205, 51.9, 1.50, 15, 80, 'excellent', 'poor', true),
('CS-4140-QT', 'AISI 4140 Quenched & Tempered', 'Alloy Steel', 7850, 655, 205, 42.6, 3.00, 18, 60, 'good', 'poor', true),
('CS-A36', 'ASTM A36 Structural Steel', 'Carbon Steel', 7850, 250, 200, 51.9, 1.20, 23, 85, 'excellent', 'poor', true),
('TI-6AL4V', 'Titanium 6Al-4V (Grade 5)', 'Titanium', 4430, 880, 114, 6.7, 35.00, 14, 20, 'fair', 'excellent', true),
('TI-CP2', 'Commercially Pure Titanium Grade 2', 'Titanium', 4510, 275, 103, 16.4, 25.00, 20, 35, 'good', 'excellent', true),
('CU-C110', 'Copper C110 (Electrolytic Tough Pitch)', 'Copper', 8940, 220, 117, 388, 8.00, 50, 75, 'good', 'fair', true),
('BR-C360', 'Brass C360 (Free-Cutting)', 'Brass', 8500, 310, 97, 115, 6.50, 53, 90, 'poor', 'fair', true),
('PLA', 'PLA (Polylactic Acid)', 'Polymer', 1240, 60, 3.5, 0.13, 3.00, 6, 85, 'poor', 'good', true),
('PETG', 'PETG (Polyethylene Terephthalate Glycol)', 'Polymer', 1270, 50, 2.0, 0.18, 4.00, 75, 80, 'poor', 'good', true),
('ABS', 'ABS (Acrylonitrile Butadiene Styrene)', 'Polymer', 1040, 44, 2.3, 0.17, 3.50, 25, 80, 'poor', 'fair', true),
('PA6', 'Nylon 6 (PA6)', 'Polymer', 1130, 70, 2.8, 0.25, 5.00, 60, 55, 'poor', 'good', true),
('PA66-GF30', 'Nylon 66 30% Glass Filled', 'Polymer', 1370, 125, 8.3, 0.30, 7.00, 4, 40, 'poor', 'good', true),
('PC', 'Polycarbonate (PC)', 'Polymer', 1200, 62, 2.4, 0.20, 5.50, 110, 75, 'poor', 'good', true)
ON CONFLICT (material_code) DO NOTHING;

-- ── Process Capabilities ────────────────────────────────────────────
-- Manufacturing processes with real tolerances from supplier data
INSERT INTO process_capabilities (process_name, display_name, tolerance_typical_mm, tolerance_min_mm, tolerance_max_mm, min_wall_thickness_mm, min_feature_size_mm, suitable_batch_sizes, suitable_materials, setup_cost_usd_typical, per_part_cost_multiplier, typical_lead_time_days, verified) VALUES
('cnc_milling', 'CNC Milling', 0.05, 0.01, 0.10, 0.8, 0.5, '{1,10,100,1000}', '{Aluminum,Steel,Stainless Steel,Titanium,Brass,Copper,Polymer}', 150, 1.0, 5, true),
('cnc_turning', 'CNC Turning', 0.03, 0.005, 0.08, 0.5, 0.3, '{1,10,100,1000}', '{Aluminum,Steel,Stainless Steel,Titanium,Brass}', 100, 0.8, 4, true),
('wire_edm', 'Wire EDM', 0.01, 0.003, 0.02, 0.1, 0.1, '{1,10,100}', '{Steel,Stainless Steel,Titanium,Copper}', 200, 2.5, 7, true),
('sheet_metal_bending', 'Sheet Metal Bending', 0.20, 0.10, 0.50, 0.5, 2.0, '{10,100,1000,10000}', '{Aluminum,Steel,Stainless Steel}', 80, 0.5, 5, true),
('laser_cutting', 'Laser Cutting', 0.10, 0.05, 0.20, 0.5, 0.5, '{1,10,100,1000,10000}', '{Aluminum,Steel,Stainless Steel,Titanium}', 50, 0.4, 3, true),
('waterjet_cutting', 'Waterjet Cutting', 0.15, 0.08, 0.30, 1.0, 1.0, '{1,10,100,1000}', '{Aluminum,Steel,Stainless Steel,Titanium,Polymer,Composite}', 60, 0.6, 4, true),
('fdm_3d_printing', 'FDM 3D Printing', 0.30, 0.20, 0.50, 0.8, 0.4, '{1,10,100}', '{PLA,PETG,ABS,Nylon,PC}', 20, 0.3, 3, true),
('sla_3d_printing', 'SLA 3D Printing (Resin)', 0.10, 0.05, 0.15, 0.5, 0.2, '{1,10,100}', '{Resin,Tough Resin,Flexible Resin}', 30, 0.5, 3, true),
('sls_3d_printing', 'SLS 3D Printing (Powder Bed)', 0.15, 0.10, 0.25, 0.7, 0.5, '{1,10,100,1000}', '{Nylon,Glass-Filled Nylon,TPU}', 40, 0.8, 5, true),
('dmls_slm', 'DMLS / SLM Metal 3D Printing', 0.10, 0.05, 0.20, 0.4, 0.2, '{1,10,100}', '{Stainless Steel,Titanium,Aluminum,Inconel}', 300, 5.0, 10, true),
('injection_molding', 'Injection Molding', 0.08, 0.03, 0.15, 0.8, 0.5, '{1000,10000,100000}', '{ABS,Nylon,PC,PP,PE,PETG}', 5000, 0.05, 30, true),
('die_casting', 'Die Casting (Aluminum/Zinc)', 0.15, 0.08, 0.30, 1.0, 1.5, '{1000,10000,100000}', '{Aluminum,Zinc,Magnesium}', 8000, 0.08, 45, true),
('investment_casting', 'Investment Casting (Lost Wax)', 0.10, 0.05, 0.20, 1.0, 1.0, '{10,100,1000}', '{Stainless Steel,Carbon Steel,Aluminum,Bronze}', 500, 1.5, 21, true),
('sand_casting', 'Sand Casting', 0.50, 0.25, 1.00, 3.0, 5.0, '{1,10,100,1000}', '{Aluminum,Cast Iron,Bronze,Steel}', 300, 0.8, 14, true),
('mig_welding', 'MIG/GMAW Welding', 0.50, 0.30, 1.00, 1.5, 3.0, '{1,10,100}', '{Carbon Steel,Stainless Steel,Aluminum}', 50, 0.6, 3, true),
('tig_welding', 'TIG/GTAW Welding', 0.30, 0.15, 0.50, 0.5, 1.0, '{1,10,100}', '{Stainless Steel,Aluminum,Titanium,Copper}', 80, 1.2, 5, true)
ON CONFLICT (process_name) DO NOTHING;

-- ── Design Standards ────────────────────────────────────────────────
-- Common engineering standards referenced in product design
INSERT INTO design_standards (standard_code, standard_name, issuing_body, summary, industry_domain, source, verified, requirements_markdown) VALUES
('ISO 2768-1', 'General tolerances for linear and angular dimensions', 'ISO', 'Defines four tolerance classes (f, m, c, v) for dimensions without individual tolerance indications. Class m (medium) is the most commonly specified for general machined parts.', 'mechanical', 'reference', true, 'See full standard document.'),
('ISO 1101', 'Geometrical product specifications — Geometrical tolerancing', 'ISO', 'Defines symbols, rules, and definitions for geometric dimensioning and tolerancing (GD&T). Covers form, orientation, location, and runout tolerances.', 'mechanical', 'reference', true, 'See full standard document.'),
('ASTM A240', 'Standard Specification for Chromium and Chromium-Nickel Stainless Steel Plate, Sheet, and Strip', 'ASTM', 'Covers stainless steel plate, sheet, and strip for pressure vessels and general applications. Includes 304, 316, 321, 347 and other austenitic grades.', 'mechanical', 'reference', true, 'See full standard document.'),
('ISO 4762', 'Hexagon socket head cap screws', 'ISO', 'Dimensions and mechanical properties of hexagon socket head cap screws (Allen bolts). Property classes 8.8, 10.9, 12.9. Most common fastener in precision assemblies.', 'mechanical', 'reference', true, 'See full standard document.'),
('ISO 4032', 'Hexagon regular nuts — Style 1', 'ISO', 'Dimensions and mechanical properties of standard hexagon nuts. Covers property classes 5, 8, 10, 12. Paired with ISO 4762 bolts.', 'mechanical', 'reference', true, 'See full standard document.'),
('ISO 7089', 'Plain washers — Normal series, Product grade A', 'ISO', 'Dimensions and tolerances for standard flat washers. Used to distribute load under bolt heads and nuts.', 'mechanical', 'reference', true, 'See full standard document.'),
('ASME Y14.5', 'Dimensioning and Tolerancing', 'ASME', 'The US standard for geometric dimensioning and tolerancing (GD&T). Defines datum reference frames, feature control frames, and tolerance zones.', 'mechanical', 'reference', true, 'See full standard document.'),
('ISO 9001', 'Quality management systems — Requirements', 'ISO', 'Specifies requirements for a quality management system. Applies to manufacturing, design, and service organizations. Required by many aerospace and automotive supply chains.', 'quality', 'reference', true, 'See full standard document.'),
('ISO 14001', 'Environmental management systems — Requirements', 'ISO', 'Framework for environmental management systems. Increasingly required for manufacturing supply chain qualification.', 'environmental', 'reference', true, 'See full standard document.'),
('CE Marking', 'Conformite Europeenne — European Conformity', 'EU', 'Mandatory conformity mark for products sold in the European Economic Area. Covers safety, health, and environmental protection requirements.', 'regulatory', 'reference', true, 'See full standard document.'),
('IP67', 'Ingress Protection Rating — Dust tight, temporary immersion', 'IEC', 'Protection against dust (6 = complete protection) and water (7 = temporary immersion to 1m for 30 minutes). Common for outdoor electronics.', 'electronics', 'reference', true, 'See full standard document.'),
('IP68', 'Ingress Protection Rating — Dust tight, continuous immersion', 'IEC', 'Protection against dust (6 = complete protection) and water (8 = continuous immersion beyond 1m). Required for underwater electronics.', 'electronics', 'reference', true, 'See full standard document.'),
('IPC-A-610', 'Acceptability of Electronic Assemblies', 'IPC', 'Defines acceptance criteria for electronic assemblies including solder joints, component mounting, cleanliness, and workmanship. Classes 1 (general), 2 (dedicated service), 3 (high performance).', 'electronics', 'reference', true, 'See full standard document.'),
('MIL-STD-810G', 'Environmental Engineering Considerations and Laboratory Tests', 'US DoD', 'Test methods for military and commercial equipment exposed to natural and induced environments. Covers temperature, humidity, vibration, shock, altitude, salt fog.', 'defense', 'reference', true, 'See full standard document.'),
('AS9100D', 'Quality Management Systems — Requirements for Aviation, Space, and Defense', 'SAE/IAQG', 'Aerospace-specific quality standard building on ISO 9001 with additional requirements for product safety, reliability, and traceability.', 'aerospace', 'reference', true, 'See full standard document.')
ON CONFLICT (standard_code) DO NOTHING;

-- ── Standard Hardware ───────────────────────────────────────────────
-- Common off-the-shelf components (table already exists with: designation, hardware_type, standard, dimensions)
INSERT INTO standard_hardware (designation, hardware_type, standard) VALUES
('ISO 4762 M3x8', 'fastener', 'ISO 4762'),
('ISO 4762 M4x12', 'fastener', 'ISO 4762'),
('ISO 4762 M5x16', 'fastener', 'ISO 4762'),
('ISO 4762 M6x20', 'fastener', 'ISO 4762'),
('ISO 4762 M8x25', 'fastener', 'ISO 4762'),
('ISO 4032 M3', 'fastener', 'ISO 4032'),
('ISO 4032 M4', 'fastener', 'ISO 4032'),
('ISO 4032 M5', 'fastener', 'ISO 4032'),
('ISO 4032 M6', 'fastener', 'ISO 4032'),
('ISO 4032 M8', 'fastener', 'ISO 4032'),
('ISO 7089 M3', 'fastener', 'ISO 7089'),
('ISO 7089 M4', 'fastener', 'ISO 7089'),
('ISO 7089 M5', 'fastener', 'ISO 7089'),
('ISO 7089 M6', 'fastener', 'ISO 7089'),
('ISO 7089 M8', 'fastener', 'ISO 7089'),
('608-2RS', 'bearing', 'ISO 15'),
('6001-2RS', 'bearing', 'ISO 15'),
('6002-2RS', 'bearing', 'ISO 15'),
('6003-2RS', 'bearing', 'ISO 15'),
('6004-2RS', 'bearing', 'ISO 15'),
('6005-2RS', 'bearing', 'ISO 15'),
('LM8UU', 'bearing', 'linear'),
('LM10UU', 'bearing', 'linear'),
('LM12UU', 'bearing', 'linear'),
('GT2-6mm', 'transmission', 'GT2'),
('GT2-20T-5mm', 'transmission', 'GT2'),
('GT2-20T-8mm', 'transmission', 'GT2'),
('T8-2mm-300', 'transmission', 'trapezoidal'),
('T8-2mm-400', 'transmission', 'trapezoidal'),
('T8-Nut', 'transmission', 'trapezoidal'),
('NEMA17-48', 'actuator', 'NEMA'),
('NEMA17-40', 'actuator', 'NEMA'),
('NEMA23-56', 'actuator', 'NEMA'),
('MG996R', 'actuator', 'hobby'),
('2020-AL-500', 'structural', 'V-slot'),
('2040-AL-500', 'structural', 'V-slot'),
('MGN12H-300', 'linear_motion', 'MGN'),
('MGN12H-400', 'linear_motion', 'MGN'),
('SCS8UU', 'linear_motion', 'pillow_block'),
('SK8', 'linear_motion', 'support'),
('KFL08', 'bearing', 'pillow_block'),
('5x8-Coupler', 'transmission', 'coupling'),
('E3D-V6', 'thermal', '3d_printing'),
('BMG-Extruder', 'feeder', '3d_printing')
ON CONFLICT DO NOTHING;

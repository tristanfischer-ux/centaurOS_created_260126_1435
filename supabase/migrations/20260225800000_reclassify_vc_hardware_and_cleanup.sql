-- ============================================================================
-- Migration: Reclassify VC-backed hardware companies & remove dead listings
-- ============================================================================
--
-- INTENT: The marketplace contains two distinct populations of "Products" listings:
--   1. Traditional UK manufacturers (CNC, Sheet Metal, Casting, etc.)
--   2. VC-backed hardware companies (AI, Quantum, Robotics, EV, Space, etc.)
--
-- These should be separated so marketplace stats and filters show accurate
-- manufacturing data. VC-backed hardware companies get subcategory = 'Hardware Company'.
--
-- Additionally, ~108 listings have non-active CH company statuses (dissolved,
-- liquidation, administration, closed). These are set to is_verified = false
-- so they no longer appear in the marketplace.
-- ============================================================================

-- ─── Part 1: Reclassify VC-backed hardware companies ────────────────────────

-- AI / ML hardware
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'AI Chip Design',
    'Edge AI Hardware',
    'AI Infrastructure',
    'AI Sensor Platform',
    'AI Vision Systems',
    'AI-Powered Robotics',
    'Neuromorphic Computing'
  );

-- Quantum hardware
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'Quantum Software',
    'Quantum Photonics',
    'Quantum Sensor',
    'Quantum Hardware',
    'Quantum Computing',
    'Quantum Communication',
    'Quantum Networking'
  );

-- Robotics
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'Inspection Robotics',
    'Industrial Robotics',
    'Medical Robotics',
    'Agricultural Robotics',
    'Humanoid Robotics',
    'Warehouse Robotics',
    'Robotics Components',
    'Surgical Robotics',
    'Swarm Robotics',
    'Soft Robotics'
  );

-- EV / Automotive
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'EV Charging',
    'EV Powertrain',
    'Autonomous Vehicle',
    'EV Battery',
    'EV Components'
  );

-- Space
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'Space Components',
    'Space Propulsion',
    'Space Manufacturing',
    'Satellite Manufacturing',
    'Space Debris',
    'Space Optics'
  );

-- Battery / Energy
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'Battery Manufacturing',
    'Battery Technology',
    'Solid-State Battery',
    'Battery Recycling',
    'Energy Storage',
    'Hydrogen Fuel Cell',
    'Hydrogen Electrolyser',
    'Small Modular Reactor',
    'Nuclear Fusion',
    'Solar Manufacturing',
    'Wind Turbine',
    'Tidal Energy'
  );

-- Cleantech / Climate
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'Carbon Capture',
    'Clean Energy',
    'Cleantech',
    'Green Hydrogen',
    'Waste-to-Energy',
    'Water Treatment'
  );

-- Drones / UAV
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'Drone/UAV Manufacturer',
    'Drone Components'
  );

-- Biotech / Medical hardware
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND attributes->>'company_type' IN (
    'Biotech Equipment',
    'Lab Equipment',
    'Medical Device',
    'Prosthetics/Orthotics'
  );

-- Catch-all for any remaining VC-backed hardware types
-- that contain known VC keywords in the company_type
UPDATE marketplace_listings
SET subcategory = 'Hardware Company'
WHERE category = 'Products'
  AND subcategory = 'Manufacturer'
  AND (
    attributes->>'company_type' ILIKE '%quantum%'
    OR attributes->>'company_type' ILIKE '%autonomous%'
    OR attributes->>'company_type' ILIKE '%humanoid%'
    OR attributes->>'company_type' ILIKE '%neuromorphic%'
    OR attributes->>'company_type' ILIKE '%fusion%'
  );

-- ─── Part 2: Hide dead companies ────────────────────────────────────────────

-- INTENT: Companies with dissolved/liquidation/administration/closed CH status
-- are no longer trading. Hide them from the marketplace by setting is_verified = false.
-- We don't delete them — they may be useful for historical data or re-verification.

UPDATE marketplace_listings
SET is_verified = false
WHERE attributes->>'ch_company_status' IN (
  'dissolved',
  'liquidation',
  'administration',
  'closed',
  'converted-closed',
  'voluntary-arrangement',
  'insolvency-proceedings',
  'receivership'
);

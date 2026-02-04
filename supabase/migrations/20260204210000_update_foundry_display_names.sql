-- Migration: Update System Foundry Display Names
-- Purpose: Rebrand from Centaur to Forge (display names only, IDs unchanged)
-- Risk: Zero - cosmetic change only, no foreign key modifications
-- Date: 2026-02-04

-- Disable triggers temporarily to avoid trigger conflicts
SET session_replication_role = 'replica';

-- Update The Centaur Guild → The Forge Guild
UPDATE public.foundries 
SET name = 'The Forge Guild'
WHERE id = 'centaur-guild';

-- Update Marketplace Suppliers → Forge Marketplace
UPDATE public.foundries 
SET name = 'Forge Marketplace'
WHERE id = 'centaur-suppliers';

-- Re-enable triggers
SET session_replication_role = 'origin';

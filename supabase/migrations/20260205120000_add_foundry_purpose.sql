/**
 * Migration: Add purpose_data to foundries table
 * 
 * Purpose: Enable founders to define their company's mission, vision, and purpose
 * through a guided questionnaire. This provides strategic context for all objectives.
 * 
 * Security:
 * - RLS policies ensure users can only read their own foundry's purpose
 * - Only founders can update purpose_data (enforced in server action)
 * 
 * Related:
 * - Frontend: src/components/objectives/company-purpose-box.tsx
 * - Action: src/actions/foundry.ts (updateFoundryPurpose)
 * 
 * Rollback: ALTER TABLE foundries DROP COLUMN purpose_data;
 */

-- Add purpose_data JSONB column to foundries table
ALTER TABLE foundries 
ADD COLUMN IF NOT EXISTS purpose_data JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN foundries.purpose_data IS 'Stores company purpose, mission, vision, and questionnaire responses. Schema: { purpose: string, mission: string|null, vision: string|null, questionnaire: {...}, updatedAt: string, updatedBy: string }';

-- RLS policies for foundries table already exist and will cover this column
-- Users can view their own foundry's purpose via existing SELECT policy
-- Updates are controlled via server action with founder-only check

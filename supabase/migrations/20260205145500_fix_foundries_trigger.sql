/**
 * Migration: Fix foundries update trigger
 * 
 * Purpose: Remove the broken update_foundries_updated_at_trigger that references
 * a non-existent updated_at column (dropped in 20260202131151_remote_schema.sql).
 * This trigger was causing all UPDATE operations on foundries to fail silently.
 * 
 * Related:
 * - 20260127259999_ensure_foundries_table.sql (created the trigger)
 * - 20260202131151_remote_schema.sql (dropped updated_at column)
 * - 20260205120000_add_foundry_purpose.sql (needs UPDATE to work)
 * 
 * Rollback: (trigger references non-existent column, no rollback needed)
 */

-- Drop the trigger that references non-existent updated_at column
DROP TRIGGER IF EXISTS update_foundries_updated_at_trigger ON public.foundries;

-- Also drop the now-orphaned function
DROP FUNCTION IF EXISTS update_foundries_updated_at();

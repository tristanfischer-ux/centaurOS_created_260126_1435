/**
 * Migration: Standardize Platform Fees to 10%
 *
 * Purpose: Eliminate inconsistent take rates across the platform.
 * Previously rates varied from 5-10% depending on order type and role.
 * Now standardized to 10% for all roles/types, with 8% apprentice discount.
 *
 * Security:
 * - No RLS changes needed (fee config is admin-managed)
 * - Fee changes apply to new transactions only (existing are unchanged)
 *
 * Related:
 * - src/types/payments.ts - DEFAULT_PLATFORM_FEE_PERCENT
 * - src/types/billing.ts - DEFAULT_FEE_CONFIG
 * - src/lib/billing/fees.ts - getSellerFeePercent
 *
 * Rollback: Restore previous fee values from backup
 */

-- Update all fee configurations to 10% standard rate
UPDATE platform_fee_config
SET fee_percent = 10, effective_from = NOW()
WHERE role != 'apprentice';

-- Set apprentice rate to 8% (the only discount)
UPDATE platform_fee_config
SET fee_percent = 8, effective_from = NOW()
WHERE role = 'apprentice';

-- Ensure default/fallback entries exist for all combinations
INSERT INTO platform_fee_config (role, order_type, fee_percent, effective_from)
VALUES
  ('default', 'default', 10, NOW()),
  ('default', 'people_booking', 10, NOW()),
  ('default', 'product_rfq', 10, NOW()),
  ('default', 'service', 10, NOW()),
  ('default', 'retainer', 10, NOW()),
  ('executive', 'default', 10, NOW()),
  ('founder', 'default', 10, NOW()),
  ('apprentice', 'default', 8, NOW()),
  ('apprentice', 'people_booking', 8, NOW()),
  ('apprentice', 'product_rfq', 8, NOW()),
  ('apprentice', 'service', 8, NOW()),
  ('apprentice', 'retainer', 8, NOW())
ON CONFLICT (role, order_type)
DO UPDATE SET fee_percent = EXCLUDED.fee_percent, effective_from = NOW();

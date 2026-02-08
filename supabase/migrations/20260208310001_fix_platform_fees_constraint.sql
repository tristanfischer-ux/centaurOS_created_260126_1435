/**
 * Migration: Fix platform_fee_config unique constraint and seed defaults
 * 
 * Adds the unique constraint on (role, order_type) that was missing,
 * then seeds default fee rows.
 */

-- Add unique constraint for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'platform_fee_config_role_order_type_key'
  ) THEN
    ALTER TABLE platform_fee_config ADD CONSTRAINT platform_fee_config_role_order_type_key UNIQUE (role, order_type);
  END IF;
END $$;

-- Seed default fee entries
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

-- Migration: Add database constraints to escrow_transactions table
-- This prevents invalid data and improves query performance

-- Add constraint to ensure amounts are positive
ALTER TABLE escrow_transactions 
DROP CONSTRAINT IF EXISTS escrow_amount_positive;

ALTER TABLE escrow_transactions 
ADD CONSTRAINT escrow_amount_positive CHECK (amount > 0);

-- Add constraint for valid transaction types
ALTER TABLE escrow_transactions
DROP CONSTRAINT IF EXISTS escrow_valid_type;

ALTER TABLE escrow_transactions
ADD CONSTRAINT escrow_valid_type 
CHECK (type IN ('hold', 'release', 'refund', 'fee_deduction'));

-- Add index for faster balance calculations
CREATE INDEX IF NOT EXISTS idx_escrow_transactions_order_type 
ON escrow_transactions(order_id, type);

-- Add index for faster queries by order and created_at
CREATE INDEX IF NOT EXISTS idx_escrow_transactions_order_created 
ON escrow_transactions(order_id, created_at DESC);

-- Add comment
COMMENT ON CONSTRAINT escrow_amount_positive ON escrow_transactions IS 
  'Ensures all escrow transaction amounts are positive (greater than 0)';

COMMENT ON CONSTRAINT escrow_valid_type ON escrow_transactions IS 
  'Ensures transaction type is one of: hold, release, refund, fee_deduction';

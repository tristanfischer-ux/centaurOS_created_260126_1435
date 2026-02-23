-- Add 'partial_refund' to the escrow_status enum.
-- This allows partial refunds to be tracked separately from full refunds,
-- preventing the bug where any refund (even partial) cancels the entire order.
ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'partial_refund';

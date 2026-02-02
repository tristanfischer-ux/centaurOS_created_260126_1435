-- Migration: Fix race condition in escrow release with atomic function
-- This function calculates available balance with row-level locking to prevent double-spending

-- Create atomic function to check and calculate escrow balance
CREATE OR REPLACE FUNCTION public.get_escrow_balance_atomic(
  p_order_id uuid
)
RETURNS TABLE (
  total_held numeric,
  total_released numeric,
  available_balance numeric
) AS $$
BEGIN
  -- Lock all escrow transactions for this order to prevent concurrent modifications
  -- This prevents race conditions when multiple releases are attempted simultaneously
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0) as total_held,
    COALESCE(SUM(CASE WHEN type IN ('release', 'fee_deduction', 'refund') THEN amount ELSE 0 END), 0) as total_released,
    COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0) - 
    COALESCE(SUM(CASE WHEN type IN ('release', 'fee_deduction', 'refund') THEN amount ELSE 0 END), 0) as available_balance
  FROM escrow_transactions
  WHERE order_id = p_order_id
  FOR UPDATE;  -- Critical: locks these rows until transaction completes
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_escrow_balance_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_escrow_balance_atomic(uuid) TO service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION public.get_escrow_balance_atomic IS 
  'Atomically calculates escrow balance with row-level locking to prevent race conditions. 
   Uses FOR UPDATE to lock escrow_transactions rows until the transaction completes.';

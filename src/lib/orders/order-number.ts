/**
 * Order Number Generation and Parsing
 * Format: ORD-YYYY-NNNNN (e.g., ORD-2026-00001)
 */

import { ParsedOrderNumber } from '@/types/orders'

// Order number prefix
const ORDER_PREFIX = 'ORD'

/**
 * Generate an order number with the current year and provided sequence
 * The sequence should come from a database counter or sequence for uniqueness
 * 
 * @param sequence - The sequence number (should be from database)
 * @param year - Optional year override (defaults to current year)
 * @returns Formatted order number string
 */
export function generateOrderNumber(sequence: number, year?: number): string {
  const orderYear = year ?? new Date().getFullYear()
  const paddedSequence = String(sequence).padStart(5, '0')
  return `${ORDER_PREFIX}-${orderYear}-${paddedSequence}`
}

/**
 * Parse an order number into its components
 * 
 * @param orderNumber - The order number to parse
 * @returns Parsed components or null if invalid
 */
export function parseOrderNumber(orderNumber: string): ParsedOrderNumber | null {
  if (!orderNumber) return null

  const pattern = /^([A-Z]+)-(\d{4})-(\d+)$/
  const match = orderNumber.match(pattern)

  if (!match) return null

  const [, prefix, yearStr, sequenceStr] = match
  const year = parseInt(yearStr, 10)
  const sequence = parseInt(sequenceStr, 10)

  if (isNaN(year) || isNaN(sequence)) return null

  return {
    prefix,
    year,
    sequence,
  }
}

/**
 * Validate an order number format
 * 
 * @param orderNumber - The order number to validate
 * @returns true if valid, false otherwise
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  return parseOrderNumber(orderNumber) !== null
}

/**
 * Extract the sequence number from an order number
 * 
 * @param orderNumber - The order number
 * @returns The sequence number or null if invalid
 */
export function getOrderSequence(orderNumber: string): number | null {
  const parsed = parseOrderNumber(orderNumber)
  return parsed?.sequence ?? null
}

/**
 * Get the year from an order number
 * 
 * @param orderNumber - The order number
 * @returns The year or null if invalid
 */
export function getOrderYear(orderNumber: string): number | null {
  const parsed = parseOrderNumber(orderNumber)
  return parsed?.year ?? null
}

/**
 * Check if an order number is from the current year
 * 
 * @param orderNumber - The order number
 * @returns true if from current year, false otherwise
 */
export function isCurrentYearOrder(orderNumber: string): boolean {
  const year = getOrderYear(orderNumber)
  return year === new Date().getFullYear()
}

/**
 * Generate SQL for creating an order number sequence
 * This can be used in database migrations
 */
export const ORDER_NUMBER_SEQUENCE_SQL = `
-- Create order number sequence if not exists
CREATE SEQUENCE IF NOT EXISTS order_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;

-- Function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'ORD-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || 
      LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order numbers
DROP TRIGGER IF EXISTS trigger_generate_order_number ON public.orders;
CREATE TRIGGER trigger_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();
`

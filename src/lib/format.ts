/**
 * @file format.ts
 *
 * @description Canonical formatting utilities for currency, amounts, and display values.
 * Consolidates duplicate formatCurrency/formatAmount implementations from:
 * - src/lib/tax/vat.ts
 * - src/lib/invoicing/templates.ts
 * - src/lib/payments/flow.ts
 * - src/lib/payments/milestones.ts
 *
 * Two main entry points:
 * - formatCurrency(): for amounts already in major units (pounds, dollars)
 * - formatCurrencyFromMinorUnits(): for amounts in minor units (pence, cents)
 *
 * @dependencies Intl.NumberFormat (browser/Node built-in)
 */

/**
 * Formats a number as currency using Intl.NumberFormat.
 *
 * @description Converts a numeric amount in major units (e.g. pounds, dollars)
 * to a locale-aware currency string. Uses 2 decimal places by default.
 *
 * @param amount - The amount to format in major units (e.g., 12.50 = twelve pounds fifty)
 * @param currency - ISO 4217 currency code (default: 'GBP')
 * @param locale - BCP 47 locale string (default: 'en-GB')
 * @returns Formatted currency string (e.g., "£1,234.56")
 *
 * @example
 * formatCurrency(1234.5)          // "£1,234.50"
 * formatCurrency(1234.5, 'USD')   // "$1,234.50"
 * formatCurrency(1234.5, 'EUR', 'de-DE') // "1.234,50 €"
 */
export function formatCurrency(
  amount: number,
  currency: string = 'GBP',
  locale: string = 'en-GB'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formats an amount stored in minor currency units (pence/cents) as a currency string.
 *
 * @description Many payment systems (Stripe, internal escrow) store amounts in the
 * smallest currency unit (e.g., 1250 = £12.50). This function divides by 100 before
 * formatting. Use this for amounts from payment_intents, escrow_transactions, and
 * similar tables that store values in pence/cents.
 *
 * @param amountInMinorUnits - The amount in minor units (e.g., 1250 = £12.50)
 * @param currency - ISO 4217 currency code (default: 'GBP')
 * @param locale - BCP 47 locale string (default: 'en-GB')
 * @returns Formatted currency string (e.g., "£12.50")
 *
 * @example
 * formatCurrencyFromMinorUnits(1250)        // "£12.50"
 * formatCurrencyFromMinorUnits(1250, 'USD') // "$12.50"
 */
export function formatCurrencyFromMinorUnits(
  amountInMinorUnits: number,
  currency: string = 'GBP',
  locale: string = 'en-GB'
): string {
  return formatCurrency(amountInMinorUnits / 100, currency, locale)
}

/**
 * Formats a fund size in GBP as a compact string (e.g. "£25M", "£1.2B").
 *
 * @description Returns null for zero or missing values (unknown fund size stored as 0).
 * Handles billions, millions, and sub-million amounts.
 *
 * @param gbp - Fund size in GBP (major units)
 * @returns Formatted string or null if the value is zero/missing
 */
export function formatFundSize(gbp: number | null | undefined): string | null {
  if (gbp == null || gbp === 0) return null
  if (gbp >= 1_000_000_000) {
    const b = gbp / 1_000_000_000
    return `£${b % 1 === 0 ? b : b.toFixed(1)}B`
  }
  if (gbp >= 1_000_000) {
    const m = gbp / 1_000_000
    return `£${m % 1 === 0 ? m : m.toFixed(0)}M`
  }
  return `£${gbp.toLocaleString()}`
}

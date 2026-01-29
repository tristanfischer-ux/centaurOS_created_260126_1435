/**
 * VAT Calculation Service
 * Handles VAT calculations and tax treatment determination
 */

import {
  VATBreakdown,
  TaxTreatment,
  TaxProfile,
  EU_COUNTRIES,
  UK_VAT_RATE,
  TAX_TREATMENT_LABELS,
  CompanyDetails,
} from '@/types/invoices'

/**
 * Calculate VAT amount from a net amount and rate
 * @param amount Net amount (excluding VAT)
 * @param rate VAT rate as decimal (e.g., 0.20 for 20%)
 * @returns VAT amount
 */
export function calculateVAT(amount: number, rate: number): number {
  if (amount < 0 || rate < 0) {
    throw new Error('Amount and rate must be non-negative')
  }
  // Round to 2 decimal places
  return Math.round(amount * rate * 100) / 100
}

/**
 * Calculate gross amount from net amount and VAT rate
 * @param netAmount Net amount (excluding VAT)
 * @param rate VAT rate as decimal
 * @returns Gross amount (including VAT)
 */
export function calculateGrossFromNet(netAmount: number, rate: number): number {
  const vatAmount = calculateVAT(netAmount, rate)
  return Math.round((netAmount + vatAmount) * 100) / 100
}

/**
 * Calculate net amount from gross amount and VAT rate
 * @param grossAmount Gross amount (including VAT)
 * @param rate VAT rate as decimal
 * @returns Net amount (excluding VAT)
 */
export function calculateNetFromGross(grossAmount: number, rate: number): number {
  if (rate < 0) {
    throw new Error('Rate must be non-negative')
  }
  const netAmount = grossAmount / (1 + rate)
  return Math.round(netAmount * 100) / 100
}

/**
 * Get the VAT rate based on buyer and seller countries
 * Currently handles UK-centric scenarios
 * @param buyerCountry ISO country code of buyer
 * @param sellerCountry ISO country code of seller
 * @param buyerIsVATRegistered Whether buyer is VAT registered
 * @returns VAT rate as decimal
 */
export function getVATRate(
  buyerCountry: string,
  sellerCountry: string,
  buyerIsVATRegistered: boolean = false
): number {
  // Normalize country codes
  const buyer = buyerCountry.toUpperCase()
  const seller = sellerCountry.toUpperCase()
  
  // UK to UK - standard 20% VAT
  if (seller === 'GB' && buyer === 'GB') {
    return UK_VAT_RATE
  }
  
  // UK to EU (B2B with VAT number) - reverse charge, 0%
  if (seller === 'GB' && isEUCountry(buyer) && buyerIsVATRegistered) {
    return 0
  }
  
  // UK to EU (B2C) - UK VAT applies until threshold, then local VAT
  // For simplicity, we apply UK VAT for now
  if (seller === 'GB' && isEUCountry(buyer)) {
    return UK_VAT_RATE
  }
  
  // UK to non-EU (export) - zero rated
  if (seller === 'GB' && !isEUCountry(buyer) && buyer !== 'GB') {
    return 0
  }
  
  // Default to UK VAT rate for domestic
  return UK_VAT_RATE
}

/**
 * Determine the tax treatment type for a transaction
 * @param buyer Buyer details including country and VAT registration
 * @param seller Seller details including country and VAT registration
 * @returns Tax treatment type
 */
export function determineTaxTreatment(
  buyer: { countryCode: string; vatNumber?: string | null; taxExempt?: boolean },
  seller: { countryCode: string; vatNumber?: string | null }
): TaxTreatment {
  const buyerCountry = buyer.countryCode.toUpperCase()
  const sellerCountry = seller.countryCode.toUpperCase()
  
  // Exempt services
  if (buyer.taxExempt) {
    return 'exempt'
  }
  
  // UK to UK - standard rate
  if (sellerCountry === 'GB' && buyerCountry === 'GB') {
    return 'standard'
  }
  
  // UK to EU with valid VAT number - reverse charge
  if (sellerCountry === 'GB' && isEUCountry(buyerCountry) && buyer.vatNumber) {
    return 'reverse_charge'
  }
  
  // UK to non-EU (export) - zero rated
  if (sellerCountry === 'GB' && !isEUCountry(buyerCountry) && buyerCountry !== 'GB') {
    return 'zero_rated'
  }
  
  // EU to UK with valid VAT number - reverse charge
  if (isEUCountry(sellerCountry) && buyerCountry === 'GB' && buyer.vatNumber) {
    return 'reverse_charge'
  }
  
  // Default to standard
  return 'standard'
}

/**
 * Check if a country is in the EU
 * @param countryCode ISO country code
 * @returns true if EU member state
 */
export function isEUCountry(countryCode: string): boolean {
  return EU_COUNTRIES.includes(countryCode.toUpperCase() as typeof EU_COUNTRIES[number])
}

/**
 * Format a complete VAT breakdown for display
 * @param order Order details with amounts and tax info
 * @returns Formatted VAT breakdown
 */
export function formatVATBreakdown(order: {
  totalAmount: number
  vatAmount: number
  vatRate: number
  taxTreatment: TaxTreatment
}): VATBreakdown {
  const { totalAmount, vatAmount, vatRate, taxTreatment } = order
  
  // Net amount is total minus VAT
  const netAmount = Math.round((totalAmount - vatAmount) * 100) / 100
  
  return {
    netAmount,
    vatRate,
    vatAmount,
    grossAmount: totalAmount,
    taxTreatment,
    taxTreatmentLabel: TAX_TREATMENT_LABELS[taxTreatment],
  }
}

/**
 * Create a full VAT breakdown from net amount and tax profile
 * @param netAmount Net amount before VAT
 * @param buyerProfile Buyer tax profile
 * @param sellerProfile Seller tax profile
 * @returns Complete VAT breakdown
 */
export function createVATBreakdown(
  netAmount: number,
  buyerProfile: { countryCode: string; vatNumber?: string | null; taxExempt?: boolean },
  sellerProfile: { countryCode: string; vatNumber?: string | null }
): VATBreakdown {
  const taxTreatment = determineTaxTreatment(buyerProfile, sellerProfile)
  const vatRate = getVATRateForTreatment(taxTreatment)
  const vatAmount = calculateVAT(netAmount, vatRate)
  const grossAmount = Math.round((netAmount + vatAmount) * 100) / 100
  
  return {
    netAmount,
    vatRate,
    vatAmount,
    grossAmount,
    taxTreatment,
    taxTreatmentLabel: TAX_TREATMENT_LABELS[taxTreatment],
  }
}

/**
 * Get the VAT rate for a specific tax treatment
 * @param treatment Tax treatment type
 * @returns VAT rate as decimal
 */
export function getVATRateForTreatment(treatment: TaxTreatment): number {
  switch (treatment) {
    case 'standard':
      return UK_VAT_RATE
    case 'reverse_charge':
    case 'zero_rated':
    case 'exempt':
      return 0
    default:
      return UK_VAT_RATE
  }
}

/**
 * Format currency amount for display
 * @param amount Amount to format
 * @param currency Currency code (default GBP)
 * @returns Formatted string
 */
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format VAT rate as percentage for display
 * @param rate VAT rate as decimal
 * @returns Formatted percentage string
 */
export function formatVATRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
}

/**
 * Calculate platform fee VAT
 * Platform charges include VAT when Centaur is VAT registered
 * @param platformFee Platform fee amount (net)
 * @param centaurVATRegistered Whether Centaur OS is VAT registered
 * @returns Platform fee with VAT breakdown
 */
export function calculatePlatformFeeVAT(
  platformFee: number,
  centaurVATRegistered: boolean = true
): {
  netFee: number
  vatAmount: number
  grossFee: number
} {
  if (!centaurVATRegistered) {
    return {
      netFee: platformFee,
      vatAmount: 0,
      grossFee: platformFee,
    }
  }
  
  const vatAmount = calculateVAT(platformFee, UK_VAT_RATE)
  return {
    netFee: platformFee,
    vatAmount,
    grossFee: Math.round((platformFee + vatAmount) * 100) / 100,
  }
}

/**
 * Generate a reverse charge notice for invoices
 * @param taxTreatment Current tax treatment
 * @returns Notice text or null
 */
export function getReverseChargeNotice(taxTreatment: TaxTreatment): string | null {
  if (taxTreatment === 'reverse_charge') {
    return 'Reverse charge: Customer to account for VAT to their local tax authority'
  }
  if (taxTreatment === 'zero_rated') {
    return 'Zero-rated for VAT: Export of services outside the UK'
  }
  return null
}

/**
 * Build company details from tax profile
 * @param profile Tax profile data
 * @param userProfile User profile data
 * @returns Company details for invoicing
 */
export function buildCompanyDetails(
  profile: TaxProfile | null,
  userProfile: { full_name?: string | null; email: string }
): CompanyDetails {
  if (!profile) {
    return {
      name: userProfile.full_name || 'Unknown',
      address: '',
      city: '',
      postcode: '',
      country: 'GB',
      email: userProfile.email,
    }
  }
  
  return {
    name: profile.companyName || userProfile.full_name || 'Unknown',
    address: profile.registeredAddress || '',
    city: profile.city || '',
    postcode: profile.postcode || '',
    country: profile.countryCode,
    vatNumber: profile.vatNumber || undefined,
    email: userProfile.email,
  }
}

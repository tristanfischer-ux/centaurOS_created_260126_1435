/**
 * Tax Profile Service
 * Manages provider tax profiles and VAT number validation
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import {
  TaxProfile,
  TaxProfileInput,
  VATValidationResult,
  VIESVerificationResult,
  EU_COUNTRIES,
} from '@/types/invoices'

type TypedSupabaseClient = SupabaseClient<Database>

// VAT number format patterns by country
const VAT_PATTERNS: Record<string, RegExp> = {
  GB: /^GB\d{9}$|^GB\d{12}$|^GBGD\d{3}$|^GBHA\d{3}$/, // UK
  AT: /^ATU\d{8}$/, // Austria
  BE: /^BE[01]\d{9}$/, // Belgium
  BG: /^BG\d{9,10}$/, // Bulgaria
  HR: /^HR\d{11}$/, // Croatia
  CY: /^CY\d{8}[A-Z]$/, // Cyprus
  CZ: /^CZ\d{8,10}$/, // Czech Republic
  DK: /^DK\d{8}$/, // Denmark
  EE: /^EE\d{9}$/, // Estonia
  FI: /^FI\d{8}$/, // Finland
  FR: /^FR[A-Z0-9]{2}\d{9}$/, // France
  DE: /^DE\d{9}$/, // Germany
  GR: /^EL\d{9}$/, // Greece (uses EL prefix)
  HU: /^HU\d{8}$/, // Hungary
  IE: /^IE\d{7}[A-Z]{1,2}$|^IE\d{1}[A-Z]\d{5}[A-Z]$/, // Ireland
  IT: /^IT\d{11}$/, // Italy
  LV: /^LV\d{11}$/, // Latvia
  LT: /^LT\d{9}$|^LT\d{12}$/, // Lithuania
  LU: /^LU\d{8}$/, // Luxembourg
  MT: /^MT\d{8}$/, // Malta
  NL: /^NL\d{9}B\d{2}$/, // Netherlands
  PL: /^PL\d{10}$/, // Poland
  PT: /^PT\d{9}$/, // Portugal
  RO: /^RO\d{2,10}$/, // Romania
  SK: /^SK\d{10}$/, // Slovakia
  SI: /^SI\d{8}$/, // Slovenia
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, // Spain
  SE: /^SE\d{12}$/, // Sweden
}

/**
 * Get a provider's tax profile
 * @param supabase Supabase client
 * @param providerId Provider profile ID
 * @returns Tax profile or null
 */
export async function getTaxProfile(
  supabase: TypedSupabaseClient,
  providerId: string
): Promise<{ data: TaxProfile | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('tax_profiles')
      .select('*')
      .eq('provider_id', providerId)
      .single()

    if (error && error.code !== 'PGRST116') { // Not found is ok
      console.error('Error fetching tax profile:', error)
      return { data: null, error: 'Failed to fetch tax profile' }
    }

    if (!data) {
      return { data: null, error: null }
    }

    const taxProfile: TaxProfile = {
      id: data.id,
      providerId: data.provider_id,
      countryCode: data.country_code,
      vatNumber: data.vat_number,
      vatVerified: data.vat_verified || false,
      taxExempt: data.tax_exempt || false,
      createdAt: data.created_at,
    }

    return { data: taxProfile, error: null }
  } catch (err) {
    console.error('Error in getTaxProfile:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Create a new tax profile for a provider
 * @param supabase Supabase client
 * @param providerId Provider profile ID
 * @param input Tax profile data
 * @returns Created tax profile
 */
export async function createTaxProfile(
  supabase: TypedSupabaseClient,
  providerId: string,
  input: TaxProfileInput
): Promise<{ data: TaxProfile | null; error: string | null }> {
  try {
    // Validate VAT number if provided
    if (input.vatNumber) {
      const validation = validateVATNumber(input.vatNumber, input.countryCode)
      if (!validation.valid) {
        return { data: null, error: validation.errors?.join(', ') || 'Invalid VAT number' }
      }
    }

    const { data, error } = await supabase
      .from('tax_profiles')
      .insert({
        provider_id: providerId,
        country_code: input.countryCode.toUpperCase(),
        vat_number: input.vatNumber || null,
        vat_verified: false, // Will need verification
        tax_exempt: input.taxExempt || false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating tax profile:', error)
      if (error.code === '23505') { // Unique constraint violation
        return { data: null, error: 'Tax profile already exists for this provider' }
      }
      return { data: null, error: 'Failed to create tax profile' }
    }

    const taxProfile: TaxProfile = {
      id: data.id,
      providerId: data.provider_id,
      countryCode: data.country_code,
      vatNumber: data.vat_number,
      vatVerified: data.vat_verified || false,
      taxExempt: data.tax_exempt || false,
      createdAt: data.created_at,
    }

    return { data: taxProfile, error: null }
  } catch (err) {
    console.error('Error in createTaxProfile:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Update a provider's tax profile
 * @param supabase Supabase client
 * @param providerId Provider profile ID
 * @param input Updated tax profile data
 * @returns Updated tax profile
 */
export async function updateTaxProfile(
  supabase: TypedSupabaseClient,
  providerId: string,
  input: Partial<TaxProfileInput>
): Promise<{ data: TaxProfile | null; error: string | null }> {
  try {
    // Validate VAT number if being updated
    if (input.vatNumber && input.countryCode) {
      const validation = validateVATNumber(input.vatNumber, input.countryCode)
      if (!validation.valid) {
        return { data: null, error: validation.errors?.join(', ') || 'Invalid VAT number' }
      }
    }

    const updateData: Record<string, unknown> = {}
    
    if (input.countryCode !== undefined) {
      updateData.country_code = input.countryCode.toUpperCase()
    }
    if (input.vatNumber !== undefined) {
      updateData.vat_number = input.vatNumber || null
      // Reset verification when VAT number changes
      updateData.vat_verified = false
    }
    if (input.taxExempt !== undefined) {
      updateData.tax_exempt = input.taxExempt
    }

    const { data, error } = await supabase
      .from('tax_profiles')
      .update(updateData)
      .eq('provider_id', providerId)
      .select()
      .single()

    if (error) {
      console.error('Error updating tax profile:', error)
      return { data: null, error: 'Failed to update tax profile' }
    }

    const taxProfile: TaxProfile = {
      id: data.id,
      providerId: data.provider_id,
      countryCode: data.country_code,
      vatNumber: data.vat_number,
      vatVerified: data.vat_verified || false,
      taxExempt: data.tax_exempt || false,
      createdAt: data.created_at,
    }

    return { data: taxProfile, error: null }
  } catch (err) {
    console.error('Error in updateTaxProfile:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Validate a VAT number format
 * Checks format against country-specific patterns
 * @param vatNumber VAT number to validate
 * @param countryCode ISO country code
 * @returns Validation result
 */
export function validateVATNumber(
  vatNumber: string,
  countryCode: string
): VATValidationResult {
  const errors: string[] = []
  
  // Normalize input
  const normalizedVAT = vatNumber.replace(/[\s.-]/g, '').toUpperCase()
  const normalizedCountry = countryCode.toUpperCase()
  
  if (!normalizedVAT) {
    return { valid: false, errors: ['VAT number is required'] }
  }
  
  // Extract country prefix from VAT number if present
  let vatCountry = normalizedCountry
  const vatRest = normalizedVAT
  
  // Check if VAT number starts with a country code
  const countryPrefixMatch = normalizedVAT.match(/^([A-Z]{2})(.+)$/)
  if (countryPrefixMatch) {
    vatCountry = countryPrefixMatch[1]
    // Handle special cases (Greece uses EL not GR)
    if (vatCountry === 'EL') {
      vatCountry = 'GR'
    }
  }
  
  // Check if country matches
  if (vatCountry !== normalizedCountry && vatCountry !== 'EL' && normalizedCountry !== 'GR') {
    // Auto-detect country from VAT number prefix
    const detectedCountry = vatCountry
    if (VAT_PATTERNS[detectedCountry]) {
      vatCountry = detectedCountry
    }
  }
  
  // Get pattern for country
  const pattern = VAT_PATTERNS[vatCountry] || VAT_PATTERNS[normalizedCountry]
  
  if (!pattern) {
    // For countries without specific patterns, accept any alphanumeric
    if (!/^[A-Z0-9]{5,20}$/.test(normalizedVAT)) {
      errors.push('Invalid VAT number format')
    }
  } else {
    // Ensure VAT number includes country prefix for validation
    let fullVAT = normalizedVAT
    if (!normalizedVAT.startsWith(vatCountry) && vatCountry !== 'GR') {
      fullVAT = vatCountry + normalizedVAT
    }
    // Handle Greece special case
    if (vatCountry === 'GR' && !normalizedVAT.startsWith('EL')) {
      fullVAT = 'EL' + normalizedVAT
    }
    
    if (!pattern.test(fullVAT)) {
      errors.push(`Invalid VAT number format for ${vatCountry}`)
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors }
  }
  
  // Format the VAT number with country prefix
  let formatted = normalizedVAT
  if (!normalizedVAT.startsWith(vatCountry) && vatCountry !== 'GR') {
    formatted = vatCountry + normalizedVAT
  }
  if (vatCountry === 'GR' && !normalizedVAT.startsWith('EL')) {
    formatted = 'EL' + normalizedVAT
  }
  
  return {
    valid: true,
    formatted,
    countryCode: vatCountry,
  }
}

/**
 * Verify a VAT number with VIES (EU VAT Information Exchange System)
 * This is a stub - in production, would call the actual VIES API
 * @param vatNumber VAT number to verify
 * @returns Verification result
 */
export async function verifyVATNumber(
  vatNumber: string
): Promise<VIESVerificationResult> {
  // Normalize VAT number
  const normalizedVAT = vatNumber.replace(/[\s.-]/g, '').toUpperCase()
  
  // Extract country code (first 2 characters)
  const countryCode = normalizedVAT.substring(0, 2)
  const vatRest = normalizedVAT.substring(2)
  
  // Stub implementation - would call VIES API in production
  // https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl
  
  // For now, return a mock response
  // In production, this would make a SOAP call to the VIES service
  const isEU = EU_COUNTRIES.includes(countryCode as typeof EU_COUNTRIES[number])
  
  if (!isEU && countryCode !== 'GB') {
    return {
      valid: false,
      requestDate: new Date().toISOString(),
      countryCode,
      vatNumber: vatRest,
    }
  }
  
  // Simulate verification - in production this would be a real check
  // For UK numbers post-Brexit, would need to use HMRC API instead
  const mockValid = normalizedVAT.length >= 8 && /^[A-Z]{2}\d+/.test(normalizedVAT)
  
  return {
    valid: mockValid,
    name: mockValid ? 'Verified Business Name' : undefined,
    address: mockValid ? 'Registered Address' : undefined,
    requestDate: new Date().toISOString(),
    countryCode,
    vatNumber: vatRest,
  }
}

/**
 * Get tax profile by user ID (via provider profile)
 * @param supabase Supabase client
 * @param userId User ID
 * @returns Tax profile or null
 */
export async function getTaxProfileByUserId(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<{ data: TaxProfile | null; error: string | null }> {
  try {
    // First get provider profile
    const { data: providerProfile, error: providerError } = await supabase
      .from('provider_profiles')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (providerError || !providerProfile) {
      return { data: null, error: null } // No provider profile yet
    }

    return getTaxProfile(supabase, providerProfile.id)
  } catch (err) {
    console.error('Error in getTaxProfileByUserId:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Upsert a tax profile (create or update)
 * @param supabase Supabase client
 * @param providerId Provider profile ID
 * @param input Tax profile data
 * @returns Tax profile
 */
export async function upsertTaxProfile(
  supabase: TypedSupabaseClient,
  providerId: string,
  input: TaxProfileInput
): Promise<{ data: TaxProfile | null; error: string | null }> {
  // Check if profile exists
  const { data: existing } = await getTaxProfile(supabase, providerId)
  
  if (existing) {
    return updateTaxProfile(supabase, providerId, input)
  } else {
    return createTaxProfile(supabase, providerId, input)
  }
}

/**
 * Get formatted VAT number display
 * @param vatNumber Raw VAT number
 * @param countryCode Country code
 * @returns Formatted VAT number with proper spacing
 */
export function formatVATNumberDisplay(vatNumber: string | null, countryCode: string): string {
  if (!vatNumber) return 'Not registered'
  
  const normalized = vatNumber.replace(/[\s.-]/g, '').toUpperCase()
  
  // Add spacing for readability based on country
  switch (countryCode.toUpperCase()) {
    case 'GB':
      // GB 123 4567 89
      if (normalized.length === 11) {
        return `${normalized.slice(0, 2)} ${normalized.slice(2, 5)} ${normalized.slice(5, 9)} ${normalized.slice(9)}`
      }
      break
    case 'DE':
      // DE 123456789
      if (normalized.length === 11) {
        return `${normalized.slice(0, 2)} ${normalized.slice(2)}`
      }
      break
    default:
      // Default: country code + number
      return normalized
  }
  
  return normalized
}

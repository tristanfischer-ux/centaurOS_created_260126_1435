"use server"

/**
 * Tax Profile Server Actions
 * Server-side actions for managing tax profiles and VAT validation
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  TaxProfile,
  TaxProfileInput,
  VATValidationResult,
  VIESVerificationResult,
} from "@/types/invoices"
import {
  getTaxProfile,
  createTaxProfile,
  updateTaxProfile,
  upsertTaxProfile,
  validateVATNumber,
  verifyVATNumber,
  getTaxProfileByUserId,
} from "@/lib/tax/profiles"

/**
 * Get the current user's tax profile
 * @returns Tax profile or null
 */
export async function getTaxProfileAction(): Promise<{
  data: TaxProfile | null
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  // Get provider profile
  const { data: providerProfile, error: providerError } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (providerError || !providerProfile) {
    // User is not a provider yet
    return { data: null, error: null }
  }

  return getTaxProfile(supabase, providerProfile.id)
}

/**
 * Update the current user's tax profile
 * Creates if doesn't exist
 * @param input Tax profile data
 * @returns Updated tax profile
 */
export async function updateTaxProfileAction(
  input: TaxProfileInput
): Promise<{
  data: TaxProfile | null
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  // Validate input
  if (!input.countryCode) {
    return { data: null, error: "Country code is required" }
  }

  // Validate VAT number format if provided
  if (input.vatNumber) {
    const validation = validateVATNumber(input.vatNumber, input.countryCode)
    if (!validation.valid) {
      return { data: null, error: validation.errors?.join(", ") || "Invalid VAT number" }
    }
  }

  // Get provider profile
  const { data: providerProfile, error: providerError } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (providerError || !providerProfile) {
    return { data: null, error: "You must be a provider to set up tax profile" }
  }

  // Upsert tax profile
  const result = await upsertTaxProfile(supabase, providerProfile.id, input)

  if (result.data) {
    revalidatePath("/provider-portal/tax")
  }

  return result
}

/**
 * Validate a VAT number format
 * Does not verify with external service
 * @param vatNumber VAT number to validate
 * @param countryCode ISO country code
 * @returns Validation result
 */
export async function validateVATNumberAction(
  vatNumber: string,
  countryCode: string
): Promise<VATValidationResult> {
  // This doesn't require authentication - can be used client-side
  return validateVATNumber(vatNumber, countryCode)
}

/**
 * Verify a VAT number with VIES (EU) or HMRC (UK)
 * @param vatNumber VAT number to verify
 * @returns Verification result
 */
export async function verifyVATNumberAction(
  vatNumber: string
): Promise<VIESVerificationResult> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      valid: false,
      requestDate: new Date().toISOString(),
      countryCode: "",
      vatNumber: "",
    }
  }

  // Verify with external service
  const result = await verifyVATNumber(vatNumber)

  // If valid, update the tax profile
  if (result.valid) {
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (providerProfile) {
      await supabase
        .from("tax_profiles")
        .update({ vat_verified: true })
        .eq("provider_id", providerProfile.id)
        .eq("vat_number", vatNumber)

      revalidatePath("/provider-portal/tax")
    }
  }

  return result
}

/**
 * Remove VAT number from profile
 * @returns Success status
 */
export async function removeVATNumber(): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Get provider profile
  const { data: providerProfile, error: providerError } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (providerError || !providerProfile) {
    return { success: false, error: "Provider profile not found" }
  }

  // Update tax profile to remove VAT number
  const { error } = await supabase
    .from("tax_profiles")
    .update({
      vat_number: null,
      vat_verified: false,
    })
    .eq("provider_id", providerProfile.id)

  if (error) {
    console.error("Error removing VAT number:", error)
    return { success: false, error: "Failed to remove VAT number" }
  }

  revalidatePath("/provider-portal/tax")

  return { success: true, error: null }
}

/**
 * Set tax exempt status
 * @param exempt Whether the provider is tax exempt
 * @returns Success status
 */
export async function setTaxExemptStatus(
  exempt: boolean
): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Get provider profile
  const { data: providerProfile, error: providerError } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (providerError || !providerProfile) {
    return { success: false, error: "Provider profile not found" }
  }

  // Update tax profile
  const { error } = await supabase
    .from("tax_profiles")
    .update({ tax_exempt: exempt })
    .eq("provider_id", providerProfile.id)

  if (error) {
    console.error("Error updating tax exempt status:", error)
    return { success: false, error: "Failed to update tax status" }
  }

  revalidatePath("/provider-portal/tax")

  return { success: true, error: null }
}

/**
 * Get tax profile for a specific provider
 * Used by buyers to understand seller's tax status
 * @param providerId Provider profile ID
 * @returns Tax profile summary (limited info)
 */
export async function getProviderTaxSummary(
  providerId: string
): Promise<{
  data: { countryCode: string; vatRegistered: boolean; vatVerified: boolean } | null
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user (must be authenticated)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  const { data: profile, error } = await getTaxProfile(supabase, providerId)

  if (error) {
    return { data: null, error }
  }

  if (!profile) {
    return {
      data: {
        countryCode: "GB",
        vatRegistered: false,
        vatVerified: false,
      },
      error: null,
    }
  }

  return {
    data: {
      countryCode: profile.countryCode,
      vatRegistered: !!profile.vatNumber,
      vatVerified: profile.vatVerified,
    },
    error: null,
  }
}

/**
 * Check if current user has completed tax profile setup
 * @returns Whether tax profile is complete
 */
export async function isTaxProfileComplete(): Promise<{
  complete: boolean
  missing: string[]
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { complete: false, missing: ["Authentication required"] }
  }

  // Get provider profile
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (!providerProfile) {
    return { complete: false, missing: ["Provider profile required"] }
  }

  // Get tax profile
  const { data: taxProfile } = await getTaxProfile(supabase, providerProfile.id)

  const missing: string[] = []

  if (!taxProfile) {
    missing.push("Tax profile not created")
    return { complete: false, missing }
  }

  if (!taxProfile.countryCode) {
    missing.push("Country not set")
  }

  // VAT number is optional but if provided should be verified
  if (taxProfile.vatNumber && !taxProfile.vatVerified) {
    missing.push("VAT number not verified")
  }

  return {
    complete: missing.length === 0,
    missing,
  }
}

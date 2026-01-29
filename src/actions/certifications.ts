"use server"

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: Using 'any' type assertions because provider tables are not in generated database types

/**
 * Certifications actions module
 * Complete certification-related functionality
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ==========================================
// TYPES
// ==========================================

export interface Certification {
    id: string
    provider_id: string
    certification_name: string
    issuing_body: string
    credential_id: string | null
    issued_date: string | null
    expiry_date: string | null
    verification_url: string | null
    is_verified: boolean
    created_at: string
}

// Type for provider profile
interface ProviderProfileRecord {
    id: string
    user_id: string
}

// Type for certification record
interface CertificationRecord {
    id: string
    is_verified: boolean
    verification_url: string | null
}

// ==========================================
// GET CERTIFICATIONS
// ==========================================

/**
 * Get all certifications for a provider
 */
export async function getCertifications(providerId?: string): Promise<{
    data: Certification[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { data: [], error: "Not authenticated" }
        }

        let targetProviderId = providerId
        if (!targetProviderId) {
            const { data: profile, error: profileError } = await (supabase as any)
                .from('provider_profiles')
                .select('id')
                .eq('user_id', user.id)
                .single() as { data: ProviderProfileRecord | null; error: any }

            if (profileError || !profile) {
                return { data: [], error: null } // No profile yet
            }
            targetProviderId = profile.id
        }

        const { data, error } = await (supabase as any)
            .from('provider_certifications')
            .select('*')
            .eq('provider_id', targetProviderId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching certifications:', error)
            return { data: [], error: error.message }
        }

        return { data: data || [], error: null }
    } catch (err) {
        console.error('Failed to fetch certifications:', err)
        return { data: [], error: 'Failed to fetch certifications' }
    }
}

// ==========================================
// ADD CERTIFICATION
// ==========================================

/**
 * Add a new certification
 */
export async function addCertification(certification: {
    certification_name: string
    issuing_body: string
    credential_id?: string
    issued_date?: string
    expiry_date?: string
    verification_url?: string
}): Promise<{
    data: Certification | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { data: null, error: "Not authenticated" }
        }

        const { data: profile, error: profileError } = await (supabase as any)
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single() as { data: ProviderProfileRecord | null; error: any }

        if (profileError || !profile) {
            return { data: null, error: "No provider profile found" }
        }

        const { data, error } = await (supabase as any)
            .from('provider_certifications')
            .insert({
                provider_id: profile.id,
                certification_name: certification.certification_name,
                issuing_body: certification.issuing_body,
                credential_id: certification.credential_id || null,
                issued_date: certification.issued_date || null,
                expiry_date: certification.expiry_date || null,
                verification_url: certification.verification_url || null,
            })
            .select()
            .single()

        if (error) {
            console.error('Error adding certification:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/provider-portal/certifications')
        return { data, error: null }
    } catch (err) {
        console.error('Failed to add certification:', err)
        return { data: null, error: 'Failed to add certification' }
    }
}

// ==========================================
// UPDATE CERTIFICATION
// ==========================================

/**
 * Update an existing certification
 */
export async function updateCertification(
    certificationId: string,
    updates: Partial<{
        certification_name: string
        issuing_body: string
        credential_id: string
        issued_date: string
        expiry_date: string
        verification_url: string
    }>
): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: "Not authenticated" }
        }

        const { data: profile, error: profileError } = await (supabase as any)
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single() as { data: ProviderProfileRecord | null; error: any }

        if (profileError || !profile) {
            return { success: false, error: "No provider profile found" }
        }

        const { error } = await (supabase as any)
            .from('provider_certifications')
            .update(updates)
            .eq('id', certificationId)
            .eq('provider_id', profile.id)

        if (error) {
            console.error('Error updating certification:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal/certifications')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to update certification:', err)
        return { success: false, error: 'Failed to update certification' }
    }
}

// ==========================================
// DELETE CERTIFICATION
// ==========================================

/**
 * Delete a certification
 */
export async function deleteCertification(certificationId: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: "Not authenticated" }
        }

        const { data: profile, error: profileError } = await (supabase as any)
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single() as { data: ProviderProfileRecord | null; error: any }

        if (profileError || !profile) {
            return { success: false, error: "No provider profile found" }
        }

        const { error } = await (supabase as any)
            .from('provider_certifications')
            .delete()
            .eq('id', certificationId)
            .eq('provider_id', profile.id)

        if (error) {
            console.error('Error deleting certification:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/provider-portal/certifications')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to delete certification:', err)
        return { success: false, error: 'Failed to delete certification' }
    }
}

// ==========================================
// REQUEST VERIFICATION
// ==========================================

/**
 * Request verification for a certification
 * This marks the certification as pending verification by admin
 */
export async function requestVerification(certificationId: string): Promise<{
    success: boolean
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: "Not authenticated" }
        }

        const { data: profile, error: profileError } = await (supabase as any)
            .from('provider_profiles')
            .select('id')
            .eq('user_id', user.id)
            .single() as { data: ProviderProfileRecord | null; error: any }

        if (profileError || !profile) {
            return { success: false, error: "No provider profile found" }
        }

        // Verify ownership and get current verification status
        const { data: cert, error: fetchError } = await (supabase as any)
            .from('provider_certifications')
            .select('id, is_verified, verification_url')
            .eq('id', certificationId)
            .eq('provider_id', profile.id)
            .single() as { data: CertificationRecord | null; error: any }

        if (fetchError || !cert) {
            return { success: false, error: "Certification not found" }
        }

        if (cert.is_verified) {
            return { success: false, error: "Certification is already verified" }
        }

        if (!cert.verification_url) {
            return { success: false, error: "Please add a verification URL before requesting verification" }
        }

        // Update certification to mark verification as requested
        const { error: updateError } = await (supabase as any)
            .from('provider_certifications')
            .update({
                verification_requested_at: new Date().toISOString(),
            })
            .eq('id', certificationId)
            .eq('provider_id', profile.id)

        if (updateError) {
            console.error('Error requesting verification:', updateError)
            return { success: false, error: updateError.message }
        }

        revalidatePath('/provider-portal/certifications')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to request verification:', err)
        return { success: false, error: 'Failed to request verification' }
    }
}

// ==========================================
// GET EXPIRING CERTIFICATIONS
// ==========================================

/**
 * Get certifications that are expiring soon (within 90 days)
 */
export async function getExpiringCertifications(providerId?: string): Promise<{
    data: Array<{
        id: string
        certification_name: string
        expiry_date: string
        days_until_expiry: number
    }>
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { data: [], error: "Not authenticated" }
        }

        let targetProviderId = providerId
        if (!targetProviderId) {
            const { data: profile, error: profileError } = await (supabase as any)
                .from('provider_profiles')
                .select('id')
                .eq('user_id', user.id)
                .single() as { data: ProviderProfileRecord | null; error: any }

            if (profileError || !profile) {
                return { data: [], error: "No provider profile found" }
            }
            targetProviderId = profile.id
        }

        const ninetyDaysFromNow = new Date()
        ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)

        const { data, error } = await (supabase as any)
            .from('provider_certifications')
            .select('id, certification_name, expiry_date')
            .eq('provider_id', targetProviderId)
            .not('expiry_date', 'is', null)
            .lte('expiry_date', ninetyDaysFromNow.toISOString().split('T')[0])
            .gte('expiry_date', new Date().toISOString().split('T')[0])
            .order('expiry_date', { ascending: true })

        if (error) {
            console.error('Error fetching expiring certifications:', error)
            return { data: [], error: error.message }
        }

        const expiringCerts = (data || []).map((cert: { id: string; certification_name: string; expiry_date: string }) => {
            const expiryDate = new Date(cert.expiry_date)
            const today = new Date()
            const diffTime = expiryDate.getTime() - today.getTime()
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            
            return {
                id: cert.id,
                certification_name: cert.certification_name,
                expiry_date: cert.expiry_date,
                days_until_expiry: diffDays,
            }
        })

        return { data: expiringCerts, error: null }
    } catch (err) {
        console.error('Failed to fetch expiring certifications:', err)
        return { data: [], error: 'Failed to fetch expiring certifications' }
    }
}

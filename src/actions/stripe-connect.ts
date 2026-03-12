"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createConnectAccount, createAccountLink, getAccountStatus, isAccountReady } from "@/lib/stripe/connect"

import { getBaseUrl } from '@/lib/domains'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

const BASE_URL = getBaseUrl()

/**
 * Creates a Stripe Connect account for the current user
 * This should be called when a provider wants to receive payments
 */
export async function createProviderStripeAccount(): Promise<{
    success: boolean
    accountId?: string
    error?: string
}> {
    try {
        const supabase = await createClient()

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: "Not authenticated" }
        }

        // Get user profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('id', user.id)
            .single()

        if (profileError || !profile) {
            return { success: false, error: "Profile not found" }
        }

        // Check if user has a provider_profiles row
        const { data: existingAccount, error: existingError } = await supabase
            .from('provider_profiles')
            .select('stripe_account_id')
            .eq('user_id', user.id)
            .single()

        if (existingError && existingError.code === 'PGRST116') {
            // No provider_profiles row exists — user hasn't completed provider setup
            return { success: false, error: 'Please complete your provider profile setup first.' }
        }

        if (existingAccount?.stripe_account_id) {
            return {
                success: true,
                accountId: existingAccount.stripe_account_id,
                error: "Account already exists"
            }
        }

        // Create Stripe Connect account
        const result = await createConnectAccount(user.id, profile.email)
        if (result.error) {
            return { success: false, error: result.error }
        }

        if (!result.accountId) {
            return { success: false, error: 'Stripe account creation returned no account ID.' }
        }

        // Store the account ID in the provider profile
        // SECURITY: Use stripe_account_id IS NULL as atomic guard to prevent race condition
        const { data: updated, error: updateError } = await supabase
            .from('provider_profiles')
            .update({ stripe_account_id: result.accountId })
            .eq('user_id', user.id)
            .is('stripe_account_id', null)
            .select('id')

        if (updateError) {
            console.error('Error storing Stripe account ID:', updateError)
            return {
                success: false,
                accountId: result.accountId,
                error: 'Stripe account was created but could not be saved. Please contact support.',
            }
        }

        if (!updated || updated.length === 0) {
            // Race condition: another request already set the account ID
            return { success: true, accountId: result.accountId, error: 'Account already exists' }
        }

        revalidatePath('/settings')
        revalidatePath('/marketplace')

        return { success: true, accountId: result.accountId }
    } catch (error) {
        console.error('Error creating provider Stripe account:', error)
        return { 
            success: false, 
            error: sanitizeErrorMessage(error) 
        }
    }
}

/**
 * Gets an onboarding link to complete Stripe Connect setup
 * Redirects the user to Stripe to complete their account setup
 */
export async function getStripeOnboardingLink(): Promise<{
    url?: string
    error?: string
}> {
    try {
        const supabase = await createClient()

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { error: "Not authenticated" }
        }

        // Get user's Stripe account ID from provider profile
        const { data: providerProfile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('stripe_account_id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !providerProfile?.stripe_account_id) {
            return { error: "No Stripe account found. Please create one first." }
        }

        // Create account link for onboarding
        const refreshUrl = `${BASE_URL}/provider-portal/payments/callback?refresh=true`
        const returnUrl = `${BASE_URL}/provider-portal/payments/callback?onboarding=complete`

        const result = await createAccountLink(providerProfile.stripe_account_id, refreshUrl, returnUrl)
        if (result.error) {
            return { error: result.error }
        }

        return { url: result.url! }
    } catch (error) {
        console.error('Error getting Stripe onboarding link:', error)
        return { 
            error: sanitizeErrorMessage(error) 
        }
    }
}

/**
 * Checks if the current user's Stripe account is ready to receive payments
 * Returns detailed status information
 */
export async function checkStripeAccountStatus(): Promise<{
    hasAccount: boolean
    isReady: boolean
    chargesEnabled: boolean
    payoutsEnabled: boolean
    detailsSubmitted: boolean
    requirements?: {
        currentlyDue: string[]
        eventuallyDue: string[]
        pastDue: string[]
    }
    error?: string
}> {
    try {
        const supabase = await createClient()

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { 
                hasAccount: false, 
                isReady: false, 
                chargesEnabled: false,
                payoutsEnabled: false,
                detailsSubmitted: false,
                error: "Not authenticated" 
            }
        }

        // Get user's Stripe account ID from provider profile
        const { data: providerProfile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('stripe_account_id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !providerProfile?.stripe_account_id) {
            return {
                hasAccount: false,
                isReady: false,
                chargesEnabled: false,
                payoutsEnabled: false,
                detailsSubmitted: false
            }
        }

        // Get account status from Stripe
        const statusResult = await getAccountStatus(providerProfile.stripe_account_id)
        if (statusResult.error) {
            return { 
                hasAccount: true, 
                isReady: false, 
                chargesEnabled: false,
                payoutsEnabled: false,
                detailsSubmitted: false,
                error: statusResult.error 
            }
        }

        const account = statusResult.account!

        // Check if account is ready
        const readyResult = await isAccountReady(providerProfile.stripe_account_id)
        const isReady = readyResult.ready

        return {
            hasAccount: true,
            isReady,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            requirements: account.requirements ? {
                currentlyDue: account.requirements.currently_due,
                eventuallyDue: account.requirements.eventually_due,
                pastDue: account.requirements.past_due,
            } : undefined
        }
    } catch (error) {
        console.error('Error checking Stripe account status:', error)
        return { 
            hasAccount: false, 
            isReady: false, 
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            error: sanitizeErrorMessage(error) 
        }
    }
}

/**
 * Gets the Stripe dashboard link for a provider to manage their account
 */
export async function getStripeDashboardLink(): Promise<{
    url?: string
    error?: string
}> {
    try {
        const supabase = await createClient()

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { error: "Not authenticated" }
        }

        // Get user's Stripe account ID from provider profile
        const { data: providerProfile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('stripe_account_id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !providerProfile?.stripe_account_id) {
            return { error: "No Stripe account found" }
        }

        // For Standard Connect accounts, users manage their account via the Stripe Dashboard
        // We can create a login link to redirect them there
        const { stripe } = await import('@/lib/stripe/client')

        const loginLink = await stripe.accounts.createLoginLink(providerProfile.stripe_account_id)

        return { url: loginLink.url }
    } catch (error) {
        console.error('Error getting Stripe dashboard link:', error)
        return { 
            error: sanitizeErrorMessage(error) 
        }
    }
}

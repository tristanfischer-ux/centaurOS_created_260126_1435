"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createConnectAccount, createAccountLink, getAccountStatus, isAccountReady } from "@/lib/stripe/connect"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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

        // Check if user already has a Stripe account
        // Note: This assumes there's a stripe_account_id column on profiles
        // You may need to add this column or use a separate table
        const { data: existingAccount } = await supabase
            .from('profiles')
            .select('stripe_account_id')
            .eq('id', user.id)
            .single()

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

        // Store the account ID in the database
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ stripe_account_id: result.accountId })
            .eq('id', user.id)

        if (updateError) {
            console.error('Error storing Stripe account ID:', updateError)
            // The account was created but we couldn't store it
            // Return success but log the error
        }

        revalidatePath('/settings')
        revalidatePath('/marketplace')

        return { success: true, accountId: result.accountId! }
    } catch (error) {
        console.error('Error creating provider Stripe account:', error)
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to create Stripe account' 
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

        // Get user's Stripe account ID
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('stripe_account_id')
            .eq('id', user.id)
            .single()

        if (profileError || !profile?.stripe_account_id) {
            return { error: "No Stripe account found. Please create one first." }
        }

        // Create account link for onboarding
        const refreshUrl = `${BASE_URL}/provider-portal/payments/callback?refresh=true`
        const returnUrl = `${BASE_URL}/provider-portal/payments/callback?onboarding=complete`

        const result = await createAccountLink(profile.stripe_account_id, refreshUrl, returnUrl)
        if (result.error) {
            return { error: result.error }
        }

        return { url: result.url! }
    } catch (error) {
        console.error('Error getting Stripe onboarding link:', error)
        return { 
            error: error instanceof Error ? error.message : 'Failed to get onboarding link' 
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

        // Get user's Stripe account ID
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('stripe_account_id')
            .eq('id', user.id)
            .single()

        if (profileError || !profile?.stripe_account_id) {
            return { 
                hasAccount: false, 
                isReady: false, 
                chargesEnabled: false,
                payoutsEnabled: false,
                detailsSubmitted: false
            }
        }

        // Get account status from Stripe
        const statusResult = await getAccountStatus(profile.stripe_account_id)
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
        const readyResult = await isAccountReady(profile.stripe_account_id)
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
            error: error instanceof Error ? error.message : 'Failed to check account status' 
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

        // Get user's Stripe account ID
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('stripe_account_id')
            .eq('id', user.id)
            .single()

        if (profileError || !profile?.stripe_account_id) {
            return { error: "No Stripe account found" }
        }

        // For Standard Connect accounts, users manage their account via the Stripe Dashboard
        // We can create a login link to redirect them there
        const { stripe } = await import('@/lib/stripe/client')
        
        const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id)

        return { url: loginLink.url }
    } catch (error) {
        console.error('Error getting Stripe dashboard link:', error)
        return { 
            error: error instanceof Error ? error.message : 'Failed to get dashboard link' 
        }
    }
}

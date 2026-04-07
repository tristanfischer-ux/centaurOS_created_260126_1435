'use server'

/**
 * @file newsletter.ts — Server action for newsletter subscriptions.
 *
 * @description Stores newsletter signups. Currently saves to site_settings
 * metadata as a simple array. Can be upgraded to Resend Audiences API or
 * a dedicated table later.
 *
 * @security No authentication required (public signup). Email validation only.
 */

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Subscribe an email to the newsletter.
 *
 * @description Stores the email in a `newsletter_subscribers` array in
 * the site_settings metadata. Uses admin client since this is a public action.
 * Validates email format before storing.
 */
export async function subscribeToNewsletter(
    email: string
): Promise<{ error: string | null }> {
    try {
        // VALIDATION: Basic email format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return { error: 'Please enter a valid email address' }
        }

        // VALIDATION: Length check
        if (email.length > 320) {
            return { error: 'Email address is too long' }
        }

        const supabase = createAdminClient()

        // FLOW: Store in a simple newsletter_subscribers table-like approach
        // using site_settings metadata. This is a lightweight MVP — upgrade to
        // Resend Audiences or a dedicated table when volume justifies it.
        //
        // For now, we use a simple insert into agent_artifacts as a "newsletter"
        // content type, which gives us foundry isolation and versioning for free.
        // In practice, a dedicated table would be better at scale.

        // Check for duplicates first
        const { data: existing } = await supabase
            .from('agent_artifacts')
            .select('id')
            .eq('content_type', 'email-template')
            .eq('title', 'newsletter_subscriber')
            .eq('content', email)
            .limit(1)

        if (existing && existing.length > 0) {
            // Already subscribed — don't error, just acknowledge
            return { error: null }
        }

        // Store the subscription
        // DECISION: Using agent_artifacts with a special content_type is a hack.
        // A proper newsletter_subscribers table should be created when this grows.
        // For MVP, this works and avoids another migration.
        const { error } = await supabase
            .from('agent_artifacts')
            .insert({
                title: 'newsletter_subscriber',
                content: email,
                content_type: 'email-template',
                foundry_id: 'fractional-forge', // INTENT: Newsletter is platform-wide, not per-foundry
                metadata: {
                    type: 'newsletter_subscription',
                    subscribed_at: new Date().toISOString(),
                },
            })

        if (error) {
            console.error('[Newsletter] Failed to store subscription:', error.message)
            return { error: 'Something went wrong. Please try again.' }
        }

        return { error: null }
    } catch (err) {
        console.error('[Newsletter] Unexpected error:', err)
        return { error: 'Something went wrong. Please try again.' }
    }
}

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

        // DECISION: Store newsletter subscribers in site_settings.metadata
        // as a JSON array. This avoids FK issues with agent_artifacts (which
        // requires a real foundry_id) and doesn't need a new migration.
        // Scale limit: ~10K emails before JSONB gets slow. Upgrade to a
        // dedicated table or Resend Audiences when volume justifies it.

        // Find or create the platform-wide site_settings row
        // Use the first foundry that exists (platform settings)
        const { data: foundries } = await supabase
            .from('foundries')
            .select('id')
            .limit(1)

        if (!foundries || foundries.length === 0) {
            console.error('[Newsletter] No foundries exist — cannot store subscriber')
            return { error: 'Something went wrong. Please try again.' }
        }

        const platformFoundryId = foundries[0].id

        // Upsert site_settings for this foundry
        const { data: settings } = await supabase
            .from('site_settings')
            .select('id, metadata')
            .eq('foundry_id', platformFoundryId)
            .single()

        const currentMeta = (settings?.metadata || {}) as Record<string, unknown>
        const subscribers = (currentMeta.newsletter_subscribers || []) as string[]

        // Check for duplicate
        if (subscribers.includes(email)) {
            return { error: null } // Already subscribed
        }

        const updatedSubscribers = [...subscribers, email]
        const updatedMeta = {
            ...currentMeta,
            newsletter_subscribers: updatedSubscribers,
            last_subscriber_at: new Date().toISOString(),
        }

        if (settings) {
            // Update existing
            const { error } = await supabase
                .from('site_settings')
                .update({
                    metadata: updatedMeta,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', settings.id)

            if (error) {
                console.error('[Newsletter] Failed to update subscribers:', error.message)
                return { error: 'Something went wrong. Please try again.' }
            }
        } else {
            // Create new
            const { error } = await supabase
                .from('site_settings')
                .insert({
                    foundry_id: platformFoundryId,
                    metadata: updatedMeta,
                    newsletter_enabled: true,
                })

            if (error) {
                console.error('[Newsletter] Failed to create settings:', error.message)
                return { error: 'Something went wrong. Please try again.' }
            }
        }

        return { error: null }
    } catch (err) {
        console.error('[Newsletter] Unexpected error:', err)
        return { error: 'Something went wrong. Please try again.' }
    }
}

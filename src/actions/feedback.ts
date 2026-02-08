'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { z } from 'zod'

/**
 * Feedback categories for early access users.
 * Each maps to a specific type of insight we want to capture.
 */
export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'confusion', 'praise'] as const
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]

const feedbackSchema = z.object({
    category: z.enum(FEEDBACK_CATEGORIES),
    message: z.string().min(5, 'Please share a bit more detail (at least 5 characters)').max(2000, 'Feedback must be under 2000 characters'),
    pageRoute: z.string().max(500).optional(),
    featureName: z.string().max(200).optional(),
})

// Simple in-memory rate limiting (per-user, 5 submissions per 10 minutes)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const entry = rateLimitMap.get(userId)

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(userId, { count: 1, windowStart: now })
        return true
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return false
    }

    entry.count++
    return true
}

/**
 * Submit early access feedback from an authenticated user.
 * 
 * @description Captures contextual feedback with category, message, 
 * current page route, and optional feature name. Rate-limited to prevent abuse.
 * 
 * @param input - Feedback submission data
 * @returns Success status or error message
 * 
 * @throws Never throws — returns error messages in result object
 * 
 * @security Requires authenticated user with active foundry membership
 * @audit Feedback stored with user_id and foundry_id for traceability
 */
export async function submitFeedback(input: {
    category: FeedbackCategory
    message: string
    pageRoute?: string
    featureName?: string
}): Promise<{ success: boolean; error?: string }> {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'You must be logged in to submit feedback' }
    }

    // SECURITY: Rate limit per user
    if (!checkRateLimit(user.id)) {
        return { success: false, error: 'You\'ve submitted a lot of feedback recently. Please wait a few minutes before sending more.' }
    }

    // VALIDATION: Parse and validate input
    const parsed = feedbackSchema.safeParse(input)
    if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message || 'Invalid feedback data'
        return { success: false, error: firstError }
    }

    // Get user's active foundry
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return { success: false, error: 'No active workspace found' }
    }

    // Insert feedback
    const { error: insertError } = await supabase
        .from('early_access_feedback')
        .insert({
            user_id: user.id,
            foundry_id: foundryId,
            category: parsed.data.category,
            message: parsed.data.message,
            page_route: parsed.data.pageRoute || null,
            feature_name: parsed.data.featureName || null,
        })

    if (insertError) {
        console.error('[FeedbackAction] Failed to submit feedback:', {
            userId: user.id,
            foundryId,
            error: insertError.message,
            code: insertError.code,
        })
        return { success: false, error: 'Failed to submit feedback. Please try again.' }
    }

    console.info('[FeedbackAction] Feedback submitted:', {
        userId: user.id,
        foundryId,
        category: parsed.data.category,
        featureName: parsed.data.featureName || 'general',
    })

    return { success: true }
}

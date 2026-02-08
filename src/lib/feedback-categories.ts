/**
 * Feedback categories for early access users.
 * Each maps to a specific type of insight we want to capture.
 *
 * Extracted from actions/feedback.ts because 'use server' files
 * can only export async functions — exporting a const array from
 * a server action file causes Next.js to throw:
 * "A 'use server' file can only export async functions, found object."
 */
export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'confusion', 'praise'] as const

export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]

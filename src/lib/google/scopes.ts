/**
 * @file scopes.ts
 *
 * @description Google OAuth scope definitions and permission utilities.
 * Scopes are requested incrementally per phase to minimize permissions.
 *
 * @security Only request scopes needed for the current feature phase.
 * @related src/lib/google/client.ts - Uses scopes for OAuth flow
 */

/** Scopes needed for Google Calendar read/write access */
export const CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
] as const

/** Scopes needed for Google Drive read-only access */
export const DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
] as const

/** Scopes needed for Gmail send-as (lightweight email) */
export const GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
] as const

/** Base profile scopes always requested */
export const BASE_SCOPES = [
    'openid',
    'email',
    'profile',
] as const

/** All scopes that CentaurOS may request across all phases */
export const ALL_SCOPES = [
    ...BASE_SCOPES,
    ...CALENDAR_SCOPES,
    ...DRIVE_SCOPES,
    ...GMAIL_SCOPES,
] as const

/**
 * Get the scopes needed for a specific integration feature.
 *
 * @param features - Array of features the user wants to enable
 * @returns Combined scope array with no duplicates
 */
export function getScopesForFeatures(
    features: ('calendar' | 'drive' | 'gmail')[]
): string[] {
    const scopes = new Set<string>([...BASE_SCOPES])

    for (const feature of features) {
        switch (feature) {
            case 'calendar':
                CALENDAR_SCOPES.forEach(s => scopes.add(s))
                break
            case 'drive':
                DRIVE_SCOPES.forEach(s => scopes.add(s))
                break
            case 'gmail':
                GMAIL_SCOPES.forEach(s => scopes.add(s))
                break
        }
    }

    return Array.from(scopes)
}

/**
 * Check if a set of granted scopes includes all required scopes for a feature.
 *
 * @param grantedScopes - Scopes the user has already granted
 * @param requiredFeature - The feature to check
 * @returns True if all required scopes are granted
 */
export function hasRequiredScopes(
    grantedScopes: string[],
    requiredFeature: 'calendar' | 'drive' | 'gmail'
): boolean {
    const required = getScopesForFeatures([requiredFeature])
    return required.every(scope => grantedScopes.includes(scope))
}

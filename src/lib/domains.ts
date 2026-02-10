/**
 * Domain configuration utilities
 *
 * @description Single source of truth for the app domain URL.
 * All code needing the base URL should import from here instead of
 * reading env vars directly. This ensures consistent fallback behaviour
 * and prevents localhost URLs from leaking into production.
 *
 * Architecture: Single-domain setup on fractionalforge.app.
 * Marketing (/, /join/*) and app (/dashboard, /tasks, etc.) share one domain.
 * The ops dashboard lives on ops.fractionalforge.app.
 *
 * Env vars used:
 * - NEXT_PUBLIC_APP_DOMAIN — the canonical domain (e.g. https://fractionalforge.app)
 * - NEXT_PUBLIC_MARKETING_DOMAIN — same as app domain in single-domain setup
 * - VERCEL_URL — auto-set by Vercel on every deployment (preview URL)
 */

export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://fractionalforge.app'
export const MARKETING_DOMAIN = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://fractionalforge.app'

/**
 * Get the base URL for the application.
 *
 * @description Resolves the base URL in priority order:
 * 1. NEXT_PUBLIC_APP_DOMAIN (explicit production domain)
 * 2. VERCEL_URL (auto-set on Vercel, gives preview deployment URL)
 * 3. localhost fallback (development only)
 *
 * Server actions, API routes, and email links should all use this.
 *
 * @returns The base URL without trailing slash (e.g. "https://fractionalforge.app")
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_DOMAIN) {
    return process.env.NEXT_PUBLIC_APP_DOMAIN
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  // Development-only fallback
  return 'http://localhost:3000'
}

/**
 * Get the full URL for a marketing page
 */
export function getMarketingUrl(path: string = '/'): string {
  return `${MARKETING_DOMAIN}${path}`
}

/**
 * Get the full URL for an app page
 */
export function getAppUrl(path: string = '/updates'): string {
  return `${APP_DOMAIN}${path}`
}

/**
 * Check if current hostname is the main app domain
 *
 * @description Checks for fractionalforge.app as well as legacy domains
 * (centauros.io, forgeos.io, centaurdynamics.io) during migration period.
 */
export function isAppDomain(hostname: string): boolean {
  return (
    hostname.includes('fractionalforge.app') ||
    hostname.includes('centauros.io') ||
    hostname.includes('forgeos.io') ||
    hostname.includes('centaurdynamics.io')
  )
}

/**
 * Check if current hostname is a marketing domain
 *
 * @description In single-domain architecture, marketing and app share the
 * same domain. This function exists for backward compatibility and returns
 * true for the main domain. Legacy domains are also matched during migration.
 */
export function isMarketingDomain(hostname: string): boolean {
  return isAppDomain(hostname)
}

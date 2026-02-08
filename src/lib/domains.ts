/**
 * Domain configuration utilities
 *
 * @description Single source of truth for app and marketing domain URLs.
 * All code needing the base URL should import from here instead of
 * reading env vars directly. This ensures consistent fallback behaviour
 * and prevents localhost URLs from leaking into production.
 *
 * Env vars used:
 * - NEXT_PUBLIC_APP_DOMAIN — the canonical app domain (e.g. https://centauros.io)
 * - NEXT_PUBLIC_MARKETING_DOMAIN — the marketing site (e.g. https://centaurdynamics.io)
 * - VERCEL_URL — auto-set by Vercel on every deployment (preview URL)
 */

export const MARKETING_DOMAIN = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://centaurdynamics.io'
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://centauros.io'

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
 * @returns The base URL without trailing slash (e.g. "https://centauros.io")
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
export function getAppUrl(path: string = '/dashboard'): string {
  return `${APP_DOMAIN}${path}`
}

/**
 * Check if current hostname is the marketing domain
 */
export function isMarketingDomain(hostname: string): boolean {
  return hostname.includes('centaurdynamics.io') || hostname.includes('fractionalforge.io')
}

/**
 * Check if current hostname is the app domain
 */
export function isAppDomain(hostname: string): boolean {
  return hostname.includes('centauros.io') || hostname.includes('forgeos.io')
}

/**
 * Domain configuration utilities
 * Handles routing between marketing domain (centaurdynamics.io) and app domain (centauros.io)
 */

export const MARKETING_DOMAIN = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://centaurdynamics.io'
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://centauros.io'

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
  return hostname.includes('centaurdynamics.io')
}

/**
 * Check if current hostname is the app domain
 */
export function isAppDomain(hostname: string): boolean {
  return hostname.includes('centauros.io')
}

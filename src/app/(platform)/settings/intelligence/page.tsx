import { redirect } from 'next/navigation'

/**
 * Intelligence Settings — removed post-pivot 2026-04-28.
 * Redirects to the main settings page.
 */
export default function IntelligenceSettingsRedirect() {
    redirect('/settings')
}

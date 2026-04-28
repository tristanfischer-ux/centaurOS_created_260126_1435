import { redirect } from 'next/navigation'

/**
 * Help & Support — removed post-pivot 2026-04-28.
 * Redirects to the main settings page.
 */
export default function HelpSettingsRedirect() {
    redirect('/settings')
}

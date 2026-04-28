import { redirect } from 'next/navigation'

/**
 * Audit Log Settings — removed post-pivot 2026-04-28.
 * Redirects to the main settings page.
 */
export default function AuditLogSettingsRedirect() {
    redirect('/settings')
}

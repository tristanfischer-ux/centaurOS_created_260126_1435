import { redirect } from 'next/navigation'

/**
 * Admin Route Redirect
 *
 * @description Redirects to the Settings page.
 * (Company Settings tab was removed post-pivot 2026-04-28.)
 */
export default function AdminRedirectPage() {
    redirect('/settings')
}

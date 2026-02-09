import { redirect } from 'next/navigation'

/**
 * Admin Route Redirect
 * 
 * @description The Company Admin hub has been consolidated into Settings.
 * This page redirects users to the Company settings tab for backward compatibility.
 */
export default function AdminRedirectPage() {
    redirect('/settings/company')
}

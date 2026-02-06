import { redirect } from 'next/navigation'

/**
 * Legacy /new-inbox route - redirects to /updates.
 * Kept for backward compatibility with cached links.
 */
export default function NewInboxPage(): never {
  redirect('/updates')
}

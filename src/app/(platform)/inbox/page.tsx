import { redirect } from 'next/navigation'

/**
 * Legacy /inbox route - redirects to /updates.
 * Kept for backward compatibility with bookmarks and cached links.
 */
export default function InboxPage(): never {
  redirect('/updates')
}

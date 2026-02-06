import { redirect } from 'next/navigation'

/**
 * Legacy /home route - redirects to /updates.
 * Kept for backward compatibility with bookmarks and cached links.
 */
export default function HomePage(): never {
  redirect('/updates')
}

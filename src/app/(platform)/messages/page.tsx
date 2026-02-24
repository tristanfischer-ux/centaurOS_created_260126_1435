import { redirect } from 'next/navigation'

/**
 * Messages Route Redirect
 *
 * @description Communications are now consolidated in the Updates page.
 * This redirect preserves backward compatibility with old bookmarks.
 */
export default function MessagesPage(): never {
  redirect('/updates')
}

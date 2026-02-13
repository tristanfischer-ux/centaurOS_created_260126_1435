import { redirect } from 'next/navigation'

/**
 * @description Legacy canvas route — redirects to the new /strategy page.
 * Kept for backwards compatibility with bookmarks and shared links.
 */
export default function CanvasPage() {
  redirect('/strategy')
}

import { redirect } from 'next/navigation'

/**
 * Money Map page — redirects to Strategy page with Money Map tab.
 * Kept for backward compatibility with bookmarks and shared links.
 */
export default function MoneyMapPage(): never {
  redirect('/canvas?tab=money-map')
}

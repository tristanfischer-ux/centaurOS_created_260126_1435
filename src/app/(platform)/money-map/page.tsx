import { redirect } from 'next/navigation'

/**
 * Money Map page — redirects to the combined Financial Tools page.
 * Kept for backward compatibility with bookmarks and shared links.
 */
export default function MoneyMapPage(): never {
  redirect('/tools/financial?tab=money-map')
}

import { redirect } from 'next/navigation'

/**
 * Money Map page — redirects to Finance Money Map.
 * Kept for backward compatibility with bookmarks and shared links.
 */
export default function MoneyMapPage(): never {
  redirect('/finance/money-map')
}

import { redirect } from 'next/navigation'

/**
 * Cost of Delay page — redirects to Strategy page with Cost of Delay tab.
 * Kept for backward compatibility with bookmarks and shared links.
 */
export default function CostOfDelayPage(): never {
  redirect('/canvas?tab=cost-of-delay')
}

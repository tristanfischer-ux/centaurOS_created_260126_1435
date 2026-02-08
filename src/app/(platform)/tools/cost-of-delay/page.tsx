import { redirect } from 'next/navigation'

/**
 * Cost of Delay page — redirects to the combined Financial Tools page.
 * Kept for backward compatibility with bookmarks and shared links.
 */
export default function CostOfDelayPage(): never {
  redirect('/tools/financial?tab=cost-of-delay')
}

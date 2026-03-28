import { redirect } from 'next/navigation'

/**
 * Knowledge page — redirects to My Profile Knowledge tab.
 *
 * @description The Knowledge vault now lives inside the My Profile page
 * as a tab. This redirect ensures old bookmarks and links still work.
 */
export default function KnowledgePage(): never {
  redirect('/my-profile?tab=knowledge')
}

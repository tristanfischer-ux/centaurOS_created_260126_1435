import { redirect } from 'next/navigation'

/**
 * ObjectiveDetailPage - Redirects to objectives list.
 * 
 * @description Individual objective detail pages have been removed.
 * Objectives are now edited inline from the objectives list view.
 * This redirect ensures any existing links or bookmarks still work.
 */
export default async function ObjectiveDetailPage() {
    redirect('/objectives')
}

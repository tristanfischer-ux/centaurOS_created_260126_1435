import { redirect } from "next/navigation"

/**
 * Advisory page redirect.
 *
 * @description Redirects to the inspiration page.
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function AdvisoryPage() {
    redirect("/inspiration")
}

import { redirect } from "next/navigation"

/**
 * Today page has been consolidated into Inbox (/messages)
 * 
 * @description The Today page previously contained:
 * - Activity feed (moved to Inbox)
 * - Prioritized tasks (moved to Tasks page)
 * - Daily pulse widget (available in Settings)
 * - Standup widget (moved to Team page)
 * 
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function TodayPage() {
    redirect("/messages")
}

import { redirect } from "next/navigation"

/**
 * Timeline page has been consolidated into Tasks
 * 
 * @description Timeline view (calendar/Gantt) is now available 
 * as a view toggle within the Tasks page.
 * 
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function TimelinePage() {
    redirect("/new-tasks")
}

import { redirect } from "next/navigation"

/**
 * Help page has been moved to Settings
 * 
 * @description Help and documentation are now accessible within Settings.
 * Use Cmd+K (command palette) for quick help or navigate to Settings.
 * 
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function HelpPage() {
    redirect("/settings")
}

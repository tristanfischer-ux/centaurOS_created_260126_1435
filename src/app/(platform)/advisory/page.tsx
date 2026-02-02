import { redirect } from "next/navigation"

/**
 * Advisory page has been consolidated into Product Map
 * 
 * @description Q&A functionality is now available within Product Map
 * as domain-contextual questions. Ask questions about specific 
 * knowledge domains to get expert AI assistance.
 * 
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function AdvisoryPage() {
    redirect("/blueprints")
}

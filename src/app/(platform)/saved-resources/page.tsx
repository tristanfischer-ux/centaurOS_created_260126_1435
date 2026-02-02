import { redirect } from "next/navigation"

/**
 * Saved Resources page has been consolidated into Marketplace
 * 
 * @description Saved resources (your "stack") are now accessible 
 * as a tab within the Marketplace.
 * Navigate to Marketplace and select the "Saved" tab.
 * 
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function SavedResourcesPage() {
    redirect("/marketplace?tab=saved")
}

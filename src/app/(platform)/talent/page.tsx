import { redirect } from "next/navigation"

/**
 * Talent page has been consolidated into Marketplace
 * 
 * @description Talent network is now accessible as a tab within the Marketplace.
 * Navigate to Marketplace and select the "Talent" tab.
 * 
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function TalentPage() {
    redirect("/marketplace?tab=talent")
}

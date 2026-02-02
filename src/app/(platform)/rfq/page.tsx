import { redirect } from "next/navigation"

/**
 * RFQ page has been consolidated into Marketplace
 * 
 * @description RFQs are now accessible as a tab within the Marketplace.
 * Navigate to Marketplace and select the "RFQs" tab.
 * 
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function RFQPage() {
    redirect("/marketplace?tab=rfqs")
}

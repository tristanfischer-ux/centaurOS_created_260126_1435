/**
 * @file page.tsx — "Marketplace" section intro page
 *
 * @description High-impact visual overview of the Marketplace: Guild, Apprenticeship,
 * Inspiration, Marketplace store, and Orders. Users visit this to understand the scope
 * of the "Marketplace" section and see what's new.
 */

import type { Metadata } from "next"
import { MarketplaceSectionIntro } from "./marketplace-section-intro"

export const metadata: Metadata = {
    title: "Marketplace",
    description: "Everything you need, everyone you need — find talent, products, and services",
}

export default function MarketplaceHubPage(): React.ReactNode {
    return <MarketplaceSectionIntro />
}

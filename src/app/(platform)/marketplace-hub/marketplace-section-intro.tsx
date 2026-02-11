/**
 * MarketplaceSectionIntro — Client component for the "Marketplace" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "marketplace" section data.
 */

"use client"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"

const section = getSectionById("marketplace")!

export function MarketplaceSectionIntro(): React.ReactElement {
    return <SectionIntroPage section={section} />
}

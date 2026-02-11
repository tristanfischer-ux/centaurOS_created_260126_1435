/**
 * WorkshopSectionIntro — Client component for the "Workshop" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "workshop" section data.
 */

"use client"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"

const section = getSectionById("workshop")!

export function WorkshopSectionIntro(): React.ReactElement {
    return <SectionIntroPage section={section} />
}

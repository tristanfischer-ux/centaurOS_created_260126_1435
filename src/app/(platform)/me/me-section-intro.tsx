/**
 * MeSectionIntro — Client component for the "Me" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "me" section data.
 */

"use client"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"

const section = getSectionById("me")!

export function MeSectionIntro(): React.ReactElement {
    return <SectionIntroPage section={section} />
}

/**
 * @file page.tsx — "Me" section intro page
 *
 * @description High-impact visual overview of personal pages: profile, updates.
 * Users visit this to understand the scope of the "Me" section and see what's new.
 */

import type { Metadata } from "next"
import { MeSectionIntro } from "./me-section-intro"

export const metadata: Metadata = {
    title: "Me | ForgeOS",
    description: "Your personal command centre — profile, activity feed, and settings",
}

export default function MePage(): React.ReactNode {
    return <MeSectionIntro />
}

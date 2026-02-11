/**
 * @file page.tsx — "Workshop" section intro page
 *
 * @description High-impact visual overview of the Workshop: The Forge, Team, Agents.
 * Users visit this to understand the scope of the "Workshop" section and see what's new.
 */

import type { Metadata } from "next"
import { WorkshopSectionIntro } from "./workshop-section-intro"

export const metadata: Metadata = {
    title: "Workshop | ForgeOS",
    description: "Where the work happens — The Forge, your team, and AI agents",
}

export default function WorkshopPage(): React.ReactNode {
    return <WorkshopSectionIntro />
}

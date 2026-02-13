/**
 * @file page.tsx — "Today" page
 *
 * @description Personalized daily landing page that greets the user with
 * intelligence: morning briefing, daily pulse summary, focus items,
 * at-risk objectives, and yesterday's wins. This is the first thing
 * a user sees when they open ForgeOS.
 */

import type { Metadata } from "next"
import { TodayView } from "./today-view"

export const metadata: Metadata = {
    title: "Today | ForgeOS",
    description: "Your personalized daily focus — what needs attention, wins, and priorities",
}

export default function TodayPage(): React.ReactNode {
    return <TodayView />
}

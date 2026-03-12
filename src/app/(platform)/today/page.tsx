/**
 * @file page.tsx — "Today" page
 *
 * @description Personalized daily landing page that greets the user with
 * intelligence: morning briefing, daily pulse summary, focus items,
 * at-risk objectives, and yesterday's wins. This is the first thing
 * a user sees when they open ForgeOS.
 *
 * Data is fetched server-side so the RSC payload includes real data —
 * eliminating the loading spinner on navigation.
 */

import type { Metadata } from "next"
import { getMorningBriefing } from "@/actions/nudges"
import { getMyDailyPulse, type DailyPulseResult } from "@/actions/reports"
import { getStrategyHealthSummary } from "@/actions/canvas"
import { getUnreadCount } from "@/actions/messaging"
import { TodayView } from "./today-view"
import dynamic from "next/dynamic"

const SetupWizardTrigger = dynamic(
    () => import("@/components/onboarding/setup-wizard-trigger").then((mod) => ({ default: mod.SetupWizardTrigger })),
    { ssr: false }
)

export const metadata: Metadata = {
    title: "Today | ForgeOS",
    description: "Your personalized daily focus — what needs attention, wins, and priorities",
}

export default async function TodayPage(): Promise<React.ReactNode> {
    const [briefingResult, pulseResult, strategyResult, unreadResult] = await Promise.all([
        getMorningBriefing().catch(() => ({ data: null, error: "Failed" })),
        getMyDailyPulse().catch(() => ({ success: false, data: undefined, error: "Failed" }) as DailyPulseResult),
        getStrategyHealthSummary().catch(() => ({ error: "Failed" }) as { error: string }),
        getUnreadCount().catch(() => ({ count: 0 })),
    ])

    return (
        <>
            <SetupWizardTrigger />
            <TodayView
                initialBriefing={briefingResult.data ?? null}
                initialPulse={pulseResult.success && pulseResult.data ? pulseResult.data : null}
                initialStrategyHealth={'data' in strategyResult && strategyResult.data ? strategyResult.data : []}
                initialUnreadCount={unreadResult?.count ?? 0}
                initialBriefingError={!briefingResult.data}
                initialPulseError={!pulseResult.success || !pulseResult.data}
            />
        </>
    )
}

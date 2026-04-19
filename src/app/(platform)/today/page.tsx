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
import { getOnboardingState } from "@/actions/onboarding"
import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

export const metadata: Metadata = {
    title: "Today",
    description: "Your personalized daily focus — what needs attention, wins, and priorities",
}

export default async function TodayPage(): Promise<React.ReactNode> {
    const supabase = await createClient()
    const [{ data: authData }, briefingResult, pulseResult, strategyResult, unreadResult, onboardingState, foundryId] = await Promise.all([
        supabase.auth.getUser(),
        getMorningBriefing().catch(() => ({ data: null, error: "Failed" })),
        getMyDailyPulse().catch(() => ({ success: false, data: undefined, error: "Failed" }) as DailyPulseResult),
        getStrategyHealthSummary().catch(() => ({ error: "Failed" }) as { error: string }),
        getUnreadCount().catch(() => ({ count: 0 })),
        getOnboardingState().catch(() => undefined),
        getFoundryIdCached().catch(() => null),
    ])

    // Show the "List yourself as a fractional executive" promo card to users who
    // are past onboarding but have is_fractional_executive=false (Phase 5).
    let showFractionalExecPrompt = false
    if (authData?.user && onboardingState) {
        const onboardingComplete = onboardingState.onboarding_modal_completed === true ||
            onboardingState.has_completed_onboarding === true
        if (onboardingComplete) {
            const { data: flagRow } = await supabase
                .from('profiles')
                .select('is_fractional_executive')
                .eq('id', authData.user.id)
                .single()
            const flag = (flagRow as unknown as { is_fractional_executive?: boolean } | null)?.is_fractional_executive
            showFractionalExecPrompt = flag !== true
        }
    }

    return (
        <>
            <TodayView
                initialBriefing={briefingResult.data ?? null}
                initialPulse={pulseResult.success && pulseResult.data ? pulseResult.data : null}
                initialStrategyHealth={'data' in strategyResult && strategyResult.data ? strategyResult.data : []}
                initialUnreadCount={unreadResult?.count ?? 0}
                initialBriefingError={!briefingResult.data}
                initialPulseError={!pulseResult.success || !pulseResult.data}
                initialOnboardingData={onboardingState}
                showFractionalExecPrompt={showFractionalExecPrompt}
                foundryId={foundryId}
            />
        </>
    )
}

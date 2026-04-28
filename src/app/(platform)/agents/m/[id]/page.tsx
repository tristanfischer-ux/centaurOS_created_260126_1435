import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { getMeetingThread, refreshSessionAssetUrls } from "@/actions/meeting-threads"
import { MeetingThreadView } from "./meeting-thread-view"
import { getUserSubscription } from "@/lib/billing/subscriptions"
import type { SubscriptionTier } from "@/lib/billing/plans"

export const dynamic = "force-dynamic"

interface MeetingThreadPageProps {
    params: Promise<{ id: string }>
}

/**
 * Persistent meeting URL — /agents/m/<meeting_id>
 *
 * @description Read-back surface for any past brainstorming session.
 * Displays the full transcript with Council position pills, arrival
 * timers, source citations sidebar, and "Run a follow-up" / "Branch
 * from here" CTAs.
 *
 * @security Auth required. RLS ensures only foundry members can view.
 */
export default async function MeetingThreadPage({ params }: MeetingThreadPageProps) {
    const { id } = await params

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const { data: thread, error } = await getMeetingThread(id)

    if (error || !thread) {
        notFound()
    }

    // Load subscription tier for follow-up gating (free tier has a brainstorm limit)
    let userTier: SubscriptionTier = "free"
    try {
        const { subscription } = await getUserSubscription(user.id)
        const isActive =
            subscription?.status === "active" || subscription?.status === "trialing"
        userTier = (subscription && isActive
            ? subscription.tier
            : "free") as SubscriptionTier
    } catch {
        // Non-critical — gating falls back to free-tier
    }

    // F2 / F3 — fetch signed URLs for cover image + audio clips. RLS on
    // meeting_threads already approved access via getMeetingThread above,
    // so this is purely a URL refresh.
    const assets = await refreshSessionAssetUrls(id)

    return (
        <MeetingThreadView
            thread={thread}
            currentUserId={user.id}
            userTier={userTier}
            coverImageUrl={assets.coverUrl}
            audioClips={assets.audioClips}
        />
    )
}

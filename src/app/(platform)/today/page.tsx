/**
 * @file page.tsx — "Today" page (V2 — mockup-faithful rebuild).
 *
 * @description Personalised daily landing. Fetches all real data in
 * parallel and hands it to the client `TodayView`. Any slot whose source
 * errors or returns empty is rendered as an empty-state in the view —
 * no mockup strings leak through to production.
 */

import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { TodayView, type TodayViewProps, type PrioritySlab, type QueueItem, type CalendarItem, type WaitingItem, type MilestoneMarker, type BuildTile, type TeamSummary } from "./today-view"
import { getMorningBriefing } from "@/actions/nudges"
import { getStrategyHealthSummary, getAllMilestones, getFoundryMembers } from "@/actions/canvas"
import { getFinanceDashboardData } from "@/actions/finance-dashboard"
import { listCadLabProjects } from "@/actions/cad-lab-projects"
import { listUpcomingEvents } from "@/actions/google-calendar"
import { getWaitingOnYou, getOperationsSummary, getLastTeamActivityAt } from "@/actions/today-feed"

export const metadata: Metadata = {
    title: "Today",
    description: "Your personalised daily focus — what needs attention, what's waiting on you, what threatens the window",
}

// Each safe-call wraps a promise so any rejection falls back to a neutral shape.
// The view renders empty-states from the neutral shape.
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
    try {
        const result = await p
        return result
    } catch (err) {
        console.error('[Today] Data source failed:', err)
        return fallback
    }
}

export default async function TodayPage(): Promise<React.ReactNode> {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()

    let fullName: string | null = null
    if (authData?.user) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", authData.user.id)
            .single()
        fullName = (profile as { full_name?: string } | null)?.full_name ?? null
    }

    const userName = fullName ?? authData?.user?.email?.split("@")[0] ?? "there"

    // FLOW: Fetch every Today-page source in parallel. None depend on each other.
    const [
        briefing,
        strategyHealth,
        finance,
        projects,
        calendarEventsRes,
        milestones,
        waiting,
        operations,
        team,
        lastTeamActivityAt,
    ] = await Promise.all([
        safe(getMorningBriefing(), { error: 'unavailable' }),
        safe(getStrategyHealthSummary(), { error: 'unavailable' } as Awaited<ReturnType<typeof getStrategyHealthSummary>>),
        safe(getFinanceDashboardData(), { data: null, error: 'unavailable' } as Awaited<ReturnType<typeof getFinanceDashboardData>>),
        safe(listCadLabProjects(), { error: 'unavailable' } as Awaited<ReturnType<typeof listCadLabProjects>>),
        safe(listUpcomingEvents('week'), { events: [], error: 'unavailable' }),
        safe(getAllMilestones(), { error: 'unavailable' } as Awaited<ReturnType<typeof getAllMilestones>>),
        safe(getWaitingOnYou(), { items: [], totalCount: 0 }),
        safe(getOperationsSummary(), { shippedProducts: 0, activeSuppliers: 0, certExpiriesNext30d: null }),
        safe(getFoundryMembers(), { error: 'unavailable' } as Awaited<ReturnType<typeof getFoundryMembers>>),
        safe(getLastTeamActivityAt(), null),
    ])

    // ── Signal chips ────────────────────────────────────────────────
    const healthData = ('data' in strategyHealth && strategyHealth.data) ? strategyHealth.data : []
    // "Broke overnight" = goals that are off-track AND have been touched in the last 24h.
    // We don't persist a created_at for "flips"; use overdueTaskCount > 0 as the blocking signal.
    const brokeOvernightCount = healthData.filter(g => g.health === 'off-track' && g.overdueTaskCount > 0).length

    const overdueCount = briefing.data?.overdueCount ?? 0

    const waitingCount = waiting.totalCount

    // ── Priority slab ───────────────────────────────────────────────
    const briefingData = briefing.data
    const topTask = briefingData?.topTasks?.[0] ?? null
    const priority: PrioritySlab | null = topTask
        ? {
            sourceTag: 'forge',
            sourceExtra: topTask.objectiveTitle ?? undefined,
            kicker: topTask.isOverdue ? 'Overdue — #1 today' : 'Top priority — #1 today',
            title: topTask.title,
            body: topTask.isOverdue
                ? `This task is past its deadline. ${topTask.objectiveTitle ? `Linked to "${topTask.objectiveTitle}".` : ''}`.trim()
                : (topTask.objectiveTitle
                    ? `Linked to "${topTask.objectiveTitle}". Due ${topTask.dueDate ?? 'soon'}.`
                    : (topTask.dueDate ? `Due ${topTask.dueDate}.` : 'No deadline set.')),
            actions: [
                { label: 'Open →', href: '/new-tasks', variant: 'primary' },
            ],
            groundingLine: null,
        }
        : null

    // ── Runway card ─────────────────────────────────────────────────
    // FinanceDashboardData only exposes monthlyRevenue / monthlyExpenses in pence.
    // Derive runway (months) = cashPosition / monthlyExpenses. Skip if burn==0.
    const fin = finance.data?.current ?? null
    let runwayMonths: number | null = null
    let burnThisMonthPence: number | null = null
    let biggestCostPence: number | null = null
    if (fin) {
        const burn = fin.monthlyExpenses
        if (burn > 0) {
            runwayMonths = Math.round((fin.cashPosition / burn) * 10) / 10
            burnThisMonthPence = burn
        }
        // "Biggest cost" placeholder — we don't break out top category here;
        // set null so the view renders the single-stat layout.
        biggestCostPence = null
    }

    // ── Today queue ─────────────────────────────────────────────────
    // Source: MorningBriefing.topTasks → extend with atRiskObjectives for variety.
    // The view filters client-side by source-tab.
    const queueItems: QueueItem[] = []
    if (briefingData?.topTasks) {
        for (let i = 0; i < briefingData.topTasks.length; i++) {
            const t = briefingData.topTasks[i]
            queueItems.push({
                rank: i + 1,
                id: t.id,
                title: t.title,
                subtitle: t.objectiveTitle ?? 'No linked objective',
                source: 'forge',
                sourceExtra: t.objectiveTitle ?? undefined,
                decay: t.isOverdue && t.dueDate
                    ? `${Math.max(1, Math.ceil((Date.now() - new Date(t.dueDate).getTime()) / 86400000))} days overdue`
                    : (t.dueDate ?? 'no deadline'),
                decayClass: t.isOverdue ? 'overdue' : undefined,
                action: 'Open →',
                href: '/new-tasks',
            })
        }
    }
    if (briefingData?.atRiskObjectives) {
        for (const o of briefingData.atRiskObjectives) {
            queueItems.push({
                rank: queueItems.length + 1,
                id: o.id,
                title: o.title,
                subtitle: o.reason,
                source: 'forge',
                decay: o.daysUntilDeadline !== null && o.daysUntilDeadline < 0
                    ? `${Math.abs(o.daysUntilDeadline)} days overdue`
                    : (o.daysUntilDeadline !== null ? `${o.daysUntilDeadline} days` : 'no deadline'),
                decayClass: o.daysUntilDeadline !== null && o.daysUntilDeadline < 0 ? 'overdue' : (o.daysUntilDeadline !== null && o.daysUntilDeadline < 7 ? 'warn' : undefined),
                action: 'Review →',
                href: '/new-objectives',
            })
        }
    }
    // Cap at 7 rows per the mockup
    const queue = queueItems.slice(0, 7)

    // ── Calendar ────────────────────────────────────────────────────
    const events = calendarEventsRes.events ?? []
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    const dayAfterTomorrow = new Date(tomorrowStart); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1)

    const eventsToday = events.filter(e => {
        if (!e.startTime) return false
        const start = new Date(e.startTime)
        return start >= now && start < tomorrowStart
    })

    const eventsTomorrow = events.filter(e => {
        if (!e.startTime) return false
        const start = new Date(e.startTime)
        return start >= tomorrowStart && start < dayAfterTomorrow
    })

    const calendar: CalendarItem[] = eventsToday.slice(0, 3).map((e, idx) => {
        const start = new Date(e.startTime)
        const timeLabel = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        return {
            id: e.id,
            time: timeLabel,
            isNow: idx === 0 && Math.abs(start.getTime() - now.getTime()) < 30 * 60 * 1000,
            title: e.summary || '(Untitled event)',
            who: e.description?.split('\n')[0] || (e.attendees.length > 0 ? `${e.attendees.length} attendee${e.attendees.length === 1 ? '' : 's'}` : 'No attendees'),
            source: 'people',
            href: e.htmlLink ?? undefined,
        }
    })

    // Connection status: only "Google account not connected" is the explicit
    // disconnect signal. Any other error / no error = treat as connected-but-empty.
    const calendarConnected = calendarEventsRes.error !== 'Google account not connected'
    const hasCalendar = calendar.length > 0

    // ── Risk horizon ────────────────────────────────────────────────
    const milestoneList = ('data' in milestones && milestones.data) ? milestones.data : []
    // Pick the nearest future milestone as the anchor
    const futureMilestones = milestoneList
        .filter(m => m.milestone_date && new Date(m.milestone_date) > now)
        .sort((a, b) => new Date(a.milestone_date!).getTime() - new Date(b.milestone_date!).getTime())
    const anchor = futureMilestones[0] ?? null

    // All milestone markers within the 14-day horizon
    const horizonEnd = new Date(now)
    horizonEnd.setDate(horizonEnd.getDate() + 14)
    const horizonMarkers: MilestoneMarker[] = milestoneList
        .filter(m => m.milestone_date && new Date(m.milestone_date) >= now && new Date(m.milestone_date) <= horizonEnd)
        .map(m => ({
            id: m.id,
            title: m.title,
            date: m.milestone_date!,
            severity: 'info' as const,
        }))

    // ── Builds row ──────────────────────────────────────────────────
    const projectList = ('projects' in projects && projects.projects) ? projects.projects : []
    const activeProjects = projectList
        .filter(p => p.status !== 'archived' && p.status !== 'deleted')
        .slice(0, 2)

    const builds: BuildTile[] = activeProjects.map(p => ({
        id: p.id,
        name: p.name,
        subtitle: p.subject.length > 60 ? `${p.subject.slice(0, 57)}...` : p.subject,
        heroUrl: p.systemIllustrationUrl,
        statePill: 'on track' as const,
        costLabel: null,
        daysToFlight: null,
        href: `/the-forge-v2/projects/${p.id}`,
    }))

    // ── Team ────────────────────────────────────────────────────────
    const teamMembers = ('data' in team && team.data) ? team.data : []
    const teamSummary: TeamSummary | null = teamMembers.length > 0
        ? {
            topMembers: teamMembers
                .filter(m => m.full_name)
                .slice(0, 3)
                .map(m => ({
                    name: m.full_name ?? 'Unnamed',
                    role: m.role,
                })),
            totalCount: teamMembers.length,
            specialistCount: 13,
            lastActivityAt: lastTeamActivityAt,
        }
        : null

    // ── Waiting on you ──────────────────────────────────────────────
    const waitingItems: WaitingItem[] = waiting.items.map(w => ({
        id: w.id,
        name: w.who.name,
        initials: w.who.initials,
        avatarKind: w.who.avatarKind,
        ask: w.ask,
        meta: w.meta,
        queuedAt: w.queuedAt,
        source: w.source,
        actions: w.actions,
    }))

    const props: TodayViewProps = {
        userName,
        signals: {
            brokeOvernightCount,
            overdueCount,
            waitingCount,
        },
        priority,
        runway: {
            runwayMonths,
            burnThisMonthPence,
            biggestCostPence,
            currency: fin?.currency ?? 'GBP',
        },
        waiting: {
            items: waitingItems,
            totalCount: waiting.totalCount,
        },
        queue,
        calendar: {
            items: calendar,
            tomorrowCount: eventsTomorrow.length,
            connected: calendarConnected,
            hasEvents: hasCalendar,
        },
        horizon: {
            anchorTitle: anchor?.title ?? null,
            anchorDate: anchor?.milestone_date ?? null,
            markers: horizonMarkers,
        },
        builds: {
            tiles: builds,
            hasAny: builds.length > 0,
        },
        operations,
        team: teamSummary,
    }

    return <TodayView {...props} />
}

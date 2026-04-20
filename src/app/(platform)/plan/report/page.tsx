/**
 * @file page.tsx — Plan redesign "Report" list + compose landing surface.
 *
 * Phase 3 Plan redesign · Chunk C.1. Flag-gated behind
 * FLAG_NEW_PLAN_EXPERIENCE. When the flag is OFF the old /reports surface
 * still owns this traffic — we 301 out to it. When ON we fetch the 20
 * most recent reports_sent rows + counts per target and render the list
 * with a "Start new update" primary CTA that routes to /plan/report/new.
 *
 * Reference: PLAN-SCHEMA §12 (reports_sent), §16.1 (view_sent_reports).
 * Mockup: no HTML mockup shipped — structure inferred from PLAN-SCHEMA §12
 *         + HANDOVER-plan.md Chunk C.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ReportEmptyState } from "@/components/plan/empty-states"
import { typography } from "@/lib/design-system/typography"

import type { ReportsSentRow, ReportTarget } from "@/types/plan"

export const metadata: Metadata = {
    title: "Report · Plan",
    description: "Draft and send weekly, monthly, quarterly updates.",
}

const MAX_REPORTS = 20

type TargetCounts = Record<ReportTarget, number>

const TARGET_LABEL: Record<ReportTarget, string> = {
    weekly_team: "Weekly team",
    monthly_investor: "Monthly investor",
    quarterly_board: "Quarterly board",
    custom: "Custom",
}

const TARGET_ORDER: ReportTarget[] = [
    "weekly_team",
    "monthly_investor",
    "quarterly_board",
    "custom",
]

export default async function PlanReportPage(): Promise<React.ReactNode> {
    // ── flag gate ─────────────────────────────────────────────────────────
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) redirect("/reports")

    const supabase = await createClient()
    const foundryId = await getFoundryIdCached().catch(() => null)

    if (!foundryId) {
        return (
            <div className="max-w-4xl space-y-6">
                <ReportPageHeader recentCount={0} counts={emptyCounts()} />
                <div className="mt-10">
                    <ReportEmptyState />
                </div>
            </div>
        )
    }

    // Plan tables aren't in the generated Database types yet — cast at the
    // query boundary (same pattern as /plan/page.tsx).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any

    const [recentRes, countsRes] = await Promise.all([
        untyped
            .from("reports_sent")
            .select(
                "id, target_type, subject_line, sent_at, open_count, reply_count, pressure_tested_before_send",
            )
            .eq("foundry_id", foundryId)
            .order("sent_at", { ascending: false })
            .limit(MAX_REPORTS),
        untyped
            .from("reports_sent")
            .select("target_type")
            .eq("foundry_id", foundryId),
    ])

    const recent =
        (recentRes.data as Array<
            Pick<
                ReportsSentRow,
                | "id"
                | "target_type"
                | "subject_line"
                | "sent_at"
                | "open_count"
                | "reply_count"
                | "pressure_tested_before_send"
            >
        > | null) ?? []

    const counts: TargetCounts = emptyCounts()
    for (const row of (countsRes.data as Array<Pick<ReportsSentRow, "target_type">> | null) ?? []) {
        counts[row.target_type] = (counts[row.target_type] ?? 0) + 1
    }

    return (
        <div className="max-w-4xl space-y-6">
            <ReportPageHeader recentCount={recent.length} counts={counts} />

            <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
                {TARGET_ORDER.map((target) => (
                    <div
                        key={target}
                        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm"
                    >
                        <span className="font-medium text-foreground">
                            {TARGET_LABEL[target]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {counts[target]}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mt-8">
                {recent.length === 0 ? (
                    <ReportEmptyState />
                ) : (
                    <ul className="space-y-3">
                        {recent.map((r) => (
                            <li key={r.id}>
                                <Link
                                    href={`/plan/report/${r.id}`}
                                    className="block focus-visible:outline-none"
                                >
                                    <Card className="transition hover:border-primary/30 hover:shadow-sm focus-within:border-primary/30">
                                        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        {TARGET_LABEL[r.target_type]}
                                                    </Badge>
                                                    {r.pressure_tested_before_send ? (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Pressure-tested
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <h3 className="mt-2 truncate text-sm font-semibold text-foreground">
                                                    {r.subject_line}
                                                </h3>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Sent {formatWhen(r.sent_at)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                <span>
                                                    <span className="font-medium text-foreground">
                                                        {r.open_count}
                                                    </span>{" "}
                                                    opens
                                                </span>
                                                <span>
                                                    <span className="font-medium text-foreground">
                                                        {r.reply_count}
                                                    </span>{" "}
                                                    replies
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

function ReportPageHeader({
    recentCount,
    counts,
}: {
    recentCount: number
    counts: TargetCounts
}): React.ReactNode {
    void counts
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pb-4 border-b border-muted">
            <div>
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Report</h1>
                </div>
                <p className={typography.pageSubtitle}>
                    Weekly, monthly and quarterly updates. Cal drafts from your
                    Strategic Goals and this-week tasks; you edit, pressure-test,
                    then send.
                </p>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                    {recentCount === 0
                        ? "No updates yet"
                        : `${recentCount} recent`}
                </span>
                <Button asChild>
                    <Link href="/plan/report/new">Start new update</Link>
                </Button>
            </div>
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function emptyCounts(): TargetCounts {
    return {
        weekly_team: 0,
        monthly_investor: 0,
        quarterly_board: 0,
        custom: 0,
    }
}

function formatWhen(iso: string): string {
    try {
        const d = new Date(iso)
        const day = d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
        })
        return day
    } catch {
        return iso
    }
}

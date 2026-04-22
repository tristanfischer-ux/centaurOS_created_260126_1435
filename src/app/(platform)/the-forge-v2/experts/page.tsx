/**
 * @file experts/page.tsx — /the-forge-v2/experts
 *
 * @description Cross-project Experts roster. Renders TWO clearly-labelled
 * groups:
 *
 *   1. "AI Specialists (13)" — the always-on in-product specialists
 *      (from SPECIALISTS in @/lib/agents/specialists-config).
 *   2. "Fractional Executives" — real humans who have opted in to being
 *      listed as fractional executives on the Fractional Forge network
 *      (profiles.is_fractional_executive = true). Data source is
 *      network-wide, not limited to the caller's foundry, because the
 *      whole point of fractional executives is cross-foundry hiring.
 *
 * Each card links to the profile drill-in at /the-forge-v2/experts/[id].
 *
 * Mockup reference: FORGE-MOCKUP-EXPERTS.html.
 *
 * @related
 * - Data (specialists): @/lib/agents/specialists-config
 * - Data (fractional execs):
 *     profiles.is_fractional_executive (opt-in flag, added 2026-04-16)
 *     joined with provider_profiles (headline, day_rate, availability)
 * - Shell: ../_components/workspace-shell
 */

import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { Sparkles, UserCircle2, Users, ArrowRight } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { SPECIALISTS } from "@/lib/agents/specialists-config"
import type { Specialist } from "@/lib/agents/specialists-config"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Experts · The Forge",
        description: "AI specialists and fractional executives available on Fractional Forge.",
    }
}

// ─── Fractional exec model ────────────────────────────────────────

type FractionalExecStatus = "available" | "joining-soon"

interface FractionalExec {
    id: string
    name: string
    headline: string | null
    dayRate: number | null
    currency: string | null
    status: FractionalExecStatus
}

/**
 * Status rules:
 *   - "available"   — provider_profiles exists AND is_active=true AND
 *                     is_public=true AND out_of_office=false
 *   - "joining-soon" — otherwise (opted in via flag, not yet active/public)
 */
function deriveStatus(pp: {
    is_active?: boolean | null
    is_public?: boolean | null
    out_of_office?: boolean | null
} | null): FractionalExecStatus {
    if (!pp) return "joining-soon"
    const active = pp.is_active === true
    const pub = pp.is_public === true
    const ooo = pp.out_of_office === true
    return active && pub && !ooo ? "available" : "joining-soon"
}

/**
 * Loads ALL opted-in fractional executives across the Fractional Forge
 * network (not scoped to the caller's foundry — the whole point is
 * cross-foundry visibility). Returns [] on any failure so the roster
 * page still renders gracefully.
 */
async function loadFractionalExecs(): Promise<FractionalExec[]> {
    try {
        const supabase = await createClient()

        const { data: rows } = await supabase
            .from("profiles")
            .select(
                "id, full_name, email, headline, provider_profiles(is_active, is_public, out_of_office, headline, day_rate, currency)",
            )
            .eq("is_fractional_executive", true)
            .eq("is_active", true)
            .limit(100)

        if (!rows) return []

        type Row = {
            id: string
            full_name: string | null
            email: string | null
            headline: string | null
            provider_profiles:
                | {
                      is_active: boolean | null
                      is_public: boolean | null
                      out_of_office: boolean | null
                      headline: string | null
                      day_rate: number | null
                      currency: string | null
                  }
                | Array<{
                      is_active: boolean | null
                      is_public: boolean | null
                      out_of_office: boolean | null
                      headline: string | null
                      day_rate: number | null
                      currency: string | null
                  }>
                | null
        }

        return (rows as Row[]).map(r => {
            // Supabase returns embedded relations as array for 1:many, object for 1:1.
            // provider_profiles.user_id is unique per user, so at most one row —
            // normalise both shapes to the single object we want.
            const pp = Array.isArray(r.provider_profiles)
                ? r.provider_profiles[0] ?? null
                : r.provider_profiles
            return {
                id: r.id,
                name:
                    r.full_name?.trim() ||
                    (r.email ? r.email.split("@")[0] : "Fractional Executive"),
                headline: pp?.headline?.trim() || r.headline?.trim() || null,
                dayRate: pp?.day_rate ?? null,
                currency: pp?.currency ?? null,
                status: deriveStatus(pp),
            }
        })
    } catch {
        return []
    }
}

export default async function ForgeV2ExpertsPage(): Promise<React.ReactNode> {
    const execs = await loadFractionalExecs()
    const availableCount = execs.filter(e => e.status === "available").length

    // Copy shown under the section header varies by how many real execs
    // are on the network — small numbers get an honest "growing" line
    // rather than silently rendering a near-empty grid.
    const execsSubhead =
        execs.length === 0
            ? null
            : execs.length < 5
            ? `Our fractional exec roster is growing — ${execs.length} onboarded so far${
                  availableCount > 0 ? `, ${availableCount} available now` : ""
              }.`
            : `${execs.length} on the network${
                  availableCount > 0 ? ` · ${availableCount} available now` : ""
              }.`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: "Experts" },
            ]}
            subtitle="Your bench of AI specialists and fractional executives"
        >
            {/* Summary strip */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-md bg-international-orange/10 text-international-orange shrink-0">
                        <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange mb-1">
                            Your bench
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">
                            <strong className="font-semibold tabular-nums">{SPECIALISTS.length}</strong> AI specialists always on
                            {execs.length > 0 ? (
                                <>
                                    {" "}
                                    plus{" "}
                                    <strong className="font-semibold tabular-nums">
                                        {execs.length}
                                    </strong>{" "}
                                    fractional {execs.length === 1 ? "executive" : "executives"} on the Fractional Forge network
                                </>
                            ) : (
                                <> · our fractional executive roster is being assembled</>
                            )}
                            . Click any profile to brief them with project context.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* AI Specialists */}
            <section aria-labelledby="specialists-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <Users className="h-4 w-4 text-international-orange" />
                    <h2
                        id="specialists-heading"
                        className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                        AI Specialists ({SPECIALISTS.length})
                    </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SPECIALISTS.map(s => (
                        <SpecialistCard key={s.id} specialist={s} />
                    ))}
                </div>
            </section>

            {/* Fractional Executives */}
            <section aria-labelledby="execs-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <UserCircle2 className="h-4 w-4 text-international-orange" />
                    <h2
                        id="execs-heading"
                        className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                        Fractional Executives{execs.length > 0 ? ` (${execs.length})` : ""}
                    </h2>
                </div>
                {execsSubhead && (
                    <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                        {execsSubhead}
                    </p>
                )}
                {execs.length === 0 ? (
                    <Card className="rounded-xl border border-dashed bg-muted/30">
                        <CardContent className="py-10 px-5 flex flex-col items-center text-center gap-3">
                            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-international-orange/10 text-international-orange">
                                <UserCircle2 className="h-5 w-5" />
                            </span>
                            <div className="space-y-1 max-w-md">
                                <p className="text-sm font-semibold text-foreground">
                                    Coming soon
                                </p>
                                <p className="text-[13px] text-muted-foreground leading-relaxed">
                                    Our fractional executive network is being assembled. Real
                                    humans with hardware pedigree, available to brief alongside
                                    your AI specialists.
                                </p>
                            </div>
                            <Button asChild size="sm" variant="outline" className="mt-1">
                                <Link href="mailto:hello@fractionalforge.com?subject=Fractional%20exec%20network">
                                    Contact us to be on the list
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {execs.map(e => (
                            <FractionalExecCard key={e.id} exec={e} />
                        ))}
                    </div>
                )}
            </section>
        </WorkspaceShell>
    )
}

// ─── Cards ──────────────────────────────────────────────────────────

function SpecialistCard({ specialist }: { specialist: Specialist }): React.ReactElement {
    const avatar = specialist.avatarImage ?? `/images/specialists/${specialist.id}.png`
    return (
        <Link
            href={`/the-forge-v2/experts/${specialist.id}`}
            className={cn(
                "group flex items-start gap-4 p-5 rounded-xl border bg-background shadow-sm",
                "transition-all hover:shadow-md hover:-translate-y-0.5",
            )}
        >
            <div className="relative h-14 w-14 rounded-full overflow-hidden bg-muted shrink-0 border border-border/50">
                <Image
                    src={avatar}
                    alt={specialist.name}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="56px"
                />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="text-base font-semibold text-foreground tracking-tight">
                        {specialist.name}
                    </h3>
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide bg-international-orange/10 text-international-orange border-international-orange/30 shrink-0">
                        {specialist.title}
                    </Badge>
                </div>
                <p className="text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                    {specialist.tagline}
                </p>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] text-muted-foreground uppercase tracking-wide">
                        {specialist.department}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-international-orange group-hover:underline">
                        View profile <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                </div>
            </div>
        </Link>
    )
}

function FractionalExecCard({ exec }: { exec: FractionalExec }): React.ReactElement {
    const initials = exec.name
        .split(/\s+/)
        .slice(0, 2)
        .map(s => s[0]?.toUpperCase() ?? "")
        .join("") || "FE"

    const isAvailable = exec.status === "available"
    const statusLabel = isAvailable ? "Available" : "Joining soon"
    // Two colour vocabularies, both from the existing semantic-token set
    // already used elsewhere on /the-forge-v2 — no new tokens introduced.
    const statusClass = isAvailable
        ? "bg-success/10 text-success border-success/30"
        : "bg-muted text-muted-foreground border-border"

    const currencySymbol = exec.currency === "USD" ? "$" : exec.currency === "EUR" ? "€" : "£"
    const rateLine =
        exec.dayRate != null
            ? `${currencySymbol}${exec.dayRate.toLocaleString()}/day`
            : "Day rate on request"

    return (
        <Link
            href={`/the-forge-v2/experts/${exec.id}`}
            className={cn(
                "group flex items-start gap-4 p-5 rounded-xl border bg-background shadow-sm",
                "transition-all hover:shadow-md hover:-translate-y-0.5",
            )}
        >
            <div className="relative h-14 w-14 rounded-full overflow-hidden shrink-0 bg-international-orange/10 text-international-orange flex items-center justify-center text-base font-bold">
                {initials}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="text-base font-semibold text-foreground tracking-tight min-w-0 truncate">
                        {exec.name}
                    </h3>
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide shrink-0",
                            statusClass,
                        )}
                    >
                        {statusLabel}
                    </Badge>
                </div>
                <p className="text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                    {exec.headline ??
                        "Fractional executive on the Fractional Forge network. Profile details coming as they finish onboarding."}
                </p>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] text-muted-foreground uppercase tracking-wide truncate">
                        {rateLine}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-international-orange group-hover:underline shrink-0">
                        View profile <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                </div>
            </div>
        </Link>
    )
}

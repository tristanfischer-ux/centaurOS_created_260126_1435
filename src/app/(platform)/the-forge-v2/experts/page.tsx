/**
 * @file experts/page.tsx — /the-forge-v2/experts
 *
 * @description Cross-project Experts roster. Lists the 13 in-product AI
 * specialists (from SPECIALISTS in @/lib/agents/specialists-config) plus
 * any fractional-executive profiles in the current foundry. Each card
 * links to the Expert profile drill-in at /the-forge-v2/experts/[id].
 *
 * Mockup reference: FORGE-MOCKUP-EXPERTS.html.
 *
 * @related
 * - Data (specialists): @/lib/agents/specialists-config
 * - Data (fractional execs): foundry profiles with role = 'Executive'
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
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Experts · The Forge",
        description: "In-product specialists and fractional executives available to your foundry.",
    }
}

// ─── Fractional exec model ────────────────────────────────────────

interface FractionalExec {
    id: string
    name: string
    email: string | null
    role: string
}

/**
 * Loads the caller's foundry profiles with role 'Executive'. Returns an
 * empty array on any failure (no foundry resolved, RLS blocks, query
 * error) so the roster page can still render gracefully.
 */
async function loadFractionalExecs(): Promise<FractionalExec[]> {
    try {
        const supabase = await createClient()
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id
        if (!userId) return []

        const { data: me } = await supabase
            .from("profiles")
            .select("foundry_id")
            .eq("id", userId)
            .maybeSingle()
        const foundryId = (me as { foundry_id?: string | null } | null)?.foundry_id
        if (!foundryId) return []

        const { data: rows } = await supabase
            .from("profiles")
            .select("id, full_name, email, role")
            .eq("foundry_id", foundryId)
            .eq("role", "Executive")

        if (!rows) return []
        return rows.map(r => {
            const rec = r as { id: string; full_name: string | null; email: string | null; role: string }
            return {
                id: rec.id,
                name: rec.full_name?.trim() || (rec.email ? rec.email.split("@")[0] : "Fractional Executive"),
                email: rec.email,
                role: rec.role,
            }
        })
    } catch {
        return []
    }
}

export default async function ForgeV2ExpertsPage(): Promise<React.ReactNode> {
    const execs = await loadFractionalExecs()

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: "Experts" },
            ]}
            subtitle="13 in-product specialists · fractional executives from your foundry"
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
                            <strong className="font-semibold tabular-nums">{SPECIALISTS.length}</strong> in-product specialists
                            {execs.length > 0 && (
                                <> plus <strong className="font-semibold tabular-nums">{execs.length}</strong> fractional {execs.length === 1 ? "executive" : "executives"} on your foundry</>
                            )}
                            . Click any profile to brief them with project context.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* In-product specialists */}
            <section aria-labelledby="specialists-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <Users className="h-4 w-4 text-international-orange" />
                    <h2 id="specialists-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        In-product specialists · always on
                    </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SPECIALISTS.map(s => (
                        <SpecialistCard key={s.id} specialist={s} />
                    ))}
                </div>
            </section>

            {/* Fractional execs */}
            <section aria-labelledby="execs-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <UserCircle2 className="h-4 w-4 text-international-orange" />
                    <h2 id="execs-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Fractional executives · humans on your foundry
                    </h2>
                </div>
                {execs.length === 0 ? (
                    <Card className="rounded-xl border border-dashed bg-muted/30">
                        <CardContent className="py-8 px-5 text-center text-sm text-muted-foreground">
                            No fractional executives on this foundry yet. Invite one from Team to surface them here.
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
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide bg-teal-50 text-teal-700 border-teal-300 shrink-0">
                        {exec.role}
                    </Badge>
                </div>
                <p className="text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                    Fractional executive on your foundry — pair them with in-product specialists on briefs that need human judgement.
                </p>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] text-muted-foreground uppercase tracking-wide truncate">
                        {exec.email ?? "Foundry member"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-international-orange group-hover:underline shrink-0">
                        View profile <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                </div>
            </div>
        </Link>
    )
}

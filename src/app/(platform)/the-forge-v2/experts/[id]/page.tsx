/**
 * @file experts/[id]/page.tsx — /the-forge-v2/experts/:id
 *
 * @description Expert profile drill-in. The id can be either an in-product
 * SpecialistId (e.g. "strategist") or a profile UUID for a fractional-
 * executive user on the caller's foundry. We resolve in that order and
 * fall back to notFound() if neither matches.
 *
 * Mockup reference: FORGE-MOCKUP-EXPERT-PROFILE.html.
 *
 * @related
 * - Data (specialists): @/lib/agents/specialists-config
 * - Data (fractional execs): foundry profiles with role = 'Executive'
 * - Ask CTA: @/components/specialists/ask-specialist-button
 * - Shell: ../../_components/workspace-shell
 */

import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    Sparkles,
    UserCircle2,
    Users,
    Target,
    Quote,
    ArrowRight,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { SPECIALISTS, getSpecialistById } from "@/lib/agents/specialists-config"
import type { Specialist } from "@/lib/agents/specialists-config"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../_components/workspace-shell"

export const dynamic = "force-dynamic"

// ─── UUID detection ────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const specialist = getSpecialistById(id)
    if (specialist) {
        return {
            title: `${specialist.name} · ${specialist.title} · The Forge`,
            description: specialist.tagline,
        }
    }
    if (UUID_RE.test(id)) {
        const exec = await loadFractionalExec(id)
        if (exec) {
            return {
                title: `${exec.name} · Fractional Executive · The Forge`,
                description: `${exec.name} — fractional executive on your foundry.`,
            }
        }
    }
    return { title: "Expert profile · The Forge" }
}

// ─── Fractional exec loader ────────────────────────────────────────

interface FractionalExec {
    id: string
    name: string
    email: string | null
    role: string
}

async function loadFractionalExec(id: string): Promise<FractionalExec | null> {
    try {
        const supabase = await createClient()
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id
        if (!userId) return null
        const { data: me } = await supabase
            .from("profiles")
            .select("foundry_id")
            .eq("id", userId)
            .maybeSingle()
        const foundryId = (me as { foundry_id?: string | null } | null)?.foundry_id
        if (!foundryId) return null

        const { data: row } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, foundry_id")
            .eq("id", id)
            .eq("foundry_id", foundryId)
            .maybeSingle()
        if (!row) return null
        const rec = row as { id: string; full_name: string | null; email: string | null; role: string }
        return {
            id: rec.id,
            name: rec.full_name?.trim() || (rec.email ? rec.email.split("@")[0] : "Fractional Executive"),
            email: rec.email,
            role: rec.role,
        }
    } catch {
        return null
    }
}

// ─── Page ──────────────────────────────────────────────────────────

export default async function ForgeV2ExpertProfilePage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // 1. Specialist by id
    const specialist = getSpecialistById(id)
    if (specialist) {
        return <SpecialistProfile specialist={specialist} />
    }

    // 2. Fractional executive by profile UUID
    if (UUID_RE.test(id)) {
        const exec = await loadFractionalExec(id)
        if (exec) {
            return <FractionalExecProfile exec={exec} />
        }
    }

    notFound()
}

// ─── Specialist profile ────────────────────────────────────────────

function SpecialistProfile({ specialist }: { specialist: Specialist }): React.ReactElement {
    const avatar = specialist.avatarImage ?? `/images/specialists/${specialist.id}.png`
    const areaChips = (specialist.highlights ?? []).slice(0, 4)
    const signature = specialist.personality?.voice?.signaturePhrases ?? []
    const reports = SPECIALISTS.filter(s => s.reportsTo === specialist.id)

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: "Experts", href: "/the-forge-v2/experts" },
                { label: specialist.name },
            ]}
            subtitle={`${specialist.title} · ${specialist.department}`}
            secondary={
                <AskSpecialistButton
                    specialistId={specialist.id}
                    specialistName={specialist.name}
                    variant="button"
                    label={`Ask ${specialist.name}`}
                    context={{
                        type: "general",
                        title: `${specialist.name} · ${specialist.title}`,
                        description: specialist.tagline,
                    }}
                />
            }
        >
            {/* Hero */}
            <Card className="rounded-xl border overflow-hidden">
                <CardContent className="py-6 px-6 flex items-start gap-5 flex-wrap">
                    <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted border border-border/50 shrink-0">
                        <Image src={avatar} alt={specialist.name} fill unoptimized className="object-cover" sizes="96px" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap mb-1">
                            <h2 className="text-2xl font-bold text-foreground tracking-tight">{specialist.name}</h2>
                            <span className="text-sm text-muted-foreground">· {specialist.title}</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed italic mb-3">&ldquo;{specialist.tagline}&rdquo;</p>
                        {areaChips.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {areaChips.map((chip, i) => (
                                    <Badge key={i} variant="outline" className="text-[10.5px] font-medium bg-international-orange/10 text-international-orange border-international-orange/30">
                                        {chip}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Bio */}
            <section aria-labelledby="bio-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <UserCircle2 className="h-4 w-4 text-international-orange" />
                    <h2 id="bio-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        About {specialist.name}
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-5 px-5">
                        <p className="text-sm text-foreground leading-relaxed mb-4">{specialist.description}</p>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">How I work:</strong> {specialist.workingStyle}
                        </p>
                    </CardContent>
                </Card>
            </section>

            {/* Key strengths */}
            <section aria-labelledby="strengths-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <Target className="h-4 w-4 text-international-orange" />
                    <h2 id="strengths-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Key strengths
                    </h2>
                </div>
                {specialist.highlights && specialist.highlights.length > 0 ? (
                    <Card className="rounded-xl border">
                        <CardContent className="py-4 px-5">
                            <ul className="space-y-0">
                                {specialist.highlights.map((h, i) => (
                                    <li
                                        key={i}
                                        className={cn(
                                            "flex items-start gap-3 py-2.5",
                                            i < (specialist.highlights?.length ?? 0) - 1 && "border-b border-border/40",
                                        )}
                                    >
                                        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-international-orange/10 text-international-orange text-[10.5px] font-bold tabular-nums shrink-0 mt-0.5">
                                            {i + 1}
                                        </span>
                                        <p className="text-sm text-foreground leading-relaxed flex-1">{h}</p>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="rounded-xl border border-dashed bg-muted/30">
                        <CardContent className="py-4 px-5 text-sm text-muted-foreground italic">
                            Capability highlights are being refined.
                        </CardContent>
                    </Card>
                )}
            </section>

            {/* Signature phrases */}
            {signature.length > 0 && (
                <section aria-labelledby="signature-heading" className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-international-orange" />
                        <Quote className="h-4 w-4 text-international-orange" />
                        <h2 id="signature-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            How {specialist.name} sounds in conversation
                        </h2>
                    </div>
                    <Card className="rounded-xl border bg-gradient-to-br from-international-orange/[0.03] to-muted/30">
                        <CardContent className="py-5 px-5">
                            <ul className="space-y-2.5">
                                {signature.slice(0, 4).map((q, i) => (
                                    <li key={i} className="text-sm text-foreground leading-relaxed italic">
                                        &ldquo;{q}&rdquo;
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </section>
            )}

            {/* Reports */}
            {reports.length > 0 && (
                <section aria-labelledby="reports-heading" className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-international-orange" />
                        <Users className="h-4 w-4 text-international-orange" />
                        <h2 id="reports-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Specialists {specialist.name} collaborates with
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {reports.map(r => (
                            <Link
                                key={r.id}
                                href={`/the-forge-v2/experts/${r.id}`}
                                className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-background hover:bg-muted/30 hover:shadow-sm transition-all group"
                            >
                                <div className="relative h-10 w-10 rounded-full overflow-hidden bg-muted shrink-0 border border-border/50">
                                    <Image src={r.avatarImage ?? `/images/specialists/${r.id}.png`} alt={r.name} fill unoptimized className="object-cover" sizes="40px" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground leading-tight">{r.name}</p>
                                    <p className="text-[11.5px] text-muted-foreground line-clamp-1">{r.title}</p>
                                </div>
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Ask CTA — bottom-of-page re-entry */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-5 flex items-start gap-3 flex-wrap">
                    <span className="flex items-center justify-center w-10 h-10 rounded-md bg-international-orange/10 text-international-orange shrink-0">
                        <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange mb-1">
                            Ready to brief {specialist.name}?
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">
                            Pass the brief in context. {specialist.name} will reference your projects, objectives, and numbers — not a generic template.
                        </p>
                    </div>
                    <div className="shrink-0">
                        <AskSpecialistButton
                            specialistId={specialist.id}
                            specialistName={specialist.name}
                            variant="button"
                            label={`Ask ${specialist.name}`}
                            context={{
                                type: "general",
                                title: `${specialist.name} · ${specialist.title}`,
                                description: specialist.tagline,
                            }}
                        />
                    </div>
                </CardContent>
            </Card>
        </WorkspaceShell>
    )
}

// ─── Fractional exec profile ───────────────────────────────────────

function FractionalExecProfile({ exec }: { exec: FractionalExec }): React.ReactElement {
    const initials = exec.name
        .split(/\s+/)
        .slice(0, 2)
        .map(s => s[0]?.toUpperCase() ?? "")
        .join("") || "FE"

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: "Experts", href: "/the-forge-v2/experts" },
                { label: exec.name },
            ]}
            subtitle={`Fractional ${exec.role} · foundry member`}
        >
            {/* Hero */}
            <Card className="rounded-xl border overflow-hidden">
                <CardContent className="py-6 px-6 flex items-start gap-5 flex-wrap">
                    <div className="flex items-center justify-center h-24 w-24 rounded-full shrink-0 bg-international-orange/10 text-international-orange text-xl font-bold border border-border/50">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap mb-1">
                            <h2 className="text-2xl font-bold text-foreground tracking-tight">{exec.name}</h2>
                            <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide bg-teal-50 text-teal-700 border-teal-300">
                                {exec.role}
                            </Badge>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed mb-3">
                            Fractional executive on your foundry. Pair with in-product specialists on briefs that need human judgement.
                        </p>
                        {exec.email && (
                            <p className="text-[12.5px] text-muted-foreground">
                                <strong className="text-foreground">Reach them:</strong>{" "}
                                <a href={`mailto:${exec.email}`} className="text-international-orange font-medium hover:underline">
                                    {exec.email}
                                </a>
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* About placeholder */}
            <section aria-labelledby="exec-about-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <UserCircle2 className="h-4 w-4 text-international-orange" />
                    <h2 id="exec-about-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        About
                    </h2>
                </div>
                <Card className="rounded-xl border border-dashed bg-muted/30">
                    <CardContent className="py-6 px-5 text-sm text-muted-foreground italic leading-relaxed">
                        Rich profiles for foundry executives (bio, portfolio, references, match breakdown) ship
                        alongside the recruits marketplace. For now: collaborate with {exec.name} directly, or
                        loop them into any brief from Team.
                    </CardContent>
                </Card>
            </section>

            {/* Collaboration CTAs */}
            <section aria-labelledby="exec-collaborate-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <Users className="h-4 w-4 text-international-orange" />
                    <h2 id="exec-collaborate-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Ways to collaborate
                    </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {exec.email && (
                        <Button asChild size="sm" variant="outline" className="gap-1.5 justify-between w-full">
                            <a href={`mailto:${exec.email}`}>
                                Email {exec.name.split(" ")[0]}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </a>
                        </Button>
                    )}
                    <Button asChild size="sm" variant="outline" className="gap-1.5 justify-between w-full">
                        <Link href="/the-forge-v2/experts">
                            Back to experts roster
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </Button>
                </div>
            </section>
        </WorkspaceShell>
    )
}

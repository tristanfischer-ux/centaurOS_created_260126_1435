/**
 * @file specialists/[specialistId]/page.tsx — /the-forge-v2/projects/:id/specialists/:specialistId
 *
 * @description Ask-Specialist artefact — mockup-faithful port of
 * FORGE-MOCKUP-ASK-SPECIALIST.html. Server component resolves the project
 * from loadCadLabProject and the specialist from the canonical roster
 * (src/lib/agents/specialists-config.ts). All interaction is read-only for
 * V1 — the chat runtime ships separately. We never fabricate specialist
 * quotes or history; every field is sourced from the specialist registry
 * or rendered as "—".
 *
 * Empty-state policy:
 * - Unknown specialistId → notFound()
 * - Missing project → notFound()
 * - Missing tagline / philosophy → "—"
 * - No prior conversations → honest "ships next round" copy
 *
 * @related
 *   - View:     ./ask-specialist-view.tsx
 *   - Styles:   ./ask-specialist-v2.css (scoped .as2)
 *   - Mockup:   FORGE-MOCKUP-ASK-SPECIALIST.html
 *   - Registry: src/lib/agents/specialists-config.ts
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { getSpecialistById, type Specialist } from "@/lib/agents/specialists-config"

import { AskSpecialistView, type AskSpecialistViewProps } from "./ask-specialist-view"

export const dynamic = "force-dynamic"

// ─── Baseline voice-consistency scores ──────────────────────────────────
// Sourced from CLAUDE.md § Baseline Scores (April 5, 2026). These are static
// benchmark outputs, not personal data — safe to inline so the chip renders
// with the canonical number the founder will recognise from the spec.
const VOICE_SCORES: Record<string, number> = {
    "strategist": 4.67,
    "cto": 4.85,
    "vp-engineering": 4.85,
    "vp-manufacturing": 4.50,
    "vp-supply-chain": 4.60,
    "product-lead": 4.40,
    "growth-marketer": 4.45,
    "sales-lead": 4.65,
    "chief-of-staff": 4.55,
    "finance-lead": 4.50,
    "fundraising-advisor": 4.70,
    "hiring-team": 4.35,
    "legal-counsel": 4.65,
}

// ─── Tailored question suggestions per specialist ───────────────────────
// Short lookup so the suggestions row in the compose box feels specific to
// the specialist the founder opened — not a generic list. 3-4 per specialist.
const SUGGESTIONS: Record<string, string[]> = {
    "strategist": [
        "What would have to be true for this to work?",
        "Which three things should we kill to focus?",
        "Can we decide this today?",
    ],
    "cto": [
        "What's the simplest thing that could work?",
        "Where's the technical risk we're underestimating?",
        "First-principles — what are we actually solving?",
    ],
    "vp-engineering": [
        "What's the single biggest schedule risk?",
        "Which module is blocking everything else?",
        "Where does the critical path actually live?",
    ],
    "vp-manufacturing": [
        "What's the biggest supply-chain risk on this BOM?",
        "Where would you dual-source?",
        "What's the path to first article in 72 hours?",
        "Which tolerance is too tight for the volume?",
    ],
    "vp-supply-chain": [
        "Where are we single-sourced today?",
        "What's the longest lead item and why?",
        "Which supplier should we qualify as backup first?",
    ],
    "product-lead": [
        "What's the one user we're building for?",
        "Which feature is a distraction right now?",
        "What can we cut to ship sooner?",
    ],
    "growth-marketer": [
        "What's the cheapest way to get the first 100 users?",
        "Where's our audience actually paying attention?",
        "What would make one channel compound?",
    ],
    "sales-lead": [
        "What's the sharpest offer we could put out this week?",
        "Which objection costs us the most deals?",
        "Where's the fastest path to a paid pilot?",
    ],
    "chief-of-staff": [
        "What's the one thing I should do this week?",
        "Which decision am I avoiding?",
        "What's the next handoff I need to unblock?",
    ],
    "finance-lead": [
        "How much runway do we actually have?",
        "What's the margin-of-safety we're burning?",
        "Which cost would I kill first if I had to?",
    ],
    "fundraising-advisor": [
        "Are we ready to raise right now?",
        "What's the single weakest slide in our deck?",
        "Which investor should we talk to first?",
    ],
    "hiring-team": [
        "Who's the most important hire right now?",
        "What would I delegate first?",
        "Where's the culture debt I should address?",
    ],
    "legal-counsel": [
        "Where are we most exposed today?",
        "Which clause should never leave our template?",
        "What's the cheapest risk we should close first?",
    ],
}

const DEFAULT_SUGGESTIONS = [
    "What's the one thing I should do next?",
    "Where am I wrong on this?",
    "What would you do first?",
]

// ─── Metadata ───────────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; specialistId: string }> },
): Promise<Metadata> {
    const { id, specialistId } = await params
    const specialist = getSpecialistById(specialistId)
    const r = await loadCadLabProject(id)
    if (!specialist || "error" in r) {
        return { title: "Ask a specialist · The Forge" }
    }
    return {
        title: `Ask ${specialist.name} · ${r.project.name}`,
        description: `Scoped specialist chat with ${r.project.name}'s context pre-loaded for ${specialist.name} (${specialist.title}).`,
    }
}

// ─── Page ───────────────────────────────────────────────────────────────

export default async function ForgeV2AskSpecialistPage({
    params,
}: {
    params: Promise<{ id: string; specialistId: string }>
}): Promise<React.ReactNode> {
    const { id, specialistId } = await params

    // Resolve specialist first — unknown id is a 404 before any DB work.
    const specialist: Specialist | undefined = getSpecialistById(specialistId)
    if (!specialist) notFound()

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // ── Context roll-up — mirrors the ask/page.tsx shape ─────────
    const moduleCount = modules.length
    const failureModeCount = modules.reduce(
        (sum, m) => sum + (m.failureModes?.length ?? 0),
        0,
    )
    const unknownCount = modules.reduce(
        (sum, m) => sum + (m.unknowns?.length ?? 0),
        0,
    )

    // ── Specialist-facing fields (never fabricated) ──────────────
    const initials = initialsFrom(specialist.name)
    const voiceScore = VOICE_SCORES[specialist.id] ?? null
    const suggestions = SUGGESTIONS[specialist.id] ?? DEFAULT_SUGGESTIONS

    // Philosophy is a real field from the personality backstory — surface it
    // honestly as the "how they think" quote. Fall back to null → "—" if the
    // override strips it.
    const philosophy =
        specialist.personality?.backstory?.philosophy?.trim() || null

    const viewProps: AskSpecialistViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        specialist: {
            id: specialist.id,
            name: specialist.name,
            title: specialist.title,
            tagline: specialist.tagline?.trim() || null,
            description: specialist.description?.trim() || null,
            highlights: specialist.highlights ?? [],
            philosophy,
            initials,
            modelTier: specialist.modelTier,
            voiceScore,
        },
        context: {
            moduleCount,
            failureModeCount,
            unknownCount,
        },
        suggestions,
    }

    return <AskSpecialistView {...viewProps} />
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Two-letter uppercase initials from a specialist's display name.
 * "Fang" → "FA", "Chief of Staff" → "CH".
 */
function initialsFrom(name: string): string {
    const cleaned = name.trim()
    if (!cleaned) return "—"
    const parts = cleaned.split(/\s+/)
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return cleaned.slice(0, 2).toUpperCase()
}

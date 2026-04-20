/**
 * @file specialists/[id]/page.tsx — /the-forge-v2/specialists/:id
 *
 * @description Global specialist profile — mockup-faithful port of
 * FORGE-MOCKUP-EXPERT-PROFILE.html. Server component resolves the specialist
 * from the canonical roster (src/lib/agents/specialists-config.ts). This is
 * the directory entry: bio, expertise, philosophy, rules of engagement,
 * track record across projects. Distinct from the project-scoped
 * /projects/[id]/specialists/[specialistId] surface which is ask-in-context.
 *
 * Empty-state policy:
 * - Unknown specialistId → notFound()
 * - Missing tagline / description / workingStyle / philosophy → "—"
 * - No ask history (we don't track it yet) → honest empty state
 * - No recent conversations (chat runtime not shipped) → honest empty state
 *
 * @related
 *   - View:     ./expert-profile-view.tsx
 *   - Styles:   ./expert-profile-v2.css (scoped .epf2)
 *   - Mockup:   FORGE-MOCKUP-EXPERT-PROFILE.html
 *   - Registry: src/lib/agents/specialists-config.ts
 *   - Sibling:  /the-forge-v2/projects/[id]/specialists/[specialistId] (ask-in-context)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getSpecialistById, type Specialist } from "@/lib/agents/specialists-config"

import { ExpertProfileView, type ExpertProfileViewProps } from "./expert-profile-view"

export const dynamic = "force-dynamic"

// ─── Baseline voice-consistency scores ──────────────────────────────────
// Sourced from CLAUDE.md § Baseline Scores (April 5, 2026). These are static
// benchmark outputs, not personal data — safe to inline so the hero renders
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

// ─── Metadata ───────────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const specialist = getSpecialistById(id)
    if (!specialist) {
        return { title: "Specialist profile · The Forge" }
    }
    return {
        title: `${specialist.name} · ${specialist.title} · The Forge`,
        description: specialist.tagline,
    }
}

// ─── Page ───────────────────────────────────────────────────────────────

export default async function ForgeV2SpecialistProfilePage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    const specialist: Specialist | undefined = getSpecialistById(id)
    if (!specialist) notFound()

    const initials = initialsFrom(specialist.name)
    const voiceScore = VOICE_SCORES[specialist.id] ?? null

    // Philosophy is a real field from the personality backstory — surface it
    // honestly as the "how they think" quote. Fall back to null → hidden.
    const philosophy =
        specialist.personality?.backstory?.philosophy?.trim() || null

    // Rules of engagement live inside the personality interaction style.
    // They are the standing constraints compiled into every prompt, so
    // showing them here is the most honest possible view of "how this
    // specialist operates".
    const rulesOfEngagement: string[] =
        specialist.personality?.interactionStyle?.rulesOfEngagement ?? []

    const viewProps: ExpertProfileViewProps = {
        specialist: {
            id: specialist.id,
            name: specialist.name,
            title: specialist.title,
            tagline: specialist.tagline?.trim() || null,
            description: specialist.description?.trim() || null,
            workingStyle: specialist.workingStyle?.trim() || null,
            highlights: specialist.highlights ?? [],
            philosophy,
            rulesOfEngagement,
            initials,
            modelTier: specialist.modelTier,
            voiceScore,
            department: specialist.department?.trim() || null,
            inspiredBy: specialist.inspiredBy?.trim() || null,
        },
    }

    return <ExpertProfileView {...viewProps} />
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

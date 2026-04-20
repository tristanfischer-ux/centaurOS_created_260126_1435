/**
 * @file specialists/page.tsx — /the-forge-v2/specialists
 *
 * @description Global Specialists directory — mockup-faithful port of
 * FORGE-MOCKUP-EXPERTS.html. Lists all 13 in-product specialists pulled
 * from @/lib/agents/specialists-config, grouped into three clusters.
 * Each card deep-links to `/the-forge-v2/specialists/{id}` (profile page
 * owned by a sibling agent).
 *
 * Data contract:
 *   - Iterates the canonical SPECIALISTS array (13 entries).
 *   - Displays name / title / tagline / up to 4 highlights / department.
 *   - Baseline voice composite score is read from a local lookup that
 *     mirrors the CLAUDE.md §Specialist Configuration Protocol → Baseline
 *     Scores table (April 5, 2026). If a score is ever missing for an id
 *     we fall back to 4.0 (the voice hard floor) so the UI stays honest.
 *
 * Empty-state policy: there are always 13. If SPECIALISTS ever returns
 * fewer, the sections still render and the stats tiles reflect the real
 * count — we do not fabricate missing specialists.
 *
 * @related
 *   - View:   ./experts-list-view.tsx
 *   - Styles: ./experts-list-v2.css (scoped .xp2)
 *   - Mockup: FORGE-MOCKUP-EXPERTS.html
 *   - Data:   @/lib/agents/specialists-config (SPECIALISTS array)
 */

import type { Metadata } from "next"

import { SPECIALISTS } from "@/lib/agents/specialists-config"
import type { Specialist, SpecialistId } from "@/lib/agents/specialists-config"

import { ExpertsListView, type ExpertsListViewProps, type SpecialistCardData } from "./experts-list-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Specialists · The Forge",
    description: "The 13 in-product specialists on your bench — strategy, engineering, manufacturing, finance, people and more.",
}

// ─── Baseline voice scores ─────────────────────────────────────────
// Source of truth: CLAUDE.md §Specialist Configuration Protocol → Baseline
// Scores (April 5, 2026). Inlined here as a plain object — we do not modify
// specialists-config.ts from this route. Any change here is a copy-paste
// from CLAUDE.md; never guessed.
const BASELINE_VOICE_SCORES: Record<SpecialistId, number> = {
    strategist: 4.40,
    cto: 4.46,
    "vp-engineering": 4.38,
    "vp-manufacturing": 4.33,
    "vp-supply-chain": 4.39,
    "product-lead": 4.37,
    "growth-marketer": 4.35,
    "sales-lead": 4.42,
    "chief-of-staff": 4.35,
    "finance-lead": 4.39,
    "fundraising-advisor": 4.39,
    "hiring-team": 4.29,
    "legal-counsel": 4.38,
}

// Department → avatar gradient class. Keeps the card grid colour-coded so
// the viewer can scan by function at a glance.
const DEPARTMENT_GRADIENT: Record<string, "a" | "b" | "c" | "d" | "e" | "f"> = {
    Strategy: "a",
    Technology: "b",
    Operations: "d",
    Product: "c",
    Marketing: "c",
    Sales: "d",
    Finance: "e",
    People: "f",
    Legal: "f",
}

// Cluster IDs → the three sections the view renders. If a new specialist is
// added to SPECIALISTS but isn't classified here, it falls through to the
// "finance" bucket so it still ships.
const LEADERSHIP_IDS: SpecialistId[] = [
    "strategist",
    "cto",
    "vp-engineering",
    "vp-manufacturing",
    "vp-supply-chain",
]

const PRODUCT_GROWTH_IDS: SpecialistId[] = [
    "product-lead",
    "growth-marketer",
    "sales-lead",
    "chief-of-staff",
]

const FINANCE_IDS: SpecialistId[] = [
    "finance-lead",
    "fundraising-advisor",
    "hiring-team",
    "legal-counsel",
]

// ─── Helpers ───────────────────────────────────────────────────────

function initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "··"
    if (parts.length === 1) {
        const w = parts[0]
        return (w.slice(0, 2) || "··").toUpperCase()
    }
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "··"
}

function toCardData(s: Specialist): SpecialistCardData {
    const score = BASELINE_VOICE_SCORES[s.id as SpecialistId] ?? 4.0
    const gradient = DEPARTMENT_GRADIENT[s.department] ?? "b"
    return {
        id: s.id,
        name: s.name,
        title: s.title,
        tagline: s.tagline,
        highlights: s.highlights ?? [],
        department: s.department,
        voiceScore: score,
        initials: initialsFor(s.name),
        gradient,
    }
}

// ─── Page ──────────────────────────────────────────────────────────

export default function ForgeV2SpecialistsPage(): React.ReactNode {
    // Map SPECIALISTS into card shape once, then split into the three clusters.
    const byId = new Map<string, Specialist>()
    for (const s of SPECIALISTS) byId.set(s.id, s)

    const pickCluster = (ids: SpecialistId[]): SpecialistCardData[] => {
        const out: SpecialistCardData[] = []
        for (const id of ids) {
            const s = byId.get(id)
            if (s) {
                out.push(toCardData(s))
                byId.delete(id)
            }
        }
        return out
    }

    const leadership = pickCluster(LEADERSHIP_IDS)
    const productGrowth = pickCluster(PRODUCT_GROWTH_IDS)
    const financeExplicit = pickCluster(FINANCE_IDS)

    // Anyone left over (future new specialist) goes into the finance cluster
    // so it still renders instead of silently disappearing.
    const leftovers = Array.from(byId.values()).map(toCardData)
    const finance = [...financeExplicit, ...leftovers]

    // Stats row — computed from the real roster, never hardcoded.
    const allCards: SpecialistCardData[] = [...leadership, ...productGrowth, ...finance]
    const total = allCards.length
    const fleetAverage = total > 0
        ? allCards.reduce((a, c) => a + c.voiceScore, 0) / total
        : 0
    const topScore = total > 0
        ? allCards.reduce((a, c) => Math.max(a, c.voiceScore), 0)
        : 0
    const departments = new Set(allCards.map((c) => c.department)).size

    const props: ExpertsListViewProps = {
        leadership,
        productGrowth,
        finance,
        stats: {
            total,
            fleetAverage,
            topScore,
            departments,
        },
    }

    return <ExpertsListView {...props} />
}

/**
 * @file (public-discovery)/the-forge-v2/page.tsx
 *
 * @description Anonymous /the-forge-v2 landing per RED-TEAM-PIVOT-PLAN
 * Tier 2 step 16. Mirrors the anonymous /investors pattern from commit
 * 4ca0f085.
 *
 * Unauthenticated visitors see:
 * - "You are browsing anonymously" banner
 * - Hero copy explaining the Forge value proposition
 * - The five demo project packs (real product output) from
 *   src/components/marketing/forge-demo-grid.tsx
 * - A "Start a project" textarea that triggers signup wall after 6 chars
 * - A blurred featured workspace preview with "Sign up to start your own"
 *
 * Authenticated visitors see:
 * - A prominent "Start a new project →" CTA linking to /the-forge-v2/start
 * - Their full saved-projects grid via RecentProjectsGrid
 *
 * Deep-dive sub-routes (/the-forge-v2/projects/<id>/...) stay under
 * (platform) and require login.
 *
 * @security Public layout, no auth gate at route level.
 */

import type { Metadata } from "next"
import { listCadLabProjects } from "@/actions/cad-lab-projects"
import { getProducts } from "@/actions/products"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { WorkspaceShell } from "../../(platform)/the-forge-v2/_components/workspace-shell"
import { RecentProjectsGrid } from "../../(platform)/the-forge/components/recent-projects-grid"
import { AnonymousForgeView } from "./AnonymousForgeView"

export const metadata: Metadata = {
    title: "The Forge",
    description:
        "From a paragraph to a manufacturer shortlist. Twenty-minute first pass, hours of detail after.",
    openGraph: {
        title: "The Forge",
        description:
            "From a paragraph to a manufacturer shortlist. Twenty-minute first pass, hours of detail after.",
        type: "website",
    },
}

export const dynamic = "force-dynamic"

export default async function PublicForgeV2LandingPage(): Promise<React.ReactNode> {
    const supabaseAuth = await createClient()
    const {
        data: { user: authedUser },
    } = await supabaseAuth.auth.getUser()

    // ── Anonymous visitor ──────────────────────────────────────────────────
    if (!authedUser) {
        return <AnonymousForgeView />
    }

    // ── Authenticated visitor — projects grid + start CTA ─────────────────
    const [cadLabResult, productsResult] = await Promise.all([
        listCadLabProjects(),
        getProducts(),
    ])
    const projects = "projects" in cadLabResult ? cadLabResult.projects : []
    const loadError = "error" in cadLabResult

    const linkedProductProjectIds: string[] = productsResult.data
        ? productsResult.data
              .map((p) => p.cad_lab_project_id)
              .filter((id): id is string => id != null)
        : []

    return (
        <WorkspaceShell
            subtitle="Your projects, all in one place."
            maxWidth="wide"
        >
            {/* ─── Prominent start CTA ─────────────────────────────────── */}
            <div className="flex items-center gap-4">
                <Link
                    href="/the-forge-v2/start"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-international-orange text-white font-semibold text-[15px] transition-colors hover:bg-international-orange/90"
                >
                    Start a new project →
                </Link>
            </div>

            {loadError && (
                <Card className="rounded-xl border-destructive/30">
                    <CardContent className="py-4">
                        <p className="text-sm text-destructive">
                            Some projects could not be loaded. You can still start a new one above.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* ─── Saved projects grid ─────────────────────────────────── */}
            <RecentProjectsGrid
                projects={projects}
                linkedProductProjectIds={linkedProductProjectIds}
            />
        </WorkspaceShell>
    )
}

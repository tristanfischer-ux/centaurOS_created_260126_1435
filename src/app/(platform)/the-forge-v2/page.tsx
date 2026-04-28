/**
 * @file page.tsx — The Forge V2 home: saved projects + start CTA
 *
 * @description Shows the founder's saved project grid with a prominent
 * "Start a new project" call to action linking to /the-forge-v2/start.
 * Reuses the existing RecentProjectsGrid component — no logic duplicated.
 *
 * @related
 * - RecentProjectsGrid: src/app/(platform)/the-forge/components/recent-projects-grid.tsx
 * - Start page: src/app/(platform)/the-forge-v2/start/page.tsx
 */

import React, { Suspense } from "react"
import Link from "next/link"

import { Skeleton } from "@/components/ui/skeleton"
import { listCadLabProjects } from "@/actions/cad-lab-projects"
import { getProducts } from "@/actions/products"
import { RecentProjectsGrid } from "@/app/(platform)/the-forge/components/recent-projects-grid"

import type { Metadata } from "next"
import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "The Forge",
  description: "Your saved projects and one-click autopilot launch",
  openGraph: {
    title: "The Forge | ForgeOS",
    description: "Your saved projects and one-click autopilot launch",
    type: "website",
  },
}

// ─── Loading skeleton ─────────────────────────────────────────────────

function LoadingSkeleton(): React.ReactNode {
  return (
    <div className="max-w-[820px] mx-auto px-6 py-8 pb-16">
      <div className="border-l-[5px] border-[#ff4500] pl-4 mb-6">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-12 w-52 rounded-lg mb-10" />
      <div className="space-y-4">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Data-fetching server component ──────────────────────────────────

async function ForgeV2ProjectList(): Promise<React.ReactNode> {
  const [cadLabResult, productsResult] = await Promise.all([
    listCadLabProjects(),
    getProducts(),
  ])

  const projects: CadLabProjectSummary[] =
    "projects" in cadLabResult ? cadLabResult.projects : []

  const linkedProductProjectIds: string[] = productsResult.data
    ? productsResult.data
        .map((p) => p.cad_lab_project_id)
        .filter((id): id is string => id != null)
    : []

  return (
    <div className="max-w-[820px] mx-auto px-6 py-8 pb-16">
      {/* Page header */}
      <header className="border-l-[5px] border-[#ff4500] pl-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">
          The Forge
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Your projects, all in one place.
        </p>
      </header>

      {/* Prominent start CTA */}
      <Link
        href="/the-forge-v2/start"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#ff4500] text-white font-semibold text-[15px] mb-10 transition-colors hover:bg-[#e63d00]"
      >
        Start a new project →
      </Link>

      {/* Saved projects grid */}
      {projects.length === 0 ? (
        <div className="rounded-xl bg-muted/30 py-12 px-8 flex flex-col items-center text-center">
          <p className="text-sm font-semibold text-foreground mb-1">No projects yet</p>
          <p className="text-xs text-muted-foreground">
            Your designs will appear here once you start building.
          </p>
        </div>
      ) : (
        <RecentProjectsGrid
          projects={projects}
          linkedProductProjectIds={linkedProductProjectIds}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function ForgeV2Page(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ForgeV2ProjectList />
    </Suspense>
  )
}

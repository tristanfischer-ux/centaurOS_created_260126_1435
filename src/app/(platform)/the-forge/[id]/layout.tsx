/**
 * @file layout.tsx — Shared layout for Forge project sub-pages
 *
 * @description Loads the forge project from DB, wraps children in
 * ForgeProjectProvider, and renders the stage sub-navigation bar.
 * All stage pages (/concept, /dossier, /people, etc.) share this layout.
 *
 * @security Project loading uses withAuth via loadScanAction (RLS)
 *
 * @related
 * - Provider: src/app/(platform)/the-forge/components/forge-project-context.tsx
 * - Sub-nav: src/app/(platform)/the-forge/components/forge-sub-nav.tsx
 */

import React, { Suspense } from "react"
import { notFound } from "next/navigation"

import { loadScanAction } from "@/actions/xray"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

import { ForgeProjectProvider } from "../components/forge-project-context"
import { ForgeSubNav } from "../components/forge-sub-nav"
import { ForgeProjectHeader } from "../components/forge-project-header"

import type { ForgeProject, ForgeStage } from "../components/forge-project-context"

// ─── Layout ──────────────────────────────────────────────────────────

interface ForgeProjectLayoutProps {
  children: React.ReactNode
  params: Promise<unknown>
}

/**
 * ForgeProjectLayout — Shared layout for all forge project stage pages.
 *
 * @description Server component that loads the project from DB, then
 * wraps children in ForgeProjectProvider with the loaded data.
 */
export default async function ForgeProjectLayout({
  children,
  params,
}: ForgeProjectLayoutProps): Promise<React.ReactNode> {
  const { id } = (await params) as { id: string }

  // Load project from DB
  const result = await loadScanAction(id)

  if ("error" in result) {
    notFound()
  }

  const project: ForgeProject = {
    scanId: result.scanId,
    spec: result.spec,
    name: result.name,
    stage: result.stage as ForgeStage,
    idea: result.idea,
    status: result.status,
    thumbnailUrl: result.thumbnailUrl,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  }

  return (
    <ForgeProjectProvider initialProject={project}>
      <div className="space-y-6">
        {/* Project header with name and idea */}
        <ForgeProjectHeader />

        {/* Stage sub-navigation */}
        <ForgeSubNav projectId={id} spec={result.spec} />

        {/* Active stage page */}
        <Suspense
          fallback={
            <div className="h-96 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </ForgeProjectProvider>
  )
}

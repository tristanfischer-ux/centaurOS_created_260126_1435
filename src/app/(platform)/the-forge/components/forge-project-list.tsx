/**
 * @file forge-project-list.tsx — Grid of forge project cards
 *
 * @description Server component that loads all projects for the current
 * foundry and renders them as clickable cards with stage badges,
 * module counts, and a context menu for delete/copy actions.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/page.tsx
 * - Actions: src/actions/xray.ts (listScansAction, deleteScanAction, copyScanAction)
 * - Card client: ./forge-project-card.tsx
 */

import React from "react"
import Link from "next/link"

import { Plus } from "lucide-react"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

import { listScansAction } from "@/actions/xray"
import { ForgeProjectCard } from "./forge-project-card"

// ─── Component ───────────────────────────────────────────────────────

/**
 * ForgeProjectList — Server component that loads and displays all projects.
 *
 * @description Fetches projects from DB and renders a grid of cards.
 * Each card links to the project's current stage page and has a
 * context menu with delete and copy actions.
 */
export async function ForgeProjectList(): Promise<React.ReactNode> {
  const result = await listScansAction()

  if ("error" in result) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    )
  }

  const { scans } = result

  return (
    <div className="space-y-8">
      <PageHeader projectCount={scans.length} />

      {scans.length === 0 ? (
        <EmptyState
          title="No forge projects yet"
          description="Create your first product concept to generate an engineering dossier with 3D models, specs, and build plans."
          action={
            <Button asChild>
              <Link href="/the-forge/new">
                <Plus className="h-4 w-4 mr-2" />
                Create Concept
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scans.map((scan) => (
            <ForgeProjectCard key={scan.id} scan={scan} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────────────────

function PageHeader({ projectCount }: { projectCount?: number }): React.ReactNode {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
      <div className="min-w-0 flex-1">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>The Forge</h1>
        </div>
        <p className={cn(typography.pageSubtitle, "mt-1")}>
          Turn product ideas into buildable engineering dossiers
          {projectCount !== undefined && projectCount > 0 && (
            <span className="text-muted-foreground"> — {projectCount} project{projectCount !== 1 ? "s" : ""}</span>
          )}
        </p>
      </div>

      <Button asChild>
        <Link href="/the-forge/new">
          <Plus className="h-4 w-4 mr-2" />
          Create Concept
        </Link>
      </Button>
    </div>
  )
}

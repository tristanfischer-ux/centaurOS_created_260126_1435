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

import { ArrowRight, Sparkles, Plus, Gamepad2 } from "lucide-react"

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
        <CadLabEntrypoint />
        <AssemblyBuilderEntrypoint />
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    )
  }

  const { scans } = result

  return (
    <div className="space-y-8">
      <PageHeader projectCount={scans.length} />
      <CadLabEntrypoint />
      <AssemblyBuilderEntrypoint />

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

function CadLabEntrypoint(): React.ReactNode {
  return (
    <div className="rounded-xl border border-international-orange/30 bg-gradient-to-r from-international-orange-light/30 via-background to-background p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-international-orange">
            <Sparkles className="h-3.5 w-3.5" />
            Recommended path
          </p>
          <h2 className="text-lg font-semibold text-foreground">Design-to-RFQ Lab</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Start here for the end-to-end flow: guided design intake, CAD generation,
            supplier packet exports, and one-click Marketplace RFQ creation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="whitespace-nowrap">
            <Link href="/the-forge/cad-lab">
              Open Design-to-RFQ Lab
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="whitespace-nowrap">
            <Link href="/the-forge/new">Open Legacy Concept Flow</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function AssemblyBuilderEntrypoint(): React.ReactNode {
  return (
    <div className="rounded-xl border border-electric-blue/30 bg-gradient-to-r from-electric-blue-light/30 via-background to-background p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-electric-blue">
            <Gamepad2 className="h-3.5 w-3.5" />
            Visual builder
          </p>
          <h2 className="text-lg font-semibold text-foreground">Assembly Builder</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Pick a design skeleton and fill its component slots from our library of 256+ parametric parts —
            like equipping a character in an RPG.
          </p>
        </div>
        <Button asChild variant="outline" className="whitespace-nowrap border-electric-blue text-electric-blue hover:bg-electric-blue hover:text-white">
          <Link href="/the-forge/assembly-builder">
            Open Assembly Builder
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </Button>
      </div>
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

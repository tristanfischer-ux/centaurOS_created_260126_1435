/**
 * @file forge-project-list.tsx — Grid of forge project cards
 *
 * @description Server component that loads all projects for the current
 * foundry and renders them as clickable cards with stage badges and
 * module counts. Includes empty state and "New Scan" CTA.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/page.tsx
 * - Actions: src/actions/xray.ts (listScansAction)
 */

import React from "react"
import Link from "next/link"

import { Plus, Flame, Lightbulb, Wrench, Users, Truck, FileText, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

import { listScansAction } from "@/actions/xray"

// ─── Stage Display Config ────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "success" | "warning" | "info" }> = {
  concept: { label: "Concept", icon: Lightbulb, variant: "secondary" },
  dossier: { label: "Dossier", icon: Wrench, variant: "info" },
  people: { label: "People", icon: Users, variant: "warning" },
  supply_chain: { label: "Supply Chain", icon: Truck, variant: "default" },
  contracting: { label: "Contracting", icon: FileText, variant: "success" },
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ForgeProjectList — Server component that loads and displays all projects.
 *
 * @description Fetches projects from DB and renders a grid of cards.
 * Each card links to the project's current stage page.
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
          description="Scan your first product idea to create an engineering dossier with 3D models, specs, and build plans."
          action={
            <Button asChild>
              <Link href="/the-forge/new">
                <Plus className="h-4 w-4 mr-2" />
                New Scan
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scans.map((scan) => {
            const stageConfig = STAGE_CONFIG[scan.stage] || STAGE_CONFIG.concept
            const StageIcon = stageConfig.icon
            const displayName = scan.name || scan.idea.slice(0, 60)
            const stageSegment = scan.stage === "supply_chain" ? "supply-chain" : scan.stage

            return (
              <Link key={scan.id} href={`/the-forge/${scan.id}/${stageSegment}`}>
                <Card className="group cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5">
                  {/* Thumbnail or gradient placeholder */}
                  <div className="h-32 rounded-t-xl overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50 relative">
                    {scan.thumbnailUrl ? (
                      <img
                        src={scan.thumbnailUrl}
                        alt={`${displayName} blueprint`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Flame className="h-10 w-10 text-international-orange/30" />
                      </div>
                    )}

                    {/* Stage badge overlay */}
                    <div className="absolute top-3 right-3">
                      <Badge variant={stageConfig.variant} className="gap-1">
                        <StageIcon className="h-3 w-3" />
                        {stageConfig.label}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="pt-4">
                    <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-international-orange transition-colors">
                      {displayName}
                    </h3>

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{scan.moduleCount} modules</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(scan.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
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
          Scan product ideas into buildable engineering dossiers
          {projectCount !== undefined && projectCount > 0 && (
            <span className="text-muted-foreground"> — {projectCount} project{projectCount !== 1 ? "s" : ""}</span>
          )}
        </p>
      </div>

      <Button asChild>
        <Link href="/the-forge/new">
          <Plus className="h-4 w-4 mr-2" />
          New Scan
        </Link>
      </Button>
    </div>
  )
}

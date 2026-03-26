/**
 * @file forge-project-list.tsx — The Forge landing page
 *
 * @description Server component that renders the main launchpad for The Forge.
 * Presents a single starting path (description-based AI pipeline),
 * a destination callout, and a grid of recent CAD Lab projects.
 * If the user has an in-progress project, a "Continue where you left off"
 * card appears at the top.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/page.tsx
 * - Actions: src/actions/cad-lab-projects.ts (listCadLabProjects)
 */

import React from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

import {
  ArrowRight,
  Sparkles,
  PlayCircle,
  PenTool,
  Search,
  Box,
  ClipboardCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import { FORGE_ROUTES, cadLabProjectUrl } from "@/lib/forge-routes"
import { listCadLabProjects } from "@/actions/cad-lab-projects"
import { PageTour } from "@/components/guidance/page-tour"
import { RecentProjectsGrid } from "./recent-projects-grid"
import { ForgeScreenContext } from "./forge-screen-context"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

// ─── Stage Display Config ───────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "info" }> = {
  draft: { label: "Draft", variant: "secondary" },
  researched: { label: "Researched", variant: "info" },
  interface_ready: { label: "Building", variant: "warning" },
  generated: { label: "Generated", variant: "success" },
  complete: { label: "Complete", variant: "success" },
}

// ─── Starting Path Definitions ──────────────────────────────────────

interface PipelineStage {
  label: string
  icon: LucideIcon
}

interface StartingPath {
  icon: LucideIcon
  iconBg: string
  iconColor: string
  accentBorder: string
  headline: string
  description: string
  href: string
  cta: string
  /** Output deliverables shown as compact tags */
  outputs: string[]
  /** Optional pipeline stages shown as compact stepper (AI Pipeline card only) */
  pipelineStages?: PipelineStage[]
}

const STARTING_PATHS: StartingPath[] = [
  {
    icon: Sparkles,
    iconBg: "bg-international-orange-light",
    iconColor: "text-international-orange",
    accentBorder: "border-l-international-orange",
    headline: "Start from a description",
    description: "Describe your product and get research, CAD models, analysis, and a supplier-ready package.",
    href: `${FORGE_ROUTES.cadLab}?new`,
    cta: "Start designing",
    outputs: ["3D CAD", "STEP files", "Engineering report", "DFM analysis", "RFQ package"],
    pipelineStages: [
      { label: "Concept", icon: Search },
      { label: "Build", icon: Box },
      { label: "Review", icon: ClipboardCheck },
    ],
  },
]

// ─── Component ───────────────────────────────────────────────────────

/**
 * ForgeProjectList — Server component: The Forge landing page.
 *
 * @description Fetches CAD Lab projects from DB and renders the launchpad
 * with a starting-path card, a destination callout, and a grid of recent projects.
 */
export async function ForgeProjectList(): Promise<React.ReactNode> {
  const cadLabResult = await listCadLabProjects()

  const hasLoadError = "error" in cadLabResult
  const projects: CadLabProjectSummary[] = "projects" in cadLabResult ? cadLabResult.projects : []

  // Find the most recently updated in-progress project for "Continue" card
  // projects is pre-sorted by updated_at DESC from the server, but we sort
  // explicitly here so the behavior is correct regardless of server ordering.
  const inProgressProject = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .find((p) => p.status !== "complete" && p.status !== "rfq_created")

  const hasRecent = projects.length > 0

  return (
    <div className="space-y-10">
      <ForgeScreenContext
        projects={projects}
        hasInProgressProject={!!inProgressProject}
      />
      <PageHeader />

      {hasLoadError && (
        <div className="rounded-lg border border-status-warning bg-status-warning-light/20 p-4 text-sm text-foreground">
          Some recent projects couldn&apos;t be loaded. Your starting paths still work — you can create a new design below.
        </div>
      )}

      {inProgressProject && <ContinueCard project={inProgressProject} />}
      <div data-tour="forge-start">
        <StartingPointsSection />
      </div>

      <div data-tour="forge-projects">
        {!hasRecent ? (
          <div className="space-y-8">
            <div className="rounded-xl bg-muted/30 py-12 px-8 flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-international-orange-light mb-5">
                <PenTool className="h-7 w-7 text-international-orange" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No designs yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Pick a starting point above to create your first engineering package.
              </p>
            </div>
          </div>
        ) : (
          <RecentProjectsGrid projects={projects} />
        )}
      </div>

      <PageTour page="the-forge" />
    </div>
  )
}

// ─── Continue Card ────────────────────────────────────────────────────

/**
 * ContinueCard — Prominent card to resume the most recent in-progress project.
 * Only rendered when an active project exists.
 */
function ContinueCard({ project }: { project: CadLabProjectSummary }): React.ReactNode {
  const stageLabel = STAGE_CONFIG[project.status]?.label ?? project.status

  let timeAgo = ""
  try {
    timeAgo = formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })
  } catch {
    // Graceful fallback — show card without time
  }

  return (
    <Link
      href={cadLabProjectUrl(project.id)}
      className="group flex items-center gap-4 rounded-xl border-2 border-international-orange/20 bg-international-orange-light/30 p-5 transition-all hover:border-international-orange/40 hover:shadow-md"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-international-orange text-white">
        <PlayCircle className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Continue where you left off
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {project.subject || project.name || "Untitled Project"}
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          {stageLabel}
          {timeAgo && (
            <>
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              {timeAgo}
            </>
          )}
        </p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-international-orange transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

// ─── Starting Points Section ──────────────────────────────────────────

/**
 * StartingPointsSection — Single starting-path card plus a destination callout.
 */
function StartingPointsSection(): React.ReactNode {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Get started
        </p>
        <p className="text-sm text-muted-foreground">
          Describe your product and we&apos;ll build a supplier-ready engineering package.
        </p>
      </div>

      <div className="grid grid-cols-1 max-w-lg gap-4">
        {STARTING_PATHS.map((path) => (
          <StartingPathCard key={path.href} path={path} />
        ))}
      </div>

    </div>
  )
}

/**
 * StartingPathCard — Single starting-path card.
 */
function StartingPathCard({ path }: { path: StartingPath }): React.ReactNode {
  const Icon = path.icon

  return (
    <Link
      href={path.href}
      className={cn(
        "group flex flex-col gap-4 rounded-xl border border-l-4 bg-background p-5 transition-all",
        "hover:shadow-md hover:-translate-y-0.5",
        path.accentBorder,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", path.iconBg)}>
          <Icon className={cn("h-4 w-4", path.iconColor)} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-foreground group-hover:text-inherit leading-tight">
            {path.headline}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 mt-0.5" />
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {path.description}
      </p>

      {/* Output deliverables */}
      <div className="flex flex-wrap gap-1.5">
        {path.outputs.map((output) => (
          <span key={output} className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
            {output}
          </span>
        ))}
      </div>

      {path.pipelineStages && path.pipelineStages.length > 0 && (
        <div className="flex items-center gap-0.5" aria-label="Pipeline stages">
          {path.pipelineStages.map((stage, index) => {
            const Icon = stage.icon
            return (
              <React.Fragment key={stage.label}>
                {index > 0 && (
                  <div className="h-0.5 w-2 flex-shrink-0 bg-muted rounded" aria-hidden />
                )}
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  title={stage.label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </React.Fragment>
            )
          })}
        </div>
      )}

      <div className="mt-auto">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", path.iconColor)}>
          {path.cta}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  )
}

// ─── Page Header ─────────────────────────────────────────────────────

function PageHeader(): React.ReactNode {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
      <div className="min-w-0 flex-1">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>The Forge</h1>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
            Alpha
          </span>
        </div>
        <p className={cn(typography.pageSubtitle, "mt-1")}>
          Turn product ideas into manufacturing-ready engineering packages
        </p>
      </div>
    </div>
  )
}


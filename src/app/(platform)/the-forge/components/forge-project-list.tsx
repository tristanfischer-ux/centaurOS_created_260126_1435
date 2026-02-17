/**
 * @file forge-project-list.tsx — The Forge landing page
 *
 * @description Server component that renders the main launchpad for The Forge.
 * Presents a single focused hero CTA to start the design pipeline,
 * a pipeline preview showing the 5 stages, a secondary Assembly Builder
 * link, and a grid of recent projects. If the user has an in-progress
 * pipeline project, a "Continue where you left off" card appears.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/page.tsx
 * - Actions: src/actions/xray.ts (listScansAction, deleteScanAction, copyScanAction)
 * - Card client: ./forge-project-card.tsx
 */

import React from "react"
import Link from "next/link"

import {
  ArrowRight,
  Sparkles,
  Plus,
  Search,
  Box,
  BarChart3,
  ShoppingCart,
  ClipboardCheck,
  Blocks,
} from "lucide-react"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

import { listScansAction } from "@/actions/xray"
import { ForgeProjectCard } from "./forge-project-card"

// ─── Pipeline Stage Definitions (for preview) ──────────────────────────

const PIPELINE_STAGES = [
  { label: "Research", icon: Search, description: "AI-powered engineering research" },
  { label: "Build", icon: Box, description: "Parametric CAD generation" },
  { label: "Analysis", icon: BarChart3, description: "Engineering analysis" },
  { label: "Procurement", icon: ShoppingCart, description: "Supply chain & costing" },
  { label: "Review", icon: ClipboardCheck, description: "Supplier-ready package" },
] as const

// ─── Component ───────────────────────────────────────────────────────

/**
 * ForgeProjectList — Server component: The Forge landing page.
 *
 * @description Fetches projects from DB and renders the launchpad with
 * hero CTA, pipeline preview, Assembly Builder link, and project grid.
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
    <div className="space-y-10">
      <PageHeader />
      <HeroSection />
      <PipelinePreview />
      <AssemblyBuilderLink />

      {scans.length === 0 ? (
        <EmptyState
          title="No designs yet"
          description="Start your first design to generate a full engineering package — 3D models, specs, analysis, and procurement-ready files."
          action={
            <Button asChild>
              <Link href="/the-forge/cad-lab">
                <Sparkles className="h-4 w-4 mr-2" />
                Start Your First Design
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Recent Projects
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {scans.length} project{scans.length !== 1 ? "s" : ""}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scans.map((scan) => (
              <ForgeProjectCard key={scan.id} scan={scan} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Hero Section ─────────────────────────────────────────────────────

/**
 * HeroSection — Single focused CTA to start the design pipeline.
 */
function HeroSection(): React.ReactNode {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-international-orange-light/40 via-background to-electric-blue-light/20 p-8 sm:p-10">
      <div className="relative z-10 max-w-xl space-y-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-international-orange/10 px-3 py-1 text-xs font-semibold text-international-orange">
          <Sparkles className="h-3 w-3" />
          AI-Powered Engineering Pipeline
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
          Turn a product idea into a
          <br />
          <span className="text-international-orange">manufacturing-ready package</span>
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Describe what you want to build. The Forge researches, generates parametric
          CAD models, runs engineering analysis, and produces supplier-ready documentation
          — all in one pipeline.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button asChild size="lg" className="gap-2">
            <Link href="/the-forge/cad-lab">
              Start New Design
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
      {/* Subtle decorative background element */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-international-orange/5 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-8 -right-8 h-48 w-48 rounded-full bg-electric-blue/5 blur-3xl" aria-hidden />
    </div>
  )
}

// ─── Pipeline Preview ─────────────────────────────────────────────────

/**
 * PipelinePreview — Shows the 5-stage pipeline as a horizontal stepper.
 */
function PipelinePreview(): React.ReactNode {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        The Pipeline
      </p>
      <div className="flex items-start gap-0 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage, index) => {
          const Icon = stage.icon
          return (
            <React.Fragment key={stage.label}>
              {index > 0 && (
                <div className="h-0.5 flex-1 min-w-4 mt-[17px] bg-muted" aria-hidden />
              )}
              <div className="flex flex-col items-center gap-1.5 min-w-[80px] sm:min-w-[100px]">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-foreground whitespace-nowrap">
                  {stage.label}
                </span>
                <span className="hidden text-[11px] text-muted-foreground text-center leading-tight sm:block max-w-[100px]">
                  {stage.description}
                </span>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ─── Assembly Builder Link ────────────────────────────────────────────

/**
 * AssemblyBuilderLink — Secondary link to the Assembly Builder.
 */
function AssemblyBuilderLink(): React.ReactNode {
  return (
    <Link
      href="/the-forge/assembly-builder"
      className="group flex items-center justify-between rounded-xl border p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-electric-blue-light text-electric-blue">
          <Blocks className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Assembly Builder</p>
          <p className="text-xs text-muted-foreground">
            Pick a design skeleton and fill its slots with 256+ parametric parts
          </p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
        </div>
        <p className={cn(typography.pageSubtitle, "mt-1")}>
          Turn product ideas into manufacturing-ready engineering packages
        </p>
      </div>

      <Button asChild>
        <Link href="/the-forge/cad-lab">
          <Plus className="h-4 w-4 mr-2" />
          New Design
        </Link>
      </Button>
    </div>
  )
}

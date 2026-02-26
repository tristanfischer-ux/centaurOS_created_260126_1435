"use client"

/**
 * @file cad-lab-layout-client.tsx — Client-side layout wrapper for The Forge.
 *
 * @description Renders the CadLabProvider, persistent header with project
 * picker Dialog, pipeline stepper navigation, progress overlay, and milestone
 * celebration banners. This client component is referenced by layout.tsx
 * (a server component that also exports maxDuration).
 */

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Loader2,
  FolderOpen,
  Save,
  Factory,
  Trash2,
  Clock,
  Plus,
  ChevronRight,
  Info,
  Store,
  X,
  ShieldAlert,
  AlertCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CadLabProgress } from "@/components/cad/cad-lab-progress"
import { CadLabMilestone } from "@/components/cad/cad-lab-milestone"
import { SECTOR_LABELS } from "@/types/foundry"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { CadLabProvider, useCadLab } from "./cad-lab-context"
import { CadLabNav, CadLabBottomNav } from "./cad-lab-nav"
import { formatRelativeTime } from "./cad-lab-utils"

export function CadLabProviderWrapper({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <CadLabProvider>
      <CadLabLayoutShell>{children}</CadLabLayoutShell>
    </CadLabProvider>
  )
}

// ─── Stage label mapping for breadcrumbs ────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  "": "Concept",
  build: "Build",
  review: "Review",
  mashup: "Mashup Lab",
  templates: "Template Library",
}

/**
 * Derives the current pipeline stage label from the URL pathname.
 */
function getCurrentStageLabel(pathname: string): string {
  const segment = pathname.replace(FORGE_ROUTES.cadLab, "").replace(/^\//, "").split("/")[0]
  return STAGE_LABELS[segment] ?? "Concept"
}

/** Mashup Lab and Template Library are standalone tools, not pipeline stages. */
function isMashupOrTemplates(pathname: string): boolean {
  return pathname.includes("/mashup") || pathname.includes("/templates")
}

function CadLabLayoutShell({ children }: { children: React.ReactNode }): React.ReactNode {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    // Header
    sector, subject,
    activeProjectId, isSaving, lastSaved, saveError,
    showProjects, setShowProjects, refreshProjects,
    // Projects
    projects, isLoadingProjects,
    handleLoadProject, handleDeleteProject, handleReset,
    // Progress
    progressLines, isResearching, isDecomposing, isBatchRunning, generatingModuleIds,
    // Milestone
    milestone, setMilestone,
    // Post-research idle detection
    hasResearch, modules,
  } = useCadLab()

  // Load project only when explicitly requested via ?project=<id>.
  // Bare /the-forge/cad-lab always starts with a blank form (safe default).
  const projectParam = searchParams.get("project")
  useEffect(() => {
    if (projectParam) {
      handleLoadProject(projectParam)
    }
  }, [projectParam, handleLoadProject])

  const isAnyActive = isResearching || isDecomposing || isBatchRunning || generatingModuleIds.size > 0
  const currentStageLabel = getCurrentStageLabel(pathname)

  // Auto-dismiss the research milestone banner after 8s (other milestones stay until dismissed)
  useEffect(() => {
    if (milestone !== "research") return
    const timer = setTimeout(() => setMilestone(null), 8000)
    return () => clearTimeout(timer)
  }, [milestone, setMilestone])

  // Dismissible disclaimer state — persisted in localStorage
  const DISCLAIMER_KEY = "forge-disclaimer-dismissed"
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(true) // default hidden to avoid flash
  useEffect(() => {
    setDisclaimerDismissed(localStorage.getItem(DISCLAIMER_KEY) === "true")
  }, [])
  const handleDismissDisclaimer = useCallback(() => {
    localStorage.setItem(DISCLAIMER_KEY, "true")
    setDisclaimerDismissed(true)
  }, [])

  return (
    <div className="space-y-6 pb-16">
      {/* ── Header (consolidated: breadcrumb + title + badges in 2 rows) ── */}
      <div className="pb-4 border-b border-muted space-y-2">
        {/* Row 1: Breadcrumb + save status + projects */}
        <div className="flex items-center justify-between">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            <Link
              href={FORGE_ROUTES.home}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              The Forge
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            {isMashupOrTemplates(pathname) ? (
              <span className="text-foreground font-medium">{currentStageLabel}</span>
            ) : (
              <>
                <span className="text-muted-foreground">Pipeline</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-foreground font-medium">{currentStageLabel}</span>
              </>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {activeProjectId && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {isSaving ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
                ) : saveError ? (
                  <><AlertCircle className="h-3 w-3 text-destructive" /> <span className="text-destructive">Save failed</span></>
                ) : lastSaved ? (
                  <><Save className="h-3 w-3 text-status-success" /> Saved</>
                ) : null}
              </span>
            )}
            <Button
              variant={showProjects ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowProjects(!showProjects)
                if (!showProjects) refreshProjects()
              }}
              className="gap-1.5"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Projects{projects.length > 0 ? ` (${projects.length})` : ""}
            </Button>
          </div>
        </div>
        {/* Row 2: Title + inline badges */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">The Forge</h1>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
            Alpha
          </span>
          {sector && (
            <span className="flex items-center gap-1.5 text-xs font-medium bg-international-orange-light text-international-orange px-2.5 py-1 rounded">
              <Factory className="h-3 w-3" />
              {SECTOR_LABELS[sector]}
            </span>
          )}
        </div>
      </div>

      {/* ── Disclaimer: outputs are for exploration, not final; recruit experts via marketplace ── */}
      {disclaimerDismissed ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 text-status-info flex-shrink-0" />
          <span>For exploration only — outputs must be checked by qualified people.</span>
          <Link href="/marketplace" className="text-electric-blue hover:underline whitespace-nowrap">
            Find experts
          </Link>
        </div>
      ) : (
        <Alert variant="default" className="border-status-info bg-status-info-light/30 relative">
          <Info className="h-4 w-4 text-status-info" />
          <AlertTitle className="text-sm font-semibold text-foreground pr-8">
            For exploration only—not final drawings
          </AlertTitle>
          <AlertDescription className="text-sm text-foreground/90">
            The information and drawings from this pipeline are to help you get an idea of the things to think about. They are <strong>not</strong> actual final drawings and <strong>must be checked by qualified people</strong> before use. Recruit relevant experts via the marketplace to validate and finalise your design.
            <div className="mt-2">
              <Button variant="outline" size="sm" className="gap-1.5 border-electric-blue text-electric-blue hover:bg-electric-blue-light/20" asChild>
                <Link href="/marketplace">
                  <Store className="h-3.5 w-3.5" />
                  Find experts in the marketplace
                </Link>
              </Button>
            </div>
          </AlertDescription>
          <button
            onClick={handleDismissDisclaimer}
            className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Dismiss disclaimer"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      {/* ── Project Browser Dialog ── */}
      <Dialog open={showProjects} onOpenChange={setShowProjects}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Saved Projects
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoadingProjects ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12">
                <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No saved projects yet</p>
                <p className="text-xs text-muted-foreground mt-1">Research a product to create your first project.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => {
                        handleLoadProject(p.id)
                        setShowProjects(false)
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-medium text-foreground truncate">{p.subject}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(p.updatedAt)}
                        </span>
                        {p.stage !== "new" && (
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {p.stage}
                          </span>
                        )}
                        {p.status === "active" && (
                          <span className="text-xs font-mono bg-status-success-light text-status-success px-1.5 py-0.5 rounded">
                            active
                          </span>
                        )}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 min-h-[44px] min-w-[44px] flex-shrink-0"
                      onClick={() => handleDeleteProject(p.id)}
                      aria-label={`Delete ${p.subject}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Pipeline stepper nav ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CadLabNav />
        <div className="flex items-center gap-1 self-center sm:self-auto">
          <Link
            href={FORGE_ROUTES.cadLabTemplates}
            className={cn(
              "text-sm font-medium transition-colors rounded-md px-3 py-2",
              pathname === FORGE_ROUTES.cadLabTemplates
                ? "text-international-orange font-semibold bg-orange-50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Template Library
          </Link>
          <Link
            href={FORGE_ROUTES.cadLabMashup}
            className={cn(
              "text-sm font-medium transition-colors rounded-md px-3 py-2",
              pathname === FORGE_ROUTES.cadLabMashup
                ? "text-international-orange font-semibold bg-orange-50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Mashup Lab
          </Link>
        </div>
      </div>

      {/* ── Milestone celebration ── */}
      {milestone && (
        <CadLabMilestone
          milestone={milestone}
          onDismiss={() => setMilestone(null)}
          subject={subject}
        />
      )}

      {/* ── Page content (sub-route) with fade transition ── */}
      <PageTransition>
        {children}
      </PageTransition>

      {/* ── Live progress (below page content so input stays at top; hidden in post-research idle and during decomposition — concept page renders decomposition progress inline) ── */}
      {!(hasResearch && modules.length === 0 && !isAnyActive) && !isDecomposing && (
        <CadLabProgress
          lines={progressLines}
          isActive={isAnyActive}
          operationType={isResearching ? "research" : isBatchRunning ? "batch" : "generate"}
          subject={subject}
        />
      )}

      {/* ── Sticky bottom pipeline nav (pipeline pages only) ── */}
      {!isMashupOrTemplates(pathname) && <CadLabBottomNav />}
    </div>
  )
}

/**
 * PageTransition — subtle fade-in when navigating between pipeline stages.
 *
 * @description Resets opacity to 0 on pathname change, then fades to 1.
 * Reinforces the linear pipeline flow without heavy CSS.
 */
function PageTransition({ children }: { children: React.ReactNode }): React.ReactNode {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // On pathname change, briefly hide then show
    setIsVisible(false)
    const timer = requestAnimationFrame(() => {
      setIsVisible(true)
    })
    return () => cancelAnimationFrame(timer)
  }, [pathname])

  return (
    <div
      className="transition-opacity duration-200 ease-out"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      {children}
    </div>
  )
}

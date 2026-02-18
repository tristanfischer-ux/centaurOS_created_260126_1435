"use client"

/**
 * @file cad-lab-layout-client.tsx — Client-side layout wrapper for The Forge.
 *
 * @description Renders the CadLabProvider, persistent header with project
 * picker Dialog, pipeline stepper navigation, progress overlay, and milestone
 * celebration banners. This client component is referenced by layout.tsx
 * (a server component that also exports maxDuration).
 */

import { useState, useEffect } from "react"
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
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CadLabProgress } from "@/components/cad/cad-lab-progress"
import { CadLabMilestone } from "@/components/cad/cad-lab-milestone"
import { SECTOR_LABELS } from "@/types/foundry"

import { CadLabProvider, useCadLab } from "./cad-lab-context"
import { CadLabNav } from "./cad-lab-nav"
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
  "": "Research",
  build: "Build",
  analysis: "Analysis",
  procurement: "Procurement",
  review: "Review",
}

/**
 * Derives the current pipeline stage label from the URL pathname.
 */
function getCurrentStageLabel(pathname: string): string {
  const segment = pathname.replace("/the-forge/cad-lab", "").replace(/^\//, "").split("/")[0]
  return STAGE_LABELS[segment] ?? "Research"
}

function CadLabLayoutShell({ children }: { children: React.ReactNode }): React.ReactNode {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    // Header
    sector, subject,
    activeProjectId, isSaving, lastSaved,
    showProjects, setShowProjects, refreshProjects,
    // Projects
    projects, isLoadingProjects,
    handleLoadProject, handleDeleteProject,
    // Progress
    progressLines, isResearching, isDecomposing, isBatchRunning, activeModuleId,
    // Milestone
    milestone, setMilestone,
  } = useCadLab()

  // Auto-load project from URL ?project=<id> parameter
  const projectParam = searchParams.get("project")
  useEffect(() => {
    if (projectParam && !activeProjectId) {
      handleLoadProject(projectParam)
    }
  }, [projectParam, activeProjectId, handleLoadProject])

  const isAnyActive = isResearching || isDecomposing || isBatchRunning || activeModuleId !== null
  const currentStageLabel = getCurrentStageLabel(pathname)

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <Link
          href="/the-forge"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          The Forge
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Pipeline</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-foreground font-medium">{currentStageLabel}</span>
      </nav>

      {/* ── Header ── */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-international-orange" />
            <h1 className="text-2xl font-bold text-foreground">The Forge</h1>
            <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
              PIPELINE
            </span>
            {sector && (
              <span className="flex items-center gap-1.5 text-xs font-medium bg-international-orange-light text-international-orange px-2.5 py-1 rounded">
                <Factory className="h-3 w-3" />
                {SECTOR_LABELS[sector]} components active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeProjectId && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {isSaving ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
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
        <p className="text-sm text-muted-foreground mt-2">
          From a single sentence to supplier-ready engineering drawings.
        </p>
      </div>

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
      <CadLabNav />

      {/* ── Milestone celebration ── */}
      {milestone && (
        <CadLabMilestone
          milestone={milestone}
          onDismiss={() => setMilestone(null)}
          subject={subject}
        />
      )}

      {/* ── Live progress ── */}
      <CadLabProgress
        lines={progressLines}
        isActive={isAnyActive}
        operationType={isResearching ? "research" : isDecomposing ? "breakdown" : isBatchRunning ? "batch" : "generate"}
        subject={subject}
      />

      {/* ── Page content (sub-route) with fade transition ── */}
      <PageTransition>
        {children}
      </PageTransition>
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

"use client"

/**
 * @file cad-lab-layout-client.tsx — Client-side layout wrapper for The Forge.
 *
 * @description Initializes CadLabProvider (mounted at platform level) and renders persistent header with project
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
  ShieldAlert,
  AlertCircle,
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

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { useCadLab } from "./cad-lab-context"
import { CadLabNav, CadLabBottomNav } from "./cad-lab-nav"
import { formatRelativeTime } from "./cad-lab-utils"

export function CadLabProviderWrapper({ children }: { children: React.ReactNode }): React.ReactNode {
  const { initialized, initializeCadLab } = useCadLab()

  useEffect(() => {
    if (!initialized) initializeCadLab()
  }, [initialized, initializeCadLab])

  return <CadLabLayoutShell>{children}</CadLabLayoutShell>
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
    progressLines, isResearching, isDecomposing, isBatchRunning, generatingModuleIds, isGeneratingUnified,
    // Milestone
    milestone, setMilestone,
    // Post-research idle detection
    hasResearch, modules,
  } = useCadLab()

  // Load project only when explicitly requested via ?project=<id>.
  // Bare /the-forge/cad-lab always starts with a blank form (safe default).
  const projectParam = searchParams.get("project")
  const isNewParam = searchParams.has("new")

  // When ?new is present (and no ?project=), reset to a blank form.
  // This clears localStorage so auto-restore finds nothing to load.
  useEffect(() => {
    if (isNewParam && !projectParam) {
      handleReset()
    }
  }, [isNewParam, projectParam, handleReset])

  useEffect(() => {
    if (projectParam) {
      handleLoadProject(projectParam)
    }
  }, [projectParam, handleLoadProject])

  const isAnyActive = isResearching || isDecomposing || isBatchRunning || generatingModuleIds.size > 0 || isGeneratingUnified

  // Auto-dismiss the research milestone banner after 8s (other milestones stay until dismissed)
  useEffect(() => {
    if (milestone !== "research") return
    const timer = setTimeout(() => setMilestone(null), 8000)
    return () => clearTimeout(timer)
  }, [milestone, setMilestone])


  return (
    <div className="space-y-6 pb-16">
      {/* ── Header: title + badges + save status + projects ── */}
      <div className="flex items-center justify-between pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">The Forge</h1>
          {sector && (
            <span className="flex items-center gap-1.5 text-xs font-medium bg-international-orange-light text-international-orange px-2.5 py-1 rounded">
              <Factory className="h-3 w-3" />
              {SECTOR_LABELS[sector]}
            </span>
          )}
        </div>
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

      {/* ── Disclaimer: compact one-liner — outputs are for exploration, not final ── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5 text-status-info flex-shrink-0" />
        <span>For exploration only — outputs must be checked by qualified people.</span>
        <Link href="/marketplace" className="text-electric-blue hover:underline whitespace-nowrap">
          Find experts
        </Link>
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CadLabNav />
        {/* Template Library and Mashup Lab hidden for now */}
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

      {/* ── Live progress (below page content so input stays at top; hidden in post-research idle, during decomposition, and on CAD page which has its own progress) ── */}
      {!(hasResearch && modules.length === 0 && !isAnyActive) && !isDecomposing && !pathname.includes("/cad-lab/cad") && (
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

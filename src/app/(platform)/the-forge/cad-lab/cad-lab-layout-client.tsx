"use client"

/**
 * @file cad-lab-layout-client.tsx — Client-side layout wrapper for The Forge.
 *
 * @description Renders the CadLabProvider, persistent header with project
 * picker, pipeline stepper navigation, progress overlay, and milestone
 * celebration banners. This client component is referenced by layout.tsx
 * (a server component that also exports maxDuration).
 */

import {
  Loader2,
  FolderOpen,
  Save,
  Factory,
  Trash2,
  Clock,
  Plus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

function CadLabLayoutShell({ children }: { children: React.ReactNode }): React.ReactNode {
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

  const isAnyActive = isResearching || isDecomposing || isBatchRunning || activeModuleId !== null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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

      {/* ── Project list panel ── */}
      {showProjects && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Saved Projects
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowProjects(false)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingProjects ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8">
                <Plus className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No saved projects yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Research a product to create your first project.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => handleLoadProject(p.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-medium text-foreground truncate">{p.subject}</p>
                      <div className="flex items-center gap-2 mt-0.5">
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
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => handleDeleteProject(p.id)}
                      aria-label={`Delete ${p.subject}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* ── Page content (sub-route) ── */}
      {children}
    </div>
  )
}

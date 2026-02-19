"use client"

/**
 * @file studio-layout.tsx — Wraps the Product Studio in the shared CadLabProvider.
 *
 * DECISION: Reuse the existing CadLabProvider rather than creating a duplicate
 * context. The CAD Lab context already manages all the state we need (research,
 * modules, batch generation, project persistence). The Studio is a new UI shell
 * over the same engine.
 */

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ChevronRight, Info, Store } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CadLabProgress } from "@/components/cad/cad-lab-progress"
import { CadLabMilestone } from "@/components/cad/cad-lab-milestone"

import { CadLabProvider, useCadLab } from "../cad-lab/cad-lab-context"
import { StudioPage } from "./studio-page"

export function StudioProviderWrapper(): React.ReactNode {
  return (
    <CadLabProvider>
      <StudioShell />
    </CadLabProvider>
  )
}

function StudioShell(): React.ReactNode {
  const searchParams = useSearchParams()
  const {
    subject,
    activeProjectId,
    handleLoadProject,
    handleReset,
    progressLines,
    isResearching,
    isDecomposing,
    isBatchRunning,
    activeModuleId,
    milestone,
    setMilestone,
  } = useCadLab()

  const projectParam = searchParams.get("project")
  const newParam = searchParams.get("new")

  useEffect(() => {
    if (newParam === "true") {
      handleReset()
      return
    }
    if (projectParam) {
      handleLoadProject(projectParam)
      return
    }
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem("forgeos:cad-lab:active-project")
        : null
    if (stored && !activeProjectId) {
      handleLoadProject(stored)
    }
  }, [projectParam, newParam, activeProjectId, handleLoadProject, handleReset])

  const isAnyActive =
    isResearching || isDecomposing || isBatchRunning || activeModuleId !== null

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <Link
          href="/the-forge"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          The Forge
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-foreground font-medium">Product Studio</span>
      </nav>

      {/* Header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">Product Studio</h1>
          <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
            BETA
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          From idea to supplier-ready engineering package — one page, one flow.
        </p>
      </div>

      {/* Disclaimer */}
      <Alert variant="default" className="border-status-info bg-status-info-light/30">
        <Info className="h-4 w-4 text-status-info" />
        <AlertTitle className="text-sm font-semibold text-foreground">
          For exploration only — not final drawings
        </AlertTitle>
        <AlertDescription className="text-sm text-foreground/90">
          Outputs help you explore ideas. They{" "}
          <strong>must be checked by qualified people</strong> before use.
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-electric-blue text-electric-blue hover:bg-electric-blue-light/20"
              asChild
            >
              <Link href="/marketplace">
                <Store className="h-3.5 w-3.5" />
                Find experts in the marketplace
              </Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* Milestone celebration */}
      {milestone && (
        <CadLabMilestone
          milestone={milestone}
          onDismiss={() => setMilestone(null)}
          subject={subject}
        />
      )}

      {/* Live progress */}
      <CadLabProgress
        lines={progressLines}
        isActive={isAnyActive}
        operationType={
          isResearching
            ? "research"
            : isDecomposing
              ? "breakdown"
              : isBatchRunning
                ? "batch"
                : "generate"
        }
        subject={subject}
      />

      {/* Main studio page */}
      <StudioPage />
    </div>
  )
}

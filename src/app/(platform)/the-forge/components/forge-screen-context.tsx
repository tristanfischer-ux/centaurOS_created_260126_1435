"use client"

/**
 * @file forge-screen-context.tsx
 *
 * @description Thin client component that registers rich screen context
 * for The Forge landing page. Receives project data as props from the
 * server component and tells specialists what the user is actually looking at.
 *
 * @related
 * - Server component: ./forge-project-list.tsx
 * - Screen context system: src/contexts/screen-context.tsx
 */

import { useMemo } from "react"

import { useRegisterScreenContext } from "@/contexts/screen-context"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

// INTENT: The Forge landing page is a server component that fetches projects.
// This client wrapper bridges the gap so specialists get dynamic context
// about what the user sees — empty state, in-progress projects, or a full grid.

interface ForgeScreenContextProps {
  projects: CadLabProjectSummary[]
  hasInProgressProject: boolean
}

const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  researched: "Researched",
  interface_ready: "Building",
  generated: "Generated",
  complete: "Complete",
}

export function ForgeScreenContext({
  projects,
  hasInProgressProject,
}: ForgeScreenContextProps): null {
  useRegisterScreenContext(
    useMemo(() => {
      if (projects.length === 0) {
        return {
          pageTitle: "The Forge",
          summary: [
            "No designs yet.",
            "The user sees a starting path: 'Start from a description' to create a supplier-ready engineering package.",
          ].join(" "),
        }
      }

      const stageCounts: Record<string, number> = {}
      for (const p of projects) {
        const label = STAGE_LABELS[p.status] ?? p.status
        stageCounts[label] = (stageCounts[label] ?? 0) + 1
      }
      const stageSummary = Object.entries(stageCounts)
        .map(([label, count]) => `${count} ${label}`)
        .join(", ")

      const parts: string[] = []
      parts.push(
        `${projects.length} design project${projects.length !== 1 ? "s" : ""}.`,
      )
      parts.push(`CAD Lab projects: ${stageSummary}.`)
      if (hasInProgressProject) {
        parts.push(
          "A 'Continue where you left off' card is shown for the most recent active project.",
        )
      }
      parts.push("The user can create a new design or open an existing project.")

      const entities = projects.map((p) => ({
        type: "cad-lab-project",
        title: p.subject || p.name || "Untitled Project",
        status: STAGE_LABELS[p.status] ?? p.status,
      }))

      return {
        pageTitle: "The Forge",
        summary: parts.join(" "),
        entities,
      }
    }, [projects, hasInProgressProject]),
  )

  return null
}

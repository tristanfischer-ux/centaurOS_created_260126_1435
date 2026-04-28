"use client"

/**
 * @file recent-projects-grid.tsx — Searchable grid of recent Forge projects
 *
 * @description Client component that renders a searchable grid of recent
 * CAD Lab projects with text search. Each card live-polls the status endpoint
 * while the autopilot is in flight, updating the stage label, in-flight
 * commentary, and progress bar without a page reload.
 */

import { useState, useMemo } from "react"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { LiveProjectCard } from "./live-project-card"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

// INTENT: Stages past 'researched' are eligible for promotion to product
const PROMOTABLE_STAGES = new Set(['interface_ready', 'generated', 'complete'])

export function RecentProjectsGrid({
  projects,
  linkedProductProjectIds = [],
}: {
  projects: CadLabProjectSummary[]
  /** CAD Lab project IDs that are already linked to a product */
  linkedProductProjectIds?: string[]
}): React.ReactNode {
  const linkedSet = useMemo(() => new Set(linkedProductProjectIds), [linkedProductProjectIds])
  const [searchQuery, setSearchQuery] = useState("")

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects

    const q = searchQuery.toLowerCase()
    return projects.filter((p) => {
      const name = p.subject || p.name || ""
      return name.toLowerCase().includes(q)
    })
  }, [projects, searchQuery])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Projects
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-44 pl-8 text-xs"
          />
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="rounded-xl bg-muted/30 py-12 px-8 flex flex-col items-center text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-4">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            {searchQuery ? "No projects match your search" : "No projects yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {searchQuery
              ? "Try a different search term."
              : "Your designs will appear here once you start building."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <LiveProjectCard
              key={project.id}
              project={project}
              canPromote={PROMOTABLE_STAGES.has(project.status) && !linkedSet.has(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}


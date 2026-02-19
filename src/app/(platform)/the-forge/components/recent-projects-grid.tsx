"use client"

/**
 * @file recent-projects-grid.tsx — Filterable grid of recent Forge projects
 *
 * @description Client component that renders a searchable, filterable grid
 * of recent CAD Lab projects and Assembly Builder designs. Supports text
 * search and type filtering (All / CAD Lab / Assemblies).
 */

import { useState, useMemo } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Search, Clock, Flame, Blocks } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"
import type { AssemblySummary } from "@/actions/assembly-builder"

const STAGE_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "info" }> = {
  draft: { label: "Draft", variant: "secondary" },
  researched: { label: "Researched", variant: "info" },
  interface_ready: { label: "Building", variant: "warning" },
  generated: { label: "Generated", variant: "success" },
  complete: { label: "Complete", variant: "success" },
}

type RecentItem =
  | { type: "cad_lab"; item: CadLabProjectSummary }
  | { type: "assembly"; item: AssemblySummary }

type FilterType = "all" | "cad_lab" | "assembly"

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "cad_lab", label: "CAD Lab" },
  { value: "assembly", label: "Assemblies" },
]

export function RecentProjectsGrid({
  items,
}: {
  items: RecentItem[]
}): React.ReactNode {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterType>("all")

  const filteredItems = useMemo(() => {
    let result = items

    if (activeFilter !== "all") {
      result = result.filter((entry) => entry.type === activeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((entry) => {
        const name = entry.type === "cad_lab"
          ? (entry.item as CadLabProjectSummary).subject || (entry.item as CadLabProjectSummary).name
          : (entry.item as AssemblySummary).name
        return (name || "").toLowerCase().includes(q)
      })
    }

    return result
  }, [items, activeFilter, searchQuery])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Projects
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {filteredItems.length} project{filteredItems.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {/* Type filter chips */}
          <div className="flex items-center gap-1">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setActiveFilter(opt.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  activeFilter === opt.value
                    ? "bg-international-orange text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Search */}
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
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl bg-muted/30 py-12 px-8 flex flex-col items-center text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-4">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            {searchQuery || activeFilter !== "all" ? "No projects match your filters" : "No projects yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {searchQuery || activeFilter !== "all"
              ? "Try a different search term or clear your filters."
              : "Your designs will appear here once you start building."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((entry) =>
            entry.type === "cad_lab" ? (
              <CadLabProjectCard key={`cad-${entry.item.id}`} project={entry.item as CadLabProjectSummary} />
            ) : (
              <AssemblyProjectCard key={`asm-${entry.item.id}`} assembly={entry.item as AssemblySummary} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

const PIPELINE_PROGRESS: Record<string, number> = {
  draft: 0,
  researched: 1,
  interface_ready: 2,
  generated: 3,
  complete: 5,
}

function CadLabProjectCard({ project }: { project: CadLabProjectSummary }): React.ReactNode {
  const stageConfig = STAGE_CONFIG[project.status] ?? STAGE_CONFIG.draft
  const displayName = project.subject || project.name || "Untitled Project"
  const progress = PIPELINE_PROGRESS[project.status] ?? 0

  return (
    <Link href={`/the-forge/cad-lab?project=${project.id}`}>
      <Card className="group cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5">
        <div className="h-32 rounded-t-xl overflow-hidden bg-gradient-to-br from-international-orange/5 to-muted relative">
          {project.thumbnailSvg ? (
            <img
              src={project.thumbnailSvg}
              alt={`${displayName} thumbnail`}
              className="w-full h-full object-contain p-4"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Flame className="h-10 w-10 text-international-orange/30" />
            </div>
          )}
          <div className="absolute top-3 right-3">
            <Badge variant={stageConfig.variant} className="gap-1">
              {stageConfig.label}
            </Badge>
          </div>
        </div>
        <CardContent className="pt-4 space-y-2">
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-international-orange transition-colors">
            {displayName}
          </h3>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
            </span>
          </div>
          {/* Pipeline progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-international-orange rounded-full transition-all"
                style={{ width: `${(progress / 5) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{progress}/5</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function AssemblyProjectCard({ assembly }: { assembly: AssemblySummary }): React.ReactNode {
  const displayName = assembly.name || "Untitled Assembly"
  const isComplete = assembly.status === "complete" || assembly.status === "rfq_created"

  return (
    <Link href={`/the-forge/assembly-builder/${assembly.id}`}>
      <Card className="group cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5">
        <div className="h-32 rounded-t-xl overflow-hidden bg-gradient-to-br from-status-success/5 to-muted relative">
          {assembly.thumbnailUrl ? (
            <img
              src={assembly.thumbnailUrl}
              alt={`${displayName} thumbnail`}
              className="w-full h-full object-contain p-4"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Blocks className="h-10 w-10 text-status-success/30" />
            </div>
          )}
          <div className="absolute top-3 right-3">
            <Badge variant={isComplete ? "success" : "secondary"} className="gap-1">
              {isComplete ? "Complete" : "Assembly"}
            </Badge>
          </div>
        </div>
        <CardContent className="pt-4 space-y-2">
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-status-success transition-colors">
            {displayName}
          </h3>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(assembly.updatedAt), { addSuffix: true })}
            </span>
            <span className="flex items-center gap-1">
              <Blocks className="h-3 w-3" />
              Assembly Builder
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

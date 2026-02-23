"use client"

/**
 * @file recent-projects-grid.tsx — Searchable grid of recent Forge projects
 *
 * @description Client component that renders a searchable grid of recent
 * CAD Lab projects with text search.
 */

import { useState, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Search, Clock, Flame } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

const STAGE_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "info" }> = {
  draft: { label: "Draft", variant: "secondary" },
  researched: { label: "Researched", variant: "info" },
  interface_ready: { label: "Building", variant: "warning" },
  generated: { label: "Generated", variant: "success" },
  complete: { label: "Complete", variant: "success" },
}

export function RecentProjectsGrid({
  projects,
}: {
  projects: CadLabProjectSummary[]
}): React.ReactNode {
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
            <CadLabProjectCard key={project.id} project={project} />
          ))}
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
            <Image
              src={project.thumbnailSvg}
              alt={`${displayName} thumbnail`}
              fill
              className="object-contain p-4"
              unoptimized
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

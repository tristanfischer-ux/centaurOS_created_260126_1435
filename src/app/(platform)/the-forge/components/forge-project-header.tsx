/**
 * @file forge-project-header.tsx — Header for a forge project detail page
 *
 * @description Shows the project name, idea summary, and edit controls.
 * Uses the standard platform page header pattern with orange accent bar.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 */

"use client"

import React, { useState } from "react"
import Link from "next/link"

import { ArrowLeft, Pencil, Check, X } from "lucide-react"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useForgeProject } from "./forge-project-context"

/**
 * ForgeProjectHeader — Page header for an individual forge project.
 *
 * @description Displays project name (editable inline), idea text,
 * and a back link to the project list. Uses the standard platform
 * header pattern with orange accent bar.
 */
export function ForgeProjectHeader(): React.ReactNode {
  const { project, updateProjectName } = useForgeProject()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(project.name || "")

  const displayName = project.name || project.idea.slice(0, 60)

  const handleSaveName = async (): Promise<void> => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== project.name) {
      await updateProjectName(trimmed)
    }
    setIsEditing(false)
  }

  const handleCancelEdit = (): void => {
    setEditName(project.name || "")
    setIsEditing(false)
  }

  return (
    <div className="pb-4 border-b border-muted">
      {/* Back link */}
      <Link
        href="/the-forge"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Projects
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />

            {isEditing ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-xl font-semibold h-auto py-1"
                  maxLength={200}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName()
                    if (e.key === "Escape") handleCancelEdit()
                  }}
                />
                <Button variant="ghost" size="icon" onClick={handleSaveName} aria-label="Save name">
                  <Check className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCancelEdit} aria-label="Cancel edit">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h1 className={cn(typography.h1, "truncate")}>{displayName}</h1>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditName(displayName)
                    setIsEditing(true)
                  }}
                  aria-label="Edit project name"
                  className="shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {!isEditing && project.idea.length > 60 && (
            <p className={cn(typography.pageSubtitle, "mt-1 line-clamp-2")}>
              {project.idea}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * @file forge-project-card.tsx — Clickable card for a forge project with actions
 *
 * @description Client component that renders a project card with a dropdown
 * menu for delete and copy actions. The card itself links to the project
 * detail page, while the dropdown menu provides additional actions.
 *
 * @related
 * - List: ./forge-project-list.tsx
 * - Actions: src/actions/xray.ts (deleteScanAction, copyScanAction)
 */

"use client"

import React, { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  Flame,
  Lightbulb,
  Wrench,
  Users,
  Truck,
  FileText,
  Clock,
  MoreVertical,
  Copy,
  Trash2,
  Loader2,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

import { deleteScanAction, copyScanAction } from "@/actions/xray"

// ─── Stage Display Config ────────────────────────────────────────────

const STAGE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: "default" | "secondary" | "success" | "warning" | "info" }
> = {
  concept: { label: "Concept", icon: Lightbulb, variant: "secondary" },
  dossier: { label: "Dossier", icon: Wrench, variant: "info" },
  people: { label: "People", icon: Users, variant: "warning" },
  supply_chain: { label: "Supply Chain", icon: Truck, variant: "default" },
  contracting: { label: "Contracting", icon: FileText, variant: "success" },
}

// ─── Types ───────────────────────────────────────────────────────────

interface ForgeProjectScan {
  /** Unique scan ID */
  id: string
  /** Raw product idea text */
  idea: string
  /** User-assigned project name */
  name: string | null
  /** Scan status (draft, scanned, etc.) */
  status: string
  /** Current pipeline stage */
  stage: string
  /** System blueprint thumbnail URL */
  thumbnailUrl: string | null
  /** Number of modules in the spec */
  moduleCount: number
  /** ISO timestamp of creation */
  createdAt: string
  /** ISO timestamp of last update */
  updatedAt: string
}

interface ForgeProjectCardProps {
  /** The scan data to display */
  scan: ForgeProjectScan
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ForgeProjectCard — Clickable project card with action dropdown.
 *
 * @description Renders a card that navigates to the project detail page
 * on click. A three-dot menu in the corner provides copy and delete
 * actions without navigating away.
 *
 * @param scan - The project scan data to display
 *
 * @example
 * <ForgeProjectCard scan={scan} />
 */
export function ForgeProjectCard({ scan }: ForgeProjectCardProps): React.ReactNode {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const stageConfig = STAGE_CONFIG[scan.stage] || STAGE_CONFIG.concept
  const StageIcon = stageConfig.icon
  const displayName = scan.name || scan.idea.slice(0, 60)
  const stageSegment = scan.stage === "supply_chain" ? "supply-chain" : scan.stage
  const href = `/the-forge/${scan.id}/${stageSegment}`

  /** Navigate to the project detail page */
  function handleCardClick(): void {
    router.push(href)
  }

  /** Copy the project and navigate to the new copy */
  function handleCopy(): void {
    startTransition(async () => {
      const result = await copyScanAction(scan.id)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Project copied successfully")
      router.refresh()
    })
  }

  /** Delete the project after confirmation */
  async function handleDelete(): Promise<void> {
    setIsDeleting(true)

    const result = await deleteScanAction(scan.id)

    if ("error" in result) {
      toast.error(result.error)
      setIsDeleting(false)
      return
    }

    toast.success("Project deleted")
    setIsDeleteDialogOpen(false)
    setIsDeleting(false)
    router.refresh()
  }

  return (
    <>
      <Card
        className="group cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 relative"
        onClick={handleCardClick}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleCardClick()
          }
        }}
      >
        {/* Thumbnail or gradient placeholder */}
        <div className="h-32 rounded-t-xl overflow-hidden bg-gradient-to-br from-international-orange/5 to-muted relative">
          {scan.thumbnailUrl ? (
            <img
              src={scan.thumbnailUrl}
              alt={`${displayName} blueprint`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Flame className="h-10 w-10 text-international-orange/30" />
            </div>
          )}

          {/* Stage badge overlay */}
          <div className="absolute top-3 right-3">
            <Badge variant={stageConfig.variant} className="gap-1">
              <StageIcon className="h-3 w-3" />
              {stageConfig.label}
            </Badge>
          </div>
        </div>

        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-international-orange transition-colors flex-1">
              {displayName}
            </h3>

            {/* Actions dropdown — stops propagation to prevent card navigation */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  aria-label="Project actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  className="gap-2 min-h-[44px]"
                  onClick={handleCopy}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 min-h-[44px] text-destructive focus:text-destructive"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>{scan.moduleCount} modules</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(scan.updatedAt), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Delete Confirmation Dialog ────────────────────────────── */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{displayName}</strong> and
              all associated data (contracts, analysis results). This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

"use client"

import React, { useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, Loader2, Calendar } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"

import { createWhiteboard, deleteWhiteboard } from "@/actions/whiteboards"
import type { WhiteboardRow } from "@/actions/whiteboards"

/**
 * @description Lists all whiteboards in the current foundry with
 * create and delete actions. Clicking a whiteboard opens the Excalidraw editor.
 */

interface WhiteboardListProps {
  whiteboards: WhiteboardRow[]
  objectives: { id: string; title: string }[]
  /** Ref to a DOM element where toolbar buttons should be portaled */
  toolbarPortalRef?: React.RefObject<HTMLDivElement | null>
}

export function WhiteboardList({ whiteboards, objectives, toolbarPortalRef }: WhiteboardListProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  /** Create a new blank whiteboard */
  const handleCreate = useCallback(async () => {
    if (isCreating) return
    setIsCreating(true)

    try {
      const { data, error } = await createWhiteboard({
        title: "Untitled Whiteboard",
        linked_entity_type: "general",
      })

      if (error || !data) {
        toast.error("Failed to create whiteboard", { description: error ?? undefined })
        return
      }

      router.push(`/canvas/whiteboard/${data.id}`)
    } catch (err) {
      console.error('[WhiteboardList] Create failed:', {
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      toast.error("Failed to create whiteboard")
    } finally {
      setIsCreating(false)
    }
  }, [isCreating, router])

  /** Delete a whiteboard */
  const handleDelete = useCallback(async (e: React.MouseEvent, whiteboardId: string) => {
    e.stopPropagation()
    if (deletingId) return
    if (!confirm("Delete this whiteboard? This cannot be undone.")) return

    setDeletingId(whiteboardId)
    const { error } = await deleteWhiteboard(whiteboardId)
    if (error) {
      toast.error("Failed to delete", { description: error })
      setDeletingId(null)
      return
    }

    toast.success("Whiteboard deleted")
    setDeletingId(null)
    router.refresh()
  }, [deletingId, router])

  const createButton = (
    <Button
      size="sm"
      onClick={handleCreate}
      disabled={isCreating}
    >
      {isCreating ? (
        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
      ) : (
        <Plus className="w-4 h-4 mr-1.5" />
      )}
      New Whiteboard
    </Button>
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Create button — portaled to tab bar when slot available, else inline header */}
      {toolbarPortalRef?.current
        ? createPortal(createButton, toolbarPortalRef.current)
        : (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Whiteboards</h2>
              <p className="text-sm text-muted-foreground">
                Freeform visual brainstorming for your team
              </p>
            </div>
            {createButton}
          </div>
        )
      }

      {/* Grid */}
      {whiteboards.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-international-orange-light border border-international-orange/10 flex items-center justify-center mx-auto mb-4">
              <Pencil className="w-7 h-7 text-international-orange/60" />
            </div>
            <h3 className="font-display text-base font-semibold text-foreground mb-1.5">
              No whiteboards yet
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first whiteboard to start brainstorming visually.
            </p>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-international-orange hover:bg-international-orange-hover rounded-lg transition-colors disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create Whiteboard
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {whiteboards.map((wb) => {
            const isDeleting = deletingId === wb.id

            return (
              <div
                key={wb.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/canvas/whiteboard/${wb.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/canvas/whiteboard/${wb.id}`) } }}
                aria-label={`Open whiteboard: ${wb.title}`}
                className="group text-left bg-card rounded-xl border p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* Preview area */}
                <div className="h-28 bg-muted/30 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                  <Pencil className="w-8 h-8 text-muted-foreground/30" />
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-foreground line-clamp-1 mb-1">
                  {wb.title}
                </h3>

                {/* Meta */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(wb.updated_at), "MMM d, yyyy")}
                  </span>

                  <button
                    onClick={(e) => handleDelete(e, wb.id)}
                    disabled={isDeleting}
                    className="p-1 rounded sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-status-error-light transition-all"
                    aria-label={`Delete ${wb.title}`}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

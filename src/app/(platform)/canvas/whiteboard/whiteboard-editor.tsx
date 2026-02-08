"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { Save, ArrowLeft, Trash2, Loader2, Pencil, CheckSquare } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import { updateWhiteboard, deleteWhiteboard } from "@/actions/whiteboards"
import { convertStickyNotesToTasks } from "@/actions/whiteboard-to-task"
import type { WhiteboardRow } from "@/actions/whiteboards"

/**
 * @description Dynamically import Excalidraw (no SSR — canvas-based).
 * The Excalidraw component must be loaded client-side only because
 * it uses browser APIs (Canvas, DOM) that are unavailable during SSR.
 */
const Excalidraw = dynamic(
  async () => {
    const mod = await import("@excalidraw/excalidraw")
    return mod.Excalidraw
  },
  { ssr: false, loading: () => <ExcalidrawLoading /> }
)

function ExcalidrawLoading() {
  return (
    <div className="flex items-center justify-center h-full bg-white">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-international-orange mx-auto" />
        <p className="text-sm text-muted-foreground">Loading whiteboard...</p>
      </div>
    </div>
  )
}

interface WhiteboardEditorProps {
  whiteboard: WhiteboardRow
  objectiveId?: string
}

export function WhiteboardEditor({ whiteboard, objectiveId }: WhiteboardEditorProps) {
  const [title, setTitle] = useState(whiteboard.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const excalidrawRef = useRef<Record<string, unknown> | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  /**
   * @description Auto-save whiteboard state with debounce.
   * Saves 2 seconds after the last change to avoid excessive writes.
   */
  const handleChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (elements: readonly any[], appState: Record<string, unknown>) => {
      // Clear pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Debounced auto-save (2 seconds after last change)
      saveTimeoutRef.current = setTimeout(async () => {
        const state = {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
          },
        }

        const { error } = await updateWhiteboard(whiteboard.id, { state })
        if (error) {
          console.error('[Whiteboard] Auto-save failed:', { whiteboardId: whiteboard.id, error })
        }
      }, 2000)
    },
    [whiteboard.id]
  )

  /** Manual save (Cmd+S) */
  const handleManualSave = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)

    try {
      // Get current scene from Excalidraw
      const api = excalidrawRef.current as { getSceneElements?: () => unknown[]; getAppState?: () => Record<string, unknown> } | null
      if (!api?.getSceneElements || !api?.getAppState) {
        toast.error("Could not access whiteboard state")
        return
      }

      const elements = api.getSceneElements()
      const appState = api.getAppState()

      const state = {
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
      }

      const updates: { state: Record<string, unknown>; title?: string } = { state }
      if (title !== whiteboard.title) {
        updates.title = title
      }

      const { error } = await updateWhiteboard(whiteboard.id, updates)
      if (error) {
        toast.error("Failed to save", { description: error })
        return
      }

      toast.success("Whiteboard saved")
    } catch (err) {
      console.error('[Whiteboard] Save failed:', {
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      toast.error("Failed to save whiteboard")
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, whiteboard.id, whiteboard.title, title])

  /** Delete whiteboard */
  const handleDelete = useCallback(async () => {
    if (isDeleting) return
    if (!confirm("Delete this whiteboard? This cannot be undone.")) return

    setIsDeleting(true)
    const { error } = await deleteWhiteboard(whiteboard.id)
    if (error) {
      toast.error("Failed to delete", { description: error })
      setIsDeleting(false)
      return
    }

    toast.success("Whiteboard deleted")
    // Navigation handled by revalidation + redirect
    window.location.href = "/canvas"
  }, [isDeleting, whiteboard.id])

  /**
   * @description Convert selected text/sticky note elements to CentaurOS tasks.
   * Reads selected elements from the Excalidraw API, extracts text content,
   * and creates tasks via the server action.
   */
  const handleConvertToTask = useCallback(async () => {
    if (isConverting) return
    setIsConverting(true)

    try {
      const api = excalidrawRef.current as {
        getSceneElements?: () => Array<{ type: string; text?: string; isDeleted?: boolean; id: string }>
        getAppState?: () => { selectedElementIds?: Record<string, boolean> }
      } | null

      if (!api?.getSceneElements || !api?.getAppState) {
        toast.error("Could not read whiteboard elements")
        return
      }

      const allElements = api.getSceneElements()
      const appState = api.getAppState()
      const selectedIds = new Set(Object.keys(appState.selectedElementIds || {}))

      // Get text elements that are selected (or all text elements if none selected)
      let textElements = allElements.filter(
        (el) => el.type === "text" && !el.isDeleted && el.text?.trim()
      )

      if (selectedIds.size > 0) {
        textElements = textElements.filter((el) => selectedIds.has(el.id))
      }

      if (textElements.length === 0) {
        toast.error("No text elements found", {
          description: selectedIds.size > 0
            ? "Select text or sticky note elements to convert"
            : "Add text elements to the whiteboard first",
        })
        return
      }

      // Convert each text element to a task
      const notes = textElements.map((el) => ({
        text: el.text || "",
        objectiveId: objectiveId || whiteboard.linked_entity_id || undefined,
      }))

      const { data, error } = await convertStickyNotesToTasks(notes)

      if (error) {
        toast.error("Failed to create tasks", { description: error })
        return
      }

      if (data && data.length > 0) {
        toast.success(
          data.length === 1
            ? `Created task #${data[0].task_number}: ${data[0].title}`
            : `Created ${data.length} tasks`,
          {
            description: data.length > 1
              ? data.map((t) => `#${t.task_number}`).join(", ")
              : undefined,
          }
        )
      }
    } catch (err) {
      console.error("[Whiteboard] Convert to task failed:", {
        error: err instanceof Error ? err.message : "Unknown error",
      })
      toast.error("Failed to convert to tasks")
    } finally {
      setIsConverting(false)
    }
  }, [isConverting, objectiveId, whiteboard.linked_entity_id])

  /** Keyboard shortcut: Cmd+S to save */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        handleManualSave()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleManualSave])

  // Parse initial scene data from stored state
  const initialData = whiteboard.state as {
    elements?: unknown[]
    appState?: Record<string, unknown>
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
        {/* Left: Back + title */}
        <div className="flex items-center gap-3">
          <Link
            href="/canvas"
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Back to Canvas"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setIsEditingTitle(false)
                if (e.key === "Escape") {
                  setTitle(whiteboard.title)
                  setIsEditingTitle(false)
                }
              }}
              className="text-sm font-semibold text-foreground bg-transparent border-b border-international-orange px-1 py-0.5 outline-none w-64"
              aria-label="Whiteboard title"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-international-orange transition-colors group"
              aria-label="Edit whiteboard title"
            >
              {title}
              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleConvertToTask}
            disabled={isConverting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-international-orange bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md transition-colors disabled:opacity-50"
            title="Convert selected text elements to tasks"
          >
            {isConverting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckSquare className="w-3.5 h-3.5" />
            )}
            Convert to Task
          </button>
          <button
            onClick={handleManualSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-white border border-slate-200 hover:bg-muted rounded-md transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-status-error-light transition-colors disabled:opacity-50"
            aria-label="Delete whiteboard"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Excalidraw canvas */}
      <div className="flex-1 bg-white">
        <Excalidraw
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={excalidrawRef as any}
          initialData={{
            elements: (initialData.elements as never[]) || [],
            appState: {
              viewBackgroundColor: "#ffffff",
              ...(initialData.appState || {}),
            },
          }}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              export: { saveFileToDisk: true },
            },
          }}
        />
      </div>
    </div>
  )
}

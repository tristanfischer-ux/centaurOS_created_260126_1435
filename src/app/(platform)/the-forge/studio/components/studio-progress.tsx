"use client"

/**
 * @file studio-progress.tsx — Compact horizontal progress bar.
 *
 * INTENT: Full-width horizontal stepper that sits above content so the
 * main area gets 100% of the available width. Clicking a completed or
 * current stage scrolls to that section smoothly.
 */

import {
  FileText,
  Search,
  Box,
  BarChart3,
  Send,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { StudioStage } from "../studio-page"

const STAGES: { id: StudioStage; label: string; icon: typeof FileText }[] = [
  { id: "brief", label: "Brief", icon: FileText },
  { id: "research", label: "Research", icon: Search },
  { id: "design", label: "Design", icon: Box },
  { id: "specs", label: "Specs", icon: BarChart3 },
  { id: "quote", label: "Get Quotes", icon: Send },
]

const STAGE_ORDER: StudioStage[] = ["brief", "research", "design", "specs", "quote"]

interface StudioProgressProps {
  currentStage: StudioStage
}

export function StudioProgress({ currentStage }: StudioProgressProps): React.ReactNode {
  const currentIndex = STAGE_ORDER.indexOf(currentStage)

  function handleClick(stageId: StudioStage): void {
    const el = document.getElementById(`studio-${stageId}`)
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <nav aria-label="Studio progress" className="hidden sm:flex items-center w-full">
      {STAGES.map((stage, idx) => {
        const Icon = stage.icon
        const stageIndex = STAGE_ORDER.indexOf(stage.id)
        const isCompleted = stageIndex < currentIndex
        const isCurrent = stage.id === currentStage
        const isFuture = stageIndex > currentIndex

        return (
          <div key={stage.id} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => handleClick(stage.id)}
              disabled={isFuture}
              className={cn(
                "flex flex-col items-center gap-1.5 transition-all",
                isFuture && "cursor-not-allowed opacity-40",
                !isFuture && "hover:opacity-80",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  isCurrent && "bg-international-orange text-white shadow-sm",
                  isCompleted && "bg-status-success-light text-status-success",
                  isFuture && "bg-muted text-muted-foreground",
                  !isCurrent && !isFuture && !isCompleted && "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  isCurrent && "text-international-orange font-semibold",
                  isCompleted && "text-status-success font-medium",
                  isFuture && "text-muted-foreground",
                  !isCurrent && !isFuture && !isCompleted && "text-muted-foreground",
                )}
              >
                {stage.label}
              </span>
            </button>

            {/* Connector line between stages */}
            {idx < STAGES.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 rounded-full transition-colors",
                  stageIndex < currentIndex
                    ? "bg-status-success"
                    : "bg-muted",
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}

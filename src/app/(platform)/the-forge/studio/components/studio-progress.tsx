"use client"

/**
 * @file studio-progress.tsx — Lightweight vertical progress indicator.
 *
 * INTENT: Replaces the 5-stage horizontal stepper with a minimal sidebar
 * that shows where the user is in the flow. Clicking a stage scrolls to
 * that section smoothly.
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
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Progress
      </p>
      {STAGES.map((stage, idx) => {
        const Icon = stage.icon
        const stageIndex = STAGE_ORDER.indexOf(stage.id)
        const isCompleted = stageIndex < currentIndex
        const isCurrent = stage.id === currentStage
        const isFuture = stageIndex > currentIndex

        return (
          <div key={stage.id}>
            <button
              onClick={() => handleClick(stage.id)}
              disabled={isFuture}
              className={cn(
                "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all",
                isCurrent && "bg-international-orange-light/20 text-international-orange font-medium",
                isCompleted && "text-status-success hover:bg-muted/50",
                isFuture && "text-muted-foreground/40 cursor-not-allowed",
                !isCurrent && !isFuture && !isCompleted && "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
                  isCurrent && "bg-international-orange text-white",
                  isCompleted && "bg-status-success-light text-status-success",
                  isFuture && "bg-muted text-muted-foreground/40",
                  !isCurrent && !isFuture && !isCompleted && "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <span className="text-sm">{stage.label}</span>
            </button>
            {/* Connector line between stages */}
            {idx < STAGES.length - 1 && (
              <div className="ml-[22px] h-3 w-0.5 rounded-full bg-muted" />
            )}
          </div>
        )
      })}
    </div>
  )
}

"use client"

import React, { memo } from "react"
import { type NodeProps } from "@xyflow/react"
import { Target } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * @description Phase Node - large container node representing a phase/objective
 * in the strategic plan. Renders as a semi-transparent background with header.
 */

interface PhaseNodeData {
  label: string
  description: string | null
  status: string
  progress: number
  width: number
  height: number
}

function PhaseNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as PhaseNodeData
  const progress = d.progress ?? 0

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed transition-all duration-200",
        selected
          ? "border-international-orange/50 bg-international-orange/[0.03]"
          : "border-muted/80 bg-muted/[0.04] hover:border-muted-foreground/30"
      )}
      style={{
        width: d.width,
        height: d.height,
        minWidth: 200,
        minHeight: 120,
      }}
    >
      {/* Phase header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dashed border-muted/40">
        <div className="w-5 h-5 rounded bg-international-orange/10 flex items-center justify-center flex-shrink-0">
          <Target className="w-3 h-3 text-international-orange" />
        </div>
        <span className="text-xs font-semibold text-foreground truncate">
          {d.label}
        </span>
        {progress > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {progress}%
          </span>
        )}
      </div>
    </div>
  )
}

export const PhaseNode = memo(PhaseNodeComponent)

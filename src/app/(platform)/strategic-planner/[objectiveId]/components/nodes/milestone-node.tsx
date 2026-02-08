"use client"

import React, { memo } from "react"
import { type NodeProps } from "@xyflow/react"
import { Flag } from "lucide-react"
import { format } from "date-fns"

/**
 * @description Milestone Node - diamond-shaped marker at a key date
 * on the strategic timeline (e.g., "Goal Deadline", "Phase Complete").
 */

interface MilestoneNodeData {
  label: string
  date: string
}

function MilestoneNodeComponent({ data }: NodeProps) {
  const d = data as unknown as MilestoneNodeData

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Diamond shape */}
      <div className="w-8 h-8 rotate-45 bg-international-orange rounded-sm flex items-center justify-center shadow-sm">
        <Flag className="w-3.5 h-3.5 text-white -rotate-45" />
      </div>
      {/* Label */}
      <div className="text-center mt-1">
        <p className="text-[10px] font-semibold text-international-orange whitespace-nowrap">
          {d.label}
        </p>
        {d.date && (
          <p className="text-[9px] text-muted-foreground">
            {format(new Date(d.date), 'MMM d, yyyy')}
          </p>
        )}
      </div>
    </div>
  )
}

export const MilestoneNode = memo(MilestoneNodeComponent)

"use client"

import React, { memo } from "react"
import { type NodeProps } from "@xyflow/react"
import { Sparkles, Plus, UserPlus, ShoppingBag, Clock, Link2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SuggestionType } from "@/types/strategic-planner"

/**
 * @description AI Suggestion Node - floating sparkle-icon node with
 * recommendation text and one-click Apply/Dismiss actions.
 */

interface AISuggestionNodeData {
  id: string
  type: SuggestionType
  message: string
  relatedPhase?: string
}

const TYPE_CONFIG = {
  add_task: { icon: Plus, color: 'text-status-info' },
  assign_person: { icon: UserPlus, color: 'text-status-success' },
  hire_resource: { icon: ShoppingBag, color: 'text-international-orange' },
  timeline_warning: { icon: Clock, color: 'text-status-warning' },
  dependency: { icon: Link2, color: 'text-electric-blue' },
} satisfies Record<SuggestionType, { icon: React.ElementType; color: string }>

function AISuggestionNodeComponent({ data }: NodeProps) {
  const d = data as unknown as AISuggestionNodeData
  const config = TYPE_CONFIG[d.type] || TYPE_CONFIG.add_task
  const Icon = config.icon

  return (
    <div className={cn(
      "w-[240px] rounded-lg border border-dashed p-3 transition-all duration-200",
      "border-electric-blue/30 bg-status-info-light/20 hover:shadow-md hover:border-electric-blue/50"
    )}>
      <div className="flex items-start gap-2">
        <div className="w-5 h-5 rounded bg-electric-blue/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-3 h-3 text-electric-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-foreground leading-snug line-clamp-3">
            {d.message}
          </p>
          {d.relatedPhase && (
            <p className="text-[9px] text-muted-foreground mt-1">
              Phase: {d.relatedPhase}
            </p>
          )}
        </div>
        <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", config.color)} />
      </div>
    </div>
  )
}

export const AISuggestionNode = memo(AISuggestionNodeComponent)

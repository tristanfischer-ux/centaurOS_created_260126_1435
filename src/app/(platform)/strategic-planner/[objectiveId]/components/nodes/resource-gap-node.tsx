"use client"

import React, { memo } from "react"
import { type NodeProps } from "@xyflow/react"
import { ShoppingBag, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { ResourcePriority } from "@/types/strategic-planner"

/**
 * @description Resource Gap Node - dashed-border card indicating a role
 * that needs to be filled, with a link to browse the marketplace.
 */

interface ResourceGapNodeData {
  role: string
  reason: string
  phase: string
  priority: ResourcePriority
}

const PRIORITY_STYLES = {
  critical: 'border-destructive/50 bg-status-error-light/30',
  recommended: 'border-status-warning/50 bg-status-warning-light/30',
  nice_to_have: 'border-muted-foreground/30 bg-muted/20',
} satisfies Record<ResourcePriority, string>

const PRIORITY_LABELS = {
  critical: 'Critical',
  recommended: 'Recommended',
  nice_to_have: 'Nice to Have',
} satisfies Record<ResourcePriority, string>

function ResourceGapNodeComponent({ data }: NodeProps) {
  const d = data as unknown as ResourceGapNodeData
  const router = useRouter()

  return (
    <div
      className={cn(
        "w-[200px] rounded-lg border-2 border-dashed p-3 transition-all duration-200 cursor-pointer hover:shadow-md",
        PRIORITY_STYLES[d.priority] || PRIORITY_STYLES.recommended
      )}
      onClick={() => router.push('/marketplace-v2')}
    >
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded bg-international-orange/10 flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="w-3.5 h-3.5 text-international-orange" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground line-clamp-1">
            {d.role}
          </p>
          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
            {d.reason}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed border-muted/40">
        <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
          {PRIORITY_LABELS[d.priority]}
        </span>
        <div className="flex items-center gap-1 text-[10px] text-international-orange font-medium">
          <span>Browse</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </div>
      </div>
    </div>
  )
}

export const ResourceGapNode = memo(ResourceGapNodeComponent)

"use client"

/**
 * @description Resources panel showing AI-identified capability gaps
 * with marketplace recommendations. Each gap card shows the role needed,
 * reason, priority, and a link to browse the marketplace.
 */

import { ShoppingBag, X, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import type { ResourceSuggestion, ResourcePriority } from "@/types/strategic-planner"

interface ResourcesPanelProps {
  suggestions: ResourceSuggestion[]
  onClose: () => void
}

const PRIORITY_MAP = {
  critical: { status: 'error' as const, label: 'Critical' },
  recommended: { status: 'warning' as const, label: 'Recommended' },
  nice_to_have: { status: 'info' as const, label: 'Nice to Have' },
} satisfies Record<ResourcePriority, { status: 'error' | 'warning' | 'info'; label: string }>

export function ResourcesPanel({ suggestions, onClose }: ResourcesPanelProps) {
  const router = useRouter()

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-international-orange" />
          <h3 className="text-sm font-semibold text-foreground">Resource Gaps</h3>
          <span className="text-xs text-muted-foreground">({suggestions.length})</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close resources panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suggestions.map((suggestion, idx) => {
          const priorityConfig = PRIORITY_MAP[suggestion.priority] || PRIORITY_MAP.recommended

          return (
            <Card key={idx} className="border">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-foreground">{suggestion.role}</p>
                  <StatusBadge status={priorityConfig.status} size="sm">
                    {priorityConfig.label}
                  </StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                  {suggestion.reason}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Phase: {suggestion.phase}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-international-orange hover:text-international-orange-hover"
                    onClick={() => router.push('/marketplace-v2')}
                  >
                    Browse
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

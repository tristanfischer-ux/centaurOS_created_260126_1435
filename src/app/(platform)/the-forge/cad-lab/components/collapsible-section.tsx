"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"

// ─── Collapsible Section ──────────────────────────────────────────────

/**
 * CollapsibleSection — Reusable collapsible card wrapper for carrying
 * content from earlier stages into later stages without overwhelming the page.
 */
export function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}): React.ReactNode {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <Card>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {isOpen
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
      </button>
      {isOpen && <div className="px-4 pb-4 border-t pt-4">{children}</div>}
    </Card>
  )
}

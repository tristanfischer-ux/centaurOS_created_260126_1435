"use client"

import { Inbox, AlertTriangle, AtSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface ActionItem {
    label: string
    color: string
    icon: typeof Inbox
}

const ACTION_ITEMS: ActionItem[] = [
    {
        label: "Decisions Pending",
        color: "bg-amber-500",
        icon: Inbox,
    },
    {
        label: "Blockers & Overdue",
        color: "bg-red-500",
        icon: AlertTriangle,
    },
    {
        label: "Mentions",
        color: "bg-blue-500",
        icon: AtSign,
    },
]

export function ActionItemsLegend({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center gap-6 text-sm", className)}>
            <span className="text-muted-foreground font-medium">Action Items:</span>
            {ACTION_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                    <div key={item.label} className="flex items-center gap-2">
                        <div className={cn("h-2 w-10 rounded-full", item.color)} />
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground font-medium">{item.label}</span>
                    </div>
                )
            })}
        </div>
    )
}

"use client"

import { CheckCircle2, AlertTriangle, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface CoverageItem {
    label: string
    color: string
    icon: typeof CheckCircle2
}

const COVERAGE_ITEMS: CoverageItem[] = [
    {
        label: "Covered",
        color: "bg-green-500",
        icon: CheckCircle2,
    },
    {
        label: "Partial",
        color: "bg-yellow-500",
        icon: Minus,
    },
    {
        label: "Gap",
        color: "bg-slate-300",
        icon: AlertTriangle,
    },
]

export function CoverageLegend({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center gap-6 text-sm", className)}>
            <span className="text-muted-foreground font-medium">Coverage:</span>
            {COVERAGE_ITEMS.map((item) => {
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

"use client"

import { CheckCircle2, Shield, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusItem {
    label: string
    color: string
    icon: typeof CheckCircle2
}

const STATUS_ITEMS: StatusItem[] = [
    {
        label: "Verified",
        color: "bg-emerald-500",
        icon: CheckCircle2,
    },
    {
        label: "Endorsed",
        color: "bg-amber-500",
        icon: Shield,
    },
    {
        label: "Awaiting Review",
        color: "bg-muted-foreground/50",
        icon: Clock,
    },
]

export function StatusLegend({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center gap-6 text-sm", className)}>
            <span className="text-muted-foreground font-medium">Status:</span>
            {STATUS_ITEMS.map((item) => {
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

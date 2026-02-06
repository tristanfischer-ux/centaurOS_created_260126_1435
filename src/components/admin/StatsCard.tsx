"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { 
    TrendingUp, 
    TrendingDown, 
    Minus,
    ClipboardList,
    AlertTriangle,
    Activity,
    RefreshCw,
    Users,
    Building2,
    DollarSign,
    Package,
    type LucideIcon
} from "lucide-react"

/**
 * Map of icon names to Lucide icon components.
 * Icons must be imported and mapped here to avoid serialization issues
 * when passing from Server Components.
 */
const ICON_MAP: Record<string, LucideIcon> = {
    ClipboardList,
    AlertTriangle,
    Activity,
    RefreshCw,
    Users,
    Building2,
    DollarSign,
    Package,
}

interface StatsCardProps {
    /** Icon name from ICON_MAP (e.g., "ClipboardList", "Activity") */
    iconName: string
    label: string
    value: string | number
    trend?: {
        direction: 'up' | 'down' | 'neutral'
        value: string
    }
    variant?: 'default' | 'success' | 'warning' | 'danger'
    className?: string
}

export function StatsCard({
    iconName,
    label,
    value,
    trend,
    variant = 'default',
    className
}: StatsCardProps) {
    const Icon = ICON_MAP[iconName] || Activity
    const variantStyles = {
        default: {
            icon: 'text-muted-foreground',
            value: 'text-foreground'
        },
        success: {
            icon: 'text-status-success',
            value: 'text-status-success'
        },
        warning: {
            icon: 'text-amber-600',
            value: 'text-amber-600'
        },
        danger: {
            icon: 'text-destructive',
            value: 'text-destructive'
        }
    }
    
    const styles = variantStyles[variant]
    
    const TrendIcon = trend?.direction === 'up' 
        ? TrendingUp 
        : trend?.direction === 'down' 
        ? TrendingDown 
        : Minus
    
    const trendColor = trend?.direction === 'up'
        ? 'text-status-success'
        : trend?.direction === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground'
    
    return (
        <Card className={cn("border-slate-200 shadow-[0_2px_15px_rgba(0,0,0,0.03)] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200", className)}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2.5 rounded-lg bg-slate-50 border border-slate-100", styles.icon)}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">{label}</p>
                            <p className={cn("text-2xl font-bold", styles.value)}>
                                {value}
                            </p>
                        </div>
                    </div>
                    {trend && (
                        <div className={cn("flex items-center gap-1 text-sm", trendColor)}>
                            <TrendIcon className="h-4 w-4" />
                            <span>{trend.value}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

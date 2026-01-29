"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react"

interface StatsCardProps {
    icon: LucideIcon
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
    icon: Icon,
    label,
    value,
    trend,
    variant = 'default',
    className
}: StatsCardProps) {
    const variantStyles = {
        default: {
            icon: 'text-muted-foreground',
            value: 'text-foreground'
        },
        success: {
            icon: 'text-green-600',
            value: 'text-green-600'
        },
        warning: {
            icon: 'text-amber-600',
            value: 'text-amber-600'
        },
        danger: {
            icon: 'text-red-600',
            value: 'text-red-600'
        }
    }
    
    const styles = variantStyles[variant]
    
    const TrendIcon = trend?.direction === 'up' 
        ? TrendingUp 
        : trend?.direction === 'down' 
        ? TrendingDown 
        : Minus
    
    const trendColor = trend?.direction === 'up'
        ? 'text-green-600'
        : trend?.direction === 'down'
        ? 'text-red-600'
        : 'text-muted-foreground'
    
    return (
        <Card className={cn("", className)}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg bg-muted", styles.icon)}>
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

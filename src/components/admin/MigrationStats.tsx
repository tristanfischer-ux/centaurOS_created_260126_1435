"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface MigrationStatsCardProps {
    icon: LucideIcon
    label: string
    value: number
    variant?: 'default' | 'success' | 'warning' | 'danger'
    trend?: {
        direction: 'up' | 'down'
        value: string
    }
    className?: string
}

export function MigrationStatsCard({
    icon: Icon,
    label,
    value,
    variant = 'default',
    className
}: MigrationStatsCardProps) {
    const variantStyles = {
        default: {
            icon: 'text-muted-foreground bg-muted',
            value: 'text-foreground'
        },
        success: {
            icon: 'text-status-success bg-status-success-light',
            value: 'text-status-success'
        },
        warning: {
            icon: 'text-status-warning bg-status-warning-light',
            value: 'text-status-warning'
        },
        danger: {
            icon: 'text-destructive bg-status-error-light',
            value: 'text-destructive'
        }
    }
    
    const styles = variantStyles[variant]
    
    return (
        <Card className={cn("", className)}>
            <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", styles.icon)}>
                        <Icon className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={cn("text-xl font-bold", styles.value)}>
                            {value.toLocaleString()}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// Detailed stats component for migration overview
interface MigrationStatsOverviewProps {
    totalListings: number
    pendingCount: number
    invitedCount: number
    inProgressCount: number
    completedCount: number
    declinedCount: number
    migrationRate: number
}

export function MigrationStatsOverview({
    totalListings,
    pendingCount,
    invitedCount,
    inProgressCount,
    completedCount,
    declinedCount,
    migrationRate
}: MigrationStatsOverviewProps) {
    const statItems = [
        { label: 'Total Listings', value: totalListings, color: 'bg-muted' },
        { label: 'Pending', value: pendingCount, color: 'bg-muted-foreground' },
        { label: 'Invited', value: invitedCount, color: 'bg-status-warning' },
        { label: 'In Progress', value: inProgressCount, color: 'bg-status-info' },
        { label: 'Completed', value: completedCount, color: 'bg-status-success' },
        { label: 'Declined', value: declinedCount, color: 'bg-destructive' },
    ]
    
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Migration Status</span>
                <span className="text-sm text-muted-foreground">
                    {migrationRate}% complete
                </span>
            </div>
            
            <div className="space-y-2">
                {statItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                        <div className={cn("w-3 h-3 rounded-full", item.color)} />
                        <span className="text-sm text-muted-foreground flex-1">
                            {item.label}
                        </span>
                        <span className="text-sm font-medium">
                            {item.value.toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
            
            {/* Progress bar */}
            <div className="pt-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                    <div 
                        className="bg-status-success transition-all"
                        style={{ width: `${(completedCount / Math.max(totalListings, 1)) * 100}%` }}
                    />
                    <div 
                        className="bg-status-info transition-all"
                        style={{ width: `${(inProgressCount / Math.max(totalListings, 1)) * 100}%` }}
                    />
                    <div 
                        className="bg-status-warning transition-all"
                        style={{ width: `${(invitedCount / Math.max(totalListings, 1)) * 100}%` }}
                    />
                    <div 
                        className="bg-destructive transition-all"
                        style={{ width: `${(declinedCount / Math.max(totalListings, 1)) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    )
}

"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Clock, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface EarningsCardProps {
    earningsThisMonth: number
    pendingPayout: number
    totalEarnings: number
    currency?: string
    previousMonthEarnings?: number
    className?: string
}

function formatCurrency(amount: number, currency: string = 'GBP'): string {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount)
}

export function EarningsCard({
    earningsThisMonth,
    pendingPayout,
    totalEarnings,
    currency = 'GBP',
    previousMonthEarnings,
    className
}: EarningsCardProps) {
    // Calculate month-over-month change
    let monthChange: number | null = null
    let isPositive = true
    
    if (previousMonthEarnings !== undefined && previousMonthEarnings > 0) {
        monthChange = ((earningsThisMonth - previousMonthEarnings) / previousMonthEarnings) * 100
        isPositive = monthChange >= 0
    }

    return (
        <Card className={cn("", className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-status-success" />
                    Earnings Overview
                </CardTitle>
                <CardDescription>Your earnings summary</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* This Month */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-status-success-light border border-status-success">
                    <div>
                        <p className="text-sm text-status-success-dark font-medium">This Month</p>
                        <p className="text-2xl font-bold text-status-success-foreground mt-1">
                            {formatCurrency(earningsThisMonth, currency)}
                        </p>
                    </div>
                    {monthChange !== null && (
                        <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium",
                            isPositive 
                                ? "bg-status-success-light text-status-success-dark" 
                                : "bg-status-error-light text-destructive"
                        )}>
                            {isPositive ? (
                                <TrendingUp className="h-4 w-4" />
                            ) : (
                                <TrendingDown className="h-4 w-4" />
                            )}
                            {Math.abs(monthChange).toFixed(0)}%
                        </div>
                    )}
                </div>

                {/* Pending and Total */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-status-warning-light border border-status-warning">
                        <div className="flex items-center gap-2 text-status-warning-dark">
                            <Clock className="h-4 w-4" />
                            <p className="text-sm font-medium">Pending Payout</p>
                        </div>
                        <p className="text-xl font-bold text-status-warning-foreground mt-2">
                            {formatCurrency(pendingPayout, currency)}
                        </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted border border-slate-100">
                        <div className="flex items-center gap-2 text-foreground">
                            <TrendingUp className="h-4 w-4" />
                            <p className="text-sm font-medium">Total Earned</p>
                        </div>
                        <p className="text-xl font-bold text-foreground mt-2">
                            {formatCurrency(totalEarnings, currency)}
                        </p>
                    </div>
                </div>

                {/* Payout info */}
                {pendingPayout > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                        Payouts are processed automatically every week
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

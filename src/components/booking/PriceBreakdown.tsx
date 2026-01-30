'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { 
    Receipt, 
    ShieldCheck, 
    Percent, 
    Building2,
    Tag
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PriceBreakdown as PriceBreakdownType, PriceBreakdownItem } from '@/types/booking'

interface PriceBreakdownProps {
    breakdown: PriceBreakdownType | null
    isLoading?: boolean
    showEscrowInfo?: boolean
    className?: string
}

function formatCurrency(amount: number, currency: string): string {
    return `${currency} ${amount.toLocaleString('en-GB', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`
}

function ItemIcon({ type }: { type: PriceBreakdownItem['type'] }) {
    switch (type) {
        case 'subtotal':
            return <Receipt className="h-4 w-4 text-muted-foreground" />
        case 'fee':
            return <ShieldCheck className="h-4 w-4 text-blue-500" />
        case 'tax':
            return <Building2 className="h-4 w-4 text-muted-foreground" />
        case 'discount':
            return <Tag className="h-4 w-4 text-emerald-500" />
        default:
            return null
    }
}

export function PriceBreakdown({ 
    breakdown, 
    isLoading = false,
    showEscrowInfo = true,
    className 
}: PriceBreakdownProps) {
    if (isLoading) {
        return (
            <Card className={className}>
                <CardHeader className="pb-4">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48 mt-1" />
                </CardHeader>
                <CardContent className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex justify-between">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-20" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        )
    }

    if (!breakdown) {
        return (
            <Card className={cn("border-dashed", className)}>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground text-sm">
                        Select dates to see price breakdown
                    </p>
                </CardContent>
            </Card>
        )
    }

    const nonTotalItems = breakdown.items.filter(item => item.type !== 'total')
    const totalItem = breakdown.items.find(item => item.type === 'total')

    return (
        <Card className={className}>
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                    Price Breakdown
                </CardTitle>
                <CardDescription>
                    {breakdown.numberOfDays 
                        ? `${breakdown.numberOfDays} day${breakdown.numberOfDays !== 1 ? 's' : ''} engagement`
                        : 'Booking summary'
                    }
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Line Items */}
                <div className="space-y-3">
                    {nonTotalItems.map((item, index) => (
                        <div 
                            key={index}
                            className="flex items-start justify-between text-sm"
                        >
                            <div className="flex items-start gap-2">
                                <ItemIcon type={item.type} />
                                <div>
                                    <p className={cn(
                                        "font-medium",
                                        item.type === 'discount' && "text-emerald-600"
                                    )}>
                                        {item.label}
                                    </p>
                                    {item.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {item.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <span className={cn(
                                "font-medium tabular-nums",
                                item.type === 'discount' && "text-emerald-600"
                            )}>
                                {item.type === 'discount' 
                                    ? `-${formatCurrency(item.amount, breakdown.currency)}`
                                    : formatCurrency(item.amount, breakdown.currency)
                                }
                            </span>
                        </div>
                    ))}
                </div>

                <Separator />

                {/* Total */}
                {totalItem && (
                    <div className="flex items-center justify-between">
                        <span className="text-base font-semibold">Total</span>
                        <span className="text-xl font-bold">
                            {formatCurrency(totalItem.amount, breakdown.currency)}
                        </span>
                    </div>
                )}

                {/* Escrow Info */}
                {showEscrowInfo && (
                    <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <div className="flex items-start gap-2">
                            <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-blue-700">Escrow Protection</p>
                                <p className="text-blue-600 mt-0.5">
                                    Your payment is held securely until the work is completed. 
                                    The provider only receives payment when you approve the deliverables.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Discount Badge */}
                {breakdown.discountPercent > 0 && (
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                        <Percent className="h-3 w-3 mr-1" />
                        {breakdown.discountPercent}% discount applied
                    </Badge>
                )}
            </CardContent>
        </Card>
    )
}

// Compact version for sidebar/summary
export function PriceBreakdownCompact({ 
    breakdown, 
    className 
}: { 
    breakdown: PriceBreakdownType | null
    className?: string 
}) {
    if (!breakdown) return null

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(breakdown.subtotal, breakdown.currency)}</span>
            </div>
            {breakdown.platformFee > 0 && (
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Platform fee</span>
                    <span>{formatCurrency(breakdown.platformFee, breakdown.currency)}</span>
                </div>
            )}
            {breakdown.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(breakdown.discountAmount, breakdown.currency)}</span>
                </div>
            )}
            {breakdown.vatAmount > 0 && (
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT ({(breakdown.vatRate * 100).toFixed(0)}%)</span>
                    <span>{formatCurrency(breakdown.vatAmount, breakdown.currency)}</span>
                </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCurrency(breakdown.total, breakdown.currency)}</span>
            </div>
        </div>
    )
}

export default PriceBreakdown

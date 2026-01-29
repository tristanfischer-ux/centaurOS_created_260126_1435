'use client'

import { format } from 'date-fns'
import {
    User,
    Calendar,
    MessageSquare,
    Star,
    ExternalLink,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    ShieldCheck,
    Package,
    Briefcase,
    Bot,
    MoreHorizontal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { OrderSummary, BookingStatus, PaymentStatus } from '@/types/booking'

// ==========================================
// HELPERS
// ==========================================

function getStatusConfig(status: BookingStatus) {
    switch (status) {
        case 'draft':
            return { label: 'Draft', color: 'bg-slate-100 text-slate-700', icon: Clock }
        case 'pending_payment':
            return { label: 'Pending Payment', color: 'bg-amber-100 text-amber-700', icon: Clock }
        case 'confirmed':
            return { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: CheckCircle }
        case 'in_progress':
            return { label: 'In Progress', color: 'bg-emerald-100 text-emerald-700', icon: Clock }
        case 'completed':
            return { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle }
        case 'cancelled':
            return { label: 'Cancelled', color: 'bg-slate-100 text-slate-500', icon: XCircle }
        case 'disputed':
            return { label: 'Disputed', color: 'bg-red-100 text-red-700', icon: AlertCircle }
        default:
            return { label: status, color: 'bg-slate-100 text-slate-700', icon: Clock }
    }
}

function getEscrowConfig(status: PaymentStatus) {
    switch (status) {
        case 'pending':
            return { label: 'Payment Pending', color: 'text-amber-600' }
        case 'held':
            return { label: 'Funds in Escrow', color: 'text-blue-600' }
        case 'partial_release':
            return { label: 'Partial Release', color: 'text-emerald-600' }
        case 'released':
            return { label: 'Payment Released', color: 'text-emerald-600' }
        case 'refunded':
            return { label: 'Refunded', color: 'text-slate-500' }
        default:
            return { label: status, color: 'text-slate-500' }
    }
}


// ==========================================
// PROPS
// ==========================================

interface OrderSummaryCardProps {
    order: OrderSummary
    onViewDetails?: (orderId: string) => void
    onMessageProvider?: (orderId: string) => void
    onLeaveReview?: (orderId: string) => void
    className?: string
}

// ==========================================
// COMPONENT
// ==========================================

// Category Icon Component - render icon based on category
function CategoryIconDisplay({ category }: { category: OrderSummary['listingCategory'] }) {
    switch (category) {
        case 'People':
            return <User className="h-3.5 w-3.5" />
        case 'Products':
            return <Package className="h-3.5 w-3.5" />
        case 'Services':
            return <Briefcase className="h-3.5 w-3.5" />
        case 'AI':
            return <Bot className="h-3.5 w-3.5" />
        default:
            return <Briefcase className="h-3.5 w-3.5" />
    }
}

export function OrderSummaryCard({
    order,
    onViewDetails,
    onMessageProvider,
    onLeaveReview,
    className
}: OrderSummaryCardProps) {
    const statusConfig = getStatusConfig(order.status)
    const escrowConfig = getEscrowConfig(order.escrowStatus)
    const StatusIcon = statusConfig.icon

    const formatCurrency = (amount: number, currency: string) => {
        return `${currency} ${amount.toLocaleString('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`
    }

    const canLeaveReview = order.status === 'completed' && !order.hasLeftReview

    return (
        <Card className={cn("hover:shadow-md transition-shadow", className)}>
            <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Provider Avatar */}
                    <Avatar className="h-14 w-14 flex-shrink-0">
                        <AvatarImage src={order.providerAvatarUrl} alt={order.providerName} />
                        <AvatarFallback>
                            <User className="h-6 w-6" />
                        </AvatarFallback>
                    </Avatar>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-lg truncate">
                                    {order.listingTitle}
                                </h3>
                                <p className="text-muted-foreground text-sm">
                                    with {order.providerName}
                                </p>
                            </div>
                            
                            {/* Status Badge */}
                            <Badge className={cn("flex-shrink-0", statusConfig.color)}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig.label}
                            </Badge>
                        </div>

                        {/* Details Row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mb-3">
                            {/* Order Number */}
                            <span className="font-mono">#{order.orderNumber}</span>
                            
                            {/* Category */}
                            <span className="flex items-center gap-1">
                                <CategoryIconDisplay category={order.listingCategory} />
                                {order.listingCategory}
                            </span>

                            {/* Dates */}
                            {order.startDate && order.endDate && (
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {format(new Date(order.startDate), 'dd MMM')} - {format(new Date(order.endDate), 'dd MMM')}
                                </span>
                            )}

                            {/* Created Date */}
                            <span>
                                Created {format(new Date(order.createdAt), 'dd MMM yyyy')}
                            </span>
                        </div>

                        {/* Footer Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            {/* Price and Escrow Status */}
                            <div className="flex items-center gap-4">
                                <span className="text-lg font-semibold">
                                    {formatCurrency(order.totalAmount, order.currency)}
                                </span>
                                <span className={cn("text-sm flex items-center gap-1", escrowConfig.color)}>
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    {escrowConfig.label}
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                {/* Unread Messages Badge */}
                                {order.hasUnreadMessages && (
                                    <Badge variant="destructive" className="animate-pulse">
                                        <MessageSquare className="h-3 w-3 mr-1" />
                                        New Message
                                    </Badge>
                                )}

                                {/* Quick Actions */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onViewDetails?.(order.id)}
                                >
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    View
                                </Button>

                                {onMessageProvider && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onMessageProvider(order.id)}
                                    >
                                        <MessageSquare className="h-4 w-4" />
                                    </Button>
                                )}

                                {/* More Actions Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onViewDetails?.(order.id)}>
                                            <ExternalLink className="h-4 w-4 mr-2" />
                                            View Details
                                        </DropdownMenuItem>
                                        {onMessageProvider && (
                                            <DropdownMenuItem onClick={() => onMessageProvider(order.id)}>
                                                <MessageSquare className="h-4 w-4 mr-2" />
                                                Message Provider
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        {canLeaveReview && onLeaveReview && (
                                            <DropdownMenuItem onClick={() => onLeaveReview(order.id)}>
                                                <Star className="h-4 w-4 mr-2" />
                                                Leave Review
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// ==========================================
// COMPACT VARIANT
// ==========================================

interface OrderSummaryCardCompactProps {
    order: OrderSummary
    onClick?: () => void
    className?: string
}

export function OrderSummaryCardCompact({
    order,
    onClick,
    className
}: OrderSummaryCardCompactProps) {
    const statusConfig = getStatusConfig(order.status)
    const StatusIcon = statusConfig.icon

    return (
        <Card 
            className={cn(
                "cursor-pointer hover:bg-muted/50 transition-colors",
                className
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={order.providerAvatarUrl} alt={order.providerName} />
                        <AvatarFallback>
                            <User className="h-4 w-4" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{order.listingTitle}</p>
                        <p className="text-sm text-muted-foreground">
                            {order.currency} {order.totalAmount.toLocaleString()}
                        </p>
                    </div>
                    <Badge className={cn("flex-shrink-0 text-xs", statusConfig.color)}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig.label}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    )
}

export default OrderSummaryCard

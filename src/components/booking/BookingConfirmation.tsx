'use client'

import { format } from 'date-fns'
import {
    CheckCircle,
    Calendar,
    MessageSquare,
    ExternalLink,
    ShieldCheck,
    Clock,
    User,
    ArrowRight,
    Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { BookingConfirmation as BookingConfirmationType } from '@/types/booking'

// ==========================================
// PROPS
// ==========================================

interface BookingConfirmationProps {
    confirmation: BookingConfirmationType
    onViewOrder?: () => void
    onMessageProvider?: () => void
    onBackToMarketplace?: () => void
    className?: string
}

// ==========================================
// COMPONENT
// ==========================================

export function BookingConfirmation({
    confirmation,
    onViewOrder,
    onMessageProvider,
    onBackToMarketplace,
    className
}: BookingConfirmationProps) {

    const formatCurrency = (amount: number, currency: string) => {
        return `${currency} ${amount.toLocaleString('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`
    }

    return (
        <div className={cn("space-y-6", className)}>
            {/* Success Header */}
            <Card className="border-status-success bg-gradient-to-br from-status-success-light to-status-success-light/50">
                <CardContent className="pt-8 pb-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-status-success text-status-success-foreground mb-4">
                        <CheckCircle className="h-8 w-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-status-success-dark mb-2">
                        Booking Confirmed!
                    </h2>
                    <p className="text-status-success">
                        Your booking has been successfully created and payment received.
                    </p>
                    <Badge 
                        variant="secondary" 
                        className="mt-4 bg-white/80 text-status-success-dark font-mono text-lg px-4 py-2"
                    >
                        Order #{confirmation.orderNumber}
                    </Badge>
                </CardContent>
            </Card>

            {/* Booking Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Booking Details</CardTitle>
                    <CardDescription>
                        Created on {format(new Date(confirmation.createdAt), 'dd MMMM yyyy, HH:mm')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Provider Info */}
                    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                        <Avatar className="h-14 w-14">
                            <AvatarImage 
                                src={confirmation.providerAvatarUrl} 
                                alt={confirmation.providerName} 
                            />
                            <AvatarFallback>
                                <User className="h-6 w-6" />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <h4 className="font-semibold text-lg">{confirmation.providerName}</h4>
                            <p className="text-muted-foreground">{confirmation.listingTitle}</p>
                        </div>
                    </div>

                    {/* Dates */}
                    {confirmation.startDate && confirmation.endDate && (
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-muted rounded-lg">
                                <Calendar className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="font-medium">
                                    {format(new Date(confirmation.startDate), 'dd MMM yyyy')} - {format(new Date(confirmation.endDate), 'dd MMM yyyy')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Engagement period
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Payment */}
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-muted rounded-lg">
                            <ShieldCheck className="h-5 w-5 text-status-info" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium">Payment in Escrow</p>
                            <p className="text-sm text-muted-foreground">
                                Securely held until work completion
                            </p>
                        </div>
                        <span className="text-lg font-bold">
                            {formatCurrency(confirmation.totalAmount, confirmation.currency)}
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* Next Steps */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-status-warning" />
                        What Happens Next
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {confirmation.nextSteps.map((step, index) => (
                            <div key={index} className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                                    {index + 1}
                                </div>
                                <p className="text-muted-foreground pt-0.5">{step}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        Order Timeline
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative pl-6 space-y-4">
                        {/* Timeline line */}
                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-status-success-light" />
                        
                        {/* Timeline items */}
                        <div className="relative flex items-start gap-4">
                            <div className="absolute -left-6 w-4 h-4 rounded-full bg-status-success border-2 border-white" />
                            <div>
                                <p className="font-medium">Booking Created</p>
                                <p className="text-sm text-muted-foreground">
                                    {format(new Date(confirmation.createdAt), 'dd MMM yyyy, HH:mm')}
                                </p>
                            </div>
                        </div>

                        <div className="relative flex items-start gap-4">
                            <div className="absolute -left-6 w-4 h-4 rounded-full bg-status-success border-2 border-white" />
                            <div>
                                <p className="font-medium">Payment Received</p>
                                <p className="text-sm text-muted-foreground">
                                    Funds held in escrow
                                </p>
                            </div>
                        </div>

                        {confirmation.startDate && (
                            <div className="relative flex items-start gap-4">
                                <div className="absolute -left-6 w-4 h-4 rounded-full bg-muted border-2 border-white" />
                                <div>
                                    <p className="font-medium text-muted-foreground">Work Begins</p>
                                    <p className="text-sm text-muted-foreground">
                                        {format(new Date(confirmation.startDate), 'dd MMM yyyy')}
                                    </p>
                                </div>
                            </div>
                        )}

                        {confirmation.endDate && (
                            <div className="relative flex items-start gap-4">
                                <div className="absolute -left-6 w-4 h-4 rounded-full bg-muted border-2 border-white" />
                                <div>
                                    <p className="font-medium text-muted-foreground">Work Completed</p>
                                    <p className="text-sm text-muted-foreground">
                                        {format(new Date(confirmation.endDate), 'dd MMM yyyy')}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="relative flex items-start gap-4">
                            <div className="absolute -left-6 w-4 h-4 rounded-full bg-muted border-2 border-white" />
                            <div>
                                <p className="font-medium text-muted-foreground">Payment Released</p>
                                <p className="text-sm text-muted-foreground">
                                    Upon approval of deliverables
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Separator />

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
                {onViewOrder && (
                    <Button onClick={onViewOrder} className="flex-1">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Order Details
                    </Button>
                )}
                {onMessageProvider && confirmation.conversationId && (
                    <Button variant="secondary" onClick={onMessageProvider} className="flex-1">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Message Provider
                    </Button>
                )}
            </div>

            {onBackToMarketplace && (
                <Button 
                    variant="ghost" 
                    onClick={onBackToMarketplace}
                    className="w-full text-muted-foreground"
                >
                    Back to Marketplace
                    <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
            )}
        </div>
    )
}

export default BookingConfirmation

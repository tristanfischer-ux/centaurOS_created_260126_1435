"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
    CheckCircle2, 
    AlertCircle, 
    XCircle, 
    ExternalLink, 
    CreditCard,
    Loader2,
    RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { 
    createProviderStripeAccount, 
    getStripeOnboardingLink, 
    getStripeDashboardLink,
    checkStripeAccountStatus 
} from "@/actions/stripe-connect"

interface StripeAccountStatusProps {
    hasAccount: boolean
    isReady: boolean
    chargesEnabled: boolean
    payoutsEnabled: boolean
    detailsSubmitted: boolean
    requirements?: {
        currentlyDue: string[]
        eventuallyDue: string[]
        pastDue: string[]
    }
    className?: string
}

export function StripeAccountStatus({
    hasAccount,
    isReady,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirements,
    className
}: StripeAccountStatusProps) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const handleCreateAccount = () => {
        setError(null)
        startTransition(async () => {
            const result = await createProviderStripeAccount()
            if (!result.success) {
                setError(result.error || "Failed to create Stripe account")
                return
            }
            // After creating, get onboarding link
            const linkResult = await getStripeOnboardingLink()
            if (linkResult.url) {
                window.location.href = linkResult.url
            } else {
                setError(linkResult.error || "Failed to get onboarding link")
            }
        })
    }

    const handleCompleteSetup = () => {
        setError(null)
        startTransition(async () => {
            const linkResult = await getStripeOnboardingLink()
            if (linkResult.url) {
                window.location.href = linkResult.url
            } else {
                setError(linkResult.error || "Failed to get onboarding link")
            }
        })
    }

    const handleOpenDashboard = () => {
        setError(null)
        startTransition(async () => {
            const result = await getStripeDashboardLink()
            if (result.url) {
                window.open(result.url, '_blank')
            } else {
                setError(result.error || "Failed to get dashboard link")
            }
        })
    }

    // Determine status
    let status: 'not_connected' | 'incomplete' | 'restricted' | 'active' = 'not_connected'
    if (hasAccount) {
        if (isReady && chargesEnabled && payoutsEnabled) {
            status = 'active'
        } else if (detailsSubmitted) {
            status = 'restricted'
        } else {
            status = 'incomplete'
        }
    }

    const statusConfig = {
        not_connected: {
            icon: XCircle,
            color: 'text-slate-400',
            bgColor: 'bg-slate-50',
            badge: 'Not Connected',
            badgeVariant: 'secondary' as const,
            description: 'Connect your Stripe account to receive payments'
        },
        incomplete: {
            icon: AlertCircle,
            color: 'text-amber-500',
            bgColor: 'bg-amber-50',
            badge: 'Setup Incomplete',
            badgeVariant: 'secondary' as const,
            description: 'Complete your Stripe onboarding to receive payments'
        },
        restricted: {
            icon: AlertCircle,
            color: 'text-orange-500',
            bgColor: 'bg-orange-50',
            badge: 'Restricted',
            badgeVariant: 'secondary' as const,
            description: 'Some features are restricted. Additional verification may be needed.'
        },
        active: {
            icon: CheckCircle2,
            color: 'text-green-600',
            bgColor: 'bg-green-50',
            badge: 'Active',
            badgeVariant: 'default' as const,
            description: 'Your account is ready to receive payments'
        }
    }

    const config = statusConfig[status]
    const StatusIcon = config.icon

    return (
        <Card className={cn("", className)}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", config.bgColor)}>
                            <CreditCard className={cn("h-5 w-5", config.color)} />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Stripe Payments</CardTitle>
                            <CardDescription>{config.description}</CardDescription>
                        </div>
                    </div>
                    <Badge variant={config.badgeVariant} className="ml-2">
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {config.badge}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Status indicators for connected accounts */}
                {hasAccount && (
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 rounded-lg bg-slate-50">
                            <div className={cn(
                                "text-sm font-medium",
                                chargesEnabled ? "text-green-600" : "text-slate-400"
                            )}>
                                {chargesEnabled ? "Enabled" : "Disabled"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Charges</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-slate-50">
                            <div className={cn(
                                "text-sm font-medium",
                                payoutsEnabled ? "text-green-600" : "text-slate-400"
                            )}>
                                {payoutsEnabled ? "Enabled" : "Disabled"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Payouts</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-slate-50">
                            <div className={cn(
                                "text-sm font-medium",
                                detailsSubmitted ? "text-green-600" : "text-slate-400"
                            )}>
                                {detailsSubmitted ? "Complete" : "Incomplete"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Details</div>
                        </div>
                    </div>
                )}

                {/* Requirements warning */}
                {requirements && requirements.currentlyDue.length > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-amber-800">
                                    Action Required
                                </p>
                                <p className="text-xs text-amber-700 mt-1">
                                    {requirements.currentlyDue.length} item{requirements.currentlyDue.length !== 1 ? 's' : ''} need your attention to continue accepting payments.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error message */}
                {error && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3">
                    {!hasAccount && (
                        <Button 
                            onClick={handleCreateAccount} 
                            disabled={isPending}
                            className="flex-1"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <CreditCard className="h-4 w-4 mr-2" />
                            )}
                            Connect Stripe Account
                        </Button>
                    )}

                    {hasAccount && !isReady && (
                        <Button 
                            onClick={handleCompleteSetup} 
                            disabled={isPending}
                            className="flex-1"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Complete Setup
                        </Button>
                    )}

                    {hasAccount && (
                        <Button 
                            variant={isReady ? "default" : "secondary"}
                            onClick={handleOpenDashboard}
                            disabled={isPending}
                            className={isReady ? "flex-1" : ""}
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <ExternalLink className="h-4 w-4 mr-2" />
                            )}
                            {isReady ? "Open Stripe Dashboard" : "View Dashboard"}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

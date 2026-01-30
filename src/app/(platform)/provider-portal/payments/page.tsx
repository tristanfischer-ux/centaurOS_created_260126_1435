import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProviderProfile } from "@/actions/provider"
import { checkStripeAccountStatus } from "@/actions/stripe-connect"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StripeAccountStatus } from "@/components/provider/StripeAccountStatus"
import { 
    CreditCard, 
    Wallet, 
    FileText,
    TrendingUp,
    Clock,
    CalendarDays,
    ExternalLink,
    Info
} from "lucide-react"

function PaymentsSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                ))}
            </div>
            <Skeleton className="h-64" />
        </div>
    )
}

async function PaymentsContent() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const { profile } = await getProviderProfile()
    
    if (!profile) {
        redirect("/provider-portal")
    }

    const stripeStatus = await checkStripeAccountStatus()

    // Get balance info if account is ready
    let balanceInfo: { available: Record<string, number>; pending: Record<string, number> } | null = null
    if (stripeStatus.isReady && profile.stripe_account_id) {
        const { getAccountBalance } = await import("@/lib/stripe/connect")
        const balanceResult = await getAccountBalance(profile.stripe_account_id)
        if (!balanceResult.error) {
            balanceInfo = balanceResult.balance
        }
    }

    // Get payout summary
    const { data: recentPayouts } = await supabase
        .from('orders')
        .select('total_amount, platform_fee, currency, completed_at')
        .eq('seller_id', profile.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10)

    const totalPaidOut = (recentPayouts || []).reduce(
        (sum, order) => sum + (Number(order.total_amount) - Number(order.platform_fee || 0)),
        0
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Payments</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your payment settings and view your earnings
                </p>
            </div>

            {/* Stripe Account Status */}
            <StripeAccountStatus
                hasAccount={stripeStatus.hasAccount}
                isReady={stripeStatus.isReady}
                chargesEnabled={stripeStatus.chargesEnabled}
                payoutsEnabled={stripeStatus.payoutsEnabled}
                detailsSubmitted={stripeStatus.detailsSubmitted}
                requirements={stripeStatus.requirements}
            />

            {/* Balance Overview - Only show if account is ready */}
            {stripeStatus.isReady && balanceInfo && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-green-50">
                                    <Wallet className="h-5 w-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Available Balance</p>
                                    <p className="text-2xl font-bold">
                                        {Object.entries(balanceInfo.available).map(([currency, amount]) => (
                                            <span key={currency}>
                                                {currency.toUpperCase()} {(amount / 100).toFixed(2)}
                                            </span>
                                        ))}
                                        {Object.keys(balanceInfo.available).length === 0 && (
                                            <span className="text-muted-foreground">{profile.currency} 0.00</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-amber-50">
                                    <Clock className="h-5 w-5 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Pending</p>
                                    <p className="text-2xl font-bold">
                                        {Object.entries(balanceInfo.pending).map(([currency, amount]) => (
                                            <span key={currency}>
                                                {currency.toUpperCase()} {(amount / 100).toFixed(2)}
                                            </span>
                                        ))}
                                        {Object.keys(balanceInfo.pending).length === 0 && (
                                            <span className="text-muted-foreground">{profile.currency} 0.00</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-50">
                                    <TrendingUp className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Paid Out</p>
                                    <p className="text-2xl font-bold">
                                        {profile.currency} {totalPaidOut.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Payout Schedule Info */}
            {stripeStatus.isReady && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="h-5 w-5" />
                            Payout Schedule
                        </CardTitle>
                        <CardDescription>
                            How and when you receive your earnings
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg bg-muted">
                                <p className="text-sm font-medium">Payout Frequency</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Payouts are processed automatically through Stripe based on your account settings.
                                    Typically, this is daily or weekly depending on your Stripe configuration.
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted">
                                <p className="text-sm font-medium">Processing Time</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Once a payout is initiated, it typically takes 2-5 business days to arrive
                                    in your bank account, depending on your bank.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 border border-blue-100">
                            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-blue-900">
                                    Manage your payout settings in Stripe
                                </p>
                                <p className="text-sm text-blue-700 mt-1">
                                    You can change your payout schedule, add bank accounts, and view detailed
                                    transaction history in your Stripe Dashboard.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Platform Fees Info */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Fee Structure
                    </CardTitle>
                    <CardDescription>
                        Understanding platform fees
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-lg border">
                                <p className="text-lg font-bold text-international-orange">10%</p>
                                <p className="text-sm font-medium mt-1">Platform Fee</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Charged on each completed transaction
                                </p>
                            </div>
                            <div className="p-4 rounded-lg border">
                                <p className="text-lg font-bold text-muted-foreground">2.9% + 20p</p>
                                <p className="text-sm font-medium mt-1">Payment Processing</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Stripe&apos;s standard processing fee
                                </p>
                            </div>
                            <div className="p-4 rounded-lg border">
                                <p className="text-lg font-bold text-green-600">~87%</p>
                                <p className="text-sm font-medium mt-1">You Keep</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Your approximate earnings after fees
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            * Actual fees may vary based on transaction type and currency conversion.
                            VAT may apply to platform fees depending on your location.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Tax Information */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Tax Information
                    </CardTitle>
                    <CardDescription>
                        Important tax considerations for providers
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-amber-50 border border-amber-100">
                            <div className="flex items-start gap-2">
                                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-amber-900">
                                        You are responsible for your own taxes
                                    </p>
                                    <p className="text-sm text-amber-700 mt-1">
                                        As a provider on our marketplace, you are considered self-employed.
                                        You are responsible for reporting and paying any applicable taxes
                                        on your earnings. We recommend consulting with a tax professional.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg border">
                                <p className="text-sm font-medium">VAT/GST</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    If you&apos;re VAT-registered, you may need to charge VAT on your services.
                                    Update your tax settings in Stripe to handle this correctly.
                                </p>
                            </div>
                            <div className="p-4 rounded-lg border">
                                <p className="text-sm font-medium">Tax Documents</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Stripe provides annual tax documents for your records.
                                    Access these through your Stripe Dashboard.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default function ProviderPaymentsPage() {
    return (
        <Suspense fallback={<PaymentsSkeleton />}>
            <PaymentsContent />
        </Suspense>
    )
}

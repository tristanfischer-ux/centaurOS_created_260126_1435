// @ts-nocheck - provider_profiles table uses `as 'profiles'` cast workaround; stripe_account_id column not in generated types
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { checkStripeAccountStatus } from "@/actions/stripe-connect"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import Link from "next/link"

function CallbackSkeleton() {
    return (
        <div className="max-w-md mx-auto py-12">
            <Card>
                <CardContent className="pt-12 pb-8 text-center">
                    <Skeleton className="h-20 w-20 rounded-full mx-auto mb-6" />
                    <Skeleton className="h-8 w-48 mx-auto mb-2" />
                    <Skeleton className="h-4 w-64 mx-auto mb-6" />
                    <Skeleton className="h-10 w-32 mx-auto" />
                </CardContent>
            </Card>
        </div>
    )
}

async function CallbackContent({ 
    searchParams 
}: { 
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Check the current Stripe status
    const stripeStatus = await checkStripeAccountStatus()

    // Update provider profile with Stripe status
    // Note: provider_profiles table exists but may not be in generated types yet
    if (stripeStatus.hasAccount) {
        const { data: providerProfile } = await supabase
            .from('provider_profiles' as 'profiles')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (providerProfile) {
            await supabase
                .from('provider_profiles' as 'profiles')
                .update({
                    stripe_onboarding_complete: stripeStatus.isReady,
                } as Record<string, unknown>)
                .eq('id', (providerProfile as { id: string }).id)
        }
    }

    // Determine what to show based on status
    const isOnboardingComplete = params?.onboarding === 'complete'
    const needsRefresh = params?.refresh === 'true'

    if (needsRefresh) {
        // User needs to continue onboarding
        return (
            <div className="max-w-md mx-auto py-12">
                <Card>
                    <CardContent className="pt-12 pb-8 text-center">
                        <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-6">
                            <AlertCircle className="h-10 w-10 text-amber-600" />
                        </div>
                        <h1 className="text-2xl font-bold mb-2">Session Expired</h1>
                        <p className="text-muted-foreground mb-6">
                            Your Stripe onboarding session has expired. 
                            Please continue where you left off.
                        </p>
                        <Link href="/provider-portal/payments">
                            <Button>Continue Setup</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (stripeStatus.isReady) {
        // Onboarding is complete
        return (
            <div className="max-w-md mx-auto py-12">
                <Card>
                    <CardContent className="pt-12 pb-8 text-center">
                        <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 className="h-10 w-10 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold mb-2">Setup Complete!</h1>
                        <p className="text-muted-foreground mb-6">
                            Your Stripe account is connected and ready to receive payments.
                            You can now start accepting orders on the marketplace.
                        </p>
                        <div className="space-y-3">
                            <Link href="/provider-portal/payments">
                                <Button>View Payment Settings</Button>
                            </Link>
                            <p className="text-sm text-muted-foreground">
                                Manage your payout settings in the Stripe Dashboard
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Onboarding started but not complete
    return (
        <div className="max-w-md mx-auto py-12">
            <Card>
                <CardContent className="pt-12 pb-8 text-center">
                    <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-6">
                        <AlertCircle className="h-10 w-10 text-amber-600" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Almost There!</h1>
                    <p className="text-muted-foreground mb-6">
                        Your Stripe account has been created, but there are still some steps 
                        to complete before you can receive payments.
                    </p>
                    
                    {stripeStatus.requirements && stripeStatus.requirements.currentlyDue.length > 0 && (
                        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-left">
                            <p className="text-sm font-medium text-amber-800 mb-2">
                                Items needed:
                            </p>
                            <ul className="text-sm text-amber-700 space-y-1">
                                {stripeStatus.requirements.currentlyDue.slice(0, 5).map((item, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <span className="text-amber-500 mt-1">•</span>
                                        <span>{formatRequirement(item)}</span>
                                    </li>
                                ))}
                                {stripeStatus.requirements.currentlyDue.length > 5 && (
                                    <li className="text-amber-600">
                                        +{stripeStatus.requirements.currentlyDue.length - 5} more items
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                    
                    <Link href="/provider-portal/payments">
                        <Button>Complete Setup</Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    )
}

// Helper function to format requirement strings
function formatRequirement(requirement: string): string {
    const formatted = requirement
        .replace(/_/g, ' ')
        .replace(/\./g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    
    return formatted
}

export default async function StripeCallbackPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    return (
        <Suspense fallback={<CallbackSkeleton />}>
            <CallbackContent searchParams={props.searchParams} />
        </Suspense>
    )
}

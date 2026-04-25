import { Suspense } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { 
    CheckCircle2, 
    ArrowRight, 
    Store, 
    CreditCard, 
    User,
    Calendar,
    Star,
    Shield
} from "lucide-react"
import { ProviderSignupForm } from "./ProviderSignupForm"

interface PageProps {
    searchParams: Promise<{ listing?: string }>
}

function SignupSkeleton() {
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-64" />
        </div>
    )
}

async function SignupContent({ listingId }: { listingId?: string }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    // Check if user is already a provider
    if (user) {
        const { data: existingProvider } = await supabase
            .from('provider_profiles')
            .select('id, listing_id')
            .eq('user_id', user.id)
            .single()
        
        if (existingProvider) {
            // Already a provider, redirect to portal
            redirect('/provider-portal')
        }
    }
    
    // Get listing details if migrating from existing listing
    let listing = null
    let migrationRecord = null
    
    if (listingId) {
        const { data: listingData } = await supabase
            .from('marketplace_listings')
            .select('*')
            .eq('id', listingId)
            .single()
        
        listing = listingData
        
        // Get migration record
        const { data: migration } = await supabase
            .from('listing_migration')
            .select('*')
            .eq('listing_id', listingId)
            .single()
        
        migrationRecord = migration
    }
    
    return (
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground">
                    {listing ? 'Complete Your Provider Setup' : 'Become a Provider'}
                </h1>
                <p className="text-muted-foreground mt-2">
                    {listing 
                        ? `Upgrade "${listing.title}" to accept bookings and payments directly.`
                        : 'Join our marketplace and start accepting bookings from foundries.'}
                </p>
            </div>
            
            {/* Migration Banner */}
            {listing && (
                <Card className="mb-6 border bg-status-info-light/50">
                    <CardContent className="flex items-start gap-4 pt-6">
                        <div className="p-2 rounded-lg bg-status-info-light">
                            <Store className="h-5 w-5 text-status-info" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-status-info-dark">
                                Migrating: {listing.title}
                            </h3>
                            <p className="text-sm text-status-info-dark mt-1">
                                {listing.category} / {listing.subcategory}
                            </p>
                            <p className="text-sm text-status-info mt-2">
                                Your existing listing will be upgraded with booking and payment capabilities.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}
            
            {/* Benefits */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-lg">Provider Benefits</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-status-success-light">
                                <CreditCard className="h-4 w-4 text-status-success" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Secure Payments</p>
                                <p className="text-xs text-muted-foreground">
                                    Get paid through our secure escrow system
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-status-info-light">
                                <Calendar className="h-4 w-4 text-status-info" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Easy Scheduling</p>
                                <p className="text-xs text-muted-foreground">
                                    Manage availability with our calendar tools
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-status-warning-light">
                                <Star className="h-4 w-4 text-status-warning" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Build Reputation</p>
                                <p className="text-xs text-muted-foreground">
                                    Collect reviews and build trust with badges
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-muted">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Dispute Protection</p>
                                <p className="text-xs text-muted-foreground">
                                    Platform-backed dispute resolution
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            {/* Signup Steps */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-lg">Setup Steps</CardTitle>
                    <CardDescription>Complete these steps to start accepting bookings</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <StepItem
                            number={1}
                            title="Create Account"
                            description={user ? 'Signed in' : 'Sign up or sign in to your account'}
                            completed={!!user}
                        />
                        <StepItem
                            number={2}
                            title="Profile Information"
                            description="Add your business details and contact information"
                            completed={false}
                        />
                        <StepItem
                            number={3}
                            title="Connect Stripe"
                            description="Set up payments to receive payouts"
                            completed={false}
                        />
                        <StepItem
                            number={4}
                            title="Set Pricing"
                            description="Configure your rates and availability"
                            completed={false}
                        />
                    </div>
                </CardContent>
            </Card>
            
            {/* Signup Form or Auth Prompt */}
            {user ? (
                <ProviderSignupForm
                    listingId={listingId}
                    listing={listing ? {
                        id: listing.id,
                        title: listing.title,
                        category: listing.category,
                        subcategory: listing.subcategory,
                        description: listing.description,
                        attributes: listing.attributes as Record<string, unknown> | null,
                    } : null}
                    migrationRecord={migrationRecord ? {
                        id: migrationRecord.id,
                        status: migrationRecord.status ?? 'pending',
                    } : null}
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center space-y-4">
                            <div className="p-4 rounded-full bg-muted w-fit mx-auto">
                                <User className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Sign in to continue</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Create an account or sign in to start your provider setup.
                                </p>
                            </div>
                            <div className="flex gap-3 justify-center">
                                <Link href={`/login?redirect=/provider-signup${listingId ? `?listing=${listingId}` : ''}`}>
                                    <Button>
                                        Sign In
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                                <Link href={`/signup?redirect=/provider-signup${listingId ? `?listing=${listingId}` : ''}`}>
                                    <Button variant="secondary">
                                        Create Account
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

function StepItem({ 
    number, 
    title, 
    description, 
    completed 
}: { 
    number: number
    title: string
    description: string
    completed: boolean
}) {
    return (
        <div className="flex items-start gap-4">
            <div className={`
                flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0
                ${completed 
                    ? 'bg-status-success-light text-status-success' 
                    : 'bg-muted text-muted-foreground'
                }
            `}>
                {completed ? (
                    <CheckCircle2 className="h-5 w-5" />
                ) : (
                    <span className="text-sm font-semibold">{number}</span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`font-medium ${completed ? 'text-status-success-dark' : ''}`}>
                    {title}
                </p>
                <p className="text-sm text-muted-foreground">
                    {description}
                </p>
            </div>
            {completed && (
                <Badge variant="secondary" className="bg-status-success-light text-status-success-dark">
                    Complete
                </Badge>
            )}
        </div>
    )
}

export default async function ProviderSignupPage({ searchParams }: PageProps) {
    const params = await searchParams
    
    return (
        <div className="py-8">
            <Suspense fallback={<SignupSkeleton />}>
                <SignupContent listingId={params.listing} />
            </Suspense>
        </div>
    )
}

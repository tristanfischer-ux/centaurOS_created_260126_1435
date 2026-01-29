import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getListingForBooking } from '@/actions/booking'
import { BookingWizard } from '@/components/booking/BookingWizard'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// Force dynamic since we're fetching data
export const dynamic = 'force-dynamic'

interface BookingPageProps {
    params: Promise<{
        id: string
    }>
}

export default async function BookingPage({ params }: BookingPageProps) {
    const { id } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect(`/login?redirect=/marketplace/${id}/book`)
    }

    // Get listing and provider data
    const { data, error } = await getListingForBooking(id)

    if (error || !data) {
        notFound()
    }

    const { listing, provider } = data

    // Only People category can be booked directly
    if (listing.category !== 'People') {
        return (
            <div className="container max-w-3xl mx-auto py-12 px-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Booking Not Available</h1>
                    <p className="text-muted-foreground mb-6">
                        Direct booking is only available for People listings. 
                        For Products, Services, and AI, please submit an RFQ (Request for Quote).
                    </p>
                    <div className="flex justify-center gap-4">
                        <Button variant="outline" asChild>
                            <Link href={`/marketplace`}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Marketplace
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    // Check if provider exists and is active
    if (!provider) {
        return (
            <div className="container max-w-3xl mx-auto py-12 px-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Provider Not Available</h1>
                    <p className="text-muted-foreground mb-6">
                        This listing does not have an associated provider profile. 
                        The provider may need to complete their profile setup.
                    </p>
                    <Button variant="outline" asChild>
                        <Link href="/marketplace">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Marketplace
                        </Link>
                    </Button>
                </div>
            </div>
        )
    }

    if (!provider.isActive) {
        return (
            <div className="container max-w-3xl mx-auto py-12 px-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Provider Unavailable</h1>
                    <p className="text-muted-foreground mb-6">
                        This provider is currently not accepting new bookings. 
                        Please check back later or browse other providers.
                    </p>
                    <Button variant="outline" asChild>
                        <Link href="/marketplace">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Marketplace
                        </Link>
                    </Button>
                </div>
            </div>
        )
    }

    // Check if provider has set a day rate
    if (!provider.dayRate) {
        return (
            <div className="container max-w-3xl mx-auto py-12 px-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Pricing Not Set</h1>
                    <p className="text-muted-foreground mb-6">
                        This provider has not set their day rate yet. 
                        Please contact them directly or check back later.
                    </p>
                    <Button variant="outline" asChild>
                        <Link href="/marketplace">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Marketplace
                        </Link>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
            {/* Header */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container max-w-3xl mx-auto py-4 px-4">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/marketplace">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Marketplace
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Booking Wizard */}
            <BookingWizard
                listing={{
                    id: listing.id,
                    title: listing.title,
                    category: listing.category,
                    subcategory: listing.subcategory,
                    description: listing.description
                }}
                provider={{
                    id: provider.id,
                    userId: provider.userId,
                    name: provider.name,
                    avatarUrl: provider.avatarUrl,
                    dayRate: provider.dayRate,
                    currency: provider.currency,
                    minimumDays: provider.minimumDays
                }}
            />
        </div>
    )
}

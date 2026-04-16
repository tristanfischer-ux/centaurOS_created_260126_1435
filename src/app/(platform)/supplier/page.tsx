import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { 
  getProviderProfile, 
  getProviderDashboardStats, 
  getProviderOrders
} from "@/actions/provider"
import { checkStripeAccountStatus } from "@/actions/stripe-connect"
import { SupplierDashboard } from "@/components/supplier/SupplierDashboard"
import { Skeleton } from "@/components/ui/skeleton"

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

async function DashboardContent() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // Get user profile
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single()

  // Get provider profile and stats
  const { profile } = await getProviderProfile()
  
  // If no provider profile exists, show a setup message
  if (!profile) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16">
          <h1 className="text-2xl font-display font-semibold text-foreground mb-4">
            Welcome to Your Supplier Portal
          </h1>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            You haven&apos;t set up your marketplace listing yet. Create your listing to start receiving orders and RFQ opportunities.
          </p>
          <a 
            href="/supplier/listing" 
            className="inline-flex items-center justify-center px-6 py-3 min-h-[48px] bg-international-orange text-white font-semibold rounded-lg hover:bg-international-orange/90 transition-colors"
          >
            Create Your Listing
          </a>
        </div>
      </div>
    )
  }

  // Fetch all data in parallel
  const [
    { stats },
    { orders: recentOrders },
    stripeStatus,
    rfqResult
  ] = await Promise.all([
    getProviderDashboardStats(),
    getProviderOrders({ limit: 5 }),
    checkStripeAccountStatus(),
    // Fetch RFQ opportunities for this supplier
    supabase
      .from("rfqs")
      .select(`
        id,
        title,
        budget_max,
        deadline,
        rfq_responses(id)
      `)
      .eq("status", "Open")
      .order("created_at", { ascending: false })
      .limit(5)
  ])

  // Transform RFQ data
  const rfqOpportunities = (rfqResult.data || []).map(rfq => ({
    id: rfq.id,
    title: rfq.title,
    budget_max: rfq.budget_max,
    currency: profile.currency || 'USD',
    deadline: rfq.deadline,
    responses_count: rfq.rfq_responses?.length || 0
  }))

  // Calculate new RFQs count (not yet responded to by this provider)
  const newRfqsCount = rfqOpportunities.length

  // Build onboarding steps
  const onboardingSteps = [
    { id: 'headline', label: 'Add a headline', completed: !!profile.headline, required: true },
    { id: 'bio', label: 'Write your bio', completed: !!profile.bio, required: true },
    { id: 'stripe', label: 'Connect Stripe', completed: stripeStatus.isReady, required: true },
    { id: 'rates', label: 'Set your rates', completed: !!profile.day_rate || !!profile.hourly_rate, required: true },
  ]

  const completedSteps = onboardingSteps.filter(s => s.completed).length
  const profileCompletionPercent = Math.round((completedSteps / onboardingSteps.length) * 100)

  // Build stats object
  const dashboardStats = {
    activeOrdersCount: stats?.activeOrdersCount || 0,
    pendingOrdersCount: recentOrders.filter(o => o.status === 'pending').length,
    newRfqsCount,
    earningsThisMonth: stats?.earningsThisMonth || 0,
    averageRating: stats?.averageRating || null,
    reviewCount: stats?.reviewCount || 0,
    currency: profile.currency || 'USD'
  }

  // Transform orders for the component
  const transformedOrders = recentOrders.map(order => ({
    id: order.id,
    order_number: order.order_number,
    listing_title: order.listing_title,
    buyer_name: order.buyer_name,
    status: order.status,
    total_amount: order.total_amount,
    currency: order.currency,
    created_at: order.created_at
  }))

  return (
    <SupplierDashboard
      userName={userProfile?.full_name || 'Supplier'}
      stats={dashboardStats}
      recentOrders={transformedOrders}
      rfqOpportunities={rfqOpportunities}
      onboardingSteps={onboardingSteps}
      profileCompletionPercent={profileCompletionPercent}
    />
  )
}

export default function SupplierPortalPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}

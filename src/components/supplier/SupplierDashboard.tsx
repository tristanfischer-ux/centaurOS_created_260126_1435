'use client'

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  ShoppingCart, 
  FileText, 
  DollarSign, 
  Star,
  ArrowRight,
  Package,
  Clock,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { typography } from "@/lib/design-system"

interface DashboardStats {
  activeOrdersCount: number
  pendingOrdersCount: number
  newRfqsCount: number
  earningsThisMonth: number
  averageRating: number | null
  reviewCount: number
  currency: string
}

interface RecentOrder {
  id: string
  order_number: string
  listing_title: string | null
  buyer_name: string
  status: string
  total_amount: number
  currency: string
  created_at: string
}

interface RFQOpportunity {
  id: string
  title: string
  budget_max: number | null
  currency: string
  deadline: string | null
  responses_count: number
}

interface OnboardingStep {
  id: string
  label: string
  completed: boolean
  required: boolean
}

interface SupplierDashboardProps {
  userName: string
  stats: DashboardStats
  recentOrders: RecentOrder[]
  rfqOpportunities: RFQOpportunity[]
  onboardingSteps: OnboardingStep[]
  profileCompletionPercent: number
}

const statusColors: Record<string, string> = {
  pending: 'bg-status-warning-light text-status-warning-dark',
  accepted: 'bg-status-info-light text-status-info-dark',
  in_progress: 'bg-status-info-light text-status-info-dark',
  completed: 'bg-status-success-light text-status-success-dark',
  cancelled: 'bg-status-error-light text-status-error-dark',
  disputed: 'bg-status-warning-light text-status-warning-dark'
}

export function SupplierDashboard({
  userName,
  stats,
  recentOrders,
  rfqOpportunities,
  onboardingSteps,
  profileCompletionPercent
}: SupplierDashboardProps) {
  const completedSteps = onboardingSteps.filter(s => s.completed).length
  const totalSteps = onboardingSteps.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Welcome back, {userName || 'Supplier'}!</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Your Supplier Portal overview
          </p>
        </div>
        <Link href="/supplier-portal/listing">
          <Button>
            <Package className="h-4 w-4 mr-2" />
            Edit Listing
          </Button>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-success-light">
                <ShoppingCart className="h-5 w-5 text-status-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeOrdersCount}</p>
                <p className="text-sm text-muted-foreground">Active Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-warning-light">
                <FileText className="h-5 w-5 text-status-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.newRfqsCount}</p>
                <p className="text-sm text-muted-foreground">New RFQs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-info-light">
                <DollarSign className="h-5 w-5 text-status-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats.currency} {stats.earningsThisMonth.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-warning-light">
                <Star className="h-5 w-5 text-status-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats.averageRating ? stats.averageRating.toFixed(1) : '-'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Rating ({stats.reviewCount} reviews)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profile Completion (if not complete) */}
      {profileCompletionPercent < 100 && (
        <Card className="border-status-warning-light">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-status-warning" />
              Complete Your Profile
            </CardTitle>
            <CardDescription>
              Finish setting up to rank higher in search results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{completedSteps} of {totalSteps} steps complete</span>
                  <span className="font-medium">{profileCompletionPercent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-international-orange transition-all duration-500"
                    style={{ width: `${profileCompletionPercent}%` }}
                  />
                </div>
              </div>
              
              {/* Incomplete Steps */}
              <div className="flex flex-wrap gap-2">
                {onboardingSteps.filter(s => !s.completed).map((step) => (
                  <Badge key={step.id} variant="secondary" className="text-xs">
                    {step.label}
                  </Badge>
                ))}
              </div>
              
              <Link href="/supplier-portal/listing">
                <Button variant="secondary" size="sm">
                  Complete Setup
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg">Recent Orders</CardTitle>
              <CardDescription>Your latest orders</CardDescription>
            </div>
            <Link href="/supplier-portal/orders">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No orders yet</p>
                <p className="text-xs mt-1">Orders will appear here when buyers purchase from you</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <Link 
                    key={order.id}
                    href={`/supplier-portal/orders/${order.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {order.listing_title || `Order ${order.order_number}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.buyer_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          statusColors[order.status] || 'bg-muted'
                        )}
                      >
                        {order.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-sm font-medium">
                        {order.currency} {order.total_amount.toFixed(0)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RFQ Opportunities */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg">RFQ Opportunities</CardTitle>
              <CardDescription>New requests matching your profile</CardDescription>
            </div>
            <Link href="/supplier-portal/rfqs">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {rfqOpportunities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No new RFQs</p>
                <p className="text-xs mt-1">Check back later for new opportunities</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rfqOpportunities.map((rfq) => (
                  <Link
                    key={rfq.id}
                    href={`/supplier-portal/rfqs?id=${rfq.id}`}
                    className="block p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium line-clamp-1">{rfq.title}</p>
                      {rfq.budget_max && (
                        <Badge variant="secondary" className="shrink-0">
                          {rfq.currency} {rfq.budget_max.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {rfq.deadline && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Due {new Date(rfq.deadline).toLocaleDateString()}
                        </span>
                      )}
                      <span>{rfq.responses_count} responses</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

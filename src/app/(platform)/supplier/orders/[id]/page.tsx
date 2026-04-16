import { Suspense } from "react"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { typography } from "@/lib/design-system"
import { 
  ArrowLeft, 
  Clock, 
  User, 
  Package, 
  PoundSterling,
  MessageSquare,
  CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"

const statusColors: Record<string, string> = {
  pending: 'bg-status-warning-light text-status-warning-dark',
  accepted: 'bg-status-info-light text-status-info-dark',
  in_progress: 'bg-status-info-light text-status-info-dark',
  completed: 'bg-status-success-light text-status-success-dark',
  cancelled: 'bg-status-error-light text-status-error-dark',
  disputed: 'bg-status-warning-light text-status-warning-dark'
}

function OrderDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

async function OrderDetailContent({ orderId }: { orderId: string }) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // Fetch order with buyer info
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      *,
      buyer:profiles!orders_buyer_id_fkey (
        full_name,
        email
      ),
      listing:marketplace_listings (
        title,
        category,
        subcategory
      )
    `)
    .eq("id", orderId)
    .single()

  if (error || !order) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <Link 
            href="/supplier/orders"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </Link>
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Order #{order.order_number}</h1>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Badge 
              variant="secondary"
              className={cn(statusColors[order.status ?? 'pending'])}
            >
              {(order.status ?? 'pending').replace('_', ' ')}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }) : '-'}
            </span>
          </div>
        </div>
        
        {order.status === 'pending' && (
          <div className="flex gap-2">
            <Button variant="secondary">Decline</Button>
            <Button>Accept Order</Button>
          </div>
        )}
        
        {order.status === 'accepted' && (
          <Button>Mark In Progress</Button>
        )}
        
        {order.status === 'in_progress' && (
          <Button>Mark Complete</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Listing</p>
                  <p className="font-medium">{order.listing?.title || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{order.listing?.category || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Type</p>
                  <p className="font-medium capitalize">{order.order_type?.replace('_', ' ') || 'Standard'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                  </p>
                </div>
              </div>
              
              {/* Notes would appear here if order had a notes field */}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Order Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-status-success-light flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-status-success" />
                  </div>
                  <div>
                    <p className="font-medium">Order Created</p>
                    <p className="text-sm text-muted-foreground">
                      {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                    </p>
                  </div>
                </div>
                
                {order.status !== 'pending' && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-status-info-light flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-status-info" />
                    </div>
                    <div>
                      <p className="font-medium">Order Accepted</p>
                    </div>
                  </div>
                )}
                
                {order.status === 'completed' && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-status-success-light flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-status-success" />
                    </div>
                    <div>
                      <p className="font-medium">Order Completed</p>
                      <p className="text-sm text-muted-foreground">
                        {order.completed_at ? new Date(order.completed_at).toLocaleString() : '-'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PoundSterling className="h-5 w-5" />
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{order.currency} {order.total_amount?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform Fee</span>
                <span>-{order.currency} {((order.total_amount || 0) * 0.1).toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Your Payout</span>
                <span>{order.currency} {((order.total_amount || 0) * 0.9).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Buyer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Buyer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="font-medium">{order.buyer?.full_name || 'Unknown'}</p>
                <p className="text-sm text-muted-foreground">{order.buyer?.email || '-'}</p>
              </div>
              <Button variant="secondary" className="w-full">
                <MessageSquare className="h-4 w-4 mr-2" />
                Message Buyer
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function SupplierOrderDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetailContentWrapper params={params} />
    </Suspense>
  )
}

async function OrderDetailContentWrapper({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  return <OrderDetailContent orderId={id} />
}

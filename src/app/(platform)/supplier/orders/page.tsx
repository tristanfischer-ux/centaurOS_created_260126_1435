import { Suspense } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getProviderOrders } from "@/actions/provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { typography } from "@/lib/design-system"
import { ShoppingCart, Package, ArrowRight, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

const statusColors: Record<string, string> = {
  pending: 'bg-status-warning-light text-status-warning-dark',
  accepted: 'bg-status-info-light text-status-info-dark',
  in_progress: 'bg-status-info-light text-status-info-dark',
  completed: 'bg-status-success-light text-status-success-dark',
  cancelled: 'bg-status-error-light text-status-error-dark',
  disputed: 'bg-status-warning-light text-status-warning-dark'
}

function OrdersSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  )
}

async function OrdersContent() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { orders, error } = await getProviderOrders({ limit: 50 })

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load orders</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Orders</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Manage and track your orders
          </p>
        </div>
      </div>

      {/* Orders List */}
      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                When buyers purchase from you, their orders will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link 
              key={order.id} 
              href={`/supplier/orders/${order.id}`}
              className="block"
            >
              <Card className="hover:border-international-orange/50 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold truncate">
                          {order.listing_title || `Order ${order.order_number}`}
                        </h3>
                        <Badge 
                          variant="secondary"
                          className={cn("shrink-0", statusColors[order.status])}
                        >
                          {order.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>#{order.order_number}</span>
                        <span>{order.buyer_name}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(order.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">
                          {order.currency} {order.total_amount.toLocaleString()}
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SupplierOrdersPage() {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersContent />
    </Suspense>
  )
}

import { Suspense } from "react"
import { getMyOrders } from "@/actions/orders"
import { OrdersView } from "./orders-view"
import { OrderCardSkeleton } from "@/components/orders"

export const dynamic = "force-dynamic"

export default async function OrdersPage() {
  // Fetch initial orders (all statuses, both roles)
  const { data: orders, count, error } = await getMyOrders(undefined, undefined, 20, 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-1 bg-primary rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
              Orders
            </h1>
          </div>
          <p className="text-muted-foreground text-sm font-medium pl-4">View and manage all orders</p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-8 w-48 bg-muted rounded animate-pulse" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <OrderCardSkeleton key={i} />
              ))}
            </div>
          </div>
        }
      >
        <OrdersView initialOrders={orders} initialCount={count} error={error} />
      </Suspense>
    </div>
  )
}

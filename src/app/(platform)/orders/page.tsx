import { Suspense } from "react"
import { getMyOrders } from "@/actions/orders"
import { OrdersView } from "./orders-view"
import { OrderCardSkeleton } from "@/components/orders"

export const dynamic = "force-dynamic"

export default async function OrdersPage() {
  // Fetch initial orders (all statuses, both roles)
  const { data: orders, count, error } = await getMyOrders(undefined, undefined, 20, 0)

  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-4">
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
  )
}

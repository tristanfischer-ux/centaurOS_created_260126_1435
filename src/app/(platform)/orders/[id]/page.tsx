import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getOrderDetail } from "@/actions/orders"
import { OrderDetail, OrderDetailSkeleton } from "@/components/orders"
import { ChevronRight } from "lucide-react"

export const dynamic = "force-dynamic"

interface OrderDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params
  const { data: order, error, role } = await getOrderDetail(id)

  if (error || !order || !role) {
    // Check if it's an auth error vs not found
    if (error === "Not authenticated") {
      return (
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h2 className="text-lg font-semibold">Authentication Required</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please sign in to view this order.
            </p>
          </div>
        </div>
      )
    }

    if (error === "Not authorized to view this order") {
      return (
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground mt-1">
              You don&apos;t have permission to view this order.
            </p>
            <Link href="/orders" className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Back to Orders
            </Link>
          </div>
        </div>
      )
    }

    notFound()
  }

  return (
    <div className="p-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm mb-6">
        <Link 
          href="/orders" 
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Orders
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-foreground font-medium">
          Order #{id.slice(0, 8)}
        </span>
      </nav>

      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderDetail order={order} userRole={role} />
      </Suspense>
    </div>
  )
}

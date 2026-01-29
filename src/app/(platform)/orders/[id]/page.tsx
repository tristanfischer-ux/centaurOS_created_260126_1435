import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getOrderDetail } from "@/actions/orders"
import { OrderDetail, OrderDetailSkeleton } from "@/components/orders"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

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
            <Button variant="outline" asChild className="mt-4">
              <Link href="/orders">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Orders
              </Link>
            </Button>
          </div>
        </div>
      )
    }

    notFound()
  }

  return (
    <div className="p-6">
      {/* Back Navigation */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/orders">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Orders
          </Link>
        </Button>
      </div>

      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderDetail order={order} userRole={role} />
      </Suspense>
    </div>
  )
}

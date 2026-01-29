"use client"

import { memo } from "react"
import Link from "next/link"
import { OrderSummary, OrderRole } from "@/types/orders"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { OrderStatusBadge } from "./OrderStatusBadge"
import { OrderActions } from "./OrderActions"
import { cn } from "@/lib/utils"
import { formatDistanceToNow, format } from "date-fns"
import {
  Calendar,
  Package,
  User,
  Store,
  ChevronRight,
  Briefcase,
  ShoppingCart,
  Cpu,
} from "lucide-react"

interface OrderCardProps {
  order: OrderSummary
  userRole: OrderRole
  className?: string
  showActions?: boolean
  onActionComplete?: () => void
}

const orderTypeConfig: Record<
  string,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    color: string
  }
> = {
  people_booking: {
    label: "Booking",
    icon: Briefcase,
    color: "text-blue-600",
  },
  product_rfq: {
    label: "Product RFQ",
    icon: ShoppingCart,
    color: "text-green-600",
  },
  service: {
    label: "Service",
    icon: Cpu,
    color: "text-purple-600",
  },
}

export const OrderCard = memo(function OrderCard({
  order,
  userRole,
  className,
  showActions = true,
  onActionComplete,
}: OrderCardProps) {
  const typeConfig = orderTypeConfig[order.order_type] || {
    label: order.order_type,
    icon: Package,
    color: "text-gray-600",
  }
  const TypeIcon = typeConfig.icon

  // Determine counterparty (buyer sees seller, seller sees buyer)
  const counterparty =
    userRole === "buyer"
      ? order.seller?.display_name || order.seller?.profile?.full_name || "Unknown Seller"
      : order.buyer?.full_name || "Unknown Buyer"

  const CounterpartyIcon = userRole === "buyer" ? Store : User

  // Format currency
  const formattedAmount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: order.currency || "GBP",
  }).format(order.total_amount)

  return (
    <Card
      className={cn(
        "group relative flex flex-col transition-all duration-200 hover:shadow-md",
        className
      )}
    >
      <Link href={`/orders/${order.id}`} className="flex-1">
        <CardContent className="p-4">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"
                )}
              >
                <TypeIcon className={cn("h-4 w-4", typeConfig.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-mono text-muted-foreground">
                  {order.order_number || "—"}
                </p>
                <h3 className="font-semibold text-sm truncate">
                  {order.listing?.title || typeConfig.label}
                </h3>
              </div>
            </div>
            <OrderStatusBadge status={order.status} size="sm" />
          </div>

          {/* Details */}
          <div className="space-y-2">
            {/* Counterparty */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CounterpartyIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{counterparty}</span>
            </div>

            {/* Amount and Date Row */}
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-foreground">
                {formattedAmount}
              </span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(order.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>

            {/* Completed date if applicable */}
            {order.completed_at && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <span className="font-medium">Completed</span>
                <span>
                  {format(new Date(order.completed_at), "MMM d, yyyy")}
                </span>
              </p>
            )}
          </div>
        </CardContent>
      </Link>

      {/* Actions Footer */}
      <CardFooter
        className={cn(
          "flex items-center justify-between gap-2 p-3 pt-0 border-t bg-muted/30",
          !showActions && "hidden"
        )}
      >
        <OrderActions
          orderId={order.id}
          status={order.status}
          userRole={userRole}
          compact
          onActionComplete={onActionComplete}
        />
        <Link
          href={`/orders/${order.id}`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Details
          <ChevronRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  )
})

// Compact inline order card for widgets
export function OrderCardInline({
  order,
  className,
}: {
  order: OrderSummary
  className?: string
}) {
  const formattedAmount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: order.currency || "GBP",
  }).format(order.total_amount)

  return (
    <Link
      href={`/orders/${order.id}`}
      className={cn(
        "flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <OrderStatusBadge status={order.status} size="sm" showIcon={false} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {order.listing?.title || order.order_number || "Order"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
      <span className="text-sm font-semibold shrink-0">{formattedAmount}</span>
    </Link>
  )
}

// Order card skeleton for loading states
export function OrderCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted" />
            <div className="space-y-1">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-4 w-32 bg-muted rounded" />
            </div>
          </div>
          <div className="h-5 w-16 bg-muted rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="flex justify-between">
            <div className="h-6 w-24 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { OrderWithDetails, OrderRole, OrderMilestone } from "@/types/orders"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { OrderStatusBadge } from "./OrderStatusBadge"
import { OrderActions } from "./OrderActions"
import { OrderTimeline } from "./OrderTimeline"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import {
  User,
  Store,
  Calendar,
  Package,
  CreditCard,
  FileText,
  MessageSquare,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"

interface OrderDetailProps {
  order: OrderWithDetails
  userRole: OrderRole
  className?: string
  onActionComplete?: () => void
}

export function OrderDetail({
  order,
  userRole,
  className,
  onActionComplete,
}: OrderDetailProps) {
  const formattedAmount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: order.currency || "GBP",
  }).format(order.total_amount)

  const formattedFee = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: order.currency || "GBP",
  }).format(order.platform_fee)

  const formattedVat = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: order.currency || "GBP",
  }).format(order.vat_amount)

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-muted-foreground">
                  {order.order_number || "—"}
                </p>
                <OrderStatusBadge status={order.status} />
              </div>
              <CardTitle className="text-xl">
                {order.listing?.title || "Order"}
              </CardTitle>
              {order.listing?.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {order.listing.description}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold">{formattedAmount}</p>
              <p className="text-xs text-muted-foreground">
                Total ({order.currency || "GBP"})
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <OrderActions
            orderId={order.id}
            status={order.status}
            userRole={userRole}
            hasOpenDispute={!!order.dispute}
            onActionComplete={onActionComplete}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Parties */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Buyer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-info-light">
                    <User className="h-5 w-5 text-status-info" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {order.buyer?.full_name || "Unknown Buyer"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Buyer · {order.buyer?.email}
                    </p>
                  </div>
                </div>
                {userRole === "seller" && (
                  <Badge variant="secondary">Counterparty</Badge>
                )}
                {userRole === "buyer" && (
                  <Badge variant="info">You</Badge>
                )}
              </div>

              <Separator />

              {/* Seller */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-light">
                    <Store className="h-5 w-5 text-status-success" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {order.seller?.display_name ||
                        order.seller?.profile?.full_name ||
                        "Unknown Seller"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seller{" "}
                      {order.seller?.profile?.email &&
                        `· ${order.seller.profile.email}`}
                    </p>
                  </div>
                </div>
                {userRole === "buyer" && (
                  <Badge variant="secondary">Counterparty</Badge>
                )}
                {userRole === "seller" && (
                  <Badge variant="info">You</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Milestones */}
          {order.milestones && order.milestones.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <MilestoneList
                  milestones={order.milestones}
                  currency={order.currency}
                />
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          {order.events && order.events.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderTimeline events={order.events} />
              </CardContent>
            </Card>
          )}

          {/* Dispute Info */}
          {order.dispute && (
            <Card className="border-status-warning bg-status-warning-light/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-status-warning-dark">
                  <AlertTriangle className="h-4 w-4" />
                  Active Dispute
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-status-warning-dark mb-2">
                  {order.dispute.reason}
                </p>
                <div className="flex items-center justify-between text-xs text-status-warning">
                  <span>Status: {order.dispute.status}</span>
                  <span>
                    Opened:{" "}
                    {format(new Date(order.dispute.created_at), "MMM d, yyyy")}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailRow
                icon={Package}
                label="Order Type"
                value={formatOrderType(order.order_type)}
              />
              <DetailRow
                icon={Calendar}
                label="Created"
                value={format(new Date(order.created_at), "MMM d, yyyy")}
              />
              {order.completed_at && (
                <DetailRow
                  icon={CheckCircle}
                  label="Completed"
                  value={format(new Date(order.completed_at), "MMM d, yyyy")}
                  highlight="green"
                />
              )}
              <DetailRow
                icon={CreditCard}
                label="Escrow Status"
                value={formatEscrowStatus(order.escrow_status)}
                badge
              />
            </CardContent>
          </Card>

          {/* Payment Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>
                  {new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: order.currency || "GBP",
                  }).format(order.total_amount - order.vat_amount)}
                </span>
              </div>
              {order.vat_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    VAT ({(order.vat_rate * 100).toFixed(0)}%)
                  </span>
                  <span>{formattedVat}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formattedAmount}</span>
              </div>
              {userRole === "seller" && (
                <>
                  <Separator />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Platform Fee</span>
                    <span>-{formattedFee}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium text-status-success">
                    <span>Your Earnings</span>
                    <span>
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: order.currency || "GBP",
                      }).format(order.total_amount - order.platform_fee)}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="secondary"
                className="w-full justify-start"
                asChild
              >
                <Link href={`/orders/${order.id}#messaging`}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Messages
                </Link>
              </Button>
              {order.listing && (
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  asChild
                >
                  <Link href={`/marketplace/${order.listing.id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Listing
                  </Link>
                </Button>
              )}
              <Button
                variant="secondary"
                className="w-full justify-start"
                asChild
              >
                <Link href={`/orders/${order.id}/documents`}>
                  <FileText className="h-4 w-4 mr-2" />
                  Documents
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Helper Components

function DetailRow({
  icon: Icon,
  label,
  value,
  highlight,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  highlight?: "green" | "red" | "yellow"
  badge?: boolean
}) {
  const highlightClasses = {
    green: "text-status-success",
    red: "text-destructive",
    yellow: "text-status-warning",
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      {badge ? (
        <Badge variant="secondary" className="font-normal">
          {value}
        </Badge>
      ) : (
        <span
          className={cn(
            "text-sm font-medium",
            highlight && highlightClasses[highlight]
          )}
        >
          {value}
        </span>
      )}
    </div>
  )
}

function MilestoneList({
  milestones,
  currency,
}: {
  milestones: OrderMilestone[]
  currency: string
}) {
  return (
    <div className="space-y-3">
      {milestones.map((milestone, index) => (
        <div
          key={milestone.id}
          className={cn(
            "flex items-center justify-between p-3 rounded-lg border",
            milestone.status === "approved" && "border-status-success bg-status-success-light/50",
            milestone.status === "rejected" && "border-destructive bg-status-error-light/50",
            milestone.status === "submitted" && "border-status-warning bg-status-warning-light/50"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                milestone.status === "approved" && "bg-status-success-light text-status-success-dark",
                milestone.status === "rejected" && "bg-status-error-light text-destructive",
                milestone.status === "submitted" && "bg-status-warning-light text-status-warning-dark",
                milestone.status === "pending" && "bg-muted text-muted-foreground",
                milestone.status === "paid" && "bg-status-success-light text-status-success-dark"
              )}
            >
              {milestone.status === "approved" || milestone.status === "paid" ? (
                <CheckCircle className="h-4 w-4" />
              ) : milestone.status === "submitted" ? (
                <Clock className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <div>
              <p className="font-medium text-sm">{milestone.title}</p>
              {milestone.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {milestone.description}
                </p>
              )}
              {milestone.due_date && (
                <p className="text-xs text-muted-foreground">
                  Due: {format(new Date(milestone.due_date), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="font-medium">
              {new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: currency || "GBP",
              }).format(milestone.amount)}
            </p>
            <Badge
              variant={
                milestone.status === "approved" || milestone.status === "paid"
                  ? "success"
                  : milestone.status === "rejected"
                  ? "destructive"
                  : milestone.status === "submitted"
                  ? "warning"
                  : "secondary"
              }
              className="text-[10px]"
            >
              {milestone.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatOrderType(type: string): string {
  const labels: Record<string, string> = {
    people_booking: "People Booking",
    product_rfq: "Product RFQ",
    service: "Service",
  }
  return labels[type] || type
}

function formatEscrowStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    held: "Funds Held",
    partial_release: "Partial Release",
    released: "Released",
    refunded: "Refunded",
  }
  return labels[status] || status
}

// Loading skeleton
export function OrderDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-6 w-48 bg-muted rounded" />
            </div>
            <div className="text-right space-y-1">
              <div className="h-8 w-24 bg-muted rounded ml-auto" />
              <div className="h-3 w-16 bg-muted rounded ml-auto" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="h-10 w-24 bg-muted rounded" />
            <div className="h-10 w-24 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { OrderStatus } from "@/types/orders"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Clock,
  CheckCircle,
  PlayCircle,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from "lucide-react"

interface OrderStatusBadgeProps {
  status: OrderStatus
  className?: string
  showIcon?: boolean
  size?: "sm" | "default" | "lg"
}

const statusConfig: Record<
  OrderStatus,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "warning" | "success" | "info" | "secondary"
    icon: React.ComponentType<{ className?: string }>
    description: string
  }
> = {
  pending: {
    label: "Pending",
    variant: "warning",
    icon: Clock,
    description: "Awaiting seller acceptance",
  },
  accepted: {
    label: "Accepted",
    variant: "info",
    icon: CheckCircle,
    description: "Order accepted, awaiting start",
  },
  in_progress: {
    label: "In Progress",
    variant: "default",
    icon: PlayCircle,
    description: "Work is in progress",
  },
  disputed: {
    label: "Disputed",
    variant: "destructive",
    icon: AlertTriangle,
    description: "A dispute has been raised",
  },
  completed: {
    label: "Completed",
    variant: "success",
    icon: CheckCircle2,
    description: "Order completed successfully",
  },
  cancelled: {
    label: "Cancelled",
    variant: "secondary",
    icon: XCircle,
    description: "Order has been cancelled",
  },
}

export function OrderStatusBadge({
  status,
  className,
  showIcon = true,
  size = "default",
}: OrderStatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    default: "",
    lg: "text-sm px-3 py-1",
  }

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "gap-1",
        sizeClasses[size],
        className
      )}
      title={config.description}
    >
      {showIcon && <Icon className={cn("h-3 w-3", size === "lg" && "h-4 w-4")} />}
      {config.label}
    </Badge>
  )
}

export function getStatusDescription(status: OrderStatus): string {
  return statusConfig[status]?.description ?? ""
}

export function getStatusLabel(status: OrderStatus): string {
  return statusConfig[status]?.label ?? status
}

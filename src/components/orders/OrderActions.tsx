"use client"

import { useState, useTransition } from "react"
import { OrderAction, OrderStatus, OrderRole } from "@/types/orders"
import { getAvailableActions } from "@/lib/orders/status-machine"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import {
  acceptOrder,
  declineOrder,
  startOrder,
  completeOrder,
  approveCompletion,
  cancelOrder,
  openDispute,
} from "@/actions/orders"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface OrderActionsProps {
  orderId: string
  status: OrderStatus
  userRole: OrderRole
  hasOpenDispute?: boolean
  className?: string
  compact?: boolean
  onActionComplete?: () => void
}

const variantMap: Record<
  OrderAction["variant"],
  "default" | "destructive" | "outline" | "secondary" | "ghost" | "success" | "warning"
> = {
  default: "default",
  destructive: "destructive",
  outline: "outline",
  secondary: "secondary",
  success: "success",
  warning: "warning",
}

export function OrderActions({
  orderId,
  status,
  userRole,
  hasOpenDispute = false,
  className,
  compact = false,
  onActionComplete,
}: OrderActionsProps) {
  const router = useRouter()
  const [isPending] = useTransition()
  const [confirmAction, setConfirmAction] = useState<OrderAction | null>(null)
  const [reasonText, setReasonText] = useState("")
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const actions = getAvailableActions(status, userRole, hasOpenDispute)

  // Filter out non-actionable items for compact mode
  const displayActions = compact
    ? actions.filter(
        (a) =>
          !["view_details", "view_dispute", "message"].includes(a.action)
      )
    : actions

  const needsReason = (action: string) =>
    ["decline", "cancel", "dispute"].includes(action)

  const handleAction = async (action: OrderAction) => {
    if (action.requiresConfirmation) {
      setConfirmAction(action)
      return
    }

    await executeAction(action.action)
  }

  const executeAction = async (action: string, reason?: string) => {
    setLoadingAction(action)

    try {
      let result: { success?: boolean; error: string | null } | undefined

      switch (action) {
        case "accept":
          result = await acceptOrder(orderId)
          if (result.success) toast.success("Order accepted")
          break

        case "decline":
          result = await declineOrder(orderId, reason || "")
          if (result.success) toast.success("Order declined")
          break

        case "start":
          result = await startOrder(orderId)
          if (result.success) toast.success("Work started")
          break

        case "complete":
          result = await completeOrder(orderId)
          if (result.success) toast.success("Order marked as complete")
          break

        case "approve_completion":
          result = await approveCompletion(orderId)
          if (result.success) toast.success("Order approved and completed")
          break

        case "cancel":
          result = await cancelOrder(orderId, reason || "")
          if (result.success) toast.success("Order cancelled")
          break

        case "dispute":
          const disputeResult = await openDispute(orderId, reason || "")
          if (disputeResult.success) {
            toast.success("Dispute opened")
          } else {
            toast.error(disputeResult.error || "Failed to open dispute")
          }
          result = disputeResult
          break

        case "resume_work":
          // Resume work transitions disputed -> in_progress
          result = await startOrder(orderId)
          if (result.success) toast.success("Work resumed")
          break

        case "view_details":
          router.push(`/orders/${orderId}`)
          return

        case "message":
          router.push(`/orders/${orderId}#messaging`)
          return

        case "leave_review":
          router.push(`/orders/${orderId}#review`)
          return

        default:
          toast.info(`Action "${action}" not implemented`)
          return
      }

      if (result?.error) {
        toast.error(result.error)
      } else {
        onActionComplete?.()
        router.refresh()
      }
    } catch (error) {
      toast.error("An error occurred")
      console.error("Action error:", error)
    } finally {
      setLoadingAction(null)
      setConfirmAction(null)
      setReasonText("")
    }
  }

  if (displayActions.length === 0) {
    return null
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap gap-2",
          compact && "gap-1.5",
          className
        )}
      >
        {displayActions.map((action) => (
          <Button
            key={action.action}
            variant={variantMap[action.variant]}
            size={compact ? "sm" : "default"}
            onClick={() => handleAction(action)}
            disabled={isPending || loadingAction !== null}
            className={cn(compact && "text-xs h-8")}
          >
            {loadingAction === action.action && (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            )}
            {action.label}
          </Button>
        ))}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.confirmationMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmAction && needsReason(confirmAction.action) && (
            <div className="py-2">
              <Textarea
                placeholder={`Please provide a reason for ${confirmAction.label.toLowerCase()}...`}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loadingAction !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) {
                  executeAction(confirmAction.action, reasonText)
                }
              }}
              disabled={
                loadingAction !== null ||
                Boolean(confirmAction && needsReason(confirmAction.action) && !reasonText.trim())
              }
              className={cn(
                confirmAction?.variant === "destructive" && "bg-destructive hover:bg-destructive/90"
              )}
            >
              {loadingAction && (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              )}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Simple action button for quick actions
export function OrderQuickAction({
  orderId,
  action,
  label,
  variant = "default",
  className,
  onComplete,
}: {
  orderId: string
  action: string
  label: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "success" | "warning"
  className?: string
  onComplete?: () => void
}) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)
    try {
      let result: { success: boolean; error: string | null } | undefined

      switch (action) {
        case "accept":
          result = await acceptOrder(orderId)
          break
        case "start":
          result = await startOrder(orderId)
          break
        case "complete":
          result = await completeOrder(orderId)
          break
        default:
          toast.info(`Action "${action}" requires confirmation`)
          return
      }

      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(`${label} successful`)
        onComplete?.()
        router.refresh()
      }
    } catch {
      toast.error("An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleClick}
      disabled={isLoading}
      className={className}
    >
      {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
      {label}
    </Button>
  )
}

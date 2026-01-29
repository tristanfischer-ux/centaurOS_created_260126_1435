import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      status: {
        success: "bg-status-success-light text-status-success-dark dark:bg-status-success-dark dark:text-status-success-light",
        warning: "bg-status-warning-light text-status-warning-dark dark:bg-status-warning-dark dark:text-status-warning-light",
        error: "bg-status-error-light text-status-error-dark dark:bg-status-error-dark dark:text-status-error-light",
        info: "bg-status-info-light text-status-info-dark dark:bg-status-info-dark dark:text-status-info-light",
        pending: "bg-muted text-muted-foreground",
        active: "bg-primary/10 text-primary",
      },
      size: {
        sm: "text-xs px-2 py-0.5",
        md: "text-sm px-2.5 py-0.5",
        lg: "text-sm px-3 py-1",
      },
      animated: {
        true: "animate-pulse",
        false: "",
      }
    },
    defaultVariants: {
      status: "info",
      size: "md",
      animated: false,
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  dot?: boolean
}

const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ className, status, size, animated, dot, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(statusBadgeVariants({ status, size, animated }), className)}
        {...props}
      >
        {dot && (
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current" />
        )}
        {children}
      </div>
    )
  }
)
StatusBadge.displayName = "StatusBadge"

export { StatusBadge, statusBadgeVariants }

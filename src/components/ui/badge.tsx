import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/80",
        // Updated warning to use semantic tokens
        warning:
          "bg-status-warning-light text-status-warning-dark hover:bg-status-warning-light/80",
        success:
          "bg-status-success-light text-status-success-dark hover:bg-status-success-light/80",
        info:
          "bg-status-info-light text-status-info-dark hover:bg-status-info-light/80",
        outline: "text-foreground bg-muted/50",
        // System status badge - Industrial style
        system:
          "bg-muted text-muted-foreground font-mono uppercase tracking-widest rounded-full",
        // Brand badge - Orange accent
        brand:
          "bg-international-orange/10 text-international-orange font-mono uppercase tracking-wider",
      },
      size: {
        sm: "text-xs px-2 py-0.5",
        md: "text-xs px-2.5 py-0.5",
        lg: "text-sm px-3 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

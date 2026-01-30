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
        // Updated warning to use International Orange
        warning:
          "bg-orange-100 text-international-orange hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-400",
        success:
          "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-400",
        info:
          "bg-blue-100 text-electric-blue hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-400",
        outline: "text-foreground bg-muted/50",
        // System status badge - Industrial style
        system:
          "bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-muted-foreground dark:text-slate-300 font-mono uppercase tracking-widest rounded-full",
        // Brand badge - Orange accent
        brand:
          "bg-international-orange/10 text-international-orange font-mono uppercase tracking-wider",
      },
      size: {
        sm: "text-[10px] px-2 py-0.5",
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

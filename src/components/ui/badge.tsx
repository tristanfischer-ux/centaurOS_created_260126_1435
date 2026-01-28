import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        // Updated warning to use International Orange
        warning:
          "bg-orange-100 text-international-orange border-orange-200 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-800",
        success:
          "bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800",
        info:
          "bg-blue-100 text-electric-blue border-blue-200 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
        outline: "text-foreground border-border",
        // System status badge - Industrial style
        system:
          "bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono uppercase tracking-widest text-[10px] rounded-full",
        // Brand badge - Orange accent
        brand:
          "bg-international-orange/10 text-international-orange border-international-orange/20 font-mono uppercase tracking-wider",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button Variant Usage Guidelines:
 * 
 * CORE VARIANTS (7 total):
 * 
 * PRIMARY ACTIONS:
 * - `default`   : International orange CTA - main brand action (uses accent token)
 * 
 * SECONDARY ACTIONS:
 * - `secondary` : Outline with border - subtle secondary actions
 * - `ghost`     : Transparent, text only - minimal UI, icon buttons, navigation
 * - `link`      : No padding, underline on hover - inline text links with button semantics
 * 
 * STATUS ACTIONS:
 * - `success`   : Emerald for positive actions - approve, confirm, complete (uses status.success)
 * - `warning`   : Amber for caution - actions needing attention (uses status.warning)
 * - `destructive`: Red for danger - delete, remove, critical actions (uses destructive token)
 * 
 * SIZES:
 * - `default` (h-11): Standard size for most buttons
 * - `sm` (h-9): Compact buttons, table actions, badges
 * - `lg` (h-12): Hero CTAs, prominent actions
 * - `icon` (h-11 w-11): Square icon-only buttons
 * 
 * BEST PRACTICES:
 * 1. One primary CTA per view - others should be secondary/ghost
 * 2. Use semantic status variants for user feedback (success/warning/destructive)
 * 3. Always provide accessible names for icon-only buttons
 * 4. Use loading state (disabled + spinner) during async operations
 * 5. For certifications/badges, use Badge component instead of button variant
 */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-action-manipulation rounded-md",
  {
    variants: {
      variant: {
        // Default - International orange primary action
        default: "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm",
        // Secondary - Outline with border
        secondary:
          "border-2 border-input bg-background hover:bg-accent/10 hover:text-accent-foreground",
        // Outline - Alias for secondary (backward compatibility)
        outline:
          "border-2 border-input bg-background hover:bg-accent/10 hover:text-accent-foreground",
        // Ghost - Transparent, text only
        ghost: "hover:bg-accent/10 hover:text-accent-foreground",
        // Link - No padding, underline on hover
        link: "text-primary underline-offset-4 hover:underline",
        // Success - Emerald for positive actions
        success: "bg-status-success text-status-success-foreground hover:bg-status-success/90 shadow-sm",
        // Warning - Amber for caution
        warning: "bg-status-warning text-status-warning-foreground hover:bg-status-warning/90 shadow-sm",
        // Destructive - Red for danger
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
      },
      size: {
        default: "h-11 min-h-[44px] px-4 py-2",
        sm: "h-9 min-h-[44px] md:min-h-0 px-3",
        lg: "h-12 min-h-[44px] px-8 py-3 text-base",
        icon: "h-11 w-11 min-h-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

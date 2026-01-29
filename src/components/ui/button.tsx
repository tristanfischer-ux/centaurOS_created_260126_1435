import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button Variant Usage Guidelines:
 * 
 * PRIMARY ACTIONS (one per view):
 * - `brand`     : Main CTA for landing pages, marketing (orange, uppercase)
 * - `primary`   : Main CTA for app interfaces (slate, professional)
 * - `default`   : Alternative primary in forms/dialogs
 * 
 * SECONDARY ACTIONS:
 * - `outline`   : Secondary actions, cancel buttons
 * - `secondary` : Lower emphasis alternatives
 * - `ghost`     : Minimal UI, icon buttons, navigation
 * 
 * STATUS ACTIONS:
 * - `success`   : Confirmation, approve, complete actions
 * - `warning`   : Actions needing attention (uses brand orange)
 * - `danger`    : Delete, remove, destructive actions
 * - `destructive`: Same as danger but uses destructive theme color
 * 
 * SPECIAL:
 * - `brand-secondary`: Electric blue for secondary brand CTAs
 * - `certified`: Purple for certification/verification badges
 * - `link`: Text links that need button semantics
 * 
 * SIZES:
 * - `default` (h-11): Standard size for most buttons
 * - `sm` (h-9): Compact buttons, table actions, badges
 * - `lg` (h-12): Hero CTAs, prominent actions
 * - `icon` (h-11 w-11): Square icon-only buttons
 * 
 * BEST PRACTICES:
 * 1. One primary CTA per view - others should be secondary/outline
 * 2. Use `ghost` for icon buttons and minimal UI
 * 3. Always provide accessible names for icon-only buttons
 * 4. Use loading state (disabled + spinner) during async operations
 */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-action-manipulation",
  {
    variants: {
      variant: {
        // Default uses International Orange
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Brand CTA - Industrial style with shadow
        brand: "bg-international-orange hover:bg-international-orange-hover text-white font-mono uppercase tracking-widest shadow-brand hover:shadow-brand-lg hover:scale-[1.02]",
        // Secondary brand action with Electric Blue
        "brand-secondary": "bg-electric-blue hover:bg-electric-blue-hover text-white font-mono uppercase tracking-wider",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Industrial outline style - using bg tint instead of border
        outline:
          "bg-slate-100 text-slate-900 hover:bg-slate-900 hover:text-white font-mono uppercase tracking-wider dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-900",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent/10 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Solid slate - professional
        primary: "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200",
        success: "bg-green-600 hover:bg-green-700 text-white",
        warning: "bg-international-orange hover:bg-international-orange-hover text-white",
        danger: "bg-red-600 hover:bg-red-700 text-white",
        certified: "bg-purple-600 hover:bg-purple-700 text-white",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 min-h-[44px] md:min-h-0 px-3",
        lg: "h-12 px-8 py-3 text-base",
        icon: "h-11 w-11",
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

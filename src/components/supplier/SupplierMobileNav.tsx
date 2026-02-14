"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  FileText, 
  MoreHorizontal,
  BarChart3,
  Settings,
  Store,
  HelpCircle
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMobileViewportState } from "@/hooks/useMobileViewportState"

/**
 * Determines if a navigation item should be marked as active
 */
function isRouteActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (pathname.startsWith(href + '/')) return true
  return false
}

// Primary nav items shown in bottom bar
const mainNavigation = [
  { name: "Dashboard", shortName: "Home", href: "/supplier-portal", icon: LayoutDashboard },
  { name: "Listing", shortName: "Listing", href: "/supplier-portal/listing", icon: Package },
  { name: "Orders", shortName: "Orders", href: "/supplier-portal/orders", icon: ShoppingCart },
  { name: "RFQs", shortName: "RFQs", href: "/supplier-portal/rfqs", icon: FileText },
]

// Items in the "More" dropdown
const moreNavigation = [
  { name: "Analytics", href: "/supplier-portal/analytics", icon: BarChart3 },
  { name: "Marketplace", href: "/marketplace", icon: Store },
  { name: "Settings", href: "/supplier-portal/settings", icon: Settings },
  { name: "Help", href: "/help", icon: HelpCircle },
]

export function SupplierMobileNav() {
  const pathname = usePathname()
  const { isKeyboardOpen } = useMobileViewportState()

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-card shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)] sm:hidden pb-safe px-safe transition-all duration-200",
        isKeyboardOpen && "translate-y-full opacity-0 pointer-events-none"
      )}
    >
      <div className="flex justify-around items-center h-16">
        {mainNavigation.map((item) => {
          const isActive = isRouteActive(pathname, item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-full min-h-[44px] min-w-[44px] h-full gap-1 text-xs font-medium touch-action-manipulation transition-colors",
                isActive ? "text-international-orange font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "fill-current")} />
              <span className="text-xs font-medium truncate max-w-[52px]">
                {item.shortName}
              </span>
            </Link>
          )
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center w-full min-h-[44px] min-w-[44px] h-full gap-1 text-xs font-medium touch-action-manipulation transition-colors",
                moreNavigation.some(item => isRouteActive(pathname, item.href))
                  ? "text-international-orange font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className={cn("h-5 w-5 shrink-0", moreNavigation.some(item => isRouteActive(pathname, item.href)) && "fill-current")} />
              <span className="text-xs font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2 mr-safe">
            {moreNavigation.map((item) => {
              const isActive = isRouteActive(pathname, item.href)
              return (
                <DropdownMenuItem key={item.name} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer w-full",
                      isActive && "text-international-orange"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

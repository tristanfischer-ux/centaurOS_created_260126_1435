"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  FileText, 
  BarChart3, 
  Settings, 
  HelpCircle,
  Store,
  LogOut
} from "lucide-react"
import { NotificationCenter } from "@/components/NotificationCenter"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Determines if a navigation item should be marked as active
 */
function isRouteActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (pathname.startsWith(href + '/')) return true
  return false
}

// Simplified navigation for suppliers
const mainNavigation = [
  { name: "Dashboard", href: "/supplier-portal", icon: LayoutDashboard, tooltip: "Your supplier home base" },
  { name: "My Listing", href: "/supplier-portal/listing", icon: Package, tooltip: "Manage your marketplace listing" },
  { name: "Orders", href: "/supplier-portal/orders", icon: ShoppingCart, tooltip: "View and manage orders" },
  { name: "RFQs", href: "/supplier-portal/rfqs", icon: FileText, tooltip: "Respond to quote requests" },
  { name: "Analytics", href: "/supplier-portal/analytics", icon: BarChart3, tooltip: "Earnings and performance metrics" },
]

const browseNavigation = [
  { name: "Marketplace", href: "/marketplace", icon: Store, tooltip: "Browse the marketplace" },
]

const supportNavigation = [
  { name: "Help", href: "/help", icon: HelpCircle, tooltip: "Help center and documentation" },
  { name: "Settings", href: "/supplier-portal/settings", icon: Settings, tooltip: "Account and portal settings" },
]

interface SupplierSidebarProps {
  userName?: string
  userEmail?: string
}

export function SupplierSidebar({ userName, userEmail }: SupplierSidebarProps) {
  const pathname = usePathname()

  const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }>; tooltip?: string }) => {
    const isActive = isRouteActive(pathname, item.href)
    const navLink = (
      <Link
        href={item.href}
        className={cn(
          isActive
            ? "bg-orange-50 text-international-orange font-semibold"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          "group flex items-center px-3 py-2.5 text-sm transition-all duration-200 rounded-md"
        )}
      >
        <item.icon
          className={cn(
            isActive ? "text-international-orange" : "text-muted-foreground group-hover:text-foreground",
            "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
          )}
          aria-hidden="true"
        />
        {item.name}
      </Link>
    )

    if (item.tooltip) {
      return (
        <Tooltip key={item.name} delayDuration={300}>
          <TooltipTrigger asChild>
            {navLink}
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px]">
            <p>{item.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      )
    }

    return <div key={item.name}>{navLink}</div>
  }

  return (
    <div className="hidden md:flex h-screen w-64 flex-col bg-background border-r border-slate-100 text-foreground">
      {/* App Header */}
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <Link href="/supplier-portal" className="group flex items-center gap-2">
            <span className="font-display text-xl font-bold tracking-[0.05em] text-foreground group-hover:text-international-orange transition-colors">
              CentaurOS
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse shadow-[0_0_8px_rgba(255,69,0,0.6)]"></span>
          </Link>
          <NotificationCenter />
        </div>
      </div>

      {/* Portal Indicator & User Info */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide">
            Supplier Portal
          </span>
        </div>
        <div className="mt-3">
          <div className="text-sm font-medium text-foreground truncate">
            {userName || "Loading..."}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {userEmail || "Loading..."}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 px-3 py-3">
        {/* Main Navigation */}
        {mainNavigation.map(renderNavItem)}
        
        {/* Spacer */}
        <div className="my-3 border-t border-slate-100" />
        
        {/* Browse Navigation */}
        {browseNavigation.map(renderNavItem)}
        
        {/* Spacer */}
        <div className="my-3 border-t border-slate-100" />
        
        {/* Support Navigation */}
        {supportNavigation.map(renderNavItem)}
      </nav>

      {/* Footer */}
      <div className="p-4 mt-auto space-y-3">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
        
        {/* Version info */}
        <div className="text-[10px] text-muted-foreground text-center font-mono tracking-wider opacity-50">
          Supplier Portal v1.0
        </div>
      </div>
    </div>
  )
}

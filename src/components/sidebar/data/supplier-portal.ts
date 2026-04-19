import {
  BarChart3,
  FileText,
  Package,
  Settings,
  ShoppingBag,
  Store,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * SUPPLIER PORTAL section — conditional. Rendered only when
 * profiles.is_supplier = true. Rehomed 2026-04-16 from the standalone
 * (supplier-portal) route group into the main platform shell.
 */

export const supplierNavigation: SidebarNavItem[] = [
  { name: 'Dashboard', href: '/supplier', icon: Store, tooltip: 'Your supplier dashboard — listing activity, orders, and earnings' },
  { name: 'My Listing', href: '/supplier/listing', icon: Package, tooltip: 'Create and edit your marketplace listing' },
  { name: 'Orders', href: '/supplier/orders', icon: ShoppingBag, tooltip: 'Orders from founders on the platform' },
  { name: 'RFQs', href: '/supplier/rfqs', icon: FileText, tooltip: 'Inbound requests for quote' },
  { name: 'Analytics', href: '/supplier/analytics', icon: BarChart3, tooltip: 'Listing views, contact rate, conversion' },
  { name: 'Settings', href: '/supplier/settings', icon: Settings, tooltip: 'Stripe Connect, availability, notifications' },
]

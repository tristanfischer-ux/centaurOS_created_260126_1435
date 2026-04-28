'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { User, Shield, CreditCard } from 'lucide-react'

/**
 * SettingsNavigation — post-pivot tab bar.
 *
 * Three tabs: Account · Billing & Usage · Privacy & Data.
 * Company / Intelligence / Audit Log / Help tabs removed 2026-04-28.
 */
export function SettingsNavigation() {
    const pathname = usePathname()

    const navigation = [
        { name: 'Account', href: '/settings', icon: User },
        { name: 'Billing & Usage', href: '/settings/billing', icon: CreditCard },
        { name: 'Privacy & Data', href: '/settings/privacy', icon: Shield },
    ]

    return (
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-border">
            {navigation.map((item) => {
                const isActive = item.href === '/settings'
                    ? pathname === '/settings'
                    : pathname.startsWith(item.href)

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2 px-3 py-3 sm:px-4 sm:py-2.5 text-sm font-medium -mb-px transition-colors whitespace-nowrap min-h-[44px]",
                            isActive
                                ? "border-b-2 border-international-orange text-foreground"
                                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
                        )}
                    >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                    </Link>
                )
            })}
        </nav>
    )
}

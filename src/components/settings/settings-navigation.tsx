'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { User, Shield, Building2, HelpCircle, CreditCard, Brain } from 'lucide-react'

interface SettingsNavigationProps {
    isCompanyAdmin: boolean
}

export function SettingsNavigation({ isCompanyAdmin }: SettingsNavigationProps) {
    const pathname = usePathname()

    const accountNav = { name: 'Account', href: '/settings', icon: User }
    const billingNav = { name: 'Billing & Usage', href: '/settings/billing', icon: CreditCard }
    const companyNav = { name: 'Company', href: '/settings/company', icon: Building2 }
    const intelligenceNav = { name: 'Intelligence', href: '/settings/intelligence', icon: Brain }
    const privacyNav = { name: 'Privacy & Data', href: '/settings/privacy', icon: Shield }
    const helpNav = { name: 'Help & Support', href: '/settings/help', icon: HelpCircle }

    const navigation = [
        accountNav,
        billingNav,
        ...(isCompanyAdmin ? [companyNav, intelligenceNav] : []),
        privacyNav,
        helpNav,
    ]

    return (
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-100">
            {navigation.map((item) => {
                const isActive = item.href === '/settings'
                    ? pathname === '/settings'
                    : pathname.startsWith(item.href)

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium -mb-px transition-colors whitespace-nowrap",
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

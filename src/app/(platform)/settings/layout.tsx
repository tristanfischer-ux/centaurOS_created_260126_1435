'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Settings, Shield, Puzzle } from 'lucide-react'

const settingsNavigation = [
    { name: 'General', href: '/settings', icon: Settings },
    { name: 'Integrations', href: '/settings/integrations', icon: Puzzle },
    { name: 'Privacy & Data', href: '/settings/privacy', icon: Shield },
]

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Settings</h1>
                </div>
                <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">Configure your profile and preferences</p>
            </div>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1 border-b border-slate-100">
                {settingsNavigation.map((item) => {
                    const isActive = item.href === '/settings'
                        ? pathname === '/settings'
                        : pathname.startsWith(item.href)

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium -mb-px transition-colors",
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

            {/* Content */}
            <div>{children}</div>
        </div>
    )
}

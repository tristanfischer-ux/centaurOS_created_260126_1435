'use client'

/**
 * DirectoryNav - Public navigation bar for the expert directory.
 *
 * @description Minimal, SEO-friendly navigation that appears on all
 * public directory pages. Includes logo, directory link, and CTA.
 * No auth required — visible to all visitors.
 *
 * @component
 *
 * @example
 * <DirectoryNav />
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Flame, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DirectoryNav() {
    const pathname = usePathname()

    const isExpertsActive = pathname === '/experts' || pathname.startsWith('/experts/')
    const isExpertActive = pathname.startsWith('/expert/')

    return (
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Logo */}
                <Link
                    href="/"
                    className="flex items-center gap-2 transition-colors hover:opacity-80"
                >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-international-orange">
                        <Flame className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-lg font-semibold text-foreground">
                        Fractional Forge
                    </span>
                </Link>

                {/* Navigation */}
                <nav className="hidden items-center gap-6 sm:flex">
                    <Link
                        href="/experts"
                        className={cn(
                            'text-sm font-medium transition-colors',
                            isExpertsActive || isExpertActive
                                ? 'text-international-orange font-semibold'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Browse Experts
                    </Link>
                    <Link
                        href="/join/expert"
                        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        List Your Profile
                    </Link>
                </nav>

                {/* CTA */}
                <div className="flex items-center gap-3">
                    <Link href="/login" className="hidden sm:block">
                        <Button variant="ghost" size="sm">
                            Sign In
                        </Button>
                    </Link>
                    <Link href="/join/expert">
                        <Button size="sm" className="gap-1.5">
                            Get Started
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </Link>
                </div>
            </div>
        </header>
    )
}

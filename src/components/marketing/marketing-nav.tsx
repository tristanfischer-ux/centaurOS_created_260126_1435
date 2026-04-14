'use client'

/**
 * MarketingNav - Shared navigation bar for all public marketing pages.
 *
 * @description Consistent, SEO-friendly navigation that appears on all
 * public pages (pricing, about, contact, experts directory, etc.).
 * No authentication required — visible to all visitors.
 *
 * @component
 *
 * @example
 * <MarketingNav />
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Flame, ArrowRight, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

const NAV_LINKS = [
    { href: '/pricing', label: 'Pricing' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
] as const

export function MarketingNav() {
    const pathname = usePathname()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [mobileMenuOpen])

    function isActive(href: string): boolean {
        return pathname === href || pathname.startsWith(href + '/')
    }

    return (
        <header className="sticky top-0 z-40 border-b bg-background">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Logo */}
                <Link
                    href="/"
                    className="flex items-center gap-2 transition-colors hover:opacity-80"
                >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-international-orange">
                        <Flame className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="text-lg font-semibold text-foreground">
                        Fractional Forge
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden items-center gap-6 md:flex">
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                'text-sm font-medium transition-colors duration-200',
                                isActive(link.href)
                                    ? 'text-international-orange font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                {/* Desktop CTA */}
                <div className="hidden items-center gap-3 md:flex">
                    <Link href="/login">
                        <Button variant="ghost" size="sm">
                            Sign In
                        </Button>
                    </Link>
                    <Link href="/join">
                        <Button size="sm" className="gap-1.5">
                            Get Started
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </Link>
                </div>

                {/* Mobile menu button */}
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground md:hidden"
                    aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={mobileMenuOpen}
                >
                    {mobileMenuOpen ? (
                        <X className="h-6 w-6" />
                    ) : (
                        <Menu className="h-6 w-6" />
                    )}
                </button>
            </div>

            {/* Mobile Navigation */}
            {mobileMenuOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-foreground/20 md:hidden"
                        style={{ zIndex: -1 }}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-hidden="true"
                    />
                    <div className="border-t bg-background shadow-lg md:hidden">
                        <div className="flex flex-col gap-1 px-4 py-4 sm:px-6">
                            <Link
                                href="/join"
                                className="mb-3 flex min-h-[48px] items-center justify-center rounded-md bg-international-orange text-center text-xs font-mono font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-international-orange-hover"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                Get Started
                            </Link>
                            {NAV_LINKS.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={cn(
                                        'flex min-h-[48px] items-center border-b border-muted/50 py-3.5 text-sm transition-colors last:border-b-0',
                                        isActive(link.href)
                                            ? 'text-international-orange font-semibold'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    {link.label}
                                </Link>
                            ))}
                            <Link
                                href="/login"
                                className="flex min-h-[48px] items-center py-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                Sign In
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </header>
    )
}

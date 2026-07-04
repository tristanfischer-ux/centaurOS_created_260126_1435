'use client'

/**
 * MarketingNav - Shared navigation bar for all public marketing pages.
 *
 * @description Consistent, SEO-friendly navigation that appears on all
 * public pages. Deliberately matches the homepage's own inline nav
 * (src/app/page.tsx) 1:1 — same gradient-square logo, same link set, same
 * "Work with us" CTA, no "Sign In" — so the chrome never changes when a
 * visitor moves from the homepage into /insights, /about, /guides, etc.
 * Landing-only sections link back to the homepage anchors (/#…).
 *
 * @component
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

const NAV_LINKS = [
    { href: '/#founders', label: 'For founders' },
    { href: '/#partners', label: 'For partners' },
    { href: '/#how', label: 'How it works' },
    { href: '/#examples', label: "What's inside" },
    { href: '/insights', label: 'Insights' },
    { href: '/about', label: 'About' },
] as const

/** The single Fractional Forge brand mark — an amber→ember→orange gradient
 *  rounded square, identical to the homepage `.flame` element. */
function BrandMark({ size = 26 }: { size?: number }) {
    return (
        <span
            aria-hidden
            className="inline-block rounded-lg"
            style={{
                width: size,
                height: size,
                background: 'linear-gradient(160deg,#f59e0b,#e2562a 60%,#c2410c)',
            }}
        />
    )
}

interface MarketingNavProps {
    /** When true, the viewer is logged in — the CTA becomes "Open app". */
    isAuthed?: boolean
}

export function MarketingNav({ isAuthed = false }: MarketingNavProps = {}) {
    const pathname = usePathname()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [mobileMenuOpen])

    function isActive(href: string): boolean {
        if (href.startsWith('/#')) return false
        return pathname === href || pathname.startsWith(href + '/')
    }

    return (
        <header className="sticky top-0 z-40 border-b bg-background">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Logo */}
                <Link
                    href="/"
                    className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
                >
                    <BrandMark />
                    <span className="text-lg font-bold tracking-tight text-foreground">
                        Fractional Forge
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden items-center gap-6 lg:flex">
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                'text-[15px] font-semibold transition-colors duration-200',
                                isActive(link.href)
                                    ? 'text-international-orange'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                {/* Desktop CTA */}
                <div className="hidden items-center gap-3 lg:flex">
                    <Link href={isAuthed ? '/investors' : '/brief'}>
                        <Button
                            size="sm"
                            className="bg-international-orange text-white hover:bg-international-orange-hover"
                        >
                            {isAuthed ? 'Open app' : 'Work with us'}
                        </Button>
                    </Link>
                </div>

                {/* Mobile menu button */}
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground lg:hidden"
                    aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={mobileMenuOpen}
                >
                    {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
            </div>

            {/* Mobile Navigation */}
            {mobileMenuOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-foreground/20 lg:hidden"
                        style={{ zIndex: -1 }}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-hidden="true"
                    />
                    <div className="border-t bg-background shadow-lg lg:hidden">
                        <div className="flex flex-col gap-1 px-4 py-4 sm:px-6">
                            <Link
                                href={isAuthed ? '/investors' : '/brief'}
                                className="mb-3 flex min-h-[48px] items-center justify-center rounded-md bg-international-orange text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-international-orange-hover"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {isAuthed ? 'Open app' : 'Work with us'}
                            </Link>
                            {NAV_LINKS.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={cn(
                                        'flex min-h-[48px] items-center border-b border-muted/50 py-3.5 text-sm font-semibold transition-colors last:border-b-0',
                                        isActive(link.href)
                                            ? 'text-international-orange'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </header>
    )
}

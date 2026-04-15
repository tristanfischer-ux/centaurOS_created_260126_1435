/**
 * MarketingFooter - Shared footer for all public marketing pages.
 *
 * @description Consistent footer with company info, navigation links,
 * and legal links. Used across homepage, pricing, about, contact,
 * and experts directory pages.
 *
 * @component
 *
 * @example
 * <MarketingFooter />
 */

import Link from 'next/link'
import { Flame } from 'lucide-react'

export function MarketingFooter() {
    const currentYear = new Date().getFullYear()

    return (
        <footer className="border-t bg-muted/30">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                    {/* Brand */}
                    <div className="space-y-4 md:col-span-2">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-international-orange">
                                <Flame className="h-4 w-4 text-primary-foreground" />
                            </div>
                            <span className="text-lg font-semibold text-foreground">
                                Fractional Forge
                            </span>
                        </Link>
                        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                            Expert teams, AI-enabled execution, and manufacturing
                            capacity — without owning a factory.
                        </p>
                    </div>

                    {/* Platform */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">
                            Platform
                        </h3>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/pricing"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Pricing
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/login"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Sign In
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/join"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Get Started
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Company */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">
                            Company
                        </h3>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/about"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    About
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/contact"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Contact
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
                    <p className="text-xs text-muted-foreground">
                        &copy; {currentYear} Fractional Forge Ltd. All rights
                        reserved.
                    </p>
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Home
                        </Link>
                        <Link
                            href="/terms"
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Terms
                        </Link>
                        <Link
                            href="/privacy"
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Privacy
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}

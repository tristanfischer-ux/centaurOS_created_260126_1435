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
                        <Link href="/" className="flex items-center gap-2.5">
                            <span
                                aria-hidden
                                className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg"
                                style={{
                                    background:
                                        'linear-gradient(160deg,#f59e0b,#e2562a 60%,#c2410c)',
                                }}
                            >
                                <Flame className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
                            </span>
                            <span className="text-lg font-bold tracking-tight text-foreground">
                                Fractional Forge
                            </span>
                        </Link>
                        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                            The front end for hardware. We help deep-tech and
                            hardware founders get funded — and built: commercial
                            strategy, capital, and a curated network of Europe&rsquo;s
                            best engineering and manufacturing partners. Every
                            Design Dossier is reviewed by a senior engineer.
                        </p>
                    </div>

                    {/* Platform */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">
                            Explore
                        </h3>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/brief"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Start a brief
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/sample-package"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Example package
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/pricing"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    How it works
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

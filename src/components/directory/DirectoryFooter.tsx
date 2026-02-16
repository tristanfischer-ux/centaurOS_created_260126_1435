/**
 * DirectoryFooter - Minimal footer for public directory pages.
 *
 * @description Shows company info, quick links, and legal links.
 * Designed for SEO with internal links to key directory pages.
 *
 * @component
 */

import Link from 'next/link'
import { Flame } from 'lucide-react'
import { DIRECTORY_ROLE_CATEGORIES } from '@/lib/directory/types'

export function DirectoryFooter() {
    const currentYear = new Date().getFullYear()
    const roleEntries = Object.entries(DIRECTORY_ROLE_CATEGORIES).slice(0, 6)

    return (
        <footer className="border-t bg-muted/30">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                    {/* Brand */}
                    <div className="space-y-4">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-international-orange">
                                <Flame className="h-4 w-4 text-white" />
                            </div>
                            <span className="text-lg font-semibold text-foreground">
                                Fractional Forge
                            </span>
                        </Link>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            The expert directory for fractional executives.
                            Find vetted CMOs, CFOs, CTOs, and more for your
                            growing business.
                        </p>
                    </div>

                    {/* Browse by Role */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">
                            Browse by Role
                        </h3>
                        <ul className="space-y-2">
                            {roleEntries.map(([slug, category]) => (
                                <li key={slug}>
                                    <Link
                                        href={`/experts/${slug}`}
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {category.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* For Experts */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">
                            For Experts
                        </h3>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/join/expert"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    List Your Profile
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
                        </ul>
                    </div>

                    {/* For Companies */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">
                            For Companies
                        </h3>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/experts"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Find an Expert
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/login"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Post a Role
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
                    <p className="text-xs text-muted-foreground">
                        &copy; {currentYear} Fractional Forge. All rights reserved.
                    </p>
                    <div className="flex items-center gap-4">
                        <Link
                            href="/experts"
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Directory
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}

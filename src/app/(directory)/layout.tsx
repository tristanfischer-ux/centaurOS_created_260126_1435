import type { Metadata } from 'next'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'

// INTENT (D1, 2026-08-14): the fractional-executive marketplace is withdrawn
// from search/AI indexes — it confuses the "Fractional Forge = hardware" entity
// model answer engines build. Code kept so it can return later.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
}

/**
 * Layout for the public expert directory.
 *
 * @description Wraps all /experts/* and /expert/* pages with the shared
 * marketing navigation bar and footer for brand consistency across
 * all public pages. No authentication required.
 *
 * @security This layout is accessible without login. All data displayed
 * comes from SECURITY DEFINER RPC functions that only return public fields.
 */
export default function DirectoryLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <MarketingNav />
            <main className="flex-1">{children}</main>
            <MarketingFooter />
        </div>
    )
}

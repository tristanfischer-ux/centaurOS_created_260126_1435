import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'

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

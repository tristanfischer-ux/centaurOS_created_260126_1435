import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { NewsletterSignup } from '@/components/content/newsletter-signup'

/**
 * Layout for public content pages (blog, resources).
 *
 * @description Wraps all /blog/* pages with the shared marketing navigation
 * bar, newsletter signup, and footer for brand consistency. No authentication
 * required.
 *
 * @security This layout is accessible without login. All data displayed
 * comes from SECURITY DEFINER RPC functions that only return published content.
 */
export default function ContentLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <MarketingNav />
            <main className="flex-1">{children}</main>
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
                <NewsletterSignup />
            </div>
            <MarketingFooter />
        </div>
    )
}

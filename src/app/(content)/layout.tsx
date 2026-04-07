import { DirectoryNav } from '@/components/directory/DirectoryNav'
import { DirectoryFooter } from '@/components/directory/DirectoryFooter'
import { NewsletterSignup } from '@/components/content/newsletter-signup'

/**
 * Layout for public content pages (blog, resources).
 *
 * @description Wraps all /blog/* pages with the public navigation bar,
 * newsletter signup, and footer. No authentication required.
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
            <DirectoryNav />
            <main className="flex-1">{children}</main>
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
                <NewsletterSignup />
            </div>
            <DirectoryFooter />
        </div>
    )
}

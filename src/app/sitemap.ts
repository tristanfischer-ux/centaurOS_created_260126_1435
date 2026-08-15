import type { MetadataRoute } from 'next'
import { getArticleSlugs } from '@/lib/insights-articles'

// INTENT: Force dynamic so sitemap is generated at request time, not during build.
// Supabase calls timeout during Vercel build (60s limit) because the build
// environment has higher latency to Supabase than the runtime environment.
export const dynamic = 'force-dynamic'

/**
 * Generates a dynamic sitemap for search engine indexing.
 *
 * @description Hardware-only pages (D1, 2026-08-14): the fractional-executive
 * marketplace (/experts, /expert/*, /blog/*) is withdrawn from the sitemap and
 * noindexed. lastModified is a REAL per-page date (P2-b, 2026-08-15) — the
 * last substantive edit of each page, maintained by hand: when you materially
 * change a page, update its date here in the same PR.
 *
 * @security Only public pages included. No authenticated routes.
 */

/** route → [lastmod, changeFrequency, priority] */
const STATIC_PAGES: Record<string, [string, 'weekly' | 'monthly' | 'yearly', number]> = {
    '': ['2026-08-15', 'weekly', 1.0],
    '/pricing': ['2026-08-14', 'monthly', 0.9],
    '/about': ['2026-08-14', 'monthly', 0.7],
    '/contact': ['2026-04-25', 'monthly', 0.7],
    '/terms': ['2026-04-16', 'yearly', 0.3],
    '/privacy': ['2026-04-25', 'yearly', 0.3],
    '/brief': ['2026-08-15', 'monthly', 0.9],
    '/quote': ['2026-08-15', 'monthly', 0.8],
    '/story': ['2026-07-04', 'monthly', 0.7],
    '/insights': ['2026-07-04', 'weekly', 0.8],
    '/cost/water-treatment-plant': ['2026-08-15', 'monthly', 0.8],
    '/guides/how-to-find-a-contract-manufacturer-uk': ['2026-08-15', 'monthly', 0.8],
    '/guides/how-to-cost-a-hardware-bill-of-materials': ['2026-08-15', 'monthly', 0.8],
    '/guides/how-to-get-a-hardware-startup-investor-ready': ['2026-08-15', 'monthly', 0.8],
    '/guides/design-for-manufacture-explained': ['2026-08-15', 'monthly', 0.8],
    '/investor-readiness': ['2026-04-16', 'monthly', 0.7],
    '/techniques': ['2026-04-25', 'monthly', 0.7],
    '/sample-package': ['2026-08-14', 'monthly', 0.8],
    '/signup': ['2026-05-05', 'monthly', 0.7],
}

/** The insights essays were republished in one batch. */
const ARTICLES_LASTMOD = '2026-07-04'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

    const staticPages: MetadataRoute.Sitemap = Object.entries(STATIC_PAGES).map(
        ([route, [lastmod, changeFrequency, priority]]) => ({
            url: `${appUrl}${route}`,
            lastModified: new Date(lastmod),
            changeFrequency,
            priority,
        })
    )

    const articlePages: MetadataRoute.Sitemap = getArticleSlugs().map((slug) => ({
        url: `${appUrl}/insights/${slug}`,
        lastModified: new Date(ARTICLES_LASTMOD),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    }))

    return [...staticPages, ...articlePages]
}

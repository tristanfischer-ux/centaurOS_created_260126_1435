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
 * noindexed — it confused the entity model answer engines build for
 * "Fractional Forge = the front end for hardware". The code remains in the
 * repo so the marketplace can return later.
 *
 * @security Only public pages included. No authenticated routes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'
    const now = new Date()

    const staticPages: MetadataRoute.Sitemap = [
        {
            url: appUrl,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${appUrl}/pricing`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${appUrl}/about`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${appUrl}/contact`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${appUrl}/terms`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${appUrl}/privacy`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${appUrl}/brief`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${appUrl}/story`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${appUrl}/insights`,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${appUrl}/cost/water-treatment-plant`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        ...[
            'how-to-find-a-contract-manufacturer-uk',
            'how-to-cost-a-hardware-bill-of-materials',
            'how-to-get-a-hardware-startup-investor-ready',
            'design-for-manufacture-explained',
        ].map((slug) => ({
            url: `${appUrl}/guides/${slug}`,
            lastModified: now,
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        })),
        {
            url: `${appUrl}/investor-readiness`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${appUrl}/techniques`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${appUrl}/sample-package`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${appUrl}/signup`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
    ]

    // Native Insights articles (republished HFN essays)
    const articlePages: MetadataRoute.Sitemap = getArticleSlugs().map((slug) => ({
        url: `${appUrl}/insights/${slug}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
    }))

    return [...staticPages, ...articlePages]
}

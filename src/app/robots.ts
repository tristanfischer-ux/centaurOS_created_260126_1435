import type { MetadataRoute } from 'next'

/**
 * Generates robots.txt rules for search engine crawlers.
 *
 * @description Minimal rules — auth handles access control for platform pages.
 * Detailed Disallow lists expose internal route structure to competitors.
 *
 * @security Only block API and framework routes. Auth protects everything else.
 */
export default function robots(): MetadataRoute.Robots {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/'],
                disallow: ['/api/', '/_next/'],
            },
        ],
        sitemap: `${appUrl}/sitemap.xml`,
    }
}

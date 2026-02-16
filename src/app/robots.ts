import type { MetadataRoute } from 'next'

/**
 * Generates robots.txt rules for search engine crawlers.
 *
 * @description Allows crawling of the public directory (/experts, /expert)
 * and marketing pages, while blocking the authenticated platform, API routes,
 * and internal tooling.
 *
 * @security Platform pages behind auth are blocked from crawling.
 */
export default function robots(): MetadataRoute.Robots {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

    return {
        rules: [
            {
                userAgent: '*',
                allow: [
                    '/',
                    '/experts',
                    '/experts/',
                    '/expert/',
                    '/join/',
                ],
                disallow: [
                    '/api/',
                    '/today/',
                    '/tasks/',
                    '/timeline/',
                    '/marketplace/',
                    '/settings/',
                    '/provider-portal/',
                    '/supplier-portal/',
                    '/messages/',
                    '/inbox/',
                    '/the-forge/',
                    '/dashboard/',
                    '/objectives/',
                    '/team/',
                    '/rfq/',
                    '/orders/',
                    '/retainers/',
                    '/ops/',
                    '/admin/',
                    '/workspace-picker',
                    '/access-revoked',
                    '/login',
                    '/auth/',
                    '/_next/',
                ],
            },
        ],
        sitemap: `${appUrl}/sitemap.xml`,
    }
}

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

    // INTENT: explicitly welcome the AI answer-engine crawlers (GEO/AEO).
    // A wildcard allow already covers them, but naming them is a clear signal
    // and future-proofs against a stricter default. Blocking these = invisibility
    // in ChatGPT / Perplexity / Gemini / Google AI Overviews answers.
    const aiCrawlers = [
        'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', // OpenAI
        'ClaudeBot', 'Claude-Web', 'anthropic-ai', // Anthropic
        'PerplexityBot', 'Perplexity-User', // Perplexity
        'Google-Extended', // Google Gemini / AI Overviews training
        'Applebot-Extended', // Apple Intelligence
        'CCBot', // Common Crawl (feeds many models)
        'Bytespider', 'Amazonbot', 'cohere-ai', 'Meta-ExternalAgent',
    ]

    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/'],
                disallow: ['/api/', '/_next/'],
            },
            ...aiCrawlers.map((userAgent) => ({
                userAgent,
                allow: ['/'],
                disallow: ['/api/', '/_next/'],
            })),
        ],
        sitemap: `${appUrl}/sitemap.xml`,
    }
}

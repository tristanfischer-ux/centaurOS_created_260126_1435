/**
 * @file directory/structured-data.ts
 *
 * @description Generates JSON-LD structured data for expert profiles and
 * directory pages. This helps Google display rich snippets (star ratings,
 * pricing, location) in search results.
 *
 * @related
 * - https://schema.org/Person
 * - https://schema.org/Service
 * - https://schema.org/ItemList
 */

import type { DirectoryExpert, DirectoryExpertFull } from './types'
import { getExpertSlug } from './types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

/**
 * Generates Person + Service JSON-LD for an individual expert profile page.
 *
 * @param expert - Full expert profile data
 * @returns JSON-LD object for embedding in a script tag
 */
export function generateExpertJsonLd(expert: DirectoryExpertFull): Record<string, unknown> {
    const slug = getExpertSlug(expert)
    const profileUrl = slug ? `${APP_URL}/expert/${slug}` : APP_URL

    const currencySymbols: Record<string, string> = { GBP: 'GBP', USD: 'USD', EUR: 'EUR' }
    const currency = currencySymbols[expert.currency] || 'GBP'

    const jsonLd: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: expert.user_name || 'Expert',
        url: profileUrl,
        jobTitle: expert.headline || 'Fractional Executive',
        description: expert.bio?.slice(0, 300) || undefined,
        image: expert.user_avatar || undefined,
        address: expert.location
            ? {
                '@type': 'PostalAddress',
                addressLocality: expert.location,
            }
            : undefined,
        sameAs: [expert.linkedin_url, expert.website_url].filter(Boolean),
        knowsAbout: expert.specializations.length > 0 ? expert.specializations : undefined,
    }

    // Add aggregate rating if available
    if (expert.average_rating && expert.total_reviews > 0) {
        jsonLd.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: expert.average_rating,
            reviewCount: expert.total_reviews,
            bestRating: 5,
            worstRating: 1,
        }
    }

    // Add service offering with pricing
    if (expert.day_rate || expert.hourly_rate) {
        jsonLd.makesOffer = {
            '@type': 'Offer',
            itemOffered: {
                '@type': 'Service',
                name: expert.headline || 'Fractional Executive Services',
                description: expert.bio?.slice(0, 160) || undefined,
                provider: {
                    '@type': 'Person',
                    name: expert.user_name || 'Expert',
                },
            },
            priceCurrency: currency,
            ...(expert.hourly_rate ? { price: expert.hourly_rate, unitText: 'HOUR' } : {}),
            ...(expert.day_rate && !expert.hourly_rate ? { price: expert.day_rate, unitText: 'DAY' } : {}),
        }
    }

    return jsonLd
}

/**
 * Generates ItemList JSON-LD for the directory browse page.
 *
 * @param experts - Array of expert profiles
 * @param pageTitle - Title of the current page
 * @param pageUrl - Canonical URL of the current page
 * @returns JSON-LD object for embedding in a script tag
 */
export function generateDirectoryListJsonLd(
    experts: DirectoryExpert[],
    pageTitle: string,
    pageUrl: string
): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: pageTitle,
        url: pageUrl,
        numberOfItems: experts.length,
        itemListElement: experts.slice(0, 20).map((expert, index) => {
            const slug = getExpertSlug(expert)
            return {
                '@type': 'ListItem',
                position: index + 1,
                item: {
                    '@type': 'Person',
                    name: expert.user_name || 'Expert',
                    url: slug ? `${APP_URL}/expert/${slug}` : undefined,
                    jobTitle: expert.headline || 'Fractional Executive',
                    image: expert.user_avatar || undefined,
                    address: expert.location
                        ? {
                            '@type': 'PostalAddress',
                            addressLocality: expert.location,
                        }
                        : undefined,
                    ...(expert.average_rating && expert.total_reviews > 0
                        ? {
                            aggregateRating: {
                                '@type': 'AggregateRating',
                                ratingValue: expert.average_rating,
                                reviewCount: expert.total_reviews,
                            },
                        }
                        : {}),
                },
            }
        }),
    }
}

/**
 * Generates WebSite + SearchAction JSON-LD for the main directory page.
 * Enables Google's search box feature in search results.
 *
 * @returns JSON-LD object for the sitewide search action
 */
export function generateDirectorySearchJsonLd(): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Fractional Forge',
        url: APP_URL,
        potentialAction: {
            '@type': 'SearchAction',
            target: {
                '@type': 'EntryPoint',
                urlTemplate: `${APP_URL}/experts?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
        },
    }
}
